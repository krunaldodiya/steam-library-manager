#!/usr/bin/env python3
"""
Steam Library Manager - Backend Engine
Handles game metadata extraction, export (All, Multi, Single), and restore.
Compatible with Millennium Python Plugin runtime and standalone execution.
"""

import os
import sys
import glob
import re
import json
import time
import shutil
import zipfile
from datetime import datetime
from pathlib import Path

DEFAULT_STEAM_ROOT = os.path.expanduser("~/.local/share/Steam")
DEFAULT_STPLUG_DIR = os.path.join(DEFAULT_STEAM_ROOT, "config/stplug-in")
DEFAULT_SLS_DIR = os.path.expanduser("~/.config/SLSsteam")
DEFAULT_BACKUP_DIR = os.path.expanduser("~/SteamLibrary-Backups")

KNOWN_NAMES = {
    730: "Counter-Strike 2", 204100: "Max Payne 3", 292030: "The Witcher 3: Wild Hunt",
    391220: "Rise of the Tomb Raider", 447040: "Watch_Dogs 2", 552520: "Far Cry 5",
    582160: "Assassin's Creed Origins", 814380: "Sekiro™: Shadows Die Twice",
    870780: "Control Ultimate Edition", 934700: "Cricket 22", 1028630: "Cricket 19",
    1030840: "Mafia: Definitive Edition", 1116960: "UNDEFEATED", 1174180: "Red Dead Redemption 2",
    1196590: "Resident Evil Village", 1238860: "Battlefield 4™", 1259420: "Days Gone",
    1338770: "Sniper Ghost Warrior Contracts 2", 1364780: "Street Fighter™ 6",
    1504980: "It Takes Two Friend's Pass", 1593500: "God of War", 1627720: "Lies of P",
    1659040: "HITMAN World of Assassination", 1659420: "UNCHARTED™: Legacy of Thieves Collection",
    1815780: "Asphalt Legends", 1817190: "Marvel's Spider-Man: Miles Morales",
    1888930: "The Last of Us™ Part I", 2215430: "Ghost of Tsushima DIRECTOR'S CUT",
    2358720: "Black Myth: Wukong", 3240220: "Grand Theft Auto V Enhanced",
    3468650: "Cricket 26 - The Official Game of the Ashes"
}

def get_steam_libraries():
    roots = [DEFAULT_STEAM_ROOT]
    vdf = os.path.join(DEFAULT_STEAM_ROOT, "steamapps/libraryfolders.vdf")
    if os.path.exists(vdf):
        try:
            with open(vdf, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
            paths = re.findall(r'"path"\s+"([^"]+)"', content)
            for p in paths:
                if p not in roots and os.path.exists(p):
                    roots.append(p)
        except Exception:
            pass
    return roots

def resolve_game_names():
    names = dict(KNOWN_NAMES)
    for lib in get_steam_libraries():
        manifests = glob.glob(os.path.join(lib, "steamapps/appmanifest_*.acf"))
        for m in manifests:
            try:
                with open(m, "r", encoding="utf-8", errors="ignore") as f:
                    data = f.read()
                aid = re.search(r'"appid"\s+"(\d+)"', data)
                name = re.search(r'"name"\s+"([^"]+)"', data)
                if aid and name:
                    names[int(aid.group(1))] = name.group(1)
            except Exception:
                pass
    return names

def get_installed_appids():
    installed = set()
    for lib in get_steam_libraries():
        manifests = glob.glob(os.path.join(lib, "steamapps/appmanifest_*.acf"))
        for m in manifests:
            try:
                with open(m, "r", encoding="utf-8", errors="ignore") as f:
                    data = f.read()
                aid = re.search(r'"appid"\s+"(\d+)"', data)
                if aid:
                    installed.add(int(aid.group(1)))
            except Exception:
                pass
    return installed

def get_managed_games():
    names = resolve_game_names()
    installed = get_installed_appids()
    games = []
    if not os.path.exists(DEFAULT_STPLUG_DIR):
        return games

    for fname in sorted(os.listdir(DEFAULT_STPLUG_DIR)):
        if not fname.endswith(".lua"):
            continue
        try:
            aid = int(fname[:-4])
        except ValueError:
            continue
        fpath = os.path.join(DEFAULT_STPLUG_DIR, fname)
        size = os.path.getsize(fpath)
        mtime = os.path.getmtime(fpath)
        game_name = names.get(aid, f"AppID {aid}")
        is_inst = aid in installed

        depots = []
        try:
            with open(fpath, "r", encoding="utf-8", errors="ignore") as lf:
                ltext = lf.read()
            depots = [int(d) for d in re.findall(r'addappid\((\d+)', ltext)]
        except Exception:
            pass

        games.append({
            "appid": aid,
            "name": game_name,
            "installed": is_inst,
            "lua_file": fname,
            "lua_size": size,
            "mtime": mtime,
            "depots": depots
        })
    return games

def export_games(appids=None, backup_name=None, backup_dir=DEFAULT_BACKUP_DIR):
    all_games = get_managed_games()
    if not all_games:
        return {"success": False, "error": "No managed games found in stplug-in"}

    if appids is None or appids == "all":
        selected_games = all_games
    else:
        req_set = set(int(a) for a in appids)
        selected_games = [g for g in all_games if g["appid"] in req_set]

    if not selected_games:
        return {"success": False, "error": "No matching games selected to export"}

    os.makedirs(backup_dir, exist_ok=True)
    ts = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    if not backup_name:
        if len(selected_games) == 1:
            clean_name = re.sub(r'[^a-zA-Z0-9_\-]', '_', selected_games[0]["name"])
            backup_name = f"game_{selected_games[0]['appid']}_{clean_name}_{ts}.zip"
        elif len(selected_games) == len(all_games):
            backup_name = f"steam_library_full_{ts}.zip"
        else:
            backup_name = f"steam_library_{len(selected_games)}_games_{ts}.zip"

    if not backup_name.endswith(".zip"):
        backup_name += ".zip"

    zip_path = os.path.join(backup_dir, backup_name)
    metadata = {
        "version": "1.0",
        "created_at": ts,
        "total_games": len(selected_games),
        "games": selected_games
    }

    manifests_dir = os.path.join(DEFAULT_SLS_DIR, "manifests")
    all_depots = set()
    for g in selected_games:
        all_depots.update(g["depots"])

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("metadata.json", json.dumps(metadata, indent=2))

        for g in selected_games:
            src = os.path.join(DEFAULT_STPLUG_DIR, g["lua_file"])
            if os.path.exists(src):
                zf.write(src, f"stplug-in/{g['lua_file']}")

        if os.path.exists(manifests_dir):
            for mfile in os.listdir(manifests_dir):
                m_match = re.match(r"^(\d+)_\d+\.manifest$", mfile)
                if m_match and int(m_match.group(1)) in all_depots:
                    msrc = os.path.join(manifests_dir, mfile)
                    zf.write(msrc, f"manifests/{mfile}")

        lat = os.path.join(DEFAULT_SLS_DIR, "library-added-times.txt")
        if os.path.exists(lat):
            zf.write(lat, "sls/library-added-times.txt")

    return {
        "success": True,
        "path": zip_path,
        "backup_name": backup_name,
        "count": len(selected_games),
        "games": selected_games
    }

def list_backups(backup_dir=DEFAULT_BACKUP_DIR):
    if not os.path.exists(backup_dir):
        return []
    backups = []
    for f in sorted(os.listdir(backup_dir), reverse=True):
        if not f.endswith(".zip"):
            continue
        p = os.path.join(backup_dir, f)
        size = os.path.getsize(p)
        mtime = os.path.getmtime(p)
        games_list = []
        try:
            with zipfile.ZipFile(p, "r") as zf:
                if "metadata.json" in zf.namelist():
                    meta = json.loads(zf.read("metadata.json").decode("utf-8"))
                    games_list = meta.get("games", [])
                else:
                    for n in zf.namelist():
                        if n.startswith("stplug-in/") and n.endswith(".lua"):
                            aid = int(n[10:-4])
                            games_list.append({"appid": aid, "name": KNOWN_NAMES.get(aid, f"AppID {aid}")})
        except Exception:
            pass

        backups.append({
            "filename": f,
            "path": p,
            "size": size,
            "mtime": mtime,
            "count": len(games_list),
            "games": games_list
        })
    return backups

def restore_games(backup_path=None, appids=None, backup_dir=DEFAULT_BACKUP_DIR):
    if not backup_path:
        all_b = list_backups(backup_dir)
        if not all_b:
            return {"success": False, "error": "No backup files found to restore from"}
        backup_path = all_b[0]["path"]

    if not os.path.exists(backup_path):
        return {"success": False, "error": f"Backup file not found: {backup_path}"}

    os.makedirs(DEFAULT_STPLUG_DIR, exist_ok=True)
    manifests_dir = os.path.join(DEFAULT_SLS_DIR, "manifests")
    os.makedirs(manifests_dir, exist_ok=True)

    restored = []
    with zipfile.ZipFile(backup_path, "r") as zf:
        namelist = zf.namelist()
        meta = {}
        if "metadata.json" in namelist:
            try:
                meta = json.loads(zf.read("metadata.json").decode("utf-8"))
            except Exception:
                pass

        available_games = meta.get("games", [])
        avail_map = {g["appid"]: g for g in available_games}

        target_appids = None
        if appids is not None and appids != "all":
            target_appids = set(int(a) for a in appids)

        for member in namelist:
            if member.startswith("stplug-in/") and member.endswith(".lua"):
                fname = os.path.basename(member)
                try:
                    aid = int(fname[:-4])
                except ValueError:
                    continue
                if target_appids is not None and aid not in target_appids:
                    continue

                dest = os.path.join(DEFAULT_STPLUG_DIR, fname)
                with open(dest, "wb") as f:
                    f.write(zf.read(member))

                g_info = avail_map.get(aid, {"appid": aid, "name": KNOWN_NAMES.get(aid, f"AppID {aid}")})
                restored.append(g_info)

            elif member.startswith("manifests/") and member.endswith(".manifest"):
                fname = os.path.basename(member)
                dest = os.path.join(manifests_dir, fname)
                with open(dest, "wb") as f:
                    f.write(zf.read(member))

            elif member == "sls/library-added-times.txt":
                dest = os.path.join(DEFAULT_SLS_DIR, "library-added-times.txt")
                if not os.path.exists(dest):
                    with open(dest, "wb") as f:
                        f.write(zf.read(member))

    return {
        "success": True,
        "restored_count": len(restored),
        "games": restored,
        "backup_path": backup_path
    }

# Millennium Plugin Hooks (if loaded by Millennium)
try:
    import Millennium
    class Plugin:
        def _load(self):
            print("[SteamLibraryManager] Millennium plugin loaded successfully.")
        def _unload(self):
            pass
        def get_games(self):
            return json.dumps(get_managed_games())
        def export(self, payload):
            p = json.loads(payload) if isinstance(payload, str) else payload
            return json.dumps(export_games(appids=p.get("appids"), backup_name=p.get("name")))
        def restore(self, payload):
            p = json.loads(payload) if isinstance(payload, str) else payload
            return json.dumps(restore_games(backup_path=p.get("backup_path"), appids=p.get("appids")))
        def get_backups(self):
            return json.dumps(list_backups())
except ImportError:
    pass

if __name__ == "__main__":
    print("Steam Library Manager Engine")
    print(f"Total managed games: {len(get_managed_games())}")
