# 🎮 Steam Library Manager

A Linux Steam library backup manager with a floating in-client interface, CLI, and automatic Steam startup integration.

---

## Install and automatic startup

Requirements: Linux with a systemd user session, Steam running with Lumen's CEF remote-debugging endpoint enabled, and Node.js 22 or newer.

```bash
git clone https://github.com/krunaldodiya/steam-library-manager.git
cd steam-library-manager
bash install.sh
```

The installer copies the app and frontend assets into `~/.local/share/steam-library-manager`, installs the CLI and desktop launcher, and enables `steam-library-manager.service` for the current user. The service starts at user login, waits for Steam's CEF page, and injects the interface automatically; no AI agent or manual injection command is needed. It retries after Steam starts or restarts.

Check the service with `systemctl --user status steam-library-manager.service`. To update an existing installation, pull the new revision and rerun `bash install.sh`. To remove the app and service, run `bash uninstall.sh`; game files and backups are not removed.

This is a Linux sidecar integration using Lumen/Steam CEF remote debugging, not a Steam-supported native plugin API or a Millennium plugin. The service must be running, Lumen's CDP endpoint must be available, and Node.js must be on the PATH captured by the installer.

---

## ⚡ Architecture: Single Source of Truth

Unlike utilities that produce opaque, monolithic archives, **Steam Library Manager** organizes your backup repository as a transparent **directory tree with per-game subdirectories**:

```text
~/SteamLibrary-Backups/
├── games/
│   ├── 1030840_Mafia__Definitive_Edition/
│   │   ├── metadata.json           # Per-game metadata & sync timestamp
│   │   ├── 1030840.lua             # LuaTools manifest (if managed)
│   │   ├── appmanifest_1030840.acf # Steam official app manifest (if installed)
│   │   └── manifests/              # Binary depot manifests
│   ├── 1174180_Red_Dead_Redemption_2/
│   ├── 268910_Cuphead/
│   └── ...
├── archives/                       # Standalone .tar.gz bundle exports
│   └── backup_YYYY-MM-DD_HH-MM-SS.tar.gz
└── index.json                      # Global synchronization registry
```

* **Zero Duplication / Single Source:** Every sync creates or replaces the game's individual subdirectory.
* **100% Dynamic:** Detects game titles and ownership dynamically from your running Steam client (`appStore.m_mapApps`). Zero hardcoded game titles.
* **Lightweight:** Backs up only metadata (`.lua`, `.acf`, depot manifests) — typically **~100 KB total**. Never touches 100 GB game binaries.

---

## 🖥️ In-Steam Interface

A movable floating pill (**`⋮⋮ 📦 Backup & Restore`**) is rendered in your Steam client:
* **Single-Screen Dashboard:** No separate backup and restore tabs.
* **Per-Game Sync Timestamps:** Displays the exact timestamp when each game was last backed up.
* **Global Sync:** Select any combination (or all) and click `🔄 Sync Selected`. Option to simultaneously generate a `.tar.gz` bundle.
* **Interactive Restore Popup:** Click `📥 Restore...` to open a clean modal. Choose between your single-source directory (`games/`) or a `.tar.gz` archive, with all games pre-checked and selectable.

---

## 💻 CLI Usage

```bash
# List all games with sync timestamps
steam-library-manager list

# Sync all games into their subdirectories
steam-library-manager sync --all

# Sync specific games by AppID (also create .tar.gz bundle)
steam-library-manager sync --games 1030840,1174180 --tar

# Restore all games from the single-source directory
steam-library-manager restore --dir --all

# Restore specific games from an archive bundle
steam-library-manager restore --archive backup.tar.gz --games 1030840
```

---

## 📄 License
MIT License - Copyright (c) 2026 Krunal Dodiya.
