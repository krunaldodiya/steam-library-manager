// LM-FRAGMENT 14-backup-tab.js - Library Backup & Restore tab for Lumen
// LM-FRAGMENT Part of steam-library-manager

var BACKUP_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/></svg>';

function renderLibraryBackup(container) {
  container.textContent = "";
  var wrap = document.createElement("div");
  wrap.className = "lumen-backup-wrap";
  wrap.style.cssText = "padding: 16px 20px; color: #c7d5e0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;";

  // State
  var gamesData = [];
  var backupsData = [];
  var activeSubTab = "games";

  // Top header card
  var topCard = document.createElement("div");
  topCard.style.cssText = "background: #1e232d; border: 1px solid #2e3543; border-radius: 8px; padding: 16px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;";

  var titleCol = document.createElement("div");
  var title = document.createElement("h2");
  title.textContent = "Steam Library Backup & Restore";
  title.style.cssText = "margin: 0 0 4px 0; color: #fff; font-size: 18px;";
  var desc = document.createElement("div");
  desc.textContent = "Backup or restore your SLSsteam / LuaTools games metadata (All, Multi-Select, or Single).";
  desc.style.cssText = "font-size: 13px; color: #8f98a0;";
  titleCol.appendChild(title);
  titleCol.appendChild(desc);
  topCard.appendChild(titleCol);

  var topActions = document.createElement("div");
  topActions.style.cssText = "display: flex; gap: 8px;";

  var btnBackupAll = document.createElement("button");
  btnBackupAll.type = "button";
  btnBackupAll.textContent = "📦 Backup Whole Library";
  btnBackupAll.style.cssText = "background: #1a9fff; color: #fff; border: none; padding: 8px 16px; border-radius: 4px; font-weight: 600; cursor: pointer;";
  btnBackupAll.addEventListener("click", function() {
    btnBackupAll.disabled = true;
    btnBackupAll.textContent = "Backing up\u2026";
    call("ExportLibraryGames", { appids: "all" })
      .then(function(res) {
        btnBackupAll.disabled = false;
        btnBackupAll.textContent = "📦 Backup Whole Library";
        var r = typeof res === "string" ? JSON.parse(res) : res;
        if (r && r.success) {
          showToast("\u2713 Backed up " + r.count + " games to " + r.backup_name);
          refresh();
        } else {
          alert("Backup failed: " + (r && r.error));
        }
      })
      .catch(function(e) {
        btnBackupAll.disabled = false;
        btnBackupAll.textContent = "📦 Backup Whole Library";
        alert("Backup error: " + e.message);
      });
  });

  var btnRestoreLatest = document.createElement("button");
  btnRestoreLatest.type = "button";
  btnRestoreLatest.textContent = "📥 Restore Latest";
  btnRestoreLatest.style.cssText = "background: #2a313d; color: #fff; border: 1px solid #3d4655; padding: 8px 16px; border-radius: 4px; font-weight: 600; cursor: pointer;";
  btnRestoreLatest.addEventListener("click", function() {
    if (!confirm("Restore all games from the latest backup?")) return;
    call("RestoreLibraryGames", { appids: "all" })
      .then(function(res) {
        var r = typeof res === "string" ? JSON.parse(res) : res;
        if (r && r.success) {
          showToast("\u2713 Restored " + r.restored_count + " games! Restart Steam to refresh.");
        } else {
          alert("Restore failed: " + (r && r.error));
        }
      });
  });

  topActions.appendChild(btnBackupAll);
  topActions.appendChild(btnRestoreLatest);
  topCard.appendChild(topActions);
  wrap.appendChild(topCard);

  // Sub tabs (Games / Backups)
  var tabNav = document.createElement("div");
  tabNav.style.cssText = "display: flex; gap: 8px; margin-bottom: 14px;";

  var subTabGames = document.createElement("button");
  subTabGames.type = "button";
  subTabGames.textContent = "🎮 Library Games";
  subTabGames.style.cssText = "background: #1a9fff; color: #fff; border: none; padding: 7px 16px; border-radius: 4px; font-weight: 600; cursor: pointer;";

  var subTabBackups = document.createElement("button");
  subTabBackups.type = "button";
  subTabBackups.textContent = "📂 Saved Backups";
  subTabBackups.style.cssText = "background: #1e232d; color: #c7d5e0; border: 1px solid #2e3543; padding: 7px 16px; border-radius: 4px; font-weight: 600; cursor: pointer;";

  tabNav.appendChild(subTabGames);
  tabNav.appendChild(subTabBackups);
  wrap.appendChild(tabNav);

  // Body container
  var bodyCard = document.createElement("div");
  bodyCard.style.cssText = "background: #1e232d; border: 1px solid #2e3543; border-radius: 8px; padding: 16px;";
  wrap.appendChild(bodyCard);

  subTabGames.addEventListener("click", function() {
    activeSubTab = "games";
    subTabGames.style.background = "#1a9fff"; subTabGames.style.color = "#fff";
    subTabBackups.style.background = "#1e232d"; subTabBackups.style.color = "#c7d5e0";
    renderGamesView();
  });

  subTabBackups.addEventListener("click", function() {
    activeSubTab = "backups";
    subTabBackups.style.background = "#1a9fff"; subTabBackups.style.color = "#fff";
    subTabGames.style.background = "#1e232d"; subTabGames.style.color = "#c7d5e0";
    renderBackupsView();
  });

  function renderGamesView() {
    bodyCard.textContent = "";

    // Toolbar
    var bar = document.createElement("div");
    bar.style.cssText = "display: flex; gap: 10px; align-items: center; margin-bottom: 14px; flex-wrap: wrap;";

    var search = document.createElement("input");
    search.type = "text";
    search.placeholder = "\uD83D\uDD0D Search games or AppID\u2026";
    search.style.cssText = "background: #12151b; border: 1px solid #2e3543; color: #fff; padding: 7px 12px; border-radius: 4px; flex: 1; min-width: 180px;";

    var btnSelectAll = document.createElement("button");
    btnSelectAll.type = "button";
    btnSelectAll.textContent = "Toggle All";
    btnSelectAll.style.cssText = "background: #2a313d; color: #fff; border: 1px solid #3d4655; padding: 7px 14px; border-radius: 4px; cursor: pointer;";

    var btnExportSel = document.createElement("button");
    btnExportSel.type = "button";
    btnExportSel.textContent = "\uD83D\uDCBE Export Selected (0)";
    btnExportSel.style.cssText = "background: #1a9fff; color: #fff; border: none; padding: 7px 14px; border-radius: 4px; font-weight: 600; cursor: pointer;";

    bar.appendChild(search);
    bar.appendChild(btnSelectAll);
    bar.appendChild(btnExportSel);
    bodyCard.appendChild(bar);

    var table = document.createElement("table");
    table.style.cssText = "width: 100%; border-collapse: collapse; font-size: 13px;";
    table.innerHTML = "<thead><tr style='border-bottom: 1px solid #282f3c; color: #8f98a0; text-align: left;'>" +
      "<th style='padding: 8px 10px;' width='30'>#</th>" +
      "<th style='padding: 8px 10px;'>Game Title</th>" +
      "<th style='padding: 8px 10px;'>AppID</th>" +
      "<th style='padding: 8px 10px;'>Status</th>" +
      "<th style='padding: 8px 10px;' width='90'>Action</th>" +
      "</tr></thead><tbody id='lumen-backup-games-body'></tbody>";
    bodyCard.appendChild(table);

    var tbody = table.querySelector("#lumen-backup-games-body");

    function updateCount() {
      var n = tbody.querySelectorAll(".lumen-gchk:checked").length;
      btnExportSel.textContent = "\uD83D\uDCBE Export Selected (" + n + ")";
    }

    btnSelectAll.addEventListener("click", function() {
      var chks = tbody.querySelectorAll(".lumen-gchk");
      var anyUnchecked = Array.from(chks).some(function(c) { return !c.checked; });
      chks.forEach(function(c) { c.checked = anyUnchecked; });
      updateCount();
    });

    btnExportSel.addEventListener("click", function() {
      var sel = Array.from(tbody.querySelectorAll(".lumen-gchk:checked")).map(function(c) { return parseInt(c.value); });
      if (sel.length === 0) { alert("Please select at least one game."); return; }
      call("ExportLibraryGames", { appids: sel })
        .then(function(res) {
          var r = typeof res === "string" ? JSON.parse(res) : res;
          if (r && r.success) {
            showToast("\u2713 Exported " + r.count + " games to " + r.backup_name);
            refresh();
          } else {
            alert("Export failed: " + (r && r.error));
          }
        });
    });

    function populate(filterText) {
      tbody.textContent = "";
      var q = (filterText || "").toLowerCase();
      var filtered = gamesData.filter(function(g) {
        return (g.name || "").toLowerCase().includes(q) || (g.appid || "").toString().includes(q);
      });

      if (filtered.length === 0) {
        tbody.innerHTML = "<tr><td colspan='5' style='text-align: center; padding: 20px; color: #8f98a0;'>No games found.</td></tr>";
        return;
      }

      filtered.forEach(function(g) {
        var tr = document.createElement("tr");
        tr.style.cssText = "border-bottom: 1px solid #252b36;";
        var stBadge = g.installed
          ? "<span style='background: rgba(92,126,16,0.25); color: #a4d007; padding: 2px 6px; border-radius: 3px; font-size: 11px;'>Installed</span>"
          : "<span style='background: rgba(26,159,255,0.18); color: #1a9fff; padding: 2px 6px; border-radius: 3px; font-size: 11px;'>In Library</span>";

        tr.innerHTML = "<td style='padding: 8px 10px;'><input type='checkbox' class='lumen-gchk' value='" + g.appid + "'></td>" +
          "<td style='padding: 8px 10px; font-weight: 600; color: #fff;'>" + g.name + "</td>" +
          "<td style='padding: 8px 10px; color: #8f98a0;'>" + g.appid + "</td>" +
          "<td style='padding: 8px 10px;'>" + stBadge + "</td>" +
          "<td style='padding: 8px 10px;'><button type='button' class='lumen-single-export' style='background: #2a313d; color: #fff; border: 1px solid #3d4655; padding: 3px 8px; border-radius: 3px; font-size: 11px; cursor: pointer;'>Export</button></td>";

        tr.querySelector(".lumen-gchk").addEventListener("change", updateCount);
        tr.querySelector(".lumen-single-export").addEventListener("click", function() {
          call("ExportLibraryGames", { appids: [g.appid] })
            .then(function(res) {
              var r = typeof res === "string" ? JSON.parse(res) : res;
              if (r && r.success) {
                showToast("\u2713 Exported " + g.name);
                refresh();
              }
            });
        });
        tbody.appendChild(tr);
      });
      updateCount();
    }

    search.addEventListener("input", function() { populate(search.value); });
    populate("");
  }

  function renderBackupsView() {
    bodyCard.textContent = "";
    if (!backupsData || backupsData.length === 0) {
      bodyCard.innerHTML = "<div style='text-align: center; padding: 30px; color: #8f98a0;'>No backups found in ~/SteamLibrary-Backups.</div>";
      return;
    }

    var table = document.createElement("table");
    table.style.cssText = "width: 100%; border-collapse: collapse; font-size: 13px;";
    table.innerHTML = "<thead><tr style='border-bottom: 1px solid #282f3c; color: #8f98a0; text-align: left;'>" +
      "<th style='padding: 8px 10px;'>Archive File</th>" +
      "<th style='padding: 8px 10px;'>Games</th>" +
      "<th style='padding: 8px 10px;'>Size</th>" +
      "<th style='padding: 8px 10px;'>Created</th>" +
      "<th style='padding: 8px 10px;' width='170'>Actions</th>" +
      "</tr></thead><tbody></tbody>";
    bodyCard.appendChild(table);

    var tbody = table.querySelector("tbody");
    backupsData.forEach(function(b) {
      var tr = document.createElement("tr");
      tr.style.cssText = "border-bottom: 1px solid #252b36;";
      var sz = (b.size / 1024).toFixed(1) + " KB";
      var dt = new Date(b.mtime * 1000).toLocaleString();

      tr.innerHTML = "<td style='padding: 8px 10px; font-weight: 600; color: #fff;'>" + b.filename + "</td>" +
        "<td style='padding: 8px 10px;'>" + b.count + " games</td>" +
        "<td style='padding: 8px 10px; color: #8f98a0;'>" + sz + "</td>" +
        "<td style='padding: 8px 10px; color: #8f98a0;'>" + dt + "</td>" +
        "<td style='padding: 8px 10px;'>" +
          "<button type='button' class='lumen-res-all' style='background: #1a9fff; color: #fff; border: none; padding: 4px 8px; border-radius: 3px; font-size: 11px; cursor: pointer;'>Restore All</button> " +
          "<button type='button' class='lumen-res-sel' style='background: #2a313d; color: #fff; border: 1px solid #3d4655; padding: 4px 8px; border-radius: 3px; font-size: 11px; cursor: pointer;'>Selective</button>" +
        "</td>";

      tr.querySelector(".lumen-res-all").addEventListener("click", function() {
        if (!confirm("Restore all " + b.count + " games from " + b.filename + "?")) return;
        call("RestoreLibraryGames", { backup_filename: b.filename, appids: "all" })
          .then(function(res) {
            var r = typeof res === "string" ? JSON.parse(res) : res;
            if (r && r.success) {
              showToast("\u2713 Restored " + r.restored_count + " games! Restart Steam to refresh.");
            } else {
              alert("Restore failed: " + (r && r.error));
            }
          });
      });

      tr.querySelector(".lumen-res-sel").addEventListener("click", function() {
        var gamesList = b.games || [];
        var msg = "Enter AppIDs separated by comma to restore (leave blank for all):\\n\\n" +
          gamesList.map(function(g) { return g.appid + ": " + g.name; }).join("\\n");
        var chosen = prompt(msg);
        if (chosen === null) return;
        var aids = chosen.trim() === "" ? "all" : chosen.split(",").map(function(s) { return parseInt(s.trim()); }).filter(function(n) { return !isNaN(n); });
        call("RestoreLibraryGames", { backup_filename: b.filename, appids: aids })
          .then(function(res) {
            var r = typeof res === "string" ? JSON.parse(res) : res;
            if (r && r.success) {
              showToast("\u2713 Restored " + r.restored_count + " games! Restart Steam to refresh.");
            } else {
              alert("Restore failed: " + (r && r.error));
            }
          });
      });

      tbody.appendChild(tr);
    });
  }

  function refresh() {
    Promise.all([
      call("ListLibraryGames", {}),
      call("ListLibraryBackups", {})
    ]).then(function(results) {
      var gRes = typeof results[0] === "string" ? JSON.parse(results[0]) : results[0];
      var bRes = typeof results[1] === "string" ? JSON.parse(results[1]) : results[1];
      if (gRes && gRes.games) gamesData = gRes.games;
      if (bRes && bRes.backups) backupsData = bRes.backups;
      if (activeSubTab === "games") renderGamesView();
      else renderBackupsView();
    }).catch(function(e) {
      log("Library backup refresh error: " + e.message);
    });
  }

  refresh();
  container.appendChild(wrap);
  return Promise.resolve();
}
