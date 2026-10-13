#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
UNIT_NAME="steam-library-manager.service"
UNIT_DEST="$HOME/.config/systemd/user/$UNIT_NAME"
OLD_PLUGIN_LINK="$HOME/.local/share/Steam/plugins/steam-library-manager"
OLD_MILLENNIUM_LINK="$HOME/.local/share/millennium/plugins/steam-library-manager"

echo "=== Uninstalling Steam Library Manager ==="
systemctl --user disable --now "$UNIT_NAME" >/dev/null 2>&1 || true
rm -f "$UNIT_DEST"
systemctl --user daemon-reload >/dev/null 2>&1 || true

rm -f "$HOME/.local/bin/steam-library-manager"
rm -f "$HOME/.local/share/applications/steam-library-manager.desktop"
rm -rf "$HOME/.local/share/steam-library-manager"
if [[ -L "$OLD_PLUGIN_LINK" ]] && [[ "$(readlink "$OLD_PLUGIN_LINK")" == "$REPO_DIR" ]]; then
    rm "$OLD_PLUGIN_LINK"
fi
if [[ -L "$OLD_MILLENNIUM_LINK" ]] && [[ "$(readlink "$OLD_MILLENNIUM_LINK")" == "$REPO_DIR" ]]; then
    rm "$OLD_MILLENNIUM_LINK"
fi

echo "Uninstalled. Steam Library Manager backups in ~/SteamLibrary-Backups remain untouched."
