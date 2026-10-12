#!/usr/bin/env bash
set -e

echo "=== Uninstalling Steam Library Manager ==="

rm -f "$HOME/.local/bin/steam-library-manager"
rm -f "$HOME/.local/share/applications/steam-library-manager.desktop"
rm -rf "$HOME/.local/share/Steam/plugins/steam-library-manager"
rm -rf "$HOME/.local/share/millennium/plugins/steam-library-manager"

echo "[✓] Uninstalled cleanly. Your backups in ~/SteamLibrary-Backups remain untouched."
