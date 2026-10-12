/**
 * Steam Library Manager - Dedicated In-Steam Frontend Plugin
 * Standalone Extension for Steam Client with Draggable Floating Button
 * Dedicated Backup and Restore Screens with State-Aware Sync & Backup Buttons
 */

(function () {
  const prevBtn = document.getElementById("slm-topbar-btn");
  if (prevBtn) prevBtn.remove();
  const prevFloat = document.getElementById("slm-floating-btn");
  if (prevFloat) prevFloat.remove();

  const API_PORT = 8343;
  const BACKEND_URL = `http://127.0.0.1:${API_PORT}`;

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
      archives: []
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
          <button class="slm-btn-secondary" id="slm-toggle-all">Select All / None</button>
          
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
      const btnToggleAll = content.querySelector("#slm-toggle-all");
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
        const count = tbody.querySelectorAll(".slm-gchk:checked").length;
        btnSelCount.textContent = count;
        btnSyncCount.textContent = count;
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
            ? `<span class="slm-badge installed">Installed${g.size_on_disk ? ' (' + (g.size_on_disk / 1e9).toFixed(1) + ' GB)' : ''}</span>`
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

      btnToggleAll.addEventListener("click", () => {
        const chks = tbody.querySelectorAll(".slm-gchk");
        const anyUnchecked = Array.from(chks).some(c => !c.checked);
        chks.forEach(c => c.checked = anyUnchecked);
        if (thChk) thChk.checked = anyUnchecked;
        updateButtonStates();
      });

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
      content.innerHTML = `
        <div class="slm-toolbar" style="justify-content:space-between;">
          <div>
            <h3 style="margin:0;color:#fff;font-size:15px;">Available Backup Archives</h3>
            <small style="color:#8f98a0;">Select an archive below to choose games and restore.</small>
          </div>
          <button class="slm-btn-secondary" id="slm-refresh-archives">🔄 Refresh</button>
        </div>

        <table class="slm-table">
          <thead>
            <tr>
              <th>Backup Archive</th>
              <th width="100">Games</th>
              <th width="110">Size</th>
              <th width="180">Created</th>
              <th width="180">Actions</th>
            </tr>
          </thead>
          <tbody id="slm-archives-body"></tbody>
        </table>
      `;

      const tbody = content.querySelector("#slm-archives-body");
      content.querySelector("#slm-refresh-archives").addEventListener("click", loadData);

      // Add Single Source Directory Entry at top
      const dirTr = document.createElement("tr");
      dirTr.style.background = "rgba(26, 159, 255, 0.05)";
      const syncedCount = state.games.filter(g => g.backed_up).length;
      dirTr.innerHTML = `
        <td style="font-weight:600;color:#fff;">📁 Single Source Directory (games/)</td>
        <td>${syncedCount} games</td>
        <td style="color:#8f98a0;">Uncompressed</td>
        <td style="color:#8f98a0;">Live on disk</td>
        <td>
          <button class="slm-btn-primary" style="padding:4px 12px;font-size:11px;" id="slm-res-dir">📥 Restore...</button>
        </td>
      `;
      dirTr.querySelector("#slm-res-dir").addEventListener("click", () => {
        openInteractivePickerModal({ filename: "Single Source Directory (games/)", isDir: true });
      });
      tbody.appendChild(dirTr);

      if (!state.archives || state.archives.length === 0) {
        const noTr = document.createElement("tr");
        noTr.innerHTML = `<td colspan="5" style="text-align:center;padding:24px;color:#8f98a0;">No standalone archive bundles found in archives/. Click Backup to generate one.</td>`;
        tbody.appendChild(noTr);
        return;
      }

      state.archives.forEach(a => {
        const tr = document.createElement("tr");
        const sz = (a.size / 1024).toFixed(1) + " KB";
        const dt = new Date(a.mtime * 1000).toLocaleString();

        tr.innerHTML = `
          <td style="font-weight:600;color:#fff;">${a.filename}</td>
          <td>${a.count} games</td>
          <td style="color:#8f98a0;">${sz}</td>
          <td style="color:#8f98a0;">${dt}</td>
          <td>
            <button class="slm-btn-primary" style="padding:4px 12px;font-size:11px;" data-action="pick">📥 Restore...</button>
            <button class="slm-btn-danger" style="padding:4px 8px;font-size:11px;margin-left:6px;" data-action="del" title="Delete this archive">🗑 Delete</button>
          </td>
        `;

        // Restore Button opens the Interactive Picker Popup!
        tr.querySelector("[data-action='pick']").addEventListener("click", () => {
          openInteractivePickerModal(a);
        });

        // 2-step inline confirm for Delete ("Sure?" prompt)
        const btnDel = tr.querySelector("[data-action='del']");
        let deleteArmed = false;
        let deleteTimer = null;
        btnDel.addEventListener("click", async () => {
          if (!deleteArmed) {
            deleteArmed = true;
            btnDel.textContent = "Sure?";
            btnDel.style.background = "#ec5c5c";
            btnDel.style.color = "#ffffff";
            deleteTimer = setTimeout(() => {
              deleteArmed = false;
              btnDel.textContent = "🗑 Delete";
              btnDel.style.background = "rgba(236, 92, 92, 0.12)";
              btnDel.style.color = "#f28b82";
            }, 4000);
            return;
          }

          clearTimeout(deleteTimer);
          btnDel.disabled = true;
          btnDel.textContent = "Deleting...";
          const res = await apiCall("delete_archive", { filename: a.filename });
          if (res.success) {
            showToast(`✓ Permanently deleted ${a.filename}`);
            loadData();
          } else {
            showToast(`✗ Delete failed: ${res.error || 'Unknown error'}`);
          }
        });

        tbody.appendChild(tr);
      });
    }

    // ── 3. Interactive Restore Picker Popup ─────────────────────────────────────
    async function openInteractivePickerModal(sourceItem) {
      const existingPop = document.getElementById("slm-restore-popup");
      if (existingPop) existingPop.remove();

      const pop = document.createElement("div");
      pop.id = "slm-restore-popup";
      pop.style.cssText = `
        position: absolute; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(15, 18, 24, 0.96); z-index: 1000;
        display: flex; flex-direction: column; padding: 22px 26px;
      `;

      const sourceName = sourceItem.filename;
      const isDir = !!sourceItem.isDir;

      pop.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 16px; border-bottom:1px solid #282f3c; padding-bottom:12px;">
          <div>
            <h3 style="margin:0;color:#fff;font-size:17px;display:flex;align-items:center;gap:8px;">
              <span>📥</span><span>Select Games to Restore</span>
            </h3>
            <small style="color:#8f98a0;">From: ${sourceName}</small>
          </div>
          <button id="slm-pop-close" class="slm-header-close">✕</button>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <div style="display:flex;gap:8px;align-items:center;">
            <button id="slm-pop-toggle" class="slm-btn-secondary" style="padding:6px 12px;font-size:12px;">Select All / None</button>
            <span style="font-size:12px;color:#8f98a0;">All games are checked by default. Uncheck any games you wish to skip.</span>
          </div>
          <button id="slm-pop-confirm" class="slm-btn-primary" style="background:#2874a6;">
            <span>📥</span><span>Restore Selected (<span id="slm-pop-count">0</span> Games)</span>
          </button>
        </div>

        <div style="flex:1; overflow-y:auto; border:1px solid #252b36; border-radius:6px; background:#14171f;">
          <table class="slm-table">
            <thead>
              <tr>
                <th width="32"><input type="checkbox" id="slm-pop-th-chk" checked></th>
                <th>Game Title</th>
                <th width="100">AppID</th>
                <th width="160">Source / Type</th>
                <th>Target Restore Location</th>
              </tr>
            </thead>
            <tbody id="slm-pop-body">
              <tr><td colspan="5" style="text-align:center;padding:30px;color:#8f98a0;">Inspecting games in backup...</td></tr>
            </tbody>
          </table>
        </div>
      `;

      win.appendChild(pop);

      const popClose = pop.querySelector("#slm-pop-close");
      const popBody = pop.querySelector("#slm-pop-body");
      const popCount = pop.querySelector("#slm-pop-count");
      const popConfirm = pop.querySelector("#slm-pop-confirm");
      const popToggle = pop.querySelector("#slm-pop-toggle");
      const popThChk = pop.querySelector("#slm-pop-th-chk");

      popClose.addEventListener("click", () => pop.remove());

      function updateCount() {
        const n = popBody.querySelectorAll(".slm-pop-chk:checked").length;
        popCount.textContent = n;
        if (n > 0) {
          popConfirm.disabled = false;
          popConfirm.style.opacity = "1";
          popConfirm.style.cursor = "pointer";
        } else {
          popConfirm.disabled = true;
          popConfirm.style.opacity = "0.4";
          popConfirm.style.cursor = "not-allowed";
        }
      }

      const res = await apiCall("inspect", {
        source_type: isDir ? "directory" : "archive",
        archive_path: isDir ? null : sourceItem.path
      });
      const games = res.games || [];

      if (games.length === 0) {
        popBody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:30px;color:#8f98a0;">No game metadata found in selected source.</td></tr>`;
        updateCount();
        return;
      }

      popBody.innerHTML = "";
      games.forEach(g => {
        const tr = document.createElement("tr");
        const targetLoc = g.installed ? "steamapps/ & stplug-in/" : "config/stplug-in/";

        tr.innerHTML = `
          <td><input type="checkbox" class="slm-pop-chk" value="${g.appid}" checked></td>
          <td style="font-weight:600;color:#fff;">${g.name}</td>
          <td style="color:#8f98a0;">${g.appid}</td>
          <td><span class="slm-badge official">${g.source || 'Steam'}</span></td>
          <td style="color:#8f98a0;font-size:12px;">${targetLoc}</td>
        `;

        tr.querySelector(".slm-pop-chk").addEventListener("change", updateCount);
        popBody.appendChild(tr);
      });

      if (popThChk) popThChk.checked = true;
      updateCount();

      popToggle.addEventListener("click", () => {
        const chks = popBody.querySelectorAll(".slm-pop-chk");
        const anyUnchecked = Array.from(chks).some(c => !c.checked);
        chks.forEach(c => c.checked = anyUnchecked);
        if (popThChk) popThChk.checked = anyUnchecked;
        updateCount();
      });

      if (popThChk) {
        popThChk.addEventListener("change", () => {
          popBody.querySelectorAll(".slm-pop-chk").forEach(c => c.checked = popThChk.checked);
          updateCount();
        });
      }

      popConfirm.addEventListener("click", async () => {
        const chosen = Array.from(popBody.querySelectorAll(".slm-pop-chk:checked")).map(c => parseInt(c.value));
        if (chosen.length === 0) return;

        popConfirm.disabled = true;
        popConfirm.innerHTML = "<span>📥</span><span>Restoring...</span>";
        const rRes = await apiCall("restore", {
          source_type: isDir ? "directory" : "archive",
          archive_path: isDir ? null : sourceItem.path,
          appids: chosen
        });
        pop.remove();

        if (rRes.success) {
          showToast(`✓ Restored ${rRes.restored_count} games from ${rRes.source}! Restart Steam to apply.`);
          loadData();
        } else {
          showToast(`✗ Restore failed: ${rRes.error}`);
        }
      });
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
