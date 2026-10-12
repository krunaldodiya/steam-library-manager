# 🎮 Steam Library Manager

A dedicated, standalone plugin, CLI, and GUI for managing, exporting, and restoring Steam games metadata (specifically built for **SLSsteam / LuaTools / SteamTools** environments).

---

## ⚡ The Problem Solved

When using tools like **LuaTools / SLSsteam**, games added to your library or uninstalled often disappear because their licenses are stored locally rather than in Valve's cloud account servers. Reinstalling Steam or accidentally uninstalling games wipes the metadata, forcing users to re-add every game manually.

**Steam Library Manager solves this with zero disk waste:**
* Backs up **only the lightweight metadata** (`.lua` manifests, depot keys, pins) — typically **~100 KB total**.
* **Zero game files are copied or moved.**
* When restored, Steam immediately displays the **"Install / Download"** button for every game, exactly as if it were a purchased title.

---

## 🚀 Key Features

* **Complete Export Options:**
  * 📦 **Whole Library:** Back up all games in one click.
  * 🔘 **Multi-Select:** Check off any combination of games and export together.
  * 🎮 **Single Game:** Export individual game metadata packages.
* **Complete Restore Options:**
  * 📥 **Whole Library Restore:** Restores an entire archive bundle at once.
  * 🔘 **Multi-Select Restore:** Choose specific games from any backup bundle.
  * 🎮 **Single Game Restore:** Pick one specific game to restore.
  * 📁 **Direct `.lua` File Import:** Import raw `.lua` scripts directly into Steam.
* **Dedicated & Standalone:**
  * Follows the **Millennium Plugin Specification** (`plugin.json`).
  * Dedicated standalone in-Steam interface.
  * **Not dependent on Lumen** or any other plugin.
  * Works via **Terminal CLI**, **Dedicated Web GUI**, and **Desktop App**.

---

## 📦 Installation

```bash
git clone https://github.com/krunaldodiya/steam-library-manager.git ~/WorkSpace/Code/steam-library-manager
cd ~/WorkSpace/Code/steam-library-manager
./install.sh
```

---

## 💻 Usage

### 1. Dedicated Web GUI
Launch the local visual manager:
```bash
steam-library-manager gui
```
Opens in your browser with full search, checkboxes, and one-click export/restore.

### 2. Command Line (CLI)

#### List All Games:
```bash
steam-library-manager list
```

#### Export / Backup:
```bash
# Export whole library (all games)
steam-library-manager export --all

# Multi-select specific games by AppID
steam-library-manager export --games 1174180,814380,2358720

# Export a single game
steam-library-manager export --game 1174180
```

#### List Available Backups:
```bash
steam-library-manager backups
```

#### Restore / Import:
```bash
# Restore all games from the latest backup
steam-library-manager restore --all

# Restore specific games from a backup
steam-library-manager restore --backup steam_library_full_2026-10-12.zip --games 1174180,814380

# Restore a single game from a backup
steam-library-manager restore --backup steam_library_full_2026-10-12.zip --game 1174180

# Import an individual .lua file directly into Steam
steam-library-manager restore --file ~/Downloads/1174180.lua
```

---

## 📂 Project Structure

```
steam-library-manager/
├── bin/
│   └── steam-library-manager         # Standalone CLI, daemon, and Web GUI
├── backend/
│   └── main.py                       # Millennium backend engine
├── frontend/
│   ├── index.js                      # In-Steam modal UI & topbar injection
│   └── styles.css                    # Steam dark theme stylesheet
├── desktop/
│   └── steam-library-manager.desktop # Application launcher
├── plugin.json                       # Millennium plugin manifest
├── install.sh                        # Installer script
└── uninstall.sh                      # Clean removal script
```

---

## 📄 License
MIT License - Copyright (c) 2026 Krunal Dodiya.
