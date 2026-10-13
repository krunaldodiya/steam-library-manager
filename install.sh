#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
APP_DIR="$HOME/.local/share/steam-library-manager"
APP_BIN="$APP_DIR/bin/steam-library-manager"
BIN_DEST="$HOME/.local/bin/steam-library-manager"
DESKTOP_DEST="$HOME/.local/share/applications/steam-library-manager.desktop"
UNIT_DIR="$HOME/.config/systemd/user"
UNIT_DEST="$UNIT_DIR/steam-library-manager.service"
SERVICE_PATH="${PATH:-/usr/bin:/bin}"

fail() {
    printf 'Installation failed: %s\n' "$1" >&2
    exit 1
}

command -v systemctl >/dev/null || fail "systemd user services are required"
systemctl --user show-environment >/dev/null 2>&1 || fail "no systemd user manager is available"
command -v node >/dev/null || fail "Node.js 22 or newer is required"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
(( NODE_MAJOR >= 22 )) || fail "Node.js 22 or newer is required (found $(node --version))"
[[ "$SERVICE_PATH" != *$'\n'* && "$SERVICE_PATH" != *'"'* ]] || fail "PATH contains characters unsafe for a systemd Environment setting"

mkdir -p "$APP_DIR/bin" "$APP_DIR/frontend" "$HOME/.local/bin" \
    "$HOME/.local/share/applications" "$UNIT_DIR"
install -m 755 "$REPO_DIR/bin/steam-library-manager" "$APP_BIN"
install -m 644 "$REPO_DIR/frontend/index.js" "$APP_DIR/frontend/index.js"
install -m 644 "$REPO_DIR/frontend/styles.css" "$APP_DIR/frontend/styles.css"

cat > "$BIN_DEST" <<EOF
#!/usr/bin/env bash
exec "$APP_BIN" "\$@"
EOF
chmod 755 "$BIN_DEST"

cat > "$DESKTOP_DEST" <<EOF
[Desktop Entry]
Name=Steam Library Manager
Comment=Back up and restore Steam library metadata
Exec=$BIN_DEST gui
Icon=steam
Terminal=false
Type=Application
Categories=Game;Utility;
StartupNotify=true
EOF
chmod 644 "$DESKTOP_DEST"

cat > "$UNIT_DEST" <<EOF
[Unit]
Description=Steam Library Manager automatic Steam UI integration
After=default.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR
Environment="PATH=$SERVICE_PATH"
ExecStart=$APP_BIN daemon
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
EOF
chmod 644 "$UNIT_DEST"

# Remove only the obsolete symlink previously created by this project's installer.
OLD_PLUGIN_LINK="$HOME/.local/share/Steam/plugins/steam-library-manager"
if [[ -L "$OLD_PLUGIN_LINK" ]] && [[ "$(readlink "$OLD_PLUGIN_LINK")" == "$REPO_DIR" ]]; then
    rm "$OLD_PLUGIN_LINK"
fi

systemctl --user daemon-reload
systemctl --user enable steam-library-manager.service
systemctl --user restart steam-library-manager.service || systemctl --user start steam-library-manager.service

printf 'Installed Steam Library Manager to %s\n' "$APP_DIR"
printf 'Automatic Steam attachment is enabled as a user service.\n'
printf 'Requirements: Steam with Lumen CDP available and Node.js %s.\n' "$(node --version)"
printf 'Service status: systemctl --user status steam-library-manager.service\n'
