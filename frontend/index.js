/**
 * Steam Library Manager - Dedicated In-Steam Frontend Plugin
 * Standalone Extension for Steam Client with Draggable Floating Button
 * Dedicated Backup and Restore Screens with State-Aware Sync & Backup Buttons
 */

(function () {
  if (window.__steamLibraryManagerInitialized) return;
  window.__steamLibraryManagerInitialized = true;

  const prevBtn = document.getElementById("slm-topbar-btn");
  if (prevBtn) prevBtn.remove();
  const prevFloat = document.getElementById("slm-floating-btn");
  if (prevFloat) prevFloat.remove();

  const API_PORT = 8343;
  const BACKEND_URL = `http://127.0.0.1:${API_PORT}`;

  function formatBytes(bytes) {
    const value = Number(bytes);
    if (!Number.isFinite(value) || value <= 0) return "0 B";

    const units = ["KB", "MB", "GB", "TB", "PB", "EB"];
    let size = value / 1024;
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) {
      size /= 1024;
      unit += 1;
    }
    if (Number(size.toFixed(1)) >= 1024 && unit < units.length - 1) {
      size /= 1024;
      unit += 1;
    }
    return `${size.toFixed(1)} ${units[unit]}`;
  }

  async function apiCall(method, params = {}) {
    const endpointMap = {
      "get_games": "/api/games",
      "get_archives": "/api/archives",
      "sync": "/api/sync",
      "backup": "/api/backup",
      "inspect": "/api/inspect",
      "restore": "/api/restore",
      "delete_archive": "/api/delete_archive"
    };
    const endpoint = endpointMap[method] || `/api/${method}`;
    const res = await fetch(`${BACKEND_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params)
    });
    return await res.json();
  }

  function showToast(text) {
    let toast = document.getElementById("slm-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "slm-toast";
      toast.className = "slm-toast";
      document.body.appendChild(toast);
    }
    toast.textContent = text;
    toast.style.display = "block";
    setTimeout(() => { toast.style.display = "none"; }, 4000);
  }

  function openManagerModal() {
    let existing = document.getElementById("slm-modal-overlay");
    if (existing) {
      existing.remove();
      return;
    }

    let state = {
      activeTab: "backup",
      activeFilter: "all",
      games: [],
      archives: [],
      restoreSourceName: "directory",
      restoreGames: [],
      restoreSelectedIds: new Set(),
      restoreRequestId: 0
    };

    const overlay = document.createElement("div");
    overlay.id = "slm-modal-overlay";
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });

    const win = document.createElement("div");
    win.id = "slm-modal-window";

    // Header
    const header = document.createElement("div");
    header.className = "slm-header";
    header.innerHTML = `
      <div class="slm-header-title">
        <span>📦</span>
        <span>Steam Library Manager</span>
      </div>
      <button class="slm-header-close" title="Close">✕</button>
    `;
    header.querySelector(".slm-header-close").addEventListener("click", () => overlay.remove());
    win.appendChild(header);

    // Tab Bar (Clean "Backup" and "Restore" screens)
    const tabs = document.createElement("div");
    tabs.className = "slm-tabs";
    tabs.innerHTML = `
      <button class="slm-tab-btn active" data-tab="backup">📦 Backup</button>
      <button class="slm-tab-btn" data-tab="restore">📥 Restore</button>
    `;
    win.appendChild(tabs);

    const content = document.createElement("div");
    content.className = "slm-content";
    win.appendChild(content);

    overlay.appendChild(win);
    document.body.appendChild(overlay);

    tabs.querySelectorAll(".slm-tab-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        tabs.querySelectorAll(".slm-tab-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        state.activeTab = btn.dataset.tab;
        renderTab();
      });
    });

    async function loadData() {
      content.innerHTML = `<div style="text-align:center;padding:50px;color:#8f98a0;">Loading library status from Steam...</div>`;
      try {
        const [gRes, aRes] = await Promise.all([
          fetch(`${BACKEND_URL}/api/games`).then(r => r.json()),
          fetch(`${BACKEND_URL}/api/archives`).then(r => r.json())
        ]);
        state.games = gRes.games || [];
        state.archives = aRes.archives || [];
        renderTab();
      } catch (err) {
        content.innerHTML = `
          <div style="text-align:center;padding:50px;color:#ec5c5c;">
            Failed to connect to backend engine.<br>
            <small style="color:#8f98a0;">Make sure steam-library-manager daemon is active.</small>
          </div>
        `;
      }
    }

    function renderTab() {
      if (state.activeTab === "backup") renderBackupScreen();
      else renderRestoreScreen();
    }

    // ── 1. Backup Screen ────────────────────────────────────────────────────────
    function renderBackupScreen() {
      const totalCount = state.games.length;
      const instCount = state.games.filter(g => g.installed).length;
      const syncedCount = state.games.filter(g => g.backed_up).length;
      const notSyncedCount = totalCount - syncedCount;

      content.innerHTML = `
        <div class="slm-filter-chips">
          <button class="slm-chip active" data-filter="all">All (${totalCount})</button>
          <button class="slm-chip" data-filter="installed">Installed (${instCount})</button>
          <button class="slm-chip" data-filter="synced">Synced (${syncedCount})</button>
          <button class="slm-chip" data-filter="notsynced">Not Synced (${notSyncedCount})</button>
          <button class="slm-chip" data-filter="luatools">LuaTools Managed</button>
          <button class="slm-chip" data-filter="official">Official Steam</button>
        </div>

        <div class="slm-toolbar">
          <input type="text" id="slm-search" class="slm-input" placeholder="🔍 Search games, AppID, or source...">
          <button class="slm-btn-secondary" id="slm-btn-sync" disabled style="opacity:0.4;cursor:not-allowed;">
            <span>🔄</span><span>Sync (<span id="slm-sync-count">0</span>)</span>
          </button>
          <button class="slm-btn-primary" id="slm-btn-backup" disabled style="opacity:0.4;cursor:not-allowed;">
            <span>💾</span><span>Backup (<span id="slm-sel-count">0</span>)</span>
          </button>
        </div>

        <table class="slm-table">
          <thead>
            <tr>
              <th width="32"><input type="checkbox" id="slm-th-chk"></th>
              <th>Game Title</th>
              <th width="90">AppID</th>
              <th width="140">Source / Type</th>
              <th width="130">Status</th>
              <th width="160">Last Backup / Sync</th>
              <th width="80">Action</th>
            </tr>
          </thead>
          <tbody id="slm-games-body"></tbody>
        </table>
      `;

      const tbody = content.querySelector("#slm-games-body");
      const search = content.querySelector("#slm-search");
      const btnSelCount = content.querySelector("#slm-sel-count");
      const btnSyncCount = content.querySelector("#slm-sync-count");
      const btnSync = content.querySelector("#slm-btn-sync");
      const btnBackup = content.querySelector("#slm-btn-backup");
      const thChk = content.querySelector("#slm-th-chk");

      content.querySelectorAll(".slm-chip").forEach(chip => {
        chip.addEventListener("click", () => {
          content.querySelectorAll(".slm-chip").forEach(c => c.classList.remove("active"));
          chip.classList.add("active");
          state.activeFilter = chip.dataset.filter;
          populate(search.value);
        });
      });

      // Update button state (enabled when >= 1 selected, disabled/readonly when 0)
      function updateButtonStates() {
        const chks = tbody.querySelectorAll(".slm-gchk");
        const checkedChks = tbody.querySelectorAll(".slm-gchk:checked");
        const count = checkedChks.length;
        btnSelCount.textContent = count;
        btnSyncCount.textContent = count;
        if (thChk && chks.length > 0) {
          thChk.checked = checkedChks.length === chks.length;
          thChk.indeterminate = count > 0 && count < chks.length;
        }
        if (count > 0) {
          btnSync.disabled = false;
          btnSync.style.opacity = "1";
          btnSync.style.cursor = "pointer";
          btnBackup.disabled = false;
          btnBackup.style.opacity = "1";
          btnBackup.style.cursor = "pointer";
        } else {
          btnSync.disabled = true;
          btnSync.style.opacity = "0.4";
          btnSync.style.cursor = "not-allowed";
          btnBackup.disabled = true;
          btnBackup.style.opacity = "0.4";
          btnBackup.style.cursor = "not-allowed";
        }
      }

      function populate(q = "") {
        tbody.innerHTML = "";
        const query = q.toLowerCase();
        let list = state.games;

        if (state.activeFilter === "installed") list = list.filter(g => g.installed);
        else if (state.activeFilter === "synced") list = list.filter(g => g.backed_up);
        else if (state.activeFilter === "notsynced") list = list.filter(g => !g.backed_up);
        else if (state.activeFilter === "luatools") list = list.filter(g => g.has_lua);
        else if (state.activeFilter === "official") list = list.filter(g => (g.source || "").includes("Official"));

        const filtered = list.filter(g =>
          (g.name || "").toLowerCase().includes(query) ||
          (g.appid || "").toString().includes(query) ||
          (g.source || "").toLowerCase().includes(query)
        );

        if (filtered.length === 0) {
          tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;color:#8f98a0;">No games matching search or filter.</td></tr>`;
          updateButtonStates();
          return;
        }

        filtered.forEach(g => {
          const tr = document.createElement("tr");

          let srcClass = "official";
          if (g.source === "LuaTools / SLSsteam") srcClass = "luatools";

          let statusBadge = g.installed
            ? `<span class="slm-badge installed">Installed${g.size_on_disk ? ' (' + formatBytes(g.size_on_disk) + ')' : ''}</span>`
            : `<span class="slm-badge library">In Library</span>`;

          let syncBadge = g.backed_up
            ? `<span class="slm-badge synced">✓ ${g.last_synced}</span>`
            : `<span class="slm-badge notsynced">Not Synced</span>`;

          tr.innerHTML = `
            <td><input type="checkbox" class="slm-gchk" value="${g.appid}"></td>
            <td style="font-weight:600;color:#fff;">${g.name}</td>
            <td style="color:#8f98a0;">${g.appid}</td>
            <td><span class="slm-badge ${srcClass}">${g.source}</span></td>
            <td>${statusBadge}</td>
            <td>${syncBadge}</td>
            <td><button class="slm-btn-secondary" style="padding:3px 10px;font-size:11px;" title="Sync this game to its directory">Sync</button></td>
          `;

          tr.querySelector(".slm-gchk").addEventListener("change", updateButtonStates);
          tr.querySelector("button").addEventListener("click", async () => {
            const res = await apiCall("sync", { appids: [g.appid], create_archive: false });
            if (res.success) {
              showToast(`✓ Synced ${g.name} to games/${g.appid}/`);
              loadData();
            }
          });
          tbody.appendChild(tr);
        });
        updateButtonStates();
      }

      search.addEventListener("input", () => populate(search.value));


      if (thChk) {
        thChk.addEventListener("change", () => {
          tbody.querySelectorAll(".slm-gchk").forEach(c => c.checked = thChk.checked);
          updateButtonStates();
        });
      }

      // Top-level Sync Action (Syncs selected to games/ directory without creating tar)
      btnSync.addEventListener("click", async () => {
        const selected = Array.from(tbody.querySelectorAll(".slm-gchk:checked")).map(c => parseInt(c.value));
        if (selected.length === 0) return;

        btnSync.disabled = true;
        btnSync.innerHTML = "<span>🔄</span><span>Syncing...</span>";
        const res = await apiCall("sync", { appids: selected, create_archive: false });
        btnSync.disabled = false;
        btnSync.innerHTML = `<span>🔄</span><span>Sync (<span id="slm-sync-count">0</span>)</span>`;
        if (res.success) {
          showToast(`✓ Synced ${res.synced_count} game(s) to single-source directory!`);
          loadData();
        } else {
          showToast(`✗ Sync failed: ${res.error}`);
        }
      });

      // Top-level Backup Action (Syncs to games/ directory AND creates .tar.gz bundle)
      btnBackup.addEventListener("click", async () => {
        const selected = Array.from(tbody.querySelectorAll(".slm-gchk:checked")).map(c => parseInt(c.value));
        if (selected.length === 0) return;

        btnBackup.disabled = true;
        btnBackup.innerHTML = "<span>💾</span><span>Backing up...</span>";
        const res = await apiCall("backup", { appids: selected });
        btnBackup.disabled = false;
        btnBackup.innerHTML = `<span>💾</span><span>Backup (<span id="slm-sel-count">0</span>)</span>`;
        if (res.success) {
          let msg = `✓ Backed up ${res.synced_count} game(s) & created archive!`;
          if (res.archive_name) msg += ` (${res.archive_name})`;
          showToast(msg);
          loadData();
        } else {
          showToast(`✗ Backup failed: ${res.error}`);
        }
      });

      populate("");
    }

    // ── 2. Restore Screen ───────────────────────────────────────────────────────
    function renderRestoreScreen() {
      if (state.restoreSourceName !== "directory" &&
          !state.archives.some(a => `archive:${a.filename}` === state.restoreSourceName)) {
        state.restoreSourceName = "directory";
      }

      const archiveOptions = state.archives.map(a =>
        `<option value="archive:${a.filename}">${a.filename} (${a.count} games)</option>`
      ).join("");

      content.innerHTML = `
        <div class="slm-toolbar" style="justify-content:space-between;">
          <div>
            <h3 style="margin:0;color:#fff;font-size:15px;">Games Available to Restore</h3>
            <small style="color:#8f98a0;">Choose a backup source, then select one or more games.</small>
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            <select id="slm-restore-source" class="slm-input" style="max-width:420px;">
              <option value="directory">📁 Uncompressed games directory</option>
              ${archiveOptions}
            </select>
            <button class="slm-btn-secondary" id="slm-refresh-restore">🔄 Refresh</button>
          </div>
        </div>

        <div class="slm-toolbar">
          <input type="text" id="slm-restore-search" class="slm-input" placeholder="🔍 Search games or AppID...">
          <button class="slm-btn-primary" id="slm-restore-selected" disabled style="opacity:0.4;cursor:not-allowed;">
            <span>📥</span><span>Restore Selected (<span id="slm-restore-count">0</span>)</span>
          </button>
        </div>

        <table class="slm-table">
          <thead>
            <tr>
              <th width="32"><input type="checkbox" id="slm-restore-all" aria-label="Select all visible games"></th>
              <th>Game Title</th>
              <th width="100">AppID</th>
              <th width="160">Source / Type</th>
              <th>Target Restore Location</th>
            </tr>
          </thead>
          <tbody id="slm-restore-games">
            <tr><td colspan="5" style="text-align:center;padding:30px;color:#8f98a0;">Loading available games...</td></tr>
          </tbody>
        </table>

        <details style="margin-top:14px;">
          <summary style="color:#8f98a0;cursor:pointer;">Manage backup archives (${state.archives.length})</summary>
          <table class="slm-table" style="margin-top:8px;">
            <thead>
              <tr>
                <th>Backup Archive</th>
                <th width="100">Games</th>
                <th width="110">Size</th>
                <th width="180">Created</th>
                <th width="100">Actions</th>
              </tr>
            </thead>
            <tbody id="slm-archives-body"></tbody>
          </table>
        </details>
      `;

      const sourceSelect = content.querySelector("#slm-restore-source");
      const search = content.querySelector("#slm-restore-search");
      const restoreAll = content.querySelector("#slm-restore-all");
      const restoreBody = content.querySelector("#slm-restore-games");
      const restoreButton = content.querySelector("#slm-restore-selected");
      const archiveBody = content.querySelector("#slm-archives-body");
      sourceSelect.value = state.restoreSourceName;

      function updateSelectionControls() {
        const visible = Array.from(restoreBody.querySelectorAll(".slm-restore-check"));
        const selectedVisible = visible.filter(c => state.restoreSelectedIds.has(Number(c.value))).length;
        restoreAll.checked = visible.length > 0 && selectedVisible === visible.length;
        restoreAll.indeterminate = selectedVisible > 0 && selectedVisible < visible.length;
        const count = state.restoreSelectedIds.size;
        restoreButton.innerHTML = `<span>📥</span><span>Restore Selected (${count})</span>`;
        restoreButton.disabled = count === 0;
        restoreButton.style.opacity = restoreButton.disabled ? "0.4" : "1";
        restoreButton.style.cursor = restoreButton.disabled ? "not-allowed" : "pointer";
      }

      function renderGames(query = "") {
        const normalizedQuery = query.trim().toLowerCase();
        const games = state.restoreGames.filter(g =>
          String(g.name || "").toLowerCase().includes(normalizedQuery) ||
          String(g.appid || "").includes(normalizedQuery) ||
          String(g.source || "").toLowerCase().includes(normalizedQuery)
        );

        if (games.length === 0) {
          const message = state.restoreGames.length === 0
            ? "No games found in this backup source."
            : "No games match your search.";
          restoreBody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:30px;color:#8f98a0;">${message}</td></tr>`;
          updateSelectionControls();
          return;
        }

        restoreBody.innerHTML = "";
        games.forEach(g => {
          const tr = document.createElement("tr");
          const appid = Number(g.appid);
          const target = g.installed ? "steamapps/ & stplug-in/" : "config/stplug-in/";
          tr.innerHTML = `
            <td><input type="checkbox" class="slm-restore-check" value="${appid}" aria-label="Select ${g.name}"></td>
            <td style="font-weight:600;color:#fff;">${g.name}</td>
            <td style="color:#8f98a0;">${appid}</td>
            <td><span class="slm-badge official">${g.source || "Steam"}</span></td>
            <td style="color:#8f98a0;font-size:12px;">${target}</td>
          `;
          const checkbox = tr.querySelector(".slm-restore-check");
          checkbox.checked = state.restoreSelectedIds.has(appid);
          checkbox.addEventListener("change", () => {
            if (checkbox.checked) state.restoreSelectedIds.add(appid);
            else state.restoreSelectedIds.delete(appid);
            updateSelectionControls();
          });
          restoreBody.appendChild(tr);
        });
        updateSelectionControls();
      }

      async function loadRestoreGames() {
        const requestId = ++state.restoreRequestId;
        state.restoreSourceName = sourceSelect.value;
        state.restoreGames = [];
        state.restoreSelectedIds = new Set();
        restoreBody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:30px;color:#8f98a0;">Loading available games...</td></tr>`;
        updateSelectionControls();

        const isDirectory = state.restoreSourceName === "directory";
        const archive = isDirectory
          ? null
          : state.archives.find(a => `archive:${a.filename}` === state.restoreSourceName);
        if (!isDirectory && !archive) {
          restoreBody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:30px;color:#ec5c5c;">Selected archive is no longer available. Refresh the list.</td></tr>`;
          return;
        }

        try {
          const result = await apiCall("inspect", {
            source_type: isDirectory ? "directory" : "archive",
            archive_path: archive ? archive.path : null
          });
          if (requestId !== state.restoreRequestId) return;
          if (!result.success) throw new Error(result.error || "Could not inspect backup source");
          state.restoreGames = result.games || [];
          renderGames(search.value);
        } catch (error) {
          if (requestId !== state.restoreRequestId) return;
          restoreBody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:30px;color:#ec5c5c;">Could not load games: ${error.message}</td></tr>`;
          updateSelectionControls();
        }
      }

      sourceSelect.addEventListener("change", loadRestoreGames);
      search.addEventListener("input", () => renderGames(search.value));
      restoreAll.addEventListener("change", () => {
        restoreBody.querySelectorAll(".slm-restore-check").forEach(checkbox => {
          const appid = Number(checkbox.value);
          if (restoreAll.checked) state.restoreSelectedIds.add(appid);
          else state.restoreSelectedIds.delete(appid);
        });
        renderGames(search.value);
      });
      content.querySelector("#slm-refresh-restore").addEventListener("click", loadData);

      restoreButton.addEventListener("click", async () => {
        const appids = Array.from(state.restoreSelectedIds);
        if (appids.length === 0) return;
        const isDirectory = state.restoreSourceName === "directory";
        const archive = isDirectory
          ? null
          : state.archives.find(a => `archive:${a.filename}` === state.restoreSourceName);
        if (!isDirectory && !archive) {
          showToast("✗ Selected archive is no longer available. Refresh the list.");
          return;
        }

        restoreButton.disabled = true;
        restoreButton.innerHTML = "<span>📥</span><span>Restoring...</span>";
        try {
          const result = await apiCall("restore", {
            source_type: isDirectory ? "directory" : "archive",
            archive_path: archive ? archive.path : null,
            appids
          });
          if (result.success) {
            showToast(`✓ Restored ${result.restored_count} games from ${result.source}! Restart Steam to apply.`);
            loadData();
          } else {
            showToast(`✗ Restore failed: ${result.error || "Unknown error"}`);
            updateSelectionControls();
          }
        } catch (error) {
          showToast(`✗ Restore failed: ${error.message}`);
          updateSelectionControls();
        }
      });

      if (state.archives.length === 0) {
        archiveBody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:20px;color:#8f98a0;">No archive bundles available.</td></tr>`;
      } else {
        state.archives.forEach(a => {
          const tr = document.createElement("tr");
          const created = new Date(a.mtime * 1000).toLocaleString();
          tr.innerHTML = `
            <td style="font-weight:600;color:#fff;">${a.filename}</td>
            <td>${a.count} games</td>
            <td style="color:#8f98a0;">${formatBytes(a.size)}</td>
            <td style="color:#8f98a0;">${created}</td>
            <td><button class="slm-btn-danger" style="padding:4px 8px;font-size:11px;" data-action="delete" title="Delete this archive">🗑 Delete</button></td>
          `;
          const deleteButton = tr.querySelector("[data-action='delete']");
          let deleteArmed = false;
          let deleteTimer = null;
          deleteButton.addEventListener("click", async () => {
            if (!deleteArmed) {
              deleteArmed = true;
              deleteButton.textContent = "Sure?";
              deleteButton.style.background = "#ec5c5c";
              deleteButton.style.color = "#ffffff";
              deleteTimer = setTimeout(() => {
                deleteArmed = false;
                deleteButton.textContent = "🗑 Delete";
                deleteButton.style.background = "rgba(236, 92, 92, 0.12)";
                deleteButton.style.color = "#f28b82";
              }, 4000);
              return;
            }

            clearTimeout(deleteTimer);
            deleteButton.disabled = true;
            deleteButton.textContent = "Deleting...";
            const result = await apiCall("delete_archive", { filename: a.filename });
            if (result.success) {
              showToast(`✓ Permanently deleted ${a.filename}`);
              loadData();
            } else {
              showToast(`✗ Delete failed: ${result.error || "Unknown error"}`);
            }
          });
          archiveBody.appendChild(tr);
        });
      }

      loadRestoreGames();
    }

    loadData();
  }

  // Draggable Floating Button Implementation
  function injectFloatingButton() {
    if (document.getElementById("slm-floating-btn")) return;

    const oldBtn = document.getElementById("slm-topbar-btn");
    if (oldBtn) oldBtn.remove();

    const btn = document.createElement("div");
    btn.id = "slm-floating-btn";
    btn.innerHTML = `<span class="slm-drag-handle">⋮⋮</span><span>📦 Backup & Restore</span>`;
    btn.title = "Drag to move anywhere • Click to open Backup & Restore";

    try {
      const saved = localStorage.getItem("slm_btn_pos");
      if (saved) {
        const pos = JSON.parse(saved);
        if (typeof pos.left === "number" && typeof pos.top === "number") {
          btn.style.left = `${Math.min(window.innerWidth - 180, Math.max(10, pos.left))}px`;
          btn.style.top = `${Math.min(window.innerHeight - 50, Math.max(10, pos.top))}px`;
          btn.style.right = "auto";
          btn.style.bottom = "auto";
        }
      }
    } catch (e) {}

    let isDragging = false;
    let dragStartX = 0, dragStartY = 0;
    let initialLeft = 0, initialTop = 0;
    let movedDistance = 0;

    btn.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      isDragging = true;
      movedDistance = 0;
      dragStartX = e.clientX;
      dragStartY = e.clientY;

      const rect = btn.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      btn.style.transition = "none";
      document.body.style.userSelect = "none";

      const onMouseMove = (moveEvt) => {
        if (!isDragging) return;
        const dx = moveEvt.clientX - dragStartX;
        const dy = moveEvt.clientY - dragStartY;
        movedDistance = Math.hypot(dx, dy);

        let newLeft = Math.max(10, Math.min(window.innerWidth - btn.offsetWidth - 10, initialLeft + dx));
        let newTop = Math.max(10, Math.min(window.innerHeight - btn.offsetHeight - 10, initialTop + dy));

        btn.style.left = `${newLeft}px`;
        btn.style.top = `${newTop}px`;
        btn.style.right = "auto";
        btn.style.bottom = "auto";
      };

      const onMouseUp = () => {
        if (!isDragging) return;
        isDragging = false;
        btn.style.transition = "background 0.18s, border-color 0.18s, color 0.18s, box-shadow 0.18s";
        document.body.style.userSelect = "";
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);

        if (movedDistance > 5) {
          const rect = btn.getBoundingClientRect();
          try {
            localStorage.setItem("slm_btn_pos", JSON.stringify({ left: rect.left, top: rect.top }));
          } catch (e) {}
        }
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    });

    btn.addEventListener("click", (e) => {
      if (movedDistance > 5) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      openManagerModal();
    });

    document.body.appendChild(btn);
  }

  setInterval(injectFloatingButton, 2000);
  injectFloatingButton();

  window.OpenSteamLibraryManager = openManagerModal;
})();
