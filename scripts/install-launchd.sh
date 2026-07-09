#!/usr/bin/env bash
# install-launchd.sh — install (or reinstall) the daily local catalog scan.
# Symlinks the plist into ~/Library/LaunchAgents and (re)bootstraps it.
# Uninstall:  ./scripts/install-launchd.sh --uninstall
set -euo pipefail
cd "$(dirname "$0")/.."

LABEL="work.cmdspace.apps-catalog"
SRC="$PWD/launchd/$LABEL.plist"
DEST="$HOME/Library/LaunchAgents/$LABEL.plist"
DOMAIN="gui/$(id -u)"

if [ "${1:-}" = "--uninstall" ]; then
  launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
  rm -f "$DEST"
  echo "✅ uninstalled $LABEL"
  exit 0
fi

chmod +x scripts/local-scan.sh scripts/notify.sh
mkdir -p "$HOME/Library/LaunchAgents"
ln -sf "$SRC" "$DEST"
launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
launchctl bootstrap "$DOMAIN" "$DEST"
echo "✅ installed $LABEL (daily 09:12). Log: /tmp/cmds-apps-catalog.log"
echo "   run now:  launchctl kickstart -k $DOMAIN/$LABEL"
