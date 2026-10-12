# 🎮 Steam Library Manager

A dedicated, standalone Steam plugin, CLI, and engine for managing, backing up, and restoring Steam games metadata.

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
