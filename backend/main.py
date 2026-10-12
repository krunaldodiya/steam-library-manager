#!/usr/bin/env python3
"""
Steam Library Manager - Backend Engine
Universal metadata manager (Official Steam & LuaTools/SLSsteam).
100% Dynamic Game Title Detection from user's Steam client.
Zero hardcoded games.
"""

import os
import sys
import glob
import re
import json
import time
import shutil
import zipfile
import subprocess
from datetime import datetime
from pathlib import Path

DEFAULT_STEAM_ROOT = os.path.expanduser("~/.local/share/Steam")
DEFAULT_STPLUG_DIR = os.path.join(DEFAULT_STEAM_ROOT, "config/stplug-in")
DEFAULT_SLS_DIR = os.path.expanduser("~/.config/SLSsteam")
DEFAULT_BACKUP_DIR = os.path.expanduser("~/SteamLibrary-Backups")
NAMES_CACHE_FILE = os.path.expanduser("~/.config/steam-library-manager/names_cache.json")

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
            if m: port = m.group(1)
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

def get_all_library_games():
    names = resolve_all_dynamic_names()
    games_map = {}
    roots = get_steam_libraries()

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

    return [games_map[k] for k in sorted(games_map.keys(), key=lambda x: str(games_map[x]["name"]).lower())]

def export_games(appids=None, backup_name=None, backup_dir=DEFAULT_BACKUP_DIR):
    all_games = get_all_library_games()
    if not all_games:
        return {"success": False, "error": "No games found in Steam library"}

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
            clean_name = re.sub(r'[^a-zA-Z0-9_\-]', '_', str(selected_games[0]["name"]))
            backup_name = f"game_{selected_games[0]['appid']}_{clean_name}_{ts}.zip"
        elif len(selected_games) == len(all_games):
            backup_name = f"steam_library_full_{ts}.zip"
        else:
            backup_name = f"steam_library_{len(selected_games)}_games_{ts}.zip"

    if not backup_name.endswith(".zip"):
        backup_name += ".zip"

    zip_path = os.path.join(backup_dir, backup_name)
    metadata = {
        "version": "2.0",
        "created_at": ts,
        "total_games": len(selected_games),
        "games": selected_games
    }

    manifests_dir = os.path.join(DEFAULT_SLS_DIR, "manifests")
    all_depots = set()
    for g in selected_games:
        for d in g.get("depots", []):
            all_depots.add(d)

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("metadata.json", json.dumps(metadata, indent=2))

        for g in selected_games:
            if g.get("has_lua") and g.get("lua_file"):
                src = os.path.join(DEFAULT_STPLUG_DIR, g["lua_file"])
                if os.path.exists(src):
                    zf.write(src, f"stplug-in/{g['lua_file']}")

            if g.get("has_acf") and g.get("acf_path"):
                if os.path.exists(g["acf_path"]):
                    fname = os.path.basename(g["acf_path"])
                    zf.write(g["acf_path"], f"acfs/{fname}")

        if os.path.exists(manifests_dir) and all_depots:
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
    names = resolve_all_dynamic_names()
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
                            games_list.append({"appid": aid, "name": names.get(aid, f"AppID {aid}")})
                        elif n.startswith("acfs/appmanifest_") and n.endswith(".acf"):
                            aid = int(n[17:-4])
                            games_list.append({"appid": aid, "name": names.get(aid, f"AppID {aid}")})
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

def delete_backup(filename_or_path, backup_dir=DEFAULT_BACKUP_DIR):
    if not filename_or_path:
        return {"success": False, "error": "No filename specified"}
    fname = os.path.basename(filename_or_path)
    target = os.path.join(backup_dir, fname)
    if not os.path.exists(target):
        return {"success": False, "error": f"Backup file not found: {fname}"}
    try:
        os.remove(target)
        return {"success": True, "filename": fname}
    except Exception as e:
        return {"success": False, "error": str(e)}

def restore_games(backup_path=None, appids=None, backup_dir=DEFAULT_BACKUP_DIR):
    if not backup_path:
        all_b = list_backups(backup_dir)
        if not all_b:
            return {"success": False, "error": "No backup files found to restore from"}
        backup_path = all_b[0]["path"]

    if not os.path.exists(backup_path):
        return {"success": False, "error": f"Backup file not found: {backup_path}"}

    names = resolve_all_dynamic_names()
    os.makedirs(DEFAULT_STPLUG_DIR, exist_ok=True)
    manifests_dir = os.path.join(DEFAULT_SLS_DIR, "manifests")
    os.makedirs(manifests_dir, exist_ok=True)
    steamapps_dir = os.path.join(DEFAULT_STEAM_ROOT, "steamapps")
    os.makedirs(steamapps_dir, exist_ok=True)

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

                g_info = avail_map.get(aid, {"appid": aid, "name": names.get(aid, f"AppID {aid}")})
                if g_info not in restored:
                    restored.append(g_info)

            elif member.startswith("acfs/") and member.endswith(".acf"):
                fname = os.path.basename(member)
                aid_match = re.search(r"appmanifest_(\d+)\.acf", fname)
                if aid_match:
                    aid = int(aid_match.group(1))
                    if target_appids is not None and aid not in target_appids:
                        continue

                    target_lib = steamapps_dir
                    if aid in avail_map and avail_map[aid].get("library_path"):
                        lib_p = avail_map[aid]["library_path"]
                        if os.path.exists(lib_p):
                            target_lib = os.path.join(lib_p, "steamapps")

                    dest = os.path.join(target_lib, fname)
                    with open(dest, "wb") as f:
                        f.write(zf.read(member))

                    g_info = avail_map.get(aid, {"appid": aid, "name": names.get(aid, f"AppID {aid}")})
                    if g_info not in restored:
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
