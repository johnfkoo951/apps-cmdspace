[![한국어](https://img.shields.io/badge/한국어-README-E985A2)](README.ko.md)

# CMDSPACE Apps

A curated home for the apps, plugins, and tools built by CMDSPACE.

**[App gallery](https://apps.cmdspace.work)** | **[Plugin guides](https://apps.cmdspace.work/plugins/)**

## What it does

- **Public gallery:** a bilingual static site with category filters, text search, keyboard quick-find, and light/dark themes.
- **Catalog monitoring:** an editorial YAML catalog enriched with GitHub release and activity information. Local and scheduled scans identify projects for editorial review, not automatic publication.

The four-plugin documentation area covers **CMDS Eagle**, **CMDS Achmage**, **CMDS Share**, and **CMDS Zotero**. Other gallery entries remain available. Zotero is work in progress, not a finished general release.

## Plugin family

| Plugin | Connection | Guide |
| --- | --- | --- |
| CMDS Eagle | Bring assets from Eagle into notes | [Overview and guide](https://apps.cmdspace.work/plugins/cmds-eagle/) |
| CMDS Achmage | Work with selected notes and review AI edits | [Overview and guide](https://apps.cmdspace.work/plugins/cmds-achmage/) |
| CMDS Share | Publish a reviewed note and manage its link | [Overview and guide](https://apps.cmdspace.work/plugins/cmds-share/) |
| CMDS Zotero | Connect literature, annotations and citations; in development | [Development guide](https://apps.cmdspace.work/plugins/cmds-zotero/) |

Manuals start as Markdown in the owner's vault. Reviewed public copies are shared by plugin repositories and this website; generated HTML is not a separate manuscript. See [the publishing workflow](docs/plugin-publishing.md).

## Local development

Requirements: Node.js 20+, npm, and Python 3 for the local static server. Catalog scans use an authenticated GitHub CLI. Website checks use Python Playwright and Chromium.

```sh
npm ci
npm run dev
```

Open `http://localhost:4321`. The gallery needs no application server or database.

## Structure

```text
catalog/apps.yaml             Editorial catalog: apps, categories and longtail
catalog/plugins.json          Four-plugin summaries and documentation status
catalog/ignore.yaml           Known exclusions from discovery
scripts/scan.mjs               Enrichment and candidate discovery
scripts/sync-plugin-docs.mjs   Explicit vault-to-public manual export
scripts/build-plugins.mjs      Static bilingual guide build
scripts/check-plugins.py       Local website verification
scripts/stage-public.mjs       Public-only upload staging
index.html                    App gallery
plugins/                      Product pages and downloadable manuals
assets/logos/                 CMDSPACE brand assets
assets/og/                    Social preview images and templates
data/apps.json                Generated gallery manifest
data/candidates.json          Candidate report; not for website upload
CANDIDATES.md                 Discovery report; not for website upload
.github/workflows/catalog.yml Scheduled public catalog refresh
launchd/                      Local scheduled-scanning definition
```

## Update the catalog

1. Edit `catalog/apps.yaml`, choosing an existing category and a `flagship` or `featured` tier.
2. Set `repo` to the verified public repository when applicable. `dev_dir` identifies its local project directory.
3. Set `url` for a website, `docs_url` for a manual, and `download: releases` only when a GitHub release is the intended download channel.
4. Generate and review the manifest diff. Do not mix unrelated existing changes into the publication.

`enrichApp()` explicitly selects supported fields. New fields must pass through enrichment and rendering. A manifest version, a local tag, a published release and community-directory acceptance are different facts.

```sh
npm run scan          # Local projects and GitHub; includes private/local discovery
npm run scan:public   # Public GitHub only
```

Both scans rewrite `data/apps.json`, `data/candidates.json`, and `CANDIDATES.md`. They are not needed to rebuild manuals. `classifyCandidate()` separates promising projects from backups, event packages and low-signal directories. Add known exclusions to `catalog/ignore.yaml`.

### Scheduled monitoring

The optional local LaunchAgent schedules a full scan for 09:12 local time and can notify about candidates or broken app links. Staleness is informational.

```sh
./scripts/install-launchd.sh
launchctl kickstart -k gui/$(id -u)/work.cmdspace.apps-catalog
./scripts/install-launchd.sh --uninstall
```

The GitHub Actions schedule corresponds to 06:17 KST, with additional catalog-change and manual triggers. Deployment depends on configured Git integration or `VERCEL_TOKEN`; workflow completion alone is not proof of a successful production deployment. The guide build installs no scheduled jobs.

## Build guides

Set the actual source paths in `VAULT_ROOT` and `DEV_ROOT`, and a temporary verification directory in `SCRATCH`:

```sh
node scripts/sync-plugin-docs.mjs --vault-root "$VAULT_ROOT" --repo-root "$DEV_ROOT"
node scripts/sync-plugin-docs.mjs --vault-root "$VAULT_ROOT" --repo-root "$DEV_ROOT" --write
npm run build:plugins
python3 scripts/check-plugins.py --out "$SCRATCH/plugin-web-checks"
```

Sync stops if an existing repository copy differs from its master. The renderer escapes raw HTML and rejects unsafe link schemes. Builds do not run plugins, upload notes, or publish websites.

## Deployment

**Do not upload the whole working tree for a documentation release.** Candidate reports and local monitoring sources are not public website content.

```sh
node scripts/stage-public.mjs --out "$PUBLIC_STAGE"
```

Use a new directory. Review the entire stage, confirm the existing Vercel project **`apps-cmdspace`**, and obtain approval before deployment. Staging excludes candidate reports and local configuration, and removes known private-repository links from the public manifest. It does not deploy, commit, or push.

The documented DNS record for **apps.cmdspace.work** is an `apps` CNAME to `cname.vercel-dns.com`. No new subdomain is needed for `/plugins/`. The project has a verified Git integration. Its Vercel build runs `npm run build:public` and serves only `public/`, applying the same file allowlist to automatic deployments.

`scripts/build-og.sh` renders 1200×630 templates using local Chrome. The plugin template is `assets/og/templates/og-plugins.html`; its image is served at `plugins/assets/og-plugins.png`.

## Author

**Yohan Koo (CMDSPACE)** | [cmdspace.work](https://cmdspace.work)

By CMDSPACE.
