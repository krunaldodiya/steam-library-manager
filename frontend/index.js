/**
 * Steam Library Manager - Dedicated In-Steam Frontend Plugin
 * Single-Screen Dashboard with Single Source of Truth Directory Backups & Interactive Restore Popup
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
      games: [],
      archives: [],
      activeFilter: "all"
    };

    const overlay = document.createElement("div");
    overlay.id = "slm-modal-overlay";
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });

    const win = document.createElement("div");
    win.id = "slm-modal-window";

    // Header (Single source of truth title)
    const header = document.createElement("div");
    header.className = "slm-header";
    header.innerHTML = `
      <div class="slm-header-title">
        <span>📦</span>
        <span>Backup & Restore (Steam Library Manager)</span>
        <span class="slm-header-path">~/SteamLibrary-Backups/games/</span>
      </div>
      <button class="slm-header-close" title="Close">✕</button>
    `;
    header.querySelector(".slm-header-close").addEventListener("click", () => overlay.remove());
    win.appendChild(header);

    // Main Single-Screen Content
    const content = document.createElement("div");
    content.className = "slm-content";
    win.appendChild(content);

    overlay.appendChild(win);
    document.body.appendChild(overlay);

    async function loadData() {
      content.innerHTML = `<div style="text-align:center;padding:50px;color:#8f98a0;">Loading library status from Steam...</div>`;
      try {
        const res = await fetch(`${BACKEND_URL}/api/games`);
        const data = await res.json();
        state.games = data.games || [];
        renderDashboard();
      } catch (err) {
        content.innerHTML = `
          <div style="text-align:center;padding:50px;color:#ec5c5c;">
            Failed to connect to backend engine.<br>
            <small style="color:#8f98a0;">Make sure steam-library-manager daemon is active.</small>
          </div>
        `;
      }
    }

    function renderDashboard() {
      const totalCount = state.games.length;
      const instCount = state.games.filter(g => g.installed).length;
      const syncedCount = state.games.filter(g => g.backed_up).length;
      const notSyncedCount = totalCount - syncedCount;

      content.innerHTML = `
        <div class="slm-action-bar">
          <div style="display:flex;gap:10px;flex:1;align-items:center;min-width:320px;">
            <input type="text" id="slm-search" class="slm-input" placeholder="🔍 Search games, AppID, or source...">
            <button class="slm-btn-secondary" id="slm-toggle-all">Select All / None</button>
          </div>

          <div class="slm-global-btns">
            <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#8f98a0;margin-right:6px;cursor:pointer;" title="Also export a standalone .tar.gz bundle into archives/">
              <input type="checkbox" id="slm-create-tar"> Create .tar.gz
            </label>
            <button class="slm-btn-primary" id="slm-btn-sync">
              <span>🔄</span><span>Sync Selected (<span id="slm-sel-count">0</span>)</span>
            </button>
            <button class="slm-btn-secondary" style="background:#2874a6;border-color:#2874a6;color:#fff;" id="slm-btn-restore">
              <span>📥</span><span>Restore...</span>
            </button>
          </div>
        </div>

        <div class="slm-filter-chips">
          <button class="slm-chip active" data-filter="all">All (${totalCount})</button>
          <button class="slm-chip" data-filter="installed">Installed (${instCount})</button>
          <button class="slm-chip" data-filter="synced">Synced (${syncedCount})</button>
          <button class="slm-chip" data-filter="notsynced">Not Synced (${notSyncedCount})</button>
          <button class="slm-chip" data-filter="luatools">LuaTools Managed</button>
          <button class="slm-chip" data-filter="official">Official Steam</button>
        </div>

        <div class="slm-table-wrap">
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
        </div>
      `;

      const tbody = content.querySelector("#slm-games-body");
      const search = content.querySelector("#slm-search");
      const btnSelCount = content.querySelector("#slm-sel-count");
      const btnSync = content.querySelector("#slm-btn-sync");
      const btnRestore = content.querySelector("#slm-btn-restore");
      const btnToggleAll = content.querySelector("#slm-toggle-all");
      const thChk = content.querySelector("#slm-th-chk");
      const chkTar = content.querySelector("#slm-create-tar");

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
            <td><button class="slm-btn-secondary" style="padding:3px 8px;font-size:11px;" title="Sync this game to its directory">Sync</button></td>
          `;

          tr.querySelector(".slm-gchk").addEventListener("change", updateSelCount);
          tr.querySelector("button").addEventListener("click", async () => {
            const res = await apiCall("sync", { appids: [g.appid], create_archive: chkTar.checked });
            if (res.success) {
              showToast(`✓ Synced ${g.name} to games/${g.appid}/`);
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

      // Global Sync Selected Action
      btnSync.addEventListener("click", async () => {
        const selected = Array.from(tbody.querySelectorAll(".slm-gchk:checked")).map(c => parseInt(c.value));
        if (selected.length === 0) {
          showToast("Please select at least one game to sync.");
          return;
        }
        btnSync.disabled = true;
        btnSync.innerHTML = "<span>🔄</span><span>Syncing...</span>";
        const res = await apiCall("sync", { appids: selected, create_archive: chkTar.checked });
        btnSync.disabled = false;
        btnSync.innerHTML = `<span>🔄</span><span>Sync Selected (<span id="slm-sel-count">0</span>)</span>`;
        if (res.success) {
          let msg = `✓ Synced ${res.synced_count} game(s) to single-source directory!`;
          if (res.archive_name) msg += ` (Bundle: ${res.archive_name})`;
          showToast(msg);
          loadData();
        } else {
          showToast(`✗ Sync failed: ${res.error}`);
        }
      });

      // Global Restore Action (Opens Interactive Picker Popup)
      btnRestore.addEventListener("click", () => {
        openInteractiveRestorePopup();
      });

      populate("");
    }

    // ── Interactive Restore Popup Modal ─────────────────────────────────────────
    async function openInteractiveRestorePopup() {
      const existingPop = document.getElementById("slm-restore-popup");
      if (existingPop) existingPop.remove();

      const pop = document.createElement("div");
      pop.id = "slm-restore-popup";
      pop.style.cssText = `
        position: absolute; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(15, 18, 24, 0.96); z-index: 1000;
        display: flex; flex-direction: column; padding: 22px 26px;
      `;

      pop.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 16px; border-bottom:1px solid #282f3c; padding-bottom:12px;">
          <div>
            <h3 style="margin:0;color:#fff;font-size:17px;display:flex;align-items:center;gap:8px;">
              <span>📥</span><span>Restore Games into Steam Library</span>
            </h3>
            <small style="color:#8f98a0;">Choose your backup source and select which games to restore.</small>
          </div>
          <button id="slm-pop-close" class="slm-header-close">✕</button>
        </div>

        <div style="display:flex; gap:16px; align-items:center; margin-bottom:16px; background:#181c25; padding:12px 16px; border-radius:6px; border:1px solid #28303f; flex-wrap:wrap;">
          <div style="font-weight:600;color:#fff;font-size:13px;">Restore Source:</div>
          <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;color:#fff;">
            <input type="radio" name="slm-src" value="directory" checked> Single Source Directory (games/)
          </label>
          <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;color:#fff;">
            <input type="radio" name="slm-src" value="archive"> Pick Archive (.tar.gz / .zip)
          </label>
          <select id="slm-archive-select" style="display:none;background:#101217;border:1px solid #2e3543;color:#fff;padding:5px 10px;border-radius:4px;font-size:12px;">
            <option value="">Loading archives...</option>
          </select>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <div style="display:flex;gap:8px;align-items:center;">
            <button id="slm-pop-toggle" class="slm-btn-secondary" style="padding:6px 12px;font-size:12px;">Select All / None</button>
            <span style="font-size:12px;color:#8f98a0;">All games are checked by default.</span>
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
              <tr><td colspan="5" style="text-align:center;padding:30px;color:#8f98a0;">Loading available games...</td></tr>
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
      const srcRadios = pop.querySelectorAll("input[name='slm-src']");
      const archiveSelect = pop.querySelector("#slm-archive-select");

      let currentSourceType = "directory";
      let availableSourceGames = [];

      popClose.addEventListener("click", () => pop.remove());

      function updateCount() {
        const n = popBody.querySelectorAll(".slm-pop-chk:checked").length;
        popCount.textContent = n;
      }

      async function loadSourceGames() {
        popBody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:30px;color:#8f98a0;">Inspecting source...</td></tr>`;
        const chosenArchive = archiveSelect.value;
        const res = await apiCall("inspect", { source_type: currentSourceType, archive_path: chosenArchive });
        availableSourceGames = res.games || [];

        if (availableSourceGames.length === 0) {
          popBody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:30px;color:#8f98a0;">No game metadata found in selected source.</td></tr>`;
          popCount.textContent = "0";
          return;
        }

        popBody.innerHTML = "";
        availableSourceGames.forEach(g => {
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
      }

      // Handle Source Switching
      srcRadios.forEach(radio => {
        radio.addEventListener("change", async () => {
          currentSourceType = radio.value;
          if (currentSourceType === "archive") {
            archiveSelect.style.display = "inline-block";
            const aRes = await apiCall("get_archives");
            const archs = aRes.archives || [];
            archiveSelect.innerHTML = "";
            if (archs.length === 0) {
              archiveSelect.innerHTML = `<option value="">No archives found in archives/</option>`;
            } else {
              archs.forEach(a => {
                const opt = document.createElement("option");
                opt.value = a.filename;
                opt.textContent = `${a.filename} (${a.count} games)`;
                archiveSelect.appendChild(opt);
              });
            }
          } else {
            archiveSelect.style.display = "none";
          }
          loadSourceGames();
        });
      });

      archiveSelect.addEventListener("change", () => {
        loadSourceGames();
      });

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

      // Confirm Restore Execution
      popConfirm.addEventListener("click", async () => {
        const chosen = Array.from(popBody.querySelectorAll(".slm-pop-chk:checked")).map(c => parseInt(c.value));
        if (chosen.length === 0) {
          showToast("Please check at least one game to restore.");
          return;
        }

        popConfirm.disabled = true;
        popConfirm.innerHTML = "<span>📥</span><span>Restoring...</span>";
        const res = await apiCall("restore", {
          source_type: currentSourceType,
          archive_path: archiveSelect.value,
          appids: chosen
        });
        pop.remove();

        if (res.success) {
          showToast(`✓ Restored ${res.restored_count} games from ${res.source}! Restart Steam to apply.`);
          loadData();
        } else {
          showToast(`✗ Restore failed: ${res.error}`);
        }
      });

      loadSourceGames();
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
