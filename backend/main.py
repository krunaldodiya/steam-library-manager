#!/usr/bin/env python3
"""
Steam Library Manager - Single Source of Truth Engine
- Per-game directory backup in ~/SteamLibrary-Backups/games/<appid>_<clean_name>/
- Per-game sync timestamps
- Unified single-screen dashboard
- Interactive restore modal with archive/folder picker & game selection
"""

import os
import sys
import glob
import re
import json
import time
import shutil
import tarfile
import zipfile
import argparse
import threading
import subprocess
import http.server
import urllib.parse
from datetime import datetime
from pathlib import Path

DEFAULT_STEAM_ROOT = os.path.expanduser("~/.local/share/Steam")
DEFAULT_STPLUG_DIR = os.path.join(DEFAULT_STEAM_ROOT, "config/stplug-in")
DEFAULT_SLS_DIR = os.path.expanduser("~/.config/SLSsteam")
DEFAULT_BACKUP_DIR = os.path.expanduser("~/SteamLibrary-Backups")
GAMES_BACKUP_DIR = os.path.join(DEFAULT_BACKUP_DIR, "games")
ARCHIVES_BACKUP_DIR = os.path.join(DEFAULT_BACKUP_DIR, "archives")
INDEX_FILE = os.path.join(DEFAULT_BACKUP_DIR, "index.json")
NAMES_CACHE_FILE = os.path.expanduser("~/.config/steam-library-manager/names_cache.json")
def resolve_repo_dir():
    configured = os.environ.get("STEAM_LIBRARY_MANAGER_HOME")
    if configured:
        return os.path.abspath(os.path.expanduser(configured))

    script_dir = Path(__file__).resolve().parent
    for candidate in (script_dir.parent, script_dir):
        if (candidate / "frontend" / "index.js").is_file() and (candidate / "frontend" / "styles.css").is_file():
            return str(candidate)
    return str(script_dir.parent)

REPO_DIR = resolve_repo_dir()

def format_bytes(value):
    try:
        size = float(value)
    except (TypeError, ValueError):
        return "0 B"
    if size <= 0:
        return "0 B"

    units = ("KB", "MB", "GB", "TB", "PB", "EB")
    size /= 1024
    unit = 0
    while size >= 1024 and unit < len(units) - 1:
        size /= 1024
        unit += 1
    if round(size, 1) >= 1024 and unit < len(units) - 1:
        size /= 1024
        unit += 1
    return f"{size:.1f} {units[unit]}"

os.makedirs(GAMES_BACKUP_DIR, exist_ok=True)
os.makedirs(ARCHIVES_BACKUP_DIR, exist_ok=True)

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

def load_index():
    if os.path.exists(INDEX_FILE):
        try:
            with open(INDEX_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}

def save_index(index_data):
    try:
        with open(INDEX_FILE, "w", encoding="utf-8") as f:
            json.dump(index_data, f, indent=2)
    except Exception:
        pass

def load_names_cache():
    if os.path.exists(NAMES_CACHE_FILE):
        try:
            with open(NAMES_CACHE_FILE, "r", encoding="utf-8") as f:
                return {int(k): v for k, v in json.load(f).items()}
        except Exception:
            pass
    return {}

def save_names_cache(cache):
    os.makedirs(os.path.dirname(NAMES_CACHE_FILE), exist_ok=True)
    try:
        with open(NAMES_CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump({str(k): v for k, v in cache.items()}, f, indent=2)
    except Exception:
        pass

def fetch_live_names_from_steam():
    names = {}
    port_file = os.path.expanduser("~/.local/share/Lumen/cef_port")
    port = None
    if os.path.exists(port_file):
        try:
            with open(port_file, "r") as f:
                port = f.read().split("\n")[0].strip()
        except Exception:
            pass
    if not port:
        try:
            out = subprocess.check_output(["pgrep", "-a", "steamwebhelper"]).decode()
            m = re.search(r'--remote-debugging-port=(\d+)', out)
            if m:
                port = m.group(1)
        except Exception:
            pass
    if not port:
        return names

    node_code = f"""
    const fs = require('fs');
    async function run() {{
        try {{
            const res = await fetch('http://127.0.0.1:{port}/json');
            const pages = await res.json();
            const shared = pages.find(p => p.title === 'SharedJSContext');
            if (!shared) return process.exit(1);
            const ws = new WebSocket(shared.webSocketDebuggerUrl);
            ws.onopen = () => {{
                ws.send(JSON.stringify({{
                    id: 1,
                    method: 'Runtime.evaluate',
                    params: {{
                        expression: `
                            (function() {{
                                const games = {{}};
                                if (window.appStore && window.appStore.m_mapApps) {{
                                    for (const [aid, app] of window.appStore.m_mapApps) {{
                                        if (app.app_type === 1 && app.display_name) {{
                                            games[aid] = app.display_name;
                                        }}
                                    }}
                                }}
                                return games;
                            }})()
                        `,
                        returnByValue: true
                    }}
                }}));
            }};
            ws.onmessage = (e) => {{
                const val = JSON.parse(e.data).result.result.value;
                console.log(JSON.stringify(val));
                process.exit(0);
            }};
            ws.onerror = () => process.exit(1);
        }} catch(e) {{
            process.exit(1);
        }}
    }}
    run();
    """
    try:
        out = subprocess.run(["node", "-e", node_code], capture_output=True, text=True, timeout=2)
        if out.returncode == 0 and out.stdout.strip():
            data = json.loads(out.stdout.strip())
            for k, v in data.items():
                if v and str(v).strip():
                    names[int(k)] = v
    except Exception:
        pass
    return names

def resolve_all_dynamic_names():
    names = load_names_cache()
    live = fetch_live_names_from_steam()
    if live:
        names.update(live)

    roots = get_steam_libraries()
    for r in set(roots):
        for acf in glob.glob(os.path.join(r, "steamapps/appmanifest_*.acf")):
            try:
                with open(acf, "r", encoding="utf-8", errors="ignore") as f:
                    txt = f.read()
                aid = re.search(r'"appid"\s+"(\d+)"', txt)
                mname = re.search(r'"name"\s+"([^"]+)"', txt)
                if aid and mname:
                    a = int(aid.group(1))
                    if a not in [228980, 1493710, 4183110]:
                        if a not in names:
                            names[a] = mname.group(1)
            except Exception:
                pass

    save_names_cache(names)
    return names

def get_game_backup_dir(appid, clean_name=""):
    # Look for existing directory starting with {appid}_
    if os.path.exists(GAMES_BACKUP_DIR):
        for entry in os.listdir(GAMES_BACKUP_DIR):
            if entry.startswith(f"{appid}_") or entry == str(appid):
                return os.path.join(GAMES_BACKUP_DIR, entry)
    clean = re.sub(r'[^a-zA-Z0-9_\-]', '_', clean_name).strip('_')
    folder_name = f"{appid}_{clean}" if clean else str(appid)
    return os.path.join(GAMES_BACKUP_DIR, folder_name)

def get_all_library_games():
    names = resolve_all_dynamic_names()
    index_data = load_index()
    games_map = {}
    roots = get_steam_libraries()

    # 1. Scan physical installations
    for r in set(roots):
        for acf in glob.glob(os.path.join(r, "steamapps/appmanifest_*.acf")):
            try:
                with open(acf, "r", encoding="utf-8", errors="ignore") as txt_f:
                    txt = txt_f.read()
                aid = re.search(r'"appid"\s+"(\d+)"', txt)
                name = re.search(r'"name"\s+"([^"]+)"', txt)
                inst_dir = re.search(r'"installdir"\s+"([^"]+)"', txt)
                sz = re.search(r'"SizeOnDisk"\s+"(\d+)"', txt)
                buildid = re.search(r'"buildid"\s+"([^"]+)"', txt)

                if aid and name:
                    a = int(aid.group(1))
                    if a in [228980, 1493710, 4183110]:
                        continue
                    display_name = names.get(a, name.group(1))
                    names[a] = display_name
                    games_map[a] = {
                        "appid": a,
                        "name": display_name,
                        "installed": True,
                        "installdir": inst_dir.group(1) if inst_dir else "",
                        "size_on_disk": int(sz.group(1)) if sz else 0,
                        "buildid": buildid.group(1) if buildid else "",
                        "acf_path": acf,
                        "library_path": r,
                        "has_acf": True,
                        "has_lua": False,
                        "source": "Official Steam"
                    }
            except Exception:
                pass

    # 2. Scan stplug-in for LuaTools manifests
    if os.path.exists(DEFAULT_STPLUG_DIR):
        for f in os.listdir(DEFAULT_STPLUG_DIR):
            if not f.endswith(".lua"):
                continue
            try:
                a = int(f[:-4])
            except ValueError:
                continue

            gname = names.get(a, f"AppID {a}")
            lpath = os.path.join(DEFAULT_STPLUG_DIR, f)
            depots = []
            try:
                with open(lpath, "r", encoding="utf-8", errors="ignore") as lf:
                    ltext = lf.read()
                depots = [int(d) for d in re.findall(r'addappid\((\d+)', ltext)]
            except Exception:
                pass

            if a not in games_map:
                games_map[a] = {
                    "appid": a,
                    "name": gname,
                    "installed": False,
                    "size_on_disk": 0,
                    "has_acf": False,
                    "has_lua": True,
                    "lua_file": f,
                    "depots": depots,
                    "source": "LuaTools / SLSsteam"
                }
            else:
                games_map[a]["has_lua"] = True
                games_map[a]["lua_file"] = f
                games_map[a]["depots"] = depots
                games_map[a]["source"] = "Official / LuaTools"

    # 3. Add known account games
    for a, gname in names.items():
        if a not in games_map and a not in [228980, 1493710, 4183110]:
            games_map[a] = {
                "appid": a,
                "name": gname,
                "installed": False,
                "size_on_disk": 0,
                "has_acf": False,
                "has_lua": False,
                "source": "Official Steam Account"
            }

    # Attach backup status & timestamp from index & filesystem
    game_list = []
    for a, g in games_map.items():
        str_a = str(a)
        idx_info = index_data.get(str_a)
        bdir = get_game_backup_dir(a, g["name"])
        backed_up = os.path.exists(bdir) and os.listdir(bdir)

        if backed_up:
            last_ts = idx_info.get("timestamp") if idx_info else os.path.getmtime(bdir)
            last_str = idx_info.get("last_synced") if idx_info else datetime.fromtimestamp(last_ts).strftime("%Y-%m-%d %H:%M")
        else:
            last_ts = 0
            last_str = "Never"

        g["backed_up"] = bool(backed_up)
        g["last_synced"] = last_str
        g["last_synced_ts"] = last_ts
        g["backup_dir"] = bdir
        game_list.append(g)

    return sorted(game_list, key=lambda x: str(x["name"]).lower())

# Sync / Backup Logic (creates/replaces per-game subdirectory in single source of truth)
def sync_games(appids=None, create_tar=True, tar_name=None):
    all_games = get_all_library_games()
    if not all_games:
        return {"success": False, "error": "No games found in library"}

    if appids is None or appids == "all":
        selected_games = all_games
    else:
        req_set = set(int(a) for a in appids)
        selected_games = [g for g in all_games if g["appid"] in req_set]

    if not selected_games:
        return {"success": False, "error": "No games selected to sync"}

    index_data = load_index()
    now_ts = time.time()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    manifests_dir = os.path.join(DEFAULT_SLS_DIR, "manifests")
    all_depots = set()
    for g in selected_games:
        for d in g.get("depots", []):
            all_depots.add(d)

    synced_folders = []

    for g in selected_games:
        aid = g["appid"]
        bdir = get_game_backup_dir(aid, g["name"])
        # Replace existing game directory cleanly
        if os.path.exists(bdir):
            shutil.rmtree(bdir)
        os.makedirs(bdir, exist_ok=True)

        saved_files = []

        # 1. Copy Lua script if present
        if g.get("has_lua") and g.get("lua_file"):
            src_lua = os.path.join(DEFAULT_STPLUG_DIR, g["lua_file"])
            if os.path.exists(src_lua):
                shutil.copy2(src_lua, os.path.join(bdir, g["lua_file"]))
                saved_files.append(g["lua_file"])

        # 2. Copy ACF manifest if present
        if g.get("has_acf") and g.get("acf_path") and os.path.exists(g["acf_path"]):
            fname = os.path.basename(g["acf_path"])
            shutil.copy2(g["acf_path"], os.path.join(bdir, fname))
            saved_files.append(fname)

        # 3. Copy referenced depot manifests
        if os.path.exists(manifests_dir) and g.get("depots"):
            g_man_dir = os.path.join(bdir, "manifests")
            for mfile in os.listdir(manifests_dir):
                m_match = re.match(r"^(\d+)_\d+\.manifest$", mfile)
                if m_match and int(m_match.group(1)) in g.get("depots", []):
                    os.makedirs(g_man_dir, exist_ok=True)
                    shutil.copy2(os.path.join(manifests_dir, mfile), os.path.join(g_man_dir, mfile))
                    saved_files.append(f"manifests/{mfile}")

        # 4. Save metadata.json inside the game's subdirectory
        meta = {
            "appid": aid,
            "name": g["name"],
            "source": g["source"],
            "installed": g["installed"],
            "size_on_disk": g.get("size_on_disk", 0),
            "last_synced": now_str,
            "timestamp": now_ts,
            "files": saved_files
        }
        with open(os.path.join(bdir, "metadata.json"), "w", encoding="utf-8") as mf:
            json.dump(meta, mf, indent=2)

        # Update global index.json
        index_data[str(aid)] = meta
        synced_folders.append(bdir)

    save_index(index_data)

    archive_path = None
    if create_tar:
        ts_tag = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        if not tar_name:
            if len(selected_games) == 1:
                clean = re.sub(r'[^a-zA-Z0-9_\-]', '_', str(selected_games[0]["name"])).strip('_')
                tar_name = f"backup_{selected_games[0]['appid']}_{clean}_{ts_tag}.tar.gz"
            else:
                tar_name = f"backup_{len(selected_games)}_games_{ts_tag}.tar.gz"

        if not tar_name.endswith(".tar.gz") and not tar_name.endswith(".zip"):
            tar_name += ".tar.gz"

        archive_path = os.path.join(ARCHIVES_BACKUP_DIR, tar_name)
        with tarfile.open(archive_path, "w:gz") as tar:
            for sdir in synced_folders:
                folder_base = os.path.basename(sdir)
                tar.add(sdir, arcname=f"games/{folder_base}")
            # Add index slice
            tar.add(INDEX_FILE, arcname="index.json")

    return {
        "success": True,
        "synced_count": len(selected_games),
        "archive_path": archive_path,
        "archive_name": os.path.basename(archive_path) if archive_path else None,
        "games": selected_games
    }

# Inspect what games are inside an archive or directory
def inspect_source(source_type="directory", archive_path=None):
    games = []
    if source_type == "directory":
        # Read from single source of truth GAMES_BACKUP_DIR
        if not os.path.exists(GAMES_BACKUP_DIR):
            return games
        index_data = load_index()
        for folder in sorted(os.listdir(GAMES_BACKUP_DIR)):
            fpath = os.path.join(GAMES_BACKUP_DIR, folder)
            if not os.path.isdir(fpath): continue
            meta_path = os.path.join(fpath, "metadata.json")
            if os.path.exists(meta_path):
                try:
                    with open(meta_path, "r", encoding="utf-8") as mf:
                        games.append(json.load(mf))
                    continue
                except Exception:
                    pass
            # Fallback parse folder name
            m = re.match(r"^(\d+)", folder)
            if m:
                aid = int(m.group(1))
                idx_g = index_data.get(str(aid), {})
                games.append({"appid": aid, "name": idx_g.get("name", folder), "source": "Backup Folder"})
        return games

    # Inspect archive file (.tar.gz or .zip)
    if not archive_path or not os.path.exists(archive_path):
        return games

    if archive_path.endswith(".tar.gz") or archive_path.endswith(".tgz") or archive_path.endswith(".tar"):
        try:
            with tarfile.open(archive_path, "r:*") as tar:
                # Look for metadata files
                for member in tar.getmembers():
                    if member.name.endswith("metadata.json") and member.isfile():
                        f = tar.extractfile(member)
                        if f:
                            games.append(json.loads(f.read().decode("utf-8")))
        except Exception:
            pass

    elif archive_path.endswith(".zip"):
        try:
            with zipfile.ZipFile(archive_path, "r") as zf:
                if "metadata.json" in zf.namelist():
                    meta = json.loads(zf.read("metadata.json").decode("utf-8"))
                    games = meta.get("games", [])
        except Exception:
            pass

    return games

# List available archive files
def list_archives():
    if not os.path.exists(ARCHIVES_BACKUP_DIR):
        return []
    archives = []
    for f in sorted(os.listdir(ARCHIVES_BACKUP_DIR), reverse=True):
        if not (f.endswith(".tar.gz") or f.endswith(".zip") or f.endswith(".tgz")):
            continue
        p = os.path.join(ARCHIVES_BACKUP_DIR, f)
        size = os.path.getsize(p)
        mtime = os.path.getmtime(p)
        games = inspect_source("archive", p)
        archives.append({
            "filename": f,
            "path": p,
            "size": size,
            "mtime": mtime,
            "count": len(games),
            "games": games
        })
    return archives

# Universal Restore Logic (from directory or archive, all or selected)
def restore_games(source_type="directory", archive_path=None, appids=None):
    os.makedirs(DEFAULT_STPLUG_DIR, exist_ok=True)
    manifests_dir = os.path.join(DEFAULT_SLS_DIR, "manifests")
    os.makedirs(manifests_dir, exist_ok=True)
    steamapps_dir = os.path.join(DEFAULT_STEAM_ROOT, "steamapps")
    os.makedirs(steamapps_dir, exist_ok=True)

    target_appids = None
    if appids is not None and appids != "all":
        target_appids = set(int(a) for a in appids)

    restored = []

    # 1. Restore from single source of truth directory (games/)
    if source_type == "directory":
        if not os.path.exists(GAMES_BACKUP_DIR):
            return {"success": False, "error": "No games backup directory found"}

        for folder in os.listdir(GAMES_BACKUP_DIR):
            fpath = os.path.join(GAMES_BACKUP_DIR, folder)
            if not os.path.isdir(fpath): continue

            meta_file = os.path.join(fpath, "metadata.json")
            meta = {}
            if os.path.exists(meta_file):
                try:
                    with open(meta_file, "r", encoding="utf-8") as mf:
                        meta = json.load(mf)
                except Exception:
                    pass

            aid = meta.get("appid")
            if not aid:
                m = re.match(r"^(\d+)", folder)
                aid = int(m.group(1)) if m else None

            if not aid: continue
            if target_appids is not None and aid not in target_appids:
                continue

            # Restore Lua file
            lua_src = os.path.join(fpath, f"{aid}.lua")
            if os.path.exists(lua_src):
                shutil.copy2(lua_src, os.path.join(DEFAULT_STPLUG_DIR, f"{aid}.lua"))

            # Restore ACF file
            for af in glob.glob(os.path.join(fpath, "appmanifest_*.acf")):
                shutil.copy2(af, os.path.join(steamapps_dir, os.path.basename(af)))

            # Restore depot manifests
            man_src = os.path.join(fpath, "manifests")
            if os.path.exists(man_src):
                for mf in os.listdir(man_src):
                    shutil.copy2(os.path.join(man_src, mf), os.path.join(manifests_dir, mf))

            restored.append({"appid": aid, "name": meta.get("name", folder)})

        return {"success": True, "restored_count": len(restored), "games": restored, "source": "Single Source Directory"}

    # 2. Restore from archive file (.tar.gz / .zip)
    if not archive_path or not os.path.exists(archive_path):
        return {"success": False, "error": f"Archive file not found: {archive_path}"}

    if archive_path.endswith(".tar.gz") or archive_path.endswith(".tgz") or archive_path.endswith(".tar"):
        with tarfile.open(archive_path, "r:*") as tar:
            for member in tar.getmembers():
                if not member.isfile(): continue
                bname = os.path.basename(member.name)

                # Check if it's a Lua file
                if bname.endswith(".lua"):
                    try:
                        aid = int(bname[:-4])
                    except ValueError:
                        continue
                    if target_appids is not None and aid not in target_appids:
                        continue
                    f = tar.extractfile(member)
                    if f:
                        with open(os.path.join(DEFAULT_STPLUG_DIR, bname), "wb") as out:
                            out.write(f.read())
                        restored.append({"appid": aid, "name": f"AppID {aid}"})

                # Check if it's an ACF file
                elif bname.startswith("appmanifest_") and bname.endswith(".acf"):
                    aid_m = re.search(r"appmanifest_(\d+)\.acf", bname)
                    if aid_m:
                        aid = int(aid_m.group(1))
                        if target_appids is not None and aid not in target_appids:
                            continue
                        f = tar.extractfile(member)
                        if f:
                            with open(os.path.join(steamapps_dir, bname), "wb") as out:
                                out.write(f.read())
                            if not any(r["appid"] == aid for r in restored):
                                restored.append({"appid": aid, "name": f"AppID {aid}"})

                # Check if it's a depot manifest
                elif bname.endswith(".manifest"):
                    f = tar.extractfile(member)
                    if f:
                        with open(os.path.join(manifests_dir, bname), "wb") as out:
                            out.write(f.read())

    elif archive_path.endswith(".zip"):
        with zipfile.ZipFile(archive_path, "r") as zf:
            for name in zf.namelist():
                bname = os.path.basename(name)
                if bname.endswith(".lua"):
                    try:
                        aid = int(bname[:-4])
                    except ValueError:
                        continue
                    if target_appids is not None and aid not in target_appids:
                        continue
                    with open(os.path.join(DEFAULT_STPLUG_DIR, bname), "wb") as out:
                        out.write(zf.read(name))
                    restored.append({"appid": aid, "name": f"AppID {aid}"})

                elif bname.startswith("appmanifest_") and bname.endswith(".acf"):
                    aid_m = re.search(r"appmanifest_(\d+)\.acf", bname)
                    if aid_m:
                        aid = int(aid_m.group(1))
                        if target_appids is not None and aid not in target_appids:
                            continue
                        with open(os.path.join(steamapps_dir, bname), "wb") as out:
                            out.write(zf.read(name))
                        if not any(r["appid"] == aid for r in restored):
                            restored.append({"appid": aid, "name": f"AppID {aid}"})

    names = resolve_all_dynamic_names()
    for r in restored:
        if r["appid"] in names:
            r["name"] = names[r["appid"]]

    return {"success": True, "restored_count": len(restored), "games": restored, "source": os.path.basename(archive_path)}

def delete_archive_file(filename):
    fname = os.path.basename(filename)
    target = os.path.join(ARCHIVES_BACKUP_DIR, fname)
    if not os.path.exists(target):
        return {"success": False, "error": f"File not found: {fname}"}
    try:
        os.remove(target)
        return {"success": True, "filename": fname}
    except Exception as e:
        return {"success": False, "error": str(e)}

# In-Memory CEF Injector
def inject_into_steam():
    port_file = os.path.expanduser("~/.local/share/Lumen/cef_port")
    port = None
    if os.path.exists(port_file):
        try:
            with open(port_file, "r", encoding="utf-8") as f:
                port = f.read().splitlines()[0].strip()
        except Exception:
            pass

    if not port:
        try:
            out = subprocess.check_output(["pgrep", "-a", "steamwebhelper"], text=True)
            match = re.search(r'--remote-debugging-port=(\d+)', out)
            if match:
                port = match.group(1)
        except Exception:
            pass

    if not port or not port.isdigit():
        return False, "Waiting for a Steam CDP port; start Lumen or Steam with remote debugging enabled"

    css_path = os.path.join(REPO_DIR, "frontend", "styles.css")
    js_path = os.path.join(REPO_DIR, "frontend", "index.js")
    if not os.path.isfile(css_path) or not os.path.isfile(js_path):
        return False, f"Frontend assets missing under {REPO_DIR}"

    node_script = f"""
    const fs = require('fs');
    const root = {json.dumps(REPO_DIR)};
    const port = {int(port)};
    const css = fs.readFileSync(root + '/frontend/styles.css', 'utf8');
    const js = fs.readFileSync(root + '/frontend/index.js', 'utf8');

    function fail(message) {{
      console.error(message);
      process.exit(1);
    }}

    async function run() {{
      const response = await fetch(`http://127.0.0.1:${{port}}/json`);
      if (!response.ok) return fail(`Steam CDP returned HTTP ${{response.status}}`);
      const pages = await response.json();
      const steam = pages.find(page => page.title === 'Steam' && page.webSocketDebuggerUrl);
      if (!steam) return fail('Steam main CEF page is not ready yet');

      const ws = new WebSocket(steam.webSocketDebuggerUrl);
      const timeout = setTimeout(() => fail('Timed out waiting for Steam CEF'), 6000);
      ws.onopen = () => {{
        const expression = `
          (function() {{
            const oldStyles = document.getElementById('slm-styles');
            if (oldStyles) oldStyles.remove();
            const styles = document.createElement('style');
            styles.id = 'slm-styles';
            styles.textContent = ${{JSON.stringify(css)}};
            document.head.appendChild(styles);
            ${{js}}
            return true;
          }})()
        `;
        ws.send(JSON.stringify({{
          id: 1,
          method: 'Runtime.evaluate',
          params: {{ expression, returnByValue: true }}
        }}));
      }};
      ws.onmessage = event => {{
        const message = JSON.parse(event.data);
        if (message.id !== 1) return;
        clearTimeout(timeout);
        if (message.error) return fail(message.error.message || 'Steam rejected the injection');
        if (message.result && message.result.exceptionDetails) {{
          return fail(message.result.exceptionDetails.text || 'Steam frontend injection failed');
        }}
        console.log('Injected into Steam');
        ws.close();
        process.exit(0);
      }};
      ws.onerror = () => fail('Could not connect to Steam CEF');
    }}

    run().catch(error => fail(error.message || String(error)));
    """
    try:
        result = subprocess.run(["node", "-e", node_script], capture_output=True, text=True, timeout=8)
        if result.returncode == 0:
            return True, "Injected into Steam"
        message = (result.stderr or result.stdout).strip()
        return False, message or f"Node injector exited with status {result.returncode}"
    except FileNotFoundError:
        return False, "Node.js 22 or newer is required for Steam CEF injection"
    except subprocess.TimeoutExpired:
        return False, "Steam CEF injection timed out"
    except Exception as error:
        return False, str(error)

# HTTP Request Handler with CORS
class RequestHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_cors_headers()
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path in ["/api/games", "/api/status"]:
            games = get_all_library_games()
            archives = list_archives()
            data = {"success": True, "games": games, "archives": archives, "total": len(games)}
            self.send_response(200)
            self.send_cors_headers()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(data).encode("utf-8"))
            return

        elif parsed.path == "/api/archives":
            archives = list_archives()
            data = {"success": True, "archives": archives}
            self.send_response(200)
            self.send_cors_headers()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(data).encode("utf-8"))
            return

        self.send_response(200)
        self.send_cors_headers()
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(b"<h1>Steam Library Manager API Service</h1>")

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length).decode('utf-8')
        try:
            payload = json.loads(body) if body else {}
        except Exception:
            payload = {}

        if parsed.path in ["/api/sync", "/api/backup"]:
            appids = payload.get("appids")
            create_tar = True if parsed.path == "/api/backup" else bool(payload.get("create_archive", False))
            tar_name = payload.get("archive_name")
            result = sync_games(appids=appids, create_tar=create_tar, tar_name=tar_name)

        elif parsed.path == "/api/inspect":
            source_type = payload.get("source_type", "directory")
            archive_path = payload.get("archive_path")
            if archive_path and not os.path.isabs(archive_path):
                archive_path = os.path.join(ARCHIVES_BACKUP_DIR, archive_path)
            games = inspect_source(source_type, archive_path)
            result = {"success": True, "games": games}

        elif parsed.path == "/api/restore":
            source_type = payload.get("source_type", "directory")
            archive_path = payload.get("archive_path")
            if archive_path and not os.path.isabs(archive_path):
                archive_path = os.path.join(ARCHIVES_BACKUP_DIR, archive_path)
            appids = payload.get("appids")
            result = restore_games(source_type=source_type, archive_path=archive_path, appids=appids)

        elif parsed.path in ["/api/delete_archive", "/api/delete_backup"]:
            filename = payload.get("filename") or payload.get("archive_name")
            result = delete_archive_file(filename)

        elif parsed.path == "/api/inject":
            ok, msg = inject_into_steam()
            result = {"success": ok, "message": msg}

        else:
            self.send_response(404)
            self.end_headers()
            return

        self.send_response(200)
        self.send_cors_headers()
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(result).encode("utf-8"))

def run_server(port=8343):
    server = http.server.HTTPServer(("127.0.0.1", port), RequestHandler)
    server.serve_forever()

def run_daemon(port=8343):
    print(f"[SLM Daemon] Starting auto-attach service on 127.0.0.1:{port}...", flush=True)
    server_thread = threading.Thread(target=run_server, args=(port,), daemon=True)
    server_thread.start()

    next_attempt = 0
    last_status_log = 0
    attached = False
    while True:
        try:
            time.sleep(3)
            now = time.monotonic()
            if now >= next_attempt:
                ok, message = inject_into_steam()
                if ok:
                    next_attempt = now + 30
                    if not attached:
                        print(f"[SLM Daemon] {message}", flush=True)
                    attached = True
                    last_status_log = now
                else:
                    next_attempt = now + 5
                    attached = False
                    if now - last_status_log >= 30:
                        last_status_log = now
                        print(f"[SLM Daemon] Waiting to attach: {message}", flush=True)
        except KeyboardInterrupt:
            break
        except Exception as error:
            now = time.monotonic()
            if now - last_status_log >= 30:
                last_status_log = now
                print(f"[SLM Daemon] Auto-attach error: {error}", flush=True)

def main():
    parser = argparse.ArgumentParser(description="Steam Library Manager - Single Source of Truth Backup & Restore")
    subparsers = parser.add_subparsers(dest="command")

    subparsers.add_parser("list", help="List all Steam games in library")

    # sync
    p_sync = subparsers.add_parser("sync", help="Sync/backup games into single-source subdirectories")
    p_sync.add_argument("--all", action="store_true", help="Sync all games")
    p_sync.add_argument("--games", type=str, help="Comma-separated AppIDs to sync")
    p_sync.add_argument("--game", type=int, help="Single AppID to sync")
    p_sync.add_argument("--tar", action="store_true", help="Also generate .tar.gz archive bundle")

    # restore
    p_restore = subparsers.add_parser("restore", help="Restore games from directory or archive")
    p_restore.add_argument("--dir", action="store_true", help="Restore from single-source directory")
    p_restore.add_argument("--archive", type=str, help="Restore from specific archive bundle (.tar.gz)")
    p_restore.add_argument("--all", action="store_true", help="Restore all games")
    p_restore.add_argument("--games", type=str, help="Comma-separated AppIDs to restore")

    # archives
    subparsers.add_parser("archives", help="List available archive bundles")

    subparsers.add_parser("daemon", help="Run background daemon")
    subparsers.add_parser("inject", help="Inject into running Steam")

    args = parser.parse_args()

    if not args.command or args.command == "list":
        games = get_all_library_games()
        print(f"\n🎮 Universal Steam Library ({len(games)} total):")
        print("─" * 90)
        for g in games:
            st = "INSTALLED" if g["installed"] else "IN LIBRARY"
            sz_str = f" ({format_bytes(g['size_on_disk'])})" if g["installed"] and g.get("size_on_disk") else ""
            sync_st = f"SYNCED ({g['last_synced']})" if g["backed_up"] else "NOT SYNCED"
            print(f"[{g['appid']:7d}] {g['name']:<38} | {st:<12}{sz_str} | {sync_st}")
        print("─" * 90)
        return

    if args.command == "sync":
        appids = None
        if args.all:
            appids = "all"
        elif args.games:
            appids = [int(x.strip()) for x in args.games.split(",") if x.strip()]
        elif args.game:
            appids = [args.game]
        else:
            print("Specify --all, --games <id1,id2>, or --game <id>")
            return

        res = sync_games(appids=appids, create_tar=args.tar)
        if res["success"]:
            print(f"\n✓ Successfully synced {res['synced_count']} game(s) to {GAMES_BACKUP_DIR}")
            if res.get("archive_path"):
                print(f"  Archive created: {res['archive_path']}")
        else:
            print(f"\n✗ Sync failed: {res['error']}")

    elif args.command == "archives":
        archs = list_archives()
        print(f"\n📦 Available Archives in {ARCHIVES_BACKUP_DIR}:")
        print("─" * 80)
        if not archs:
            print("No archives found.")
        for a in archs:
            dt = datetime.fromtimestamp(a["mtime"]).strftime("%Y-%m-%d %H:%M:%S")
            sz = format_bytes(a["size"])
            print(f"{a['filename']:<48} {a['count']:2d} games | {sz} | {dt}")
        print("─" * 80)

    elif args.command == "restore":
        source_type = "archive" if args.archive else "directory"
        appids = "all" if args.all else ([int(x.strip()) for x in args.games.split(",")] if args.games else "all")
        res = restore_games(source_type=source_type, archive_path=args.archive, appids=appids)
        if res["success"]:
            print(f"\n✓ Successfully restored {res['restored_count']} game(s) from {res['source']}!")
            for g in res["games"]:
                print(f"  + [{g['appid']}] {g['name']}")
            print("\n→ Restart Steam to refresh your library.")
        else:
            print(f"\n✗ Restore failed: {res['error']}")

    elif args.command == "daemon":
        run_daemon()

    elif args.command == "inject":
        ok, msg = inject_into_steam()
        print(f"[{'✓' if ok else '✗'}] {msg}")

if __name__ == "__main__":
    main()
