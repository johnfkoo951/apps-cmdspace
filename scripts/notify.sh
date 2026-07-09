#!/usr/bin/env bash
# notify.sh — after a local scan, raise a macOS notification if the catalog
# drifted (new feature-candidates) or an app broke (dead-url / archived).
# Silent when there is nothing to report. Called by launchd via local-scan.sh.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f data/candidates.json ] || exit 0

summary=$(python3 - <<'PY'
import json
d = json.load(open('data/candidates.json'))
c = d['counts']
fc, an = c['feature_candidates'], c['anomalies']
if fc == 0 and an == 0:
    raise SystemExit  # nothing to report → empty stdout
names = [x['name'] for x in d.get('feature_candidates', [])]
parts = []
if fc:
    parts.append(f"신규 후보 {fc}개: " + ", ".join(names[:4]))
if an:
    parts.append(f"이상 {an}건")
print(" · ".join(parts))
PY
) || true

[ -z "${summary:-}" ] && exit 0

title="CMDSPACE Apps 카탈로그"
if command -v terminal-notifier >/dev/null 2>&1; then
  terminal-notifier -title "$title" -message "$summary" \
    -open "file://$PWD/CANDIDATES.md" -group work.cmdspace.apps-catalog
else
  osascript -e "display notification \"${summary//\"/\\\"}\" with title \"$title\" sound name \"Glass\""
fi
echo "[notify] $summary"
