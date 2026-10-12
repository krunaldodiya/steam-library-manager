/**
 * Steam Library Manager - Dedicated In-Steam Frontend Plugin
 * Standalone Extension for Steam Client
 */

(function () {
  if (window.__SteamLibraryManagerInjected) return;
  window.__SteamLibraryManagerInjected = true;

  const API_PORT = 8343;
  const BACKEND_URL = `http://127.0.0.1:${API_PORT}`;

  // Backend Bridge (Supports Millennium Plugin API or Standalone Local Daemon)
  async function apiCall(method, params = {}) {
    if (window.Millennium && window.Millennium.callServerMethod) {
      try {
        const res = await window.Millennium.callServerMethod("steam-library-manager", method, params);
        return typeof res === "string" ? JSON.parse(res) : res;
      } catch (e) {
        console.warn("[SLM] Millennium bridge failed, falling back to local daemon:", e);
      }
    }

    // Fallback: Local daemon HTTP call
    const endpointMap = {
      "get_games": "/api/games",
      "get_backups": "/api/backups",
      "export": "/api/export",
      "restore": "/api/restore"
    };
    const endpoint = endpointMap[method] || `/api/${method}`;
    const res = await fetch(`${BACKEND_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params)
    });
    return await res.json();
  }

  // Toast System
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

  // Build Modal Dialog
  function openManagerModal() {
    if (document.getElementById("slm-modal-overlay")) return;

    let state = {
      activeTab: "export",
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
        <span>Steam Library Manager</span>
      </div>
      <button class="slm-header-close" title="Close">✕</button>
    `;
    header.querySelector(".slm-header-close").addEventListener("click", () => overlay.remove());
    win.appendChild(header);

    // Tab Bar
    const tabs = document.createElement("div");
    tabs.className = "slm-tabs";
    tabs.innerHTML = `
      <button class="slm-tab-btn active" data-tab="export">📦 Export & Backup</button>
      <button class="slm-tab-btn" data-tab="restore">📥 Restore & Import</button>
    `;
    win.appendChild(tabs);

    // Content Body
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
      content.innerHTML = `<div style="text-align:center;padding:40px;color:#8f98a0;">Loading library data...</div>`;
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
            <small style="color:#8f98a0;">Make sure steam-library-manager daemon is running.</small>
          </div>
        `;
      }
    }

    function renderTab() {
      if (state.activeTab === "export") renderExportTab();
      else renderRestoreTab();
    }

    // ── Export Tab ─────────────────────────────────────────────────────────────
    function renderExportTab() {
      content.innerHTML = `
        <div class="slm-toolbar">
          <input type="text" id="slm-search" class="slm-input" placeholder="🔍 Search games or AppID...">
          <button class="slm-btn-secondary" id="slm-toggle-all">Select All / None</button>
          <button class="slm-btn-primary" id="slm-export-selected">💾 Export Selected (<span id="slm-sel-count">0</span>)</button>
          <button class="slm-btn-primary" style="background:#2874a6;" id="slm-export-all">📦 Backup Whole Library</button>
        </div>

        <table class="slm-table">
          <thead>
            <tr>
              <th width="30"><input type="checkbox" id="slm-th-chk"></th>
              <th>Game Title</th>
              <th>AppID</th>
              <th>Status</th>
              <th width="100">Action</th>
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

      function updateSelCount() {
        const n = tbody.querySelectorAll(".slm-gchk:checked").length;
        btnSelCount.textContent = n;
      }

      function populate(q = "") {
        tbody.innerHTML = "";
        const query = q.toLowerCase();
        const filtered = state.games.filter(g =>
          (g.name || "").toLowerCase().includes(query) || (g.appid || "").toString().includes(query)
        );

        if (filtered.length === 0) {
          tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:#8f98a0;">No games matching search.</td></tr>`;
          return;
        }

        filtered.forEach(g => {
          const tr = document.createElement("tr");
          const badgeClass = g.installed ? "installed" : "library";
          const badgeText = g.installed ? "Installed" : "In Library";

          tr.innerHTML = `
            <td><input type="checkbox" class="slm-gchk" value="${g.appid}"></td>
            <td style="font-weight:600;color:#fff;">${g.name}</td>
            <td style="color:#8f98a0;">${g.appid}</td>
            <td><span class="slm-badge ${badgeClass}">${badgeText}</span></td>
            <td><button class="slm-btn-secondary" style="padding:4px 10px;font-size:11px;" data-appid="${g.appid}">Export</button></td>
          `;

          tr.querySelector(".slm-gchk").addEventListener("change", updateSelCount);
          tr.querySelector("button").addEventListener("click", async () => {
            const res = await apiCall("export", { appids: [g.appid] });
            if (res.success) {
              showToast(`✓ Exported ${g.name} (${g.appid})`);
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
          alert("Please select at least one game to export.");
          return;
        }
        btnExportSel.disabled = true;
        const res = await apiCall("export", { appids: selected });
        btnExportSel.disabled = false;
        if (res.success) {
          showToast(`✓ Exported ${res.count} selected games to ${res.backup_name}`);
          loadData();
        } else {
          alert("Export failed: " + res.error);
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
          alert("Export failed: " + res.error);
        }
      });

      populate("");
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
              <th width="200">Actions</th>
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
            <button class="slm-btn-secondary" style="padding:4px 10px;font-size:11px;margin-left:6px;" data-action="sel">Selective</button>
          </td>
        `;

        tr.querySelector("[data-action='all']").addEventListener("click", async () => {
          if (!confirm(`Restore all ${b.count} games from ${b.filename}?`)) return;
          const res = await apiCall("restore", { backup_filename: b.filename, appids: "all" });
          if (res.success) {
            showToast(`✓ Restored ${res.restored_count} games! Restart Steam to refresh.`);
            loadData();
          } else {
            alert("Restore failed: " + res.error);
          }
        });

        tr.querySelector("[data-action='sel']").addEventListener("click", async () => {
          const gamesList = b.games || [];
          const msg = "Enter AppIDs to restore separated by comma (leave blank to restore all):\\n\\n" +
            gamesList.map(g => `${g.appid}: ${g.name}`).join("\\n");
          const input = prompt(msg);
          if (input === null) return;
          const aids = input.trim() === "" ? "all" : input.split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n));
          const res = await apiCall("restore", { backup_filename: b.filename, appids: aids });
          if (res.success) {
            showToast(`✓ Restored ${res.restored_count} games! Restart Steam to refresh.`);
            loadData();
          } else {
            alert("Restore failed: " + res.error);
          }
        });

        tbody.appendChild(tr);
      });
    }

    loadData();
  }

  // Inject Dedicated Topbar Button into Steam UI
  function injectTopBarButton() {
    if (document.getElementById("slm-topbar-btn")) return;

    // Anchor near top right window controls or menubar
    const target = document.querySelector(".title-area-icon-inner")?.parentElement?.parentElement ||
                   document.querySelector("._2D64jIEK7wpUR_NlObDW76") ||
                   document.querySelector(".RootMenuBar") ||
                   document.querySelector("nav") ||
                   document.body;

    if (!target) return;

    const btn = document.createElement("div");
    btn.id = "slm-topbar-btn";
    btn.innerHTML = `<span>📦</span><span>Library Manager</span>`;
    btn.title = "Steam Library Manager (Backup & Restore)";
    btn.addEventListener("click", openManagerModal);

    target.appendChild(btn);
  }

  // Polling / MutationObserver to keep button present across Steam window navigation
  setInterval(injectTopBarButton, 2000);
  injectTopBarButton();

  // Expose Global Helper
  window.OpenSteamLibraryManager = openManagerModal;
})();
