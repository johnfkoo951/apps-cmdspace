#!/usr/bin/env node
// Build the product pages from reviewed public Markdown. No network or catalog scan.
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Marked } from 'marked';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { products, updated } = JSON.parse(readFileSync(join(ROOT, 'catalog/plugins.json'), 'utf8'));
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const sum = (s) => createHash('sha256').update(s).digest('hex');
const BASE = 'https://apps.cmdspace.work/plugins/';
const ui = {
  ko: { home:'모든 앱', family:'플러그인', guide:'사용설명서', source:'GitHub 소스', read:'소개와 사용설명서', prerequisites:'시작 전 준비', limits:'먼저 알아둘 것', contents:'이 문서의 내용', download:'Markdown 내려받기', verified:'문서 기준', sourceVersion:'소스 버전', dev:'개발 중', checked:'소스 확인', release:'공개 릴리스', top:'맨 위로', saved:'목적에 맞는 도구부터 시작하세요.', tagline:'내 지식의 흐름에 맞춰 만든 도구들', title:'노트가 일하게 만드는\n네 가지 연결.', intro:'자료를 모으는 곳, 생각을 발전시키는 곳, 결과를 건네는 곳. 서로 떨어져 있던 작업을 Obsidian 안팎으로 연결합니다.', choose:'지금 막힌 곳에서 시작하세요', chooseText:'네 개를 모두 설치할 필요는 없습니다. 내 작업에서 다음으로 이어지지 않는 한 지점을 골라 보세요.', workflow:'한 노트가 결과물이 되기까지', workflowText:'Eagle로 자료를 연결하고, Achmage로 맥락을 지정해 작업하고, Share로 검토한 결과를 건넵니다. Zotero는 문헌 근거를 잇는 다음 연결을 개발하고 있습니다.', seminar:'실습 자료와 오래 쓰는 설명서', seminarText:'2026년 9월 14일 세미나의 CMDSPACE 발표 파트는 같은 노트로 이 흐름을 보여줍니다. 설치와 설정은 이 설명서에서 다시 확인할 수 있습니다.', seminarLink:'세미나 자료', footer:'Yohan Koo (CMDSPACE). 내게 필요한 도구를 만들고 나눕니다.', skip:'본문으로 바로가기', nojs:'이 페이지는 JavaScript 없이도 읽을 수 있습니다. 두 언어의 설명서가 아래에 이어집니다.' },
  en: { home:'All apps', family:'Plugins', guide:'User guide', source:'GitHub source', read:'Explore & read the guide', prerequisites:'Before you start', limits:'Know the boundaries', contents:'On this page', download:'Download Markdown', verified:'Documentation checked', sourceVersion:'Source version', dev:'In development', checked:'Source checked', release:'Public release', top:'Back to top', saved:'Start with the tool your work needs.', tagline:'Tools shaped around your knowledge workflow', title:'Four connections.\nNotes that do real work.', intro:'Collect material, develop ideas, and deliver the result. Connect work that used to live in separate places, in and around Obsidian.', choose:'Start where your work gets stuck', chooseText:'You do not need all four plugins. Choose the missing connection in your own workflow and start there.', workflow:'From a note to something useful', workflowText:'Connect assets with Eagle, work with chosen context in Achmage, and share the reviewed result with Share. Zotero is the next connection under development: returning to literature and evidence.', seminar:'A live session. A lasting reference.', seminarText:'The CMDSPACE segment of the September 14, 2026 seminar follows this workflow with one note. Return here for installation, settings, and the complete guides.', seminarLink:'Seminar materials', footer:'Yohan Koo (CMDSPACE). Build the tools you need. Share what works.', skip:'Skip to content', nojs:'This page works without JavaScript. Both language editions are available below.' }
};
function safeURL(href) {
  const normalized = String(href || '').replace(/[\x00- ]/g, '');
  if (/^(https?:|mailto:|obsidian:)/i.test(normalized) || /^(#|\.\/|\.\.\/)/.test(normalized) || !/^[a-z][a-z0-9+.-]*:/i.test(normalized)) return href;
  throw new Error(`Unsafe link scheme: ${href}`);
}
function renderGuide(md, lang, p) {
  const prose = md.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]+`/g, '');
  if (/^---\s*\n/.test(md) || /omnicontrol:|\/Users\//.test(md) || /\[\[|%%|file:\/\//.test(prose)) throw new Error(`Private metadata or vault notation in ${p.slug}/${lang}`);
  const toc = [];
  const counts = new Map();
  const parser = new Marked({ gfm: true, renderer: {
    html({text}) { return esc(text); },
    heading({tokens, depth, text}) {
      const base = text.toLowerCase().replace(/<[^>]*>/g, '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'section';
      const n = counts.get(base) || 0; counts.set(base, n + 1);
      const id = `${lang}-${base}${n ? `-${n}` : ''}`;
      if (depth === 2 || depth === 3) toc.push({id, text: text.replace(/[`*_]/g, ''), depth});
      return `<h${depth} id="${id}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
    },
    link({href, title, tokens}) {
      safeURL(href);
      let target = href;
      if (href?.startsWith('#')) target = `#${lang}-${href.slice(1)}`;
      else if (href && !/^(https?:|mailto:|obsidian:|\/)/i.test(href)) target = new URL(href, `https://github.com/${p.repo}/blob/main/docs/`).href;
      return `<a href="${esc(target || '')}"${title ? ` title="${esc(title)}"` : ''}>${this.parser.parseInline(tokens)}</a>`;
    },
    image({href, text, title}) {
      safeURL(href);
      const src = /^https?:/i.test(href) ? href : new URL(href, `https://raw.githubusercontent.com/${p.repo}/main/docs/`).href;
      return `<img src="${esc(src)}" alt="${esc(text)}" loading="lazy"${title ? ` title="${esc(title)}"` : ''}>`;
    }
  }});
  return { html: parser.parse(md), toc };
}
function head(title, description, path, assetPrefix) {
  const url = BASE + path;
  return `<!doctype html>\n<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${url}">
<meta property="og:type" content="website"><meta property="og:site_name" content="CMDSPACE"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${url}"><meta property="og:image" content="${BASE}assets/og-plugins.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="CMDSPACE Plugins: Eagle, Achmage, Share, Zotero"><meta property="og:locale" content="ko_KR"><meta property="og:locale:alternate" content="en_US"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="${BASE}assets/og-plugins.png"><meta name="twitter:image:alt" content="CMDSPACE Plugins"><meta name="theme-color" content="#134538">
<link rel="icon" type="image/png" href="${assetPrefix}logo.png"><link rel="apple-touch-icon" href="${assetPrefix}logo.png"><link rel="stylesheet" href="${assetPrefix}plugins.css"><script src="${assetPrefix}plugins.js" defer></script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<script>try{const l=new URLSearchParams(location.search).get('lang')||localStorage.getItem('cmds-lang');if(l==='en')document.documentElement.lang='en';const t=localStorage.getItem('cmds-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch{}</script></head><body>
<a href="#main" class="skip"><span data-lang="ko">본문으로 바로가기</span><span data-lang="en">Skip to content</span></a>`;
}
function header(prefix) {
  return `<header class="site-header"><a class="brand" href="/" aria-label="CMDSPACE Apps"><img src="${prefix}logo.png" alt="" width="34" height="34"><span>CMDSPACE <b>Plugins</b></span></a><nav aria-label="Primary"><a href="/" data-ko="모든 앱" data-en="All apps">모든 앱</a><a href="/plugins/" data-ko="플러그인" data-en="Plugins">플러그인</a><button id="language" type="button" aria-label="Switch language">EN</button><button id="theme" type="button" aria-label="Toggle theme" data-ko="테마" data-en="Theme">테마</button></nav></header>`;
}
function footer() { return `<footer class="site-footer"><a href="https://cmdspace.work">CMDSPACE</a><p data-ko="${esc(ui.ko.footer)}" data-en="${esc(ui.en.footer)}">${esc(ui.ko.footer)}</p><a href="https://bio.cmdspace.work">bio.cmdspace.work ↗</a></footer><div id="glossTip" role="tooltip" hidden></div><p class="sr-only" id="feedback" aria-live="polite"></p></body></html>`; }
function status(p, lang) {
  const t = ui[lang];
  return `<span class="status${p.stage === 'development' ? ' development' : ''}">${esc(p.stage === 'development' ? t.dev : p.releaseVersion ? `${t.release} ${p.releaseVersion}` : t.checked)}</span>`;
}
function card(p, lang, index) {
  const d = p[lang], t = ui[lang];
  return `<article class="product-card"><div class="card-top"><span class="role">${esc(d.role)}</span>${status(p, lang)}</div><h3><a href="${p.slug}/?lang=${lang}">${esc(p.name)}</a></h3><p class="card-line">${esc(d.headline).replace(/\n/g, '<br>')}</p><p>${esc(d.description)}</p><ul>${d.tasks.map(s=>`<li>${esc(s)}</li>`).join('')}</ul><a class="card-link" href="${p.slug}/?lang=${lang}">${t.read} <span aria-hidden="true">↗</span></a></article>`;
}
function landing() {
  let html = head('CMDSPACE Plugins', ui.ko.intro, '', 'assets/') + header('assets/');
  html += '<main id="main">';
  for (const lang of ['ko','en']) {
    const t = ui[lang];
    html += `<div data-lang="${lang}" class="landing"><section class="hero"><p class="eyebrow">${t.tagline}</p><h1>${esc(t.title).replace(/\n/g,'<br>')}</h1><p class="lede">${t.intro}</p><a class="button primary" href="#${lang}-products">${t.choose} ↓</a><div class="wordline" aria-label="Plugin family"><span>Eagle</span><span>Achmage</span><span>Share</span><span>Zotero <small>${t.dev}</small></span></div></section><section id="${lang}-products" class="products-section"><div class="section-intro"><h2>${t.choose}</h2><p>${t.chooseText}</p></div><div class="product-grid">${products.map((p,i)=>card(p,lang,i)).join('')}</div></section><section class="workflow"><p class="eyebrow">CONNECT → MERGE → DEVELOP → SHARE</p><h2>${t.workflow}</h2><p>${t.workflowText}</p><div class="workflow-steps"><span>Eagle<br><small>${products[0][lang].role}</small></span><span>Achmage<br><small>${products[1][lang].role}</small></span><span>Share<br><small>${products[2][lang].role}</small></span></div></section><section class="seminar"><div><h2>${t.seminar}</h2><p>${t.seminarText}</p></div><a class="button" href="https://labs.cmdspace.work/achmage-seminar-0914/materials/">${t.seminarLink} ↗</a></section></div>`;
  }
  return html + '</main>' + footer();
}
function productPage(p, guides) {
  let html = head(`${p.name} | CMDSPACE Plugins`, p.ko.description, `${p.slug}/`, '../assets/') + header('../assets/');
  html += '<main id="main" class="product-page">';
  for (const lang of ['ko','en']) {
    const t=ui[lang], d=p[lang], g=guides[lang];
    html += `<div data-lang="${lang}"><section class="product-hero"><div class="product-meta"><a href="../?lang=${lang}">← ${t.family}</a>${status(p,lang)}</div><p class="eyebrow">${esc(p.name)} / ${esc(d.role)}</p><h1>${esc(d.headline).replace(/\n/g,'<br>')}</h1><p class="lede">${esc(d.description)}</p><div class="actions"><a class="button primary" href="#${lang}-manual">${t.guide} ↓</a>${p.publicRepo === false ? '' : `<a class="button" href="https://github.com/${p.repo}">${t.source} ↗</a>`}</div>${p.screenshot ? `<figure class="product-preview"><img src="../assets/${esc(p.screenshot)}" alt="${esc(d.screenshotCaption)}" loading="lazy"><figcaption>${esc(d.screenshotCaption)}</figcaption></figure>` : ''}<div class="requirements"><div><h2>${t.prerequisites}</h2><p>${esc(d.requires)}</p></div><div><h2>${t.limits}</h2><p>${esc(d.boundary)}</p></div></div></section><div class="docs-layout" id="${lang}-manual"><aside class="toc"><p>${t.contents}</p><nav aria-label="${t.contents}">${g.toc.map(h=>`<a href="#${h.id}" class="depth-${h.depth}">${esc(h.text)}</a>`).join('')}</nav><a class="download" href="guide.${lang}.md" download>${t.download} ↙</a></aside><article class="prose"><div class="doc-meta"><span>${t.verified} ${updated}</span><span>${p.publicSourceVersion ? (lang==='ko'?'로컬 개발본':'Local development') : t.sourceVersion} ${esc(p.sourceVersion)}</span>${p.publicSourceVersion ? `<span>Public main ${esc(p.publicSourceVersion)}</span>` : ''}<a href="guide.${lang}.md" download>Markdown ↙</a></div>${g.html}<a href="#main" class="back-top">${t.top} ↑</a></article></div></div>`;
  }
  return html + '</main>' + footer();
}
const outputs = [];
mkdirSync(join(ROOT,'plugins/assets'),{recursive:true});
copyFileSync(join(ROOT,'assets/logos/cmds-logo-round.png'),join(ROOT,'plugins/assets/logo.png'));
for(const p of products) {
  const guides = {};
  for(const lang of ['ko','en']) {
    const file=join(ROOT,'plugins',p.slug,`guide.${lang}.md`);
    if(!existsSync(file)) throw new Error(`Missing reviewed manual: ${file}. Run sync-plugin-docs.mjs first.`);
    const md=readFileSync(file,'utf8');
    guides[lang]=renderGuide(md,lang,p);
    outputs.push({file:`${p.slug}/guide.${lang}.md`,sha256:sum(md)});
  }
  const page=productPage(p,guides);
  writeFileSync(join(ROOT,'plugins',p.slug,'index.html'),page);
  outputs.push({file:`${p.slug}/index.html`,sha256:sum(page)});
}
writeFileSync(join(ROOT,'plugins/index.html'),landing());
writeFileSync(join(ROOT,'plugins/build-manifest.json'),JSON.stringify({updated,renderer:'marked@18.0.13',outputs},null,2)+'\n');
console.log(`Built ${products.length} product pages, bilingual guides and introduction.`);
