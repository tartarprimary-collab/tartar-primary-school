/*!
 * Tartar School — shared app chrome: sidebar, header, bottom nav, role switcher,
 * toasts, dialogs/sheets, and a tiny tab controller. Loaded on every /app
 * page after data.js.
 */
(function (global) {
  "use strict";
  var N = global.Tartar;

  function svg(inner) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + inner + "</svg>";
  }
  var ICONS = {
    home: svg('<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-9"/><path d="M9.5 20v-6h5v6"/>'),
    students: svg('<path d="M12 4 2 9l10 5 10-5-10-5Z"/><path d="M6 11.5V17c0 1.5 2.7 3 6 3s6-1.5 6-3v-5.5"/><path d="M22 9v6"/>'),
    attendance: svg('<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M3.5 9.5h17"/><path d="M8 3v4M16 3v4"/><path d="M8.5 14.3l2.2 2.1 4.3-4.6"/>'),
    timetable: svg('<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4M7.5 13h3M13.5 13h3M7.5 17h3"/>'),
    clubs: svg('<path d="M7 4.5h10v15H7z"/><path d="M9.5 8h5M9.5 11.5h5M9.5 15h2"/><path d="m14.5 16.5 1.5 1.5 3-3"/>'),
    assessment: svg('<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1"/><path d="M9 11h6M9 14.5h6M9 17.5h3.5"/>'),
    finance: svg('<rect x="2.5" y="6.5" width="19" height="11" rx="2"/><circle cx="12" cy="12" r="2.6"/>'),
    messages: svg('<path d="M4 5.5h16a1 1 0 0 1 1 1V15a1 1 0 0 1-1 1H9l-4.5 4V16H4a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1Z"/>'),
    staff: svg('<circle cx="9" cy="8" r="3"/><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/><circle cx="17.3" cy="9" r="2.3"/><path d="M15.6 14.1c2.3.3 4.1 2.1 4.1 4.9"/>'),
    parent: svg('<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5"/>'),
    menu: svg('<path d="M3.5 6.5h17M3.5 12h17M3.5 17.5h17"/>'),
    close: svg('<path d="M5 5l14 14M19 5 5 19"/>'),
    chevronDown: svg('<path d="M5.5 8.5 12 15l6.5-6.5"/>'),
    download: svg('<path d="M12 3.5v11.5"/><path d="M7.5 11 12 15.5 16.5 11"/><path d="M4.5 18.5h15"/>'),
    share: svg('<circle cx="18" cy="5.5" r="2.3"/><circle cx="6" cy="12" r="2.3"/><circle cx="18" cy="18.5" r="2.3"/><path d="M8.1 10.8l7.8-4.4M8.1 13.2l7.8 4.4"/>'),
    print: svg('<path d="M7 8.5V3.5h10v5"/><rect x="3.5" y="8.5" width="17" height="8" rx="1.5"/><path d="M7 15.5h10v5H7z"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    check: svg('<path d="M4.5 12.5 9.5 17.5 19.5 7"/>'),
    arrowRight: svg('<path d="M4.5 12h15"/><path d="M13.5 6l6 6-6 6"/>'),
    search: svg('<circle cx="10.5" cy="10.5" r="6.5"/><path d="M19.5 19.5 15 15"/>'),
    file: svg('<path d="M7 3.5h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1Z"/><path d="M14 3.5V8h4"/><path d="M8.5 12.5h7M8.5 15.5h7M8.5 18h4"/>'),
    trend: svg('<path d="M3.5 17 9 10.5l4 3L20.5 5"/><path d="M15 5h5.5v5.5"/>'),
  };
  function ic(name, cls) { return '<span class="' + (cls || "") + '" style="display:inline-flex;width:15px;height:15px;flex-shrink:0">' + (ICONS[name] || "") + "</span>"; }

  var ROOT = location.pathname.indexOf("/app/") > -1 ? "../" : "";
  var BRAND_MARK = '<img src="' + ROOT + 'assets/img/crest.png" alt="Tartar School crest" width="34" height="34" style="border-radius:8px;flex-shrink:0;display:block;">';

  ICONS.profile = svg('<rect x="4" y="9" width="16" height="11" rx="1"/><path d="M2 9l10-5 10 5"/><path d="M9.5 20v-5h5v5"/>');
  ICONS.classes = svg('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>');
  ICONS.back = svg('<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>');
  ICONS.forward = svg('<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>');
  var NAV = [
    { key: "dashboard", href: "dashboard.html", label: "Home", icon: "home", roles: ["principal", "teacher", "bursar"] },
    { key: "profile", href: "profile.html", label: "School profile", icon: "profile", roles: ["principal", "teacher", "bursar"] },
    { key: "students", href: "students.html", label: "Students", icon: "students", roles: ["principal", "teacher", "bursar"] },
    { key: "classes", href: "classes.html", label: "Classes", icon: "classes", roles: ["principal", "teacher"] },
    { key: "attendance", href: "attendance.html", label: "Attendance", icon: "attendance", roles: ["principal", "teacher"] },
    { key: "timetable", href: "timetable.html", label: "Timetable", icon: "timetable", roles: ["principal", "teacher"] },
    { key: "clubs", href: "clubs.html", label: "Clubs & Societies", icon: "clubs", roles: ["principal"] },
    { key: "assessment", href: "assessment.html", label: "Assessment", icon: "assessment", roles: ["principal", "teacher"] },
    { key: "finance", href: "finance.html", label: "Finance", icon: "finance", roles: ["principal", "bursar"] },
    { key: "messages", href: "messages.html", label: "Messages", icon: "messages", roles: ["principal", "teacher", "bursar"] },
    { key: "staff", href: "staff.html", label: "Staff", icon: "staff", roles: ["principal"] },
    { key: "parent", href: "parent.html", label: "Parent", icon: "parent", roles: ["principal", "parent"] },
  ];
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function navFor(role) { return NAV.filter(function (n) { return n.roles.indexOf(role) > -1; }); }

  function sidebarHtml(activeKey, role) {
    var links = navFor(role).map(function (n) {
      return '<a class="nav-link' + (n.key === activeKey ? " active" : "") + '" href="' + n.href + '">' + ICONS[n.icon] + "<span>" + n.label + "</span></a>";
    }).join("");
    var person = N.ROLE_PERSON[role];
    return '<div class="sidebar-brand">' + BRAND_MARK + '<span style="font-family:var(--font-display);font-weight:600;font-size:17px;color:var(--sidebar-fg)">Tartar School</span></div>' +
      '<div class="sidebar-meta"><div class="eyebrow">Primary &amp; Junior School</div><div class="school-name">' + N.esc(N.SCHOOL.short) + '</div><div class="term">' + N.esc(N.SCHOOL.termLabel) + "</div></div>" +
      '<nav class="sidebar-nav">' + links + "</nav>" +
      '<div class="sidebar-foot"><div class="who">' + N.esc(person.name) + '</div><div class="role">' + N.esc(person.title) + "</div>" +
      '<button id="resetDemoBtn" type="button" style="margin-top:10px;padding:0;height:auto;border:none;background:none;cursor:pointer;font-size:11.5px;color:var(--sidebar-muted);text-decoration:underline;text-underline-offset:2px;">Log out</button></div>';
  }
  function topbarHtml(role) {
    var person = N.ROLE_PERSON[role];
    return '<button class="icon-btn menu-trigger" id="menuTrigger" aria-label="Open menu">' + ICONS.menu + "</button>" +
      '<div class="history-controls" aria-label="Page navigation">' +
      '<button class="icon-btn history-btn" id="historyBack" type="button" title="Go back (Alt+Left)" aria-label="Go back">' + ICONS.back + "</button>" +
      '<button class="icon-btn history-btn" id="historyForward" type="button" title="Go forward (Alt+Right)" aria-label="Go forward">' + ICONS.forward + "</button></div>" +
      '<div class="title"><p>' + N.esc(N.SCHOOL.name) + "</p><p>" + [N.SCHOOL.motto, N.SCHOOL.termLabel].filter(Boolean).map(N.esc).join(" &middot; ") + "</p></div>" +
      '<button class="role-trigger" id="roleTrigger" type="button"><span class="avatar">' + N.initials(person.name) + '</span><span class="lbl">' + cap(role) + "</span>" + ICONS.chevronDown + "</button>";
  }
  function bottomNavHtml(activeKey, role) {
    var items = navFor(role);
    var shown = items.slice(0, 4);
    var html = shown.map(function (n) {
      return '<a class="' + (n.key === activeKey ? "active" : "") + '" href="' + n.href + '">' + ICONS[n.icon] + "<span>" + n.label + "</span></a>";
    }).join("");
    if (items.length > 4) html += '<a href="#" id="moreNavBtn">' + ICONS.menu + "<span>More</span></a>";
    return html;
  }
  function mobilePanelHtml(activeKey, role) {
    var links = navFor(role).map(function (n) {
      return '<a class="nav-link' + (n.key === activeKey ? " active" : "") + '" href="' + n.href + '">' + ICONS[n.icon] + "<span>" + n.label + "</span></a>";
    }).join("");
    var person = N.ROLE_PERSON[role];
    return '<div class="close-row">' + BRAND_MARK + '<button class="icon-btn" id="closeMobileNav" style="color:var(--sidebar-fg)" aria-label="Close menu">' + ICONS.close + "</button></div>" +
      '<nav style="display:flex;flex-direction:column;gap:2px;">' + links + "</nav>" +
      '<div style="margin-top:auto;padding-top:16px;border-top:1px solid rgba(255,255,255,0.09);">' +
      '<div style="font-weight:600;font-size:13.5px;color:var(--sidebar-fg);">' + N.esc(person.name) + '</div><div style="font-size:12px;color:var(--sidebar-muted);">' + N.esc(person.title) + "</div>" +
      '<button type="button" id="resetDemoBtnMobile" style="margin-top:10px;padding:0;height:auto;border:none;background:none;cursor:pointer;font-size:11.5px;color:var(--sidebar-muted);text-decoration:underline;text-underline-offset:2px;">Log out</button></div>';
  }
  function roleMenuOptionsHtml(role) {
    return ["principal", "teacher", "bursar", "parent"].map(function (r) {
      var person = N.ROLE_PERSON[r];
      var active = role === r;
      return '<button type="button" class="role-opt" data-role="' + r + '" style="display:flex;width:100%;align-items:center;gap:9px;padding:9px 10px;border-radius:8px;border:none;background:' + (active ? "var(--surface-sunk)" : "transparent") + ';cursor:pointer;text-align:left;">' +
        '<span class="avatar" style="width:27px;height:27px;font-size:10.5px;">' + N.initials(person.name) + "</span>" +
        '<span style="min-width:0;"><span style="display:block;font-weight:600;font-size:13px;color:var(--ink)">' + cap(r) + '</span><span style="display:block;font-size:11px;color:var(--ink-soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + N.esc(person.title) + "</span></span>" +
        (active ? '<span style="margin-left:auto;color:var(--primary);">' + ICONS.check + "</span>" : "") + "</button>";
    }).join("");
  }

  var Shell = { ICONS: ICONS, ic: ic, NAV: NAV };

  Shell.init = function (activeKey) {
    N.Store.init();
    var role = N.Store.state.role;
    var me = N.Store.me || {};
    if (me.role && me.role !== "admin" && activeKey !== "dashboard" && !navFor(role).some(function (n) { return n.key === activeKey; })) {
      location.replace("dashboard.html"); return;   // this role may not open that page
    }
    var shellEl = document.getElementById("shell");
    var sidebar = document.createElement("aside");
    sidebar.className = "sidebar";
    sidebar.innerHTML = sidebarHtml(activeKey, role);
    shellEl.insertBefore(sidebar, shellEl.firstChild);

    var contentWrap = shellEl.querySelector(".shell-content");
    var topbar = document.createElement("header");
    topbar.className = "topbar";
    topbar.innerHTML = topbarHtml(role);
    contentWrap.insertBefore(topbar, contentWrap.firstChild);

    var bottomnav = document.createElement("nav");
    bottomnav.className = "bottomnav";
    bottomnav.innerHTML = bottomNavHtml(activeKey, role);
    shellEl.appendChild(bottomnav);

    var mobilePanel = document.createElement("div");
    mobilePanel.className = "mobile-nav-panel";
    mobilePanel.id = "mobileNavPanel";
    mobilePanel.innerHTML = mobilePanelHtml(activeKey, role);
    document.body.appendChild(mobilePanel);

    var mobileBackdrop = document.createElement("div");
    mobileBackdrop.className = "overlay-backdrop";
    mobileBackdrop.style.zIndex = 60;
    mobileBackdrop.style.display = "none";
    document.body.appendChild(mobileBackdrop);

    function openMobile() { mobileBackdrop.style.display = "block"; requestAnimationFrame(function () { mobileBackdrop.classList.add("in"); mobilePanel.classList.add("open"); }); }
    function closeMobile() { mobileBackdrop.classList.remove("in"); mobilePanel.classList.remove("open"); setTimeout(function () { mobileBackdrop.style.display = "none"; }, 280); }
    document.getElementById("menuTrigger").addEventListener("click", openMobile);
    document.getElementById("historyBack").addEventListener("click", function () { history.back(); });
    document.getElementById("historyForward").addEventListener("click", function () { history.forward(); });
    document.addEventListener("keydown", function (e) {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      var target = e.target;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); history.back(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); history.forward(); }
    });
    var moreBtn = document.getElementById("moreNavBtn");
    if (moreBtn) moreBtn.addEventListener("click", function (e) { e.preventDefault(); openMobile(); });
    document.getElementById("closeMobileNav").addEventListener("click", closeMobile);
    mobileBackdrop.addEventListener("click", closeMobile);

    if (me.role && me.role !== "admin") document.getElementById("roleTrigger").style.cursor = "default";
    document.getElementById("roleTrigger").addEventListener("click", function (e) {
      e.stopPropagation();
      if (me.role && me.role !== "admin") return;   // staff cannot switch roles
      var existing = document.getElementById("roleMenu");
      if (existing) { existing.remove(); return; }
      var menu = document.createElement("div");
      menu.id = "roleMenu";
      menu.style.cssText = "position:fixed;right:14px;top:58px;background:var(--surface);border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow-pop);padding:6px;z-index:65;min-width:208px;";
      menu.innerHTML = roleMenuOptionsHtml(role);
      document.body.appendChild(menu);
      menu.querySelectorAll(".role-opt").forEach(function (b) {
        b.addEventListener("click", function () {
          var r = b.getAttribute("data-role");
          N.Store.setRole(r);
          location.href = r === "parent" ? "parent.html" : "dashboard.html";
        });
      });
      setTimeout(function () {
        document.addEventListener("click", function onDoc(ev) {
          if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener("click", onDoc); }
        });
      }, 0);
    });

    var resetBtn = document.getElementById("resetDemoBtn");
    var resetBtnMobile = document.getElementById("resetDemoBtnMobile");
    function doReset() { N.Store.logout(); }
    if (resetBtn) resetBtn.addEventListener("click", doReset);
    if (resetBtnMobile) resetBtnMobile.addEventListener("click", doReset);
  };

  // ---------------- toast ----------------
  Shell.toast = function (title, desc) {
    var root = document.getElementById("toast-root");
    if (!root) return;
    var t = document.createElement("div");
    t.className = "toast";
    t.innerHTML = '<div class="t-title">' + ic("check") + " " + N.esc(title) + "</div>" + (desc ? '<div class="t-desc">' + N.esc(desc) + "</div>" : "");
    root.appendChild(t);
    requestAnimationFrame(function () { t.classList.add("in"); });
    setTimeout(function () { t.classList.remove("in"); setTimeout(function () { t.remove(); }, 250); }, 3400);
  };

  // ---------------- dialog / sheet ----------------
  function overlayRoot() { return document.getElementById("overlay-root"); }
  Shell.openDialog = function (innerHtml, opts) {
    opts = opts || {};
    var backdrop = document.createElement("div");
    backdrop.className = "overlay-backdrop";
    var dialog = document.createElement("div");
    dialog.className = "dialog" + (opts.wide ? " dialog-wide" : "");
    dialog.innerHTML = '<button type="button" class="dialog-close" aria-label="Close">' + ICONS.close + "</button>" + innerHtml;
    overlayRoot().appendChild(backdrop);
    overlayRoot().appendChild(dialog);
    requestAnimationFrame(function () { backdrop.classList.add("in"); dialog.classList.add("in"); });
    function close() {
      backdrop.classList.remove("in"); dialog.classList.remove("in");
      setTimeout(function () { backdrop.remove(); dialog.remove(); }, 180);
      document.removeEventListener("keydown", onKey);
    }
    backdrop.addEventListener("click", close);
    dialog.querySelector(".dialog-close").addEventListener("click", close);
    function onKey(e) { if (e.key === "Escape") close(); }
    document.addEventListener("keydown", onKey);
    return { el: dialog, close: close };
  };
  Shell.openSheet = function (innerHtml) {
    var backdrop = document.createElement("div");
    backdrop.className = "overlay-backdrop";
    var sheet = document.createElement("div");
    sheet.className = "sheet";
    sheet.innerHTML = '<button type="button" class="dialog-close" aria-label="Close">' + ICONS.close + "</button>" + innerHtml;
    overlayRoot().appendChild(backdrop);
    overlayRoot().appendChild(sheet);
    requestAnimationFrame(function () { backdrop.classList.add("in"); sheet.classList.add("in"); });
    function close() {
      backdrop.classList.remove("in"); sheet.classList.remove("in");
      setTimeout(function () { backdrop.remove(); sheet.remove(); }, 220);
      document.removeEventListener("keydown", onKey);
    }
    backdrop.addEventListener("click", close);
    sheet.querySelector(".dialog-close").addEventListener("click", close);
    function onKey(e) { if (e.key === "Escape") close(); }
    document.addEventListener("keydown", onKey);
    return { el: sheet, close: close };
  };

  // ---------------- tabs ----------------
  Shell.initTabs = function (root) {
    var btns = root.querySelectorAll("[data-tab]");
    btns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        btns.forEach(function (b) { b.classList.toggle("active", b === btn); });
        var target = btn.getAttribute("data-tab");
        root.querySelectorAll("[data-panel]").forEach(function (p) { p.hidden = p.getAttribute("data-panel") !== target; });
      });
    });
  };

  // ---------------- small builders ----------------
  Shell.pageHeader = function (o) {
    return '<div class="page-header"><div><div class="eyebrow">' + N.esc(o.kicker) + "</div><h1>" + N.esc(o.title) + '</h1><p class="desc">' + o.desc + "</p></div>" +
      (o.actions ? '<div class="actions">' + o.actions + "</div>" : "") + "</div>";
  };
  Shell.kpi = function (o) {
    return '<div class="kpi"><div class="label">' + N.esc(o.label) + '</div><div class="value">' + o.value + '</div><div class="hint">' + (o.hint || "") + "</div></div>";
  };
  Shell.levelPill = function (mark) {
    if (mark == null) return '<span class="level-pill level-none">—</span>';
    var code = N.bandCode(mark);
    var rubric = N.BANDS.filter(function (band) { return band.code === code; })[0];
    return '<span class="level-pill level-' + N.bandTone(code) + '" title="' + mark + '/100 · ' + N.esc(rubric.label) + ' (' + rubric.lo + '-' + rubric.hi + ')">' + code + "</span>";
  };
  Shell.scoreLevel = function (mark) {
    if (mark == null) return '<span class="score-level"><span class="score-value">—</span>' + Shell.levelPill(null) + "</span>";
    return '<span class="score-level"><span class="score-value">' + mark + '</span>' + Shell.levelPill(mark) + "</span>";
  };
  Shell.pathwayChip = function (pathway) {
    return '<span class="pathway-chip pathway-' + pathway.replace(/\s+/g, "-") + '">' + N.esc(pathway) + "</span>";
  };

  global.Shell = Shell;
})(window);
