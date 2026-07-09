#!/usr/bin/env bash
# local-scan.sh — launchd entrypoint. Runs the FULL local scan (local /DEV git,
# private repos, unpushed work) then notifies on drift. Runs under a login shell
# so node/gh/homebrew are on PATH.
set -euo pipefail
cd "$(dirname "$0")/.."

NODE="$(command -v node || true)"
[ -z "$NODE" ] && for p in /opt/homebrew/bin/node /usr/local/bin/node; do [ -x "$p" ] && NODE="$p" && break; done
[ -z "$NODE" ] && { echo "[local-scan] node not found on PATH" >&2; exit 127; }

"$NODE" scripts/scan.mjs --local
bash scripts/notify.sh
