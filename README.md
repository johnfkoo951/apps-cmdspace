# apps-cmdspace

**커맨드스페이스가 만든 앱·도구 쇼케이스 + 카탈로그 모니터링 엔진** → [apps.cmdspace.work](https://apps.cmdspace.work)

두 가지를 한 레포로 관장한다:

1. **공개 쇼케이스** — `/DEV`·GitHub의 프로젝트 중 *직접 만든 앱/도구*만 큐레이션해 카테고리별 갤러리로 보여준다.
2. **상시 모니터링 엔진** — `/DEV` 폴더 + GitHub를 주기 스캔해 (a) featured 앱의 라이브 상태(최근 커밋·릴리스·★·배포 URL 생사)를 자동 갱신하고, (b) 아직 카탈로그에 없는 새 프로젝트를 *후보*로 감지·알림한다.

데이터 흐름은 apex(cmdspace.work)의 `gallery.json` 패턴과 동일: **`scan.mjs` → `data/apps.json` → 정적 `index.html`이 fetch 렌더.** 큐레이션은 사람이(`catalog/apps.yaml`), 라이브 상태·드리프트 감지는 스캐너가 담당한다.

## 구조

```
catalog/apps.yaml     ← ★ 큐레이션 원천 (사람이 편집): featured + longtail + 카테고리
catalog/ignore.yaml   ← 알려진 제외 목록 (포크·강의·백업·개인 인프라) — 드리프트 재감지 방지
scripts/scan.mjs      ← 스캐너: apps.yaml enrich → data/apps.json + candidates.json + CANDIDATES.md
index.html            ← v4.3 Landing 갤러리 (data/apps.json 렌더)
data/apps.json        ← 생성물 (커밋됨, Vercel이 서빙)
data/candidates.json  ← 생성물: 드리프트 리포트
CANDIDATES.md         ← 사람이 읽는 드리프트 리포트
.github/workflows/catalog.yml         ← 클라우드 크론: 공개 스캔 → 커밋 → Vercel 자동배포 → 이슈
launchd/…apps-catalog.plist           ← 로컬 크론: 매일 전체 스캔 + macOS 알림
```

## 앱 추가·수정하기 (가장 흔한 작업)

1. `catalog/apps.yaml`의 `apps:`에 항목 추가 (또는 기존 항목 수정).
   - `category`는 `categories:`의 `id` 중 하나. `tier`는 `flagship`(상단) / `featured`.
   - `repo: owner/name` → GitHub에서 ★·릴리스·최근 push 자동 수집.
   - `dev_dir: <폴더명>` → 로컬 `/DEV/<폴더>` git에서 마지막 커밋 수집.
   - `url:` 배포 주소(있으면). `download: releases` → 최신 GitHub 릴리스로 자동 링크(네이티브 앱용).
2. `npm run scan` → `data/apps.json` 재생성.
3. 커밋·푸시 → (Vercel Git 연동 시) 자동 배포. 또는 `vercel deploy --prod --yes`.

제외할 프로젝트는 `catalog/ignore.yaml`로.

## 스캔

```bash
npm run scan          # --local: 로컬 /DEV git + 비공개 repo + gh (전체)
npm run scan:public   # --public-only: gh API만 (CI용, 로컬 파일 안 봄)
```

산출: `data/apps.json`(렌더 매니페스트) · `data/candidates.json` · `CANDIDATES.md`.
스캔이 새 *피처 후보*나 *앱 이상(dead-url/archived)*을 찾으면 리포트에 올린다. (오래된 앱 `stale`은 정보성 — 알림 대상 아님.)

## 모니터링 (둘 다)

**로컬 (launchd)** — 매일 09:12, 로컬 `/DEV`·비공개·미푸시까지 전체 탐지 후 새 후보/이상 시 macOS 알림.
```bash
./scripts/install-launchd.sh            # 설치
launchctl kickstart -k gui/$(id -u)/work.cmdspace.apps-catalog   # 즉시 1회
./scripts/install-launchd.sh --uninstall
```

**클라우드 (GitHub Actions)** — `.github/workflows/catalog.yml`, 매일 06:17 KST + `catalog/**` 푸시 시. 공개 repo 상태 갱신 → `data/apps.json` 변경 시 커밋(→ Vercel 자동배포) → 드리프트 GitHub 이슈 개설/갱신.
- Vercel **Git 연동**을 켜면 커밋만으로 배포된다. 아니면 `VERCEL_TOKEN` 시크릿을 넣으면 Action이 CLI로 배포한다.

역할 분담: launchd = 로컬 전권 탐지·알림, Action = 공개 상태 신선도·자동 배포·이슈.

## 배포 (Vercel + Cloudflare)

```bash
vercel link            # 프로젝트 apps-cmdspace 연결
vercel deploy --prod --yes
```
Cloudflare DNS: `apps` CNAME → `cname.vercel-dns.com`. Vercel 도메인에 `apps.cmdspace.work` 추가.
OG 이미지 재생성: `bash scripts/build-og.sh` (Chrome headless).

## 큐레이션 판단은 `scan.mjs`의 `classifyCandidate()`에

새로 감지된 프로젝트를 *피처 후보*로 올릴지 *노이즈로 스킵*할지는 `scripts/scan.mjs`의
`classifyCandidate()` 휴리스틱이 결정한다. 이 함수가 "모니터가 무엇을 알려줄지"를 정의하므로,
피처 기준이 바뀌면 여기 신호·패턴·임계값을 조정하면 된다.
