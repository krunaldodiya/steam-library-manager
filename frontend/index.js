/**
 * Steam Library Manager - Dedicated In-Steam Frontend Plugin
 * Standalone Extension for Steam Client with Draggable Floating Button
 * Universal Steam Game Support (Official Purchased & LuaTools/SLSsteam Managed)
 * 100% In-DOM Interactive Controls (Zero window.confirm/prompt/alert for CEF compatibility)
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
      "get_backups": "/api/backups",
      "export": "/api/export",
      "restore": "/api/restore",
      "delete_backup": "/api/delete_backup"
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
      activeTab: "export",
      activeFilter: "all",
      games: [],
      backups: []
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
        <span>Backup & Restore (Universal Steam Library Manager)</span>
      </div>
      <button class="slm-header-close" title="Close">✕</button>
    `;
    header.querySelector(".slm-header-close").addEventListener("click", () => overlay.remove());
    win.appendChild(header);

    // Tab Bar (Clean "Backup" and "Restore" labels)
    const tabs = document.createElement("div");
    tabs.className = "slm-tabs";
    tabs.innerHTML = `
      <button class="slm-tab-btn active" data-tab="export">📦 Backup</button>
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
      content.innerHTML = `<div style="text-align:center;padding:40px;color:#8f98a0;">Loading universal library data...</div>`;
      try {
        const [gRes, bRes] = await Promise.all([
          apiCall("get_games"),
          apiCall("get_backups")
        ]);
        state.games = Array.isArray(gRes) ? gRes : (gRes.games || []);
        state.backups = Array.isArray(bRes) ? bRes : (bRes.backups || []);
        renderTab();
      } catch (err) {
        content.innerHTML = `
          <div style="text-align:center;padding:40px;color:#ec5c5c;">
            Failed to connect to backend engine.<br>
            <small style="color:#8f98a0;">Make sure steam-library-manager daemon is active.</small>
          </div>
        `;
      }
    }

    function renderTab() {
      if (state.activeTab === "export") renderExportTab();
      else renderRestoreTab();
    }

    // ── Backup Tab ─────────────────────────────────────────────────────────────
    function renderExportTab() {
      const totalCount = state.games.length;
      const instCount = state.games.filter(g => g.installed).length;
      const officialCount = state.games.filter(g => (g.source || "").includes("Official")).length;
      const luaCount = state.games.filter(g => g.has_lua).length;

      content.innerHTML = `
        <div class="slm-filter-chips">
          <button class="slm-chip active" data-filter="all">All (${totalCount})</button>
          <button class="slm-chip" data-filter="installed">Installed (${instCount})</button>
          <button class="slm-chip" data-filter="official">Official / Purchased (${officialCount})</button>
          <button class="slm-chip" data-filter="luatools">LuaTools Managed (${luaCount})</button>
        </div>

        <div class="slm-toolbar">
          <input type="text" id="slm-search" class="slm-input" placeholder="🔍 Search games, AppID, or source...">
          <button class="slm-btn-secondary" id="slm-toggle-all">Select All / None</button>
          <button class="slm-btn-primary" id="slm-export-selected">💾 Backup Selected (<span id="slm-sel-count">0</span>)</button>
          <button class="slm-btn-primary" style="background:#2874a6;" id="slm-export-all">📦 Backup Whole Library</button>
        </div>

        <table class="slm-table">
          <thead>
            <tr>
              <th width="30"><input type="checkbox" id="slm-th-chk"></th>
              <th>Game Title</th>
              <th>AppID</th>
              <th>Source / Type</th>
              <th>Status</th>
              <th width="90">Action</th>
            </tr>
          </thead>
          <tbody id="slm-games-body"></tbody>
        </table>
      `;

      const tbody = content.querySelector("#slm-games-body");
      const search = content.querySelector("#slm-search");
      const btnSelCount = content.querySelector("#slm-sel-count");
      const btnExportSel = content.querySelector("#slm-export-selected");
      const btnExportAll = content.querySelector("#slm-export-all");
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

      function updateSelCount() {
        const n = tbody.querySelectorAll(".slm-gchk:checked").length;
        btnSelCount.textContent = n;
      }

      function populate(q = "") {
        tbody.innerHTML = "";
        const query = q.toLowerCase();
        let list = state.games;

        if (state.activeFilter === "installed") list = list.filter(g => g.installed);
        else if (state.activeFilter === "official") list = list.filter(g => (g.source || "").includes("Official"));
        else if (state.activeFilter === "luatools") list = list.filter(g => g.has_lua);

        const filtered = list.filter(g =>
          (g.name || "").toLowerCase().includes(query) ||
          (g.appid || "").toString().includes(query) ||
          (g.source || "").toLowerCase().includes(query)
        );

        if (filtered.length === 0) {
          tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:#8f98a0;">No games matching search/filter.</td></tr>`;
          return;
        }

        filtered.forEach(g => {
          const tr = document.createElement("tr");

          let srcClass = "official";
          if (g.source === "LuaTools / SLSsteam") srcClass = "luatools";
          else if (g.source === "Official / LuaTools") srcClass = "both";

          let statusBadge = g.installed
            ? `<span class="slm-badge installed">Installed${g.size_on_disk ? ' (' + (g.size_on_disk / 1e9).toFixed(1) + ' GB)' : ''}</span>`
            : `<span class="slm-badge library">In Library</span>`;

          tr.innerHTML = `
            <td><input type="checkbox" class="slm-gchk" value="${g.appid}"></td>
            <td style="font-weight:600;color:#fff;">${g.name}</td>
            <td style="color:#8f98a0;">${g.appid}</td>
            <td><span class="slm-badge ${srcClass}">${g.source}</span></td>
            <td>${statusBadge}</td>
            <td><button class="slm-btn-secondary" style="padding:4px 10px;font-size:11px;" data-appid="${g.appid}">Backup</button></td>
          `;

          tr.querySelector(".slm-gchk").addEventListener("change", updateSelCount);
          tr.querySelector("button").addEventListener("click", async () => {
            const res = await apiCall("export", { appids: [g.appid] });
            if (res.success) {
              showToast(`✓ Backed up ${g.name} (${g.appid})`);
              loadData();
            }
          });
          tbody.appendChild(tr);
        });
        updateSelCount();
      }

      search.addEventListener("input", () => populate(search.value));
      btnToggleAll.addEventListener("click", () => {
        const chks = tbody.querySelectorAll(".slm-gchk");
        const anyUnchecked = Array.from(chks).some(c => !c.checked);
        chks.forEach(c => c.checked = anyUnchecked);
        if (thChk) thChk.checked = anyUnchecked;
        updateSelCount();
      });
      if (thChk) {
        thChk.addEventListener("change", () => {
          tbody.querySelectorAll(".slm-gchk").forEach(c => c.checked = thChk.checked);
          updateSelCount();
        });
      }

      btnExportSel.addEventListener("click", async () => {
        const selected = Array.from(tbody.querySelectorAll(".slm-gchk:checked")).map(c => parseInt(c.value));
        if (selected.length === 0) {
          showToast("Please select at least one game to backup.");
          return;
        }
        btnExportSel.disabled = true;
        const res = await apiCall("export", { appids: selected });
        btnExportSel.disabled = false;
        if (res.success) {
          showToast(`✓ Backed up ${res.count} selected games to ${res.backup_name}`);
          loadData();
        } else {
          showToast(`✗ Backup failed: ${res.error}`);
        }
      });

      btnExportAll.addEventListener("click", async () => {
        btnExportAll.disabled = true;
        const res = await apiCall("export", { appids: "all" });
        btnExportAll.disabled = false;
        if (res.success) {
          showToast(`✓ Backed up whole library (${res.count} games) to ${res.backup_name}`);
          loadData();
        } else {
          showToast(`✗ Backup failed: ${res.error}`);
        }
      });

      populate("");
    }

    // ── Selective Restore In-DOM Modal ─────────────────────────────────────────
    function openSelectiveModal(backup) {
      const existingSel = document.getElementById("slm-selective-modal");
      if (existingSel) existingSel.remove();

      const selModal = document.createElement("div");
      selModal.id = "slm-selective-modal";
      selModal.style.cssText = `
        position: absolute; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(15, 18, 23, 0.95); z-index: 100;
        display: flex; flex-direction: column; padding: 24px;
      `;

      const games = backup.games || [];
      selModal.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 16px;">
          <div>
            <h3 style="margin:0;color:#fff;font-size:16px;">Select Games to Restore</h3>
            <small style="color:#8f98a0;">From: ${backup.filename}</small>
          </div>
          <button id="slm-sel-close" class="slm-header-close">✕</button>
        </div>

        <div style="display:flex; gap:10px; margin-bottom:12px;">
          <button id="slm-sel-toggle-all" class="slm-btn-secondary">Select All / None</button>
          <button id="slm-sel-confirm" class="slm-btn-primary">📥 Restore Selected (<span id="slm-sel-badge">0</span>)</button>
        </div>

        <div style="flex:1; overflow-y:auto; border:1px solid #282f3c; border-radius:6px; padding:8px; background:#12151b;">
          <table class="slm-table">
            <thead>
              <tr>
                <th width="30">#</th>
                <th>Game Title</th>
                <th>AppID</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody id="slm-sel-body"></tbody>
          </table>
        </div>
      `;

      win.appendChild(selModal);

      const selBody = selModal.querySelector("#slm-sel-body");
      const selBadge = selModal.querySelector("#slm-sel-badge");
      const btnConfirm = selModal.querySelector("#slm-sel-confirm");
      const btnToggle = selModal.querySelector("#slm-sel-toggle-all");

      function updateSelBadge() {
        const count = selBody.querySelectorAll(".slm-sel-chk:checked").length;
        selBadge.textContent = count;
      }

      games.forEach(g => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td><input type="checkbox" class="slm-sel-chk" value="${g.appid}"></td>
          <td style="font-weight:600;color:#fff;">${g.name}</td>
          <td style="color:#8f98a0;">${g.appid}</td>
          <td><span class="slm-badge official">${g.source || 'Steam'}</span></td>
        `;
        tr.querySelector(".slm-sel-chk").addEventListener("change", updateSelBadge);
        selBody.appendChild(tr);
      });

      btnToggle.addEventListener("click", () => {
        const chks = selBody.querySelectorAll(".slm-sel-chk");
        const anyUnchecked = Array.from(chks).some(c => !c.checked);
        chks.forEach(c => c.checked = anyUnchecked);
        updateSelBadge();
      });

      btnConfirm.addEventListener("click", async () => {
        const chosen = Array.from(selBody.querySelectorAll(".slm-sel-chk:checked")).map(c => parseInt(c.value));
        if (chosen.length === 0) {
          showToast("Please select at least one game to restore.");
          return;
        }
        btnConfirm.disabled = true;
        btnConfirm.textContent = "Restoring...";
        const res = await apiCall("restore", { backup_filename: backup.filename, appids: chosen });
        selModal.remove();
        if (res.success) {
          showToast(`✓ Restored ${res.restored_count} games! Restart Steam to refresh.`);
          loadData();
        } else {
          showToast(`✗ Restore failed: ${res.error}`);
        }
      });

      selModal.querySelector("#slm-sel-close").addEventListener("click", () => selModal.remove());
    }

    // ── Restore Tab ────────────────────────────────────────────────────────────
    function renderRestoreTab() {
      content.innerHTML = `
        <div class="slm-toolbar">
          <h3 style="margin:0;color:#fff;font-size:15px;">Available Backup Archives</h3>
          <button class="slm-btn-secondary" id="slm-refresh-backups">🔄 Refresh</button>
        </div>

        <table class="slm-table">
          <thead>
            <tr>
              <th>Backup File</th>
              <th>Games</th>
              <th>Size</th>
              <th>Created</th>
              <th width="260">Actions</th>
            </tr>
          </thead>
          <tbody id="slm-backups-body"></tbody>
        </table>
      `;

      const tbody = content.querySelector("#slm-backups-body");
      content.querySelector("#slm-refresh-backups").addEventListener("click", loadData);

      if (!state.backups || state.backups.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:#8f98a0;">No backups found in ~/SteamLibrary-Backups.</td></tr>`;
        return;
      }

      state.backups.forEach(b => {
        const tr = document.createElement("tr");
        const sz = (b.size / 1024).toFixed(1) + " KB";
        const dt = new Date(b.mtime * 1000).toLocaleString();

        tr.innerHTML = `
          <td style="font-weight:600;color:#fff;">${b.filename}</td>
          <td>${b.count} games</td>
          <td style="color:#8f98a0;">${sz}</td>
          <td style="color:#8f98a0;">${dt}</td>
          <td>
            <button class="slm-btn-primary" style="padding:4px 10px;font-size:11px;" data-action="all">Restore All</button>
            <button class="slm-btn-secondary" style="padding:4px 10px;font-size:11px;margin-left:4px;" data-action="sel">Selective</button>
            <button class="slm-btn-danger" style="padding:4px 8px;font-size:11px;margin-left:4px;" data-action="del" title="Delete backup archive">🗑 Delete</button>
          </td>
        `;

        const btnAll = tr.querySelector("[data-action='all']");
        const btnSel = tr.querySelector("[data-action='sel']");
        const btnDel = tr.querySelector("[data-action='del']");

        // 2-step inline confirm for Restore All
        let restoreArmed = false;
        let restoreTimer = null;
        btnAll.addEventListener("click", async () => {
          if (!restoreArmed) {
            restoreArmed = true;
            btnAll.textContent = "⚠️ Confirm Restore?";
            btnAll.style.background = "#2874a6";
            restoreTimer = setTimeout(() => {
              restoreArmed = false;
              btnAll.textContent = "Restore All";
              btnAll.style.background = "#1a9fff";
            }, 4000);
            return;
          }
          clearTimeout(restoreTimer);
          btnAll.disabled = true;
          btnAll.textContent = "Restoring...";
          const res = await apiCall("restore", { backup_filename: b.filename, appids: "all" });
          if (res.success) {
            showToast(`✓ Restored ${res.restored_count} games! Restart Steam to refresh.`);
            loadData();
          } else {
            showToast(`✗ Restore failed: ${res.error}`);
          }
        });

        // In-DOM Selective modal
        btnSel.addEventListener("click", () => {
          openSelectiveModal(b);
        });

        // 2-step inline confirm for Delete (Zero browser confirm() needed!)
        let deleteArmed = false;
        let deleteTimer = null;
        btnDel.addEventListener("click", async () => {
          if (!deleteArmed) {
            deleteArmed = true;
            btnDel.textContent = "⚠️ Confirm Delete?";
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
          const res = await apiCall("delete_backup", { filename: b.filename });
          if (res.success) {
            showToast(`✓ Permanently deleted ${b.filename}`);
            loadData();
          } else {
            showToast(`✗ Delete failed: ${res.error || 'Unknown error'}`);
          }
        });

        tbody.appendChild(tr);
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
