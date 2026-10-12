-- librarybackup.lua: Lumen RPC backend for Steam Library Backup & Restore
local json = require("json")
local utils = require("utils")

local librarybackup = {}

local function get_steam_root()
  return os.getenv("HOME") .. "/.local/share/Steam"
end

local function get_stplug_dir()
  return get_steam_root() .. "/config/stplug-in"
end

local function get_sls_dir()
  return os.getenv("HOME") .. "/.config/SLSsteam"
end

local function get_backup_dir()
  local bdir = os.getenv("HOME") .. "/SteamLibrary-Backups"
  os.execute("mkdir -p '" .. bdir .. "'")
  return bdir
end

function librarybackup.list_games()
  local cmd = os.getenv("HOME") .. "/.local/bin/steam-library-manager list >/dev/null 2>&1"
  -- Call python helper or inspect stplug-in directly
  local py_cmd = "python3 -c '\n"
    .. "import sys, json\n"
    .. "sys.path.insert(0, \"" .. os.getenv("HOME") .. "/WorkSpace/Code/steam-library-manager/bin\")\n"
    .. "import importlib.util\n"
    .. "spec = importlib.util.spec_from_file_location(\"slm\", \"" .. os.getenv("HOME") .. "/WorkSpace/Code/steam-library-manager/bin/steam-library-manager\")\n"
    .. "mod = importlib.util.module_from_spec(spec)\n"
    .. "spec.loader.exec_module(mod)\n"
    .. "print(json.dumps({\"success\": True, \"games\": mod.get_managed_games()}))\n"
    .. "'"
  local handle = io.popen(py_cmd)
  local result = handle:read("*a")
  handle:close()
  return result
end

function librarybackup.export_games(req_str)
  local py_cmd = "python3 -c '\n"
    .. "import sys, json, importlib.util\n"
    .. "spec = importlib.util.spec_from_file_location(\"slm\", \"" .. os.getenv("HOME") .. "/WorkSpace/Code/steam-library-manager/bin/steam-library-manager\")\n"
    .. "mod = importlib.util.module_from_spec(spec)\n"
    .. "spec.loader.exec_module(mod)\n"
    .. "req = json.loads(" .. string.format("%q", req_str) .. ")\n"
    .. "appids = req.get(\"appids\")\n"
    .. "name = req.get(\"backup_name\")\n"
    .. "res = mod.export_games(appids=appids, backup_name=name)\n"
    .. "print(json.dumps(res))\n"
    .. "'"
  local handle = io.popen(py_cmd)
  local result = handle:read("*a")
  handle:close()
  return result
end

function librarybackup.restore_games(req_str)
  local py_cmd = "python3 -c '\n"
    .. "import sys, json, importlib.util\n"
    .. "spec = importlib.util.spec_from_file_location(\"slm\", \"" .. os.getenv("HOME") .. "/WorkSpace/Code/steam-library-manager/bin/steam-library-manager\")\n"
    .. "mod = importlib.util.module_from_spec(spec)\n"
    .. "spec.loader.exec_module(mod)\n"
    .. "req = json.loads(" .. string.format("%q", req_str) .. ")\n"
    .. "appids = req.get(\"appids\")\n"
    .. "fname = req.get(\"backup_filename\")\n"
    .. "bpath = req.get(\"backup_path\")\n"
    .. "if fname and not bpath:\n"
    .. "    import os\n"
    .. "    bpath = os.path.join(mod.DEFAULT_BACKUP_DIR, fname)\n"
    .. "res = mod.restore_games(backup_path=bpath, appids=appids)\n"
    .. "print(json.dumps(res))\n"
    .. "'"
  local handle = io.popen(py_cmd)
  local result = handle:read("*a")
  handle:close()
  return result
end

function librarybackup.list_backups()
  local py_cmd = "python3 -c '\n"
    .. "import sys, json, importlib.util\n"
    .. "spec = importlib.util.spec_from_file_location(\"slm\", \"" .. os.getenv("HOME") .. "/WorkSpace/Code/steam-library-manager/bin/steam-library-manager\")\n"
    .. "mod = importlib.util.module_from_spec(spec)\n"
    .. "spec.loader.exec_module(mod)\n"
    .. "print(json.dumps({\"success\": True, \"backups\": mod.list_backups()}))\n"
    .. "'"
  local handle = io.popen(py_cmd)
  local result = handle:read("*a")
  handle:close()
  return result
end

function librarybackup.register(registry)
  registry.ListLibraryGames = function()
    return librarybackup.list_games()
  end

  registry.ExportLibraryGames = function(req)
    local s = type(req) == "string" and req or json.encode(req or {})
    return librarybackup.export_games(s)
  end

  registry.RestoreLibraryGames = function(req)
    local s = type(req) == "string" and req or json.encode(req or {})
    return librarybackup.restore_games(s)
  end

  registry.ListLibraryBackups = function()
    return librarybackup.list_backups()
  end

  return registry
end

return librarybackup
