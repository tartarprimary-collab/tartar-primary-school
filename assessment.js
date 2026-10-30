(function () {
  "use strict";
  var N = window.Tartar, S = window.Shell, R = window.Reports;
  N.Store.init();

  var daysToKjsea = Math.round((new Date(N.SCHOOL.kjseaStart) - new Date(N.SCHOOL.today)) / 86400000);
  document.getElementById("pageDesc").textContent = "Term 3 End-of-Term Assessment marks are loaded. Grade 9 sits KJSEA in " + daysToKjsea + " days (" + N.fmtDate(N.SCHOOL.kjseaStart) + ").";

  S.initTabs(document);

  // ===================== MARKS ENTRY =====================
  function fillSelect(sel, opts, getVal, getLabel) {
    sel.innerHTML = opts.map(function (o) { return '<option value="' + getVal(o) + '">' + N.esc(getLabel(o)) + "</option>"; }).join("");
  }
  var eAssessment = document.getElementById("eAssessment");
  var eGrade = document.getElementById("eGrade");
  var eGroup = document.getElementById("eGroup");
  var eSubject = document.getElementById("eSubject");
  var entryBody = document.getElementById("entryBody");
  var entryNote = document.getElementById("entryNote");
  var currentStudents = [];

  fillSelect(eAssessment, N.ASSESSMENTS, function (a) { return a.id; }, function (a) { return a.label; });
  eAssessment.value = "t3eot";
  fillSelect(eGrade, N.GRADES, function (g) { return g; }, function (g) { return "" + N.gradeLabel(g); });
  eGrade.value = "7";

  function updateGroupOptions() {
    var grade = Number(eGrade.value);
    fillSelect(eGroup, N.groupsFor(grade), function (g) { return g; }, function (g) { return g; });
  }
  function updateSubjectOptions() {
    var grade = Number(eGrade.value), group = eGroup.value;
    fillSelect(eSubject, N.subjectsFor(grade, group), function (s) { return s.id; }, function (s) { return s.name; });
  }
  function renderEntryTable() {
    var assessmentId = eAssessment.value, grade = Number(eGrade.value), group = eGroup.value, subjectId = eSubject.value;
    var asm = N.ASSESSMENTS.filter(function (a) { return a.id === assessmentId; })[0];
    currentStudents = N.Store.state.students.filter(function (s) { return s.grade === grade && s.stream === group; })
      .slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
    entryBody.innerHTML = currentStudents.map(function (st) {
      var mark = N.Store.scoreOf(assessmentId, st.id, subjectId);
      return '<div class="card card-pad row-between" style="gap:12px;" data-sid="' + st.id + '">' +
        '<div style="min-width:0;overflow:hidden;"><div style="font-weight:600;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + N.esc(st.name) + '</div><div class="small muted mono">' + N.esc(st.adm) + "</div></div>" +
        '<div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">' +
        '<input type="number" min="0" max="100" class="markInput" value="' + (mark == null ? "" : mark) + '" placeholder="\u2014" style="width:64px;text-align:center;padding:0 4px;"' + (asm.status === "closed" ? " disabled" : "") + ">" +
        '<span class="levelCell">' + S.levelPill(mark) + "</span></div></div>";
    }).join("") || '<p class="empty-note">No learners in this grade &amp; stream yet.</p>';

    entryBody.querySelectorAll(".markInput").forEach(function (input) {
      input.addEventListener("change", function () {
        var row = input.closest("[data-sid]"), sid = row.getAttribute("data-sid");
        var st = currentStudents.filter(function (s) { return s.id === sid; })[0];
        var val = input.value === "" ? null : N.clamp(Math.round(Number(input.value)), 0, 100);
        N.Store.mark(assessmentId, sid, subjectId, val);
        input.value = val == null ? "" : val;
        row.querySelector(".levelCell").innerHTML = S.levelPill(val);
        if (val != null && st) S.toast("Mark saved", st.name + " \u2014 " + val + "/100 (" + N.bandCode(val) + ")");
        if (reportState.type === "learner" && reportState.studentId === sid) renderReportPreview();
      });
    });
    entryNote.textContent = asm.status === "closed" ? asm.label + " is closed \u2014 these marks are read-only." : "Marks save automatically on this device as you type.";
  }
  eAssessment.addEventListener("change", renderEntryTable);
  eGrade.addEventListener("change", function () { updateGroupOptions(); updateSubjectOptions(); renderEntryTable(); });
  eGroup.addEventListener("change", function () { updateSubjectOptions(); renderEntryTable(); });
  eSubject.addEventListener("change", renderEntryTable);
  updateGroupOptions(); updateSubjectOptions(); renderEntryTable();

  // ===================== REPORTS =====================
  var reportState = { type: "learner", assessmentId: "t3eot", grade: 7, group: null, studentId: null, subjectId: null, scopeType: "school", scopeGrade: 7, scopeClassId: null };

  document.getElementById("reportTypeTabs").querySelectorAll("[data-rtype]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll("#reportTypeTabs [data-rtype]").forEach(function (b) { b.classList.toggle("active", b === btn); });
      reportState.type = btn.getAttribute("data-rtype");
      renderReportControls(); renderReportPreview();
    });
  });

  function selectHtml(id, opts, current) {
    return '<div class="select-wrap"><select id="' + id + '">' + opts.map(function (o) {
      return '<option value="' + o.v + '"' + (String(o.v) === String(current) ? " selected" : "") + ">" + N.esc(o.l) + "</option>";
    }).join("") + "</select></div>";
  }
  function wire(id, fn) { var el = document.getElementById(id); if (el) el.addEventListener("change", function () { fn(el.value); }); }

  function renderReportControls() {
    var t = reportState.type;
    if (!reportState.assessmentId) reportState.assessmentId = "t3eot";
    var effGrade = reportState.grade || 9; reportState.grade = effGrade;
    var effGroups = N.groupsFor(effGrade);
    var effGroup = (reportState.group && effGroups.indexOf(reportState.group) > -1) ? reportState.group : effGroups[0];
    reportState.group = effGroup;

    var html = selectHtml("rAssessment", N.ASSESSMENTS.map(function (a) { return { v: a.id, l: a.label }; }), reportState.assessmentId);

    if (t === "learner" || t === "class" || t === "subject") html += selectHtml("rGrade", N.GRADES.map(function (g) { return { v: g, l: "" + N.gradeLabel(g) }; }), effGrade);
    if (t === "learner" || t === "class" || false) html += selectHtml("rGroup", effGroups.map(function (g) { return { v: g, l: g }; }), effGroup);

    if (t === "learner") {
      var pool = N.Store.state.students.filter(function (s) { return s.grade === effGrade && s.stream === effGroup; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
      var effStudent = (reportState.studentId && pool.some(function (s) { return s.id === reportState.studentId; })) ? reportState.studentId : (pool[0] ? pool[0].id : null);
      reportState.studentId = effStudent;
      html += pool.length ? selectHtml("rStudent", pool.map(function (s) { return { v: s.id, l: s.name + " (" + s.adm + ")" }; }), effStudent) : "";
      if (!pool.length) html += '<p class="empty-note" style="margin:0 4px;">No learners in this group.</p>';
    }
    if (t === "subject") {
      var subs = N.subjectsFor(effGrade, effGroup);
      var effSubject = (reportState.subjectId && subs.some(function (s) { return s.id === reportState.subjectId; })) ? reportState.subjectId : subs[0].id;
      reportState.subjectId = effSubject;
      html += selectHtml("rSubject", subs.map(function (s) { return { v: s.id, l: s.name }; }), effSubject);
    }
    if (t === "overview") {
      var effScope = reportState.scopeType || "school"; reportState.scopeType = effScope;
      html += selectHtml("rScopeType", [
        { v: "school", l: "Whole school" },
        { v: "grade", l: "By grade" },
        { v: "class", l: "One class / stream" },
        { v: "classes", l: "All classes / streams" },
      ], effScope);
      if (effScope === "grade") { var eg = reportState.scopeGrade || 7; reportState.scopeGrade = eg; html += selectHtml("rScopeGrade", N.GRADES.map(function (g) { return { v: g, l: "" + N.gradeLabel(g) }; }), eg); }
      if (effScope === "class" || effScope === "classes") {
        var classOptions = N.Store.state.classes.slice().sort(function (a, b) {
          return a.grade - b.grade || String(a.stream || "").localeCompare(String(b.stream || ""));
        }).map(function (c) {
          var stream = String(c.stream || "").replace(new RegExp("^" + c.grade + "\\s+", "i"), "").trim();
          return { v: c.id, l: N.gradeLabel(c.grade) + (stream ? " " + stream : "") };
        });
        if (effScope === "class") {
          if (!classOptions.some(function (c) { return c.v === reportState.scopeClassId; })) reportState.scopeClassId = classOptions.length ? classOptions[0].v : "";
          html += selectHtml("rScopeClass", classOptions, reportState.scopeClassId);
        }
      }
    }

    document.getElementById("reportControls").innerHTML = html;
    wire("rAssessment", function (v) { reportState.assessmentId = v; renderReportPreview(); });
    wire("rGrade", function (v) { reportState.grade = Number(v); reportState.group = null; reportState.studentId = null; reportState.subjectId = null; renderReportControls(); renderReportPreview(); });
    wire("rGroup", function (v) { reportState.group = v; reportState.studentId = null; reportState.subjectId = null; renderReportControls(); renderReportPreview(); });
    wire("rStudent", function (v) { reportState.studentId = v; renderReportPreview(); });
    wire("rSubject", function (v) { reportState.subjectId = v; renderReportPreview(); });
    wire("rScopeType", function (v) { reportState.scopeType = v; reportState.scopeClassId = null; renderReportControls(); renderReportPreview(); });
    wire("rScopeGrade", function (v) { reportState.scopeGrade = Number(v); renderReportPreview(); });
    wire("rScopeClass", function (v) { reportState.scopeClassId = v; renderReportPreview(); });
  }

  var currentDoc = null;
  function reportParams() {
    var t = reportState.type;
    if (t === "learner") return [reportState.studentId, reportState.assessmentId];
    if (t === "class") return [reportState.grade, reportState.group, reportState.assessmentId];
    if (t === "subject") return [reportState.grade, reportState.subjectId, reportState.assessmentId, reportState.group];
    var scope = reportState.scopeType === "grade"
      ? { type: "grade", grade: reportState.scopeGrade }
      : { type: reportState.scopeType, classId: reportState.scopeClassId };
    return [scope, reportState.assessmentId];
  }
  function renderReportPreview() {
    var t = reportState.type;
    if (t === "learner" && !reportState.studentId) {
      document.getElementById("reportPreview").innerHTML = '<p class="empty-note">No learners in this group yet.</p>';
      document.getElementById("reportTitle").textContent = "Learner report";
      document.getElementById("reportSubtitle").textContent = "Choose a grade & stream with learners";
      currentDoc = null;
      return;
    }
    var Rp = R[t];
    var data = Rp.data.apply(null, reportParams());
    document.getElementById("reportPreview").innerHTML = Rp.html(data);
    document.getElementById("reportTitle").textContent = Rp.title(data);
    document.getElementById("reportSubtitle").textContent = N.SCHOOL.termLabel + " \u00b7 generated just now on this device";
    currentDoc = { type: t, data: data };
  }

  var btnDownload = document.getElementById("btnDownload");
  var btnPrint = document.getElementById("btnPrint");
  var btnShare = document.getElementById("btnShare");
  btnDownload.innerHTML = S.ic("download") + " Download PDF";
  btnPrint.innerHTML = S.ic("print") + " Print";
  btnShare.innerHTML = S.ic("share") + " Share";

  btnDownload.addEventListener("click", function () {
    if (!currentDoc) return;
    R.withCrest(function () {
      var Rp = R[currentDoc.type];
      var doc = Rp.pdf(currentDoc.data);
      doc.save(Rp.filename(currentDoc.data));
      S.toast("PDF downloaded", Rp.filename(currentDoc.data));
    });
  });
  btnPrint.addEventListener("click", function () {
    if (!currentDoc) return;
    R.withCrest(function () {
      var Rp = R[currentDoc.type];
      R.openPdfTab(Rp.pdf(currentDoc.data));
    });
  });
  btnShare.addEventListener("click", function () {
    if (!currentDoc) return;
    R.withCrest(function () {
      var Rp = R[currentDoc.type];
      var doc = Rp.pdf(currentDoc.data);
      R.shareOrDownload(doc, Rp.filename(currentDoc.data), Rp.title(currentDoc.data), Rp.shareText(currentDoc.data));
    });
  });

  renderReportControls();
  renderReportPreview();
})();
