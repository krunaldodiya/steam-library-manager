#!/usr/bin/env bash
set -e

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DEST="$HOME/.local/bin/steam-library-manager"
DESKTOP_DEST="$HOME/.local/share/applications/steam-library-manager.desktop"
STEAM_PLUGINS_DIR="$HOME/.local/share/Steam/plugins"
MILLENNIUM_PLUGINS_DIR="$HOME/.local/share/millennium/plugins"

echo "=== Installing Dedicated Steam Library Manager ==="

# 1. Install CLI & Engine binary
mkdir -p "$HOME/.local/bin" "$HOME/.local/share/applications"
cp "$REPO_DIR/bin/steam-library-manager" "$BIN_DEST"
chmod +x "$BIN_DEST"
echo "[✓] Installed CLI & Daemon engine to $BIN_DEST"

# 2. Install Desktop application launcher
cp "$REPO_DIR/desktop/steam-library-manager.desktop" "$DESKTOP_DEST"
chmod +x "$DESKTOP_DEST"
echo "[✓] Installed Desktop launcher to $DESKTOP_DEST"

# 3. Register as dedicated Millennium Steam plugin if Millennium directories exist
INSTALLED_AS_PLUGIN=false
for pdir in "$STEAM_PLUGINS_DIR" "$MILLENNIUM_PLUGINS_DIR"; do
    if [ -d "$pdir" ]; then
        DEST="$pdir/steam-library-manager"
        rm -rf "$DEST"
        ln -sf "$REPO_DIR" "$DEST"
        echo "[✓] Registered as dedicated Steam plugin in: $DEST"
        INSTALLED_AS_PLUGIN=true
    fi
done

if [ "$INSTALLED_AS_PLUGIN" = false ]; then
    mkdir -p "$STEAM_PLUGINS_DIR"
    ln -sf "$REPO_DIR" "$STEAM_PLUGINS_DIR/steam-library-manager"
    echo "[✓] Linked to dedicated Steam plugins folder: $STEAM_PLUGINS_DIR/steam-library-manager"
fi

echo ""
echo "=== Installation Successful! ==="
echo "Features available:"
echo "1. Terminal CLI: steam-library-manager list / export / restore / backups"
echo "2. Dedicated Web GUI: steam-library-manager gui"
echo "3. Desktop App: Search 'Steam Library Manager' in your KDE application menu"
echo "4. Dedicated In-Steam Plugin: Packaged in $REPO_DIR with plugin.json"
