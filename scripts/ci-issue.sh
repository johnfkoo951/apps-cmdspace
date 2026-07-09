#!/usr/bin/env bash
# ci-issue.sh — GitHub Action helper. Opens or refreshes a single tracking issue
# listing uncatalogued feature-candidates + broken apps. Closes it when clean.
# Requires: gh (GH_TOKEN in env), data/candidates.json (from a prior scan).
set -euo pipefail
cd "$(dirname "$0")/.."

TITLE="🆕 카탈로그 드리프트 — 검토 필요"
[ -f data/candidates.json ] || { echo "no candidates.json"; exit 0; }

read -r FC AN < <(python3 -c "import json;d=json.load(open('data/candidates.json'));print(d['counts']['feature_candidates'], d['counts']['anomalies'])")

existing=$(gh issue list --state open --search "$TITLE in:title" --json number --jq '.[0].number' 2>/dev/null || echo "")

if [ "$FC" -eq 0 ] && [ "$AN" -eq 0 ]; then
  if [ -n "$existing" ]; then
    gh issue close "$existing" --comment "✅ 모든 후보/이상 해소됨 — 자동 종료." || true
  fi
  echo "clean; nothing to open"; exit 0
fi

body=$(python3 - <<'PY'
import json
d = json.load(open('data/candidates.json'))
L = [f"> 자동 생성 · {d['generated_at']} · 모드 `{d['mode']}`", ""]
fc = d.get('feature_candidates', [])
if fc:
    L += ["## 🆕 피처 후보", "", "| 프로젝트 | 소스 | 최근 커밋 | 이유 |", "|---|---|---|---|"]
    for c in fc:
        L.append(f"| `{c['name']}` | {c['source']} | {c.get('last_commit') or '—'} | {c['reason']} |")
    L.append("")
an = d.get('anomalies', [])
if an:
    L += ["## ⚠️ 앱 이상", "", "| 앱 | 유형 | 상세 |", "|---|---|---|"]
    for a in an:
        L.append(f"| `{a['name']}` | {a['kind']} | {a['detail']} |")
    L.append("")
L += ["---", "`catalog/apps.yaml`(피처링) 또는 `catalog/ignore.yaml`(제외)로 옮기면 다음 스캔에서 사라집니다."]
print("\n".join(L))
PY
)

if [ -n "$existing" ]; then
  gh issue edit "$existing" --body "$body"
  echo "updated issue #$existing"
else
  gh issue create --title "$TITLE" --body "$body" --label "catalog" 2>/dev/null \
    || gh issue create --title "$TITLE" --body "$body"
  echo "created issue"
fi
