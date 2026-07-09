#!/usr/bin/env node
// scan.mjs — CMDSPACE apps catalog monitoring engine.
//
// Reads the curated source (catalog/apps.yaml + catalog/ignore.yaml), enriches
// every featured app with LIVE status from GitHub (`gh`) and local git, then emits:
//   data/apps.json        → the render manifest the site fetches (curated ⊕ live)
//   data/candidates.json  → machine-readable drift report (uncatalogued + anomalies)
//   CANDIDATES.md         → human-readable drift report
//
// Modes:
//   --local        (default via `npm run scan`)  scans local /DEV dirs + local git + gh
//   --public-only  (CI/GitHub Action)            gh API only; no local filesystem scan
//   --fail-on-candidates                         exit 20 when NEW feature-candidates appear
//
// Env:
//   DEV_ROOT   override local DEV workspace path (default /Users/yohankoo/DEV)
//   GH_USER    GitHub owner for repo enumeration (default johnfkoo951)

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parse as parseYAML } from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DEV_ROOT = process.env.DEV_ROOT || '/Users/yohankoo/DEV';
const GH_USER = process.env.GH_USER || 'johnfkoo951';

const ARGV = process.argv.slice(2);
const LOCAL = ARGV.includes('--local') || !ARGV.includes('--public-only');
const PUBLIC_ONLY = ARGV.includes('--public-only');
const FAIL_ON_CANDIDATES = ARGV.includes('--fail-on-candidates');

const STALE_DAYS = 120; // no commit in this many days → flagged stale

// ───────────────────────── helpers ─────────────────────────

/** Run a command, return trimmed stdout or null on any failure. Never throws. */
function sh(cmd, args, opts = {}) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 20000, ...opts }).trim();
  } catch {
    return null;
  }
}

let ghOk = null;
function ghAvailable() {
  if (ghOk === null) ghOk = sh('gh', ['--version']) !== null;
  return ghOk;
}

/** `gh repo view owner/name --json ...` → parsed object or null. */
function ghRepo(repo) {
  if (!repo || !ghAvailable()) return null;
  const out = sh('gh', ['repo', 'view', repo, '--json',
    'pushedAt,stargazerCount,isPrivate,isArchived,latestRelease,homepageUrl,url,description']);
  if (!out) return null;
  try { return JSON.parse(out); } catch { return null; }
}

/** All repos owned by GH_USER (name + pushedAt + visibility). */
function ghRepoList() {
  if (!ghAvailable()) return [];
  const out = sh('gh', ['repo', 'list', GH_USER, '--limit', '300', '--json', 'name,pushedAt,isPrivate,url']);
  if (!out) return [];
  try { return JSON.parse(out); } catch { return []; }
}

/** Local git enrichment for a /DEV directory. */
function localGit(devDir) {
  if (!devDir) return {};
  const path = join(DEV_ROOT, devDir);
  if (!existsSync(join(path, '.git'))) return { present: existsSync(path), git: false };
  const last = sh('git', ['-C', path, 'log', '-1', '--format=%cI']); // ISO commit date
  const dirty = sh('git', ['-C', path, 'status', '--porcelain']);
  const remote = sh('git', ['-C', path, 'remote', 'get-url', 'origin']);
  return { present: true, git: true, last_commit_iso: last, dirty: !!(dirty && dirty.length), remote: remote || '' };
}

function daysSince(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((SCAN_NOW - t) / 86400000);
}

function isoToDate(iso) { return iso ? iso.slice(0, 10) : null; }

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) cmds-apps-scan/1.0';

/**
 * Check a url. Returns TRUE (alive, HTTP < 400), FALSE (confirmed GONE — 404/410),
 * or NULL (unknown: no url, request failed, or a blocked/transient status like
 * 401/403/405/429/5xx). Many hosts (npm, some CDNs) 403 bot GETs and Vercel can
 * 5xx transiently — those are NOT "dead", so only a definitive 404/410 flags a
 * dead link. Uses GET (HEAD is often 405'd by CDNs).
 */
async function urlAlive(url) {
  if (!url) return null;
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 12000);
    const r = await fetch(url, { method: 'GET', redirect: 'follow', signal: c.signal, headers: { 'user-agent': UA } });
    clearTimeout(t);
    if (r.status < 400) return true;
    if (r.status === 404 || r.status === 410) return false; // gone
    return null; // blocked / transient — not conclusive
  } catch {
    return null; // could not determine — not "dead"
  }
}

/** Simple concurrency limiter so we don't fire dozens of fetches at once. */
function makeLimiter(n) {
  let active = 0;
  const q = [];
  const pump = () => {
    if (active >= n || q.length === 0) return;
    active++;
    const { fn, res, rej } = q.shift();
    Promise.resolve().then(fn).then(res, rej).finally(() => { active--; pump(); });
  };
  return (fn) => new Promise((res, rej) => { q.push({ fn, res, rej }); pump(); });
}
const limit = makeLimiter(6);

function repoUrl(repo) { return repo ? `https://github.com/${repo}` : ''; }

// SCAN_NOW is fixed once so all age math in a run is consistent.
const SCAN_NOW = Date.now();
const SCAN_ISO = new Date(SCAN_NOW).toISOString();

// ───────────────────────── load curated source ─────────────────────────

const catalog = parseYAML(readFileSync(join(ROOT, 'catalog/apps.yaml'), 'utf8'));
const ignoreDoc = parseYAML(readFileSync(join(ROOT, 'catalog/ignore.yaml'), 'utf8'));
const ignoreNames = new Set((ignoreDoc?.excluded || []).map((e) => e.name));

const apps = catalog.apps || [];
const longtail = catalog.longtail || [];

// ───────────────────────── enrich featured apps ─────────────────────────

async function enrichApp(app) {
  const gh = app.repo ? ghRepo(app.repo) : null;
  const git = LOCAL ? localGit(app.dev_dir) : {};

  // last commit: prefer whichever source we have; local commit date vs gh pushedAt.
  const ghPushIso = gh?.pushedAt || null;
  const lastIso = [git.last_commit_iso, ghPushIso].filter(Boolean).sort().pop() || null;
  const ageDays = daysSince(lastIso);

  // download url: `download: releases` → resolve latest GitHub release.
  let download_url = '';
  if (app.download === 'releases' && gh?.latestRelease?.url) download_url = gh.latestRelease.url;

  const url_alive = await limit(() => urlAlive(app.url));

  return {
    name: app.name,
    category: app.category,
    tier: app.tier || 'featured',
    priority: app.priority ?? 99,
    headline: app.headline || app.name,
    sub: app.sub || '',
    tech: app.tech || '',
    tags: app.tags || [],
    status: app.status || '',            // editorial status from apps.yaml (not overwritten)
    url: app.url || '',
    download_url,
    repo_url: repoUrl(app.repo) || gh?.url || '',
    // ── live fields ──
    last_commit: isoToDate(lastIso),
    stars: gh?.stargazerCount ?? null,
    latest_release: gh?.latestRelease?.tagName || null,
    url_alive,
    is_private: gh?.isPrivate ?? null,
    is_archived: gh?.isArchived ?? null,
    dirty: git.git ? !!git.dirty : null,
    stale: ageDays !== null ? ageDays > STALE_DAYS : null,
  };
}

const enriched = await Promise.all(apps.map(enrichApp));
enriched.sort((a, b) => a.priority - b.priority);

const enrichedLongtail = await Promise.all(longtail.map(async (l) => {
  const gh = l.repo ? ghRepo(l.repo) : null;
  return {
    name: l.name, sub: l.sub || '', tech: l.tech || '',
    url: l.url || '', repo_url: repoUrl(l.repo) || gh?.url || '',
    url_alive: await limit(() => urlAlive(l.url)),
    last_commit: gh?.pushedAt ? isoToDate(gh.pushedAt) : null,
    stars: gh?.stargazerCount ?? null,
  };
}));

// ───────────────────────── render manifest ─────────────────────────

const liveCount = enriched.filter((a) => a.url_alive === true).length;
const manifest = {
  generated_at: SCAN_ISO,
  site: catalog.site,
  stats: { total: enriched.length, live: liveCount, categories: (catalog.categories || []).length },
  categories: catalog.categories || [],
  apps: enriched,
  longtail: enrichedLongtail,
};
writeFileSync(join(ROOT, 'data/apps.json'), JSON.stringify(manifest, null, 2) + '\n');

// ───────────────────────── drift detection ─────────────────────────

const knownNames = new Set([
  ...apps.map((a) => a.name),
  ...apps.map((a) => a.dev_dir).filter(Boolean),
  ...apps.map((a) => a.repo?.split('/')[1]).filter(Boolean), // GitHub repo basename (may differ in case)
  ...longtail.map((l) => l.name),
  ...longtail.map((l) => l.repo?.split('/')[1]).filter(Boolean),
  ...ignoreNames,
].map((n) => n.toLowerCase()));
const isKnown = (name) => knownNames.has(String(name).toLowerCase());

/** Gather cheap signals for a candidate project directory. */
function inspectDir(name) {
  const path = join(DEV_ROOT, name);
  const has = (p) => existsSync(join(path, p));
  let files = [];
  try { files = readdirSync(path); } catch { /* not a dir */ }
  const nativeApp = files.some((f) => f.endsWith('.xcodeproj') || f === 'Package.swift');
  const git = existsSync(join(path, '.git'));
  const g = git ? localGit(name) : {};
  return {
    name,
    isGit: git,
    hasVercel: has('vercel.json') || has('.vercel'),
    isNativeApp: nativeApp,
    isObsidianPlugin: has('manifest.json') && has('main.js') || has('manifest.json') && has('main.ts'),
    hasPackage: has('package.json'),
    hasReadme: has('README.md'),
    lastCommitDays: daysSince(g.last_commit_iso),
    remote: g.remote || '',
  };
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  ★ LEARNING COLLABORATION POINT — classifyCandidate()                     ║
// ║                                                                            ║
// ║  When the scanner finds a /DEV folder or GitHub repo that is NOT already   ║
// ║  in apps.yaml or ignore.yaml, this function decides whether it's worth     ║
// ║  surfacing as a "feature candidate" or should be quietly skipped as noise. ║
// ║                                                                            ║
// ║  This is YOUR judgment to encode — it defines what the monitor nags you    ║
// ║  about. The baseline below is a reasonable starting point; tune the        ║
// ║  heuristics (signals, patterns, thresholds) to match how you actually      ║
// ║  decide what deserves a spot on apps.cmdspace.work.                        ║
// ║                                                                            ║
// ║  Return { verdict: 'feature-candidate' | 'skip', reason: string }.         ║
// ╚══════════════════════════════════════════════════════════════════════════╝
function classifyCandidate(info) {
  const name = info.name;

  // Obvious noise: backups, version snapshots, lecture/event packages, private infra.
  const NOISE = /(-backup$|-v\d|\bbackup\b|rehearsal|survey|cohort|-lecture|^lge-|^lg-|-package$|dotfiles|node_modules)/i;
  if (NOISE.test(name)) return { verdict: 'skip', reason: '이름 패턴상 백업/강의/개인 인프라로 추정' };

  // Strong "this is a shippable thing" signals.
  if (info.isNativeApp) return { verdict: 'feature-candidate', reason: 'Xcode/Swift 네이티브 앱' };
  if (info.isObsidianPlugin) return { verdict: 'feature-candidate', reason: 'Obsidian 플러그인 manifest 존재' };
  if (info.hasVercel) return { verdict: 'feature-candidate', reason: 'Vercel 배포 설정 존재' };

  // A live-ish git project with recent activity is worth a look.
  if (info.isGit && info.lastCommitDays !== null && info.lastCommitDays <= 45)
    return { verdict: 'feature-candidate', reason: `최근 ${info.lastCommitDays}일 내 커밋된 활성 git 프로젝트` };

  // Low signal: no deploy target, no native/plugin markers, stale or no git.
  return { verdict: 'skip', reason: '배포/앱 신호 없음 (저신호)' };
}

// enumerate candidates from local dirs + public repos
const candidateNames = new Set();
if (LOCAL) {
  let entries = [];
  try { entries = readdirSync(DEV_ROOT, { withFileTypes: true }); } catch { /* ignore */ }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith('_') || e.name.startsWith('.') || e.name === 'untitled folder') continue;
    if (!isKnown(e.name)) candidateNames.add(e.name);
  }
}
const publicRepos = ghRepoList();
for (const r of publicRepos) if (!isKnown(r.name)) candidateNames.add(r.name);

const publicByName = new Map(publicRepos.map((r) => [r.name, r]));

const candidates = [];
for (const name of [...candidateNames].sort()) {
  const info = LOCAL ? inspectDir(name) : { name, isGit: true, hasVercel: false, isNativeApp: false, isObsidianPlugin: false, hasPackage: false, hasReadme: false, lastCommitDays: publicByName.get(name)?.pushedAt ? daysSince(publicByName.get(name).pushedAt) : null, remote: '' };
  const cls = classifyCandidate(info);
  candidates.push({
    name,
    verdict: cls.verdict,
    reason: cls.reason,
    source: LOCAL && existsSync(join(DEV_ROOT, name)) ? 'local+' + (publicByName.has(name) ? 'github' : 'local-only') : 'github',
    repo_url: publicByName.get(name)?.url || (info.remote ? '' : ''),
    is_private: publicByName.get(name)?.isPrivate ?? null,
    last_commit: (info.lastCommitDays !== null && info.lastCommitDays !== undefined)
      ? isoToDate(new Date(SCAN_NOW - info.lastCommitDays * 86400000).toISOString()) : null,
    signals: {
      git: info.isGit, vercel: info.hasVercel, nativeApp: info.isNativeApp,
      obsidianPlugin: info.isObsidianPlugin, lastCommitDays: info.lastCommitDays,
    },
  });
}

// anomalies = alert-worthy problems (drive notifications). Stale is NOT an anomaly:
// a finished, released app legitimately has no recent commits — it's informational only.
const anomalies = [];
const staleApps = [];
for (const a of enriched) {
  if (a.url && a.url_alive === false) anomalies.push({ name: a.name, kind: 'dead-url', detail: `${a.url} (404/410)` });
  if (a.is_archived === true) anomalies.push({ name: a.name, kind: 'archived', detail: 'GitHub repo archived' });
  if (a.stale === true) staleApps.push({ name: a.name, detail: `${STALE_DAYS}일+ 무커밋 (last ${a.last_commit || '?'})` });
}

const featureCandidates = candidates.filter((c) => c.verdict === 'feature-candidate');

const drift = {
  generated_at: SCAN_ISO,
  mode: PUBLIC_ONLY ? 'public-only' : 'local',
  counts: {
    catalogued: apps.length,
    candidates: candidates.length,
    feature_candidates: featureCandidates.length,
    anomalies: anomalies.length,
    stale: staleApps.length,
  },
  feature_candidates: featureCandidates,
  skipped_candidates: candidates.filter((c) => c.verdict === 'skip'),
  anomalies,
  stale: staleApps,
};
writeFileSync(join(ROOT, 'data/candidates.json'), JSON.stringify(drift, null, 2) + '\n');

// ───────────────────────── CANDIDATES.md ─────────────────────────

const md = [];
md.push('# 카탈로그 드리프트 리포트');
md.push('');
md.push(`> 생성: ${SCAN_ISO} · 모드: \`${drift.mode}\` · 카탈로그 ${apps.length}개 · 신규후보 ${featureCandidates.length}개 · 이상 ${anomalies.length}건`);
md.push('');
md.push('이 파일은 `scripts/scan.mjs`가 자동 생성합니다. 새 프로젝트는 `catalog/apps.yaml`(피처링) 또는 `catalog/ignore.yaml`(제외)로 옮기면 다음 스캔부터 사라집니다.');
md.push('');
md.push('## 🆕 피처 후보 (검토 필요)');
if (featureCandidates.length === 0) md.push('\n_없음._');
else {
  md.push('\n| 프로젝트 | 소스 | 최근 커밋 | 신호 | 판단 이유 |');
  md.push('|---|---|---|---|---|');
  for (const c of featureCandidates) {
    const sig = Object.entries(c.signals).filter(([, v]) => v === true).map(([k]) => k).join(', ') || '—';
    md.push(`| \`${c.name}\` | ${c.source}${c.is_private ? ' 🔒' : ''} | ${c.last_commit || '—'} | ${sig} | ${c.reason} |`);
  }
}
md.push('');
md.push('## ⚠️ 기존 앱 이상 (알림 대상)');
if (anomalies.length === 0) md.push('\n_없음._');
else {
  md.push('\n| 앱 | 유형 | 상세 |');
  md.push('|---|---|---|');
  for (const a of anomalies) md.push(`| \`${a.name}\` | ${a.kind} | ${a.detail} |`);
}
md.push('');
if (staleApps.length) {
  md.push('<details><summary>😴 오래된 앱 (참고용, ' + staleApps.length + '개 · 알림 아님)</summary>\n');
  for (const a of staleApps) md.push(`- \`${a.name}\` — ${a.detail}`);
  md.push('\n</details>');
  md.push('');
}
md.push('<details><summary>스킵된 후보 (저신호) ' + drift.skipped_candidates.length + '개</summary>\n');
for (const c of drift.skipped_candidates) md.push(`- \`${c.name}\` — ${c.reason}`);
md.push('\n</details>');
md.push('');
writeFileSync(join(ROOT, 'CANDIDATES.md'), md.join('\n') + '\n');

// ───────────────────────── summary + exit ─────────────────────────

console.log(`[scan] mode=${drift.mode} apps=${enriched.length} live=${liveCount} ` +
  `feature_candidates=${featureCandidates.length} anomalies=${anomalies.length}`);
if (featureCandidates.length) console.log('[scan] 🆕 ' + featureCandidates.map((c) => c.name).join(', '));
if (anomalies.length) console.log('[scan] ⚠️  ' + anomalies.map((a) => `${a.name}:${a.kind}`).join(', '));
console.log(`[scan] wrote data/apps.json, data/candidates.json, CANDIDATES.md`);
// machine-readable last line for wrappers (notify.sh / CI)
console.log(`SCAN_RESULT feature_candidates=${featureCandidates.length} anomalies=${anomalies.length}`);

if (FAIL_ON_CANDIDATES && featureCandidates.length > 0) process.exit(20);
