(function () {
  "use strict";
  var N = window.Tartar, S = window.Shell, R = window.Reports;
  N.Store.init();

  var childSelect = document.getElementById("childSelect");
  var students = N.Store.state.students.slice().sort(function (a, b) { return a.grade - b.grade || a.name.localeCompare(b.name); });
  childSelect.innerHTML = students.map(function (s) {
    var admission = s.adm ? " \u00b7 Adm. " + s.adm : " \u00b7 Admission number not recorded";
    return '<option value="' + s.id + '"' + (s.id === N.Store.state.parentStudentId ? " selected" : "") + ">" + N.esc(s.name) + " \u2014 " + N.gradeLabel(s.grade) + admission + "</option>";
  }).join("");

  function relevantMessages(st) {
    return N.Store.state.outbox.filter(function (m) {
      if (m.audience === "Boarding balance") return st.boarding === "Boarding" && (N.Store.ledgerOf(st.id).billed - N.Store.ledgerOf(st.id).paid) > 0;
      if (m.audience.indexOf("Grade 9") > -1) return st.grade === 9;
      return true;
    });
  }

  function render() {
    var st = N.Store.student(childSelect.value);
    if (!st) {
      document.getElementById("hdrName").textContent = "No learners yet";
      document.getElementById("hdrDesc").textContent = "Admit a learner on the Students page to see the parent view.";
      return;
    }
    document.getElementById("hdrName").textContent = st.name;
    document.getElementById("hdrDesc").textContent = "Admission no. " + (st.adm || "not recorded") + " \u00b7 " +
      (st.parent || "Guardian not recorded") + (st.parentPhone ? " \u00b7 " + st.parentPhone : "") + " \u00b7 " +
      N.gradeLabel(st.grade) + (st.stream ? " " + st.stream : "") + (st.boarding ? " \u00b7 " + st.boarding : "");

    var ledger = N.Store.ledgerOf(st.id);
    var att = N.attendancePct(st);
    var marks = N.studentAssessmentMarks(st, "t3eot").filter(function (m) { return m != null; });
    var counts = N.bandCounts(marks);
    var total = marks.length || 1;
    var feeVal = st.boarding === "Boarding" ? N.ksh(Math.max(0, ledger.billed - ledger.paid)) : st.boarding === "Day" ? "KSh 0" : "Not set";
    var feeHint = st.boarding === "Boarding" ? (ledger.billed - ledger.paid > 0 ? "due this term" : "boarding fees clear") : st.boarding === "Day" ? "day scholar \u00b7 capitation-funded" : "boarding/day status not recorded";

    document.getElementById("kpiGrid").innerHTML = [
      S.kpi({ label: "Fees", value: feeVal, hint: feeHint }),
      S.kpi({ label: "Attendance", value: N.pct(att), hint: "so far this term" }),
      S.kpi({ label: "Meeting expectation +", value: N.pct((counts.EE + counts.ME) / total), hint: marks.length + " of " + N.studentSubjects(st).length + " subjects assessed" }),
      S.kpi({ label: "Exceeding expectation", value: counts.EE, hint: "learning areas this term" }),
    ].join("");

    document.getElementById("asmTitle").textContent = "Term 3 End-of-Term Assessment \u2014 " + st.name.split(" ")[0] + "'s progress";
    document.getElementById("subjectList").innerHTML = N.studentSubjects(st).map(function (s) {
      var mark = N.Store.scoreOf("t3eot", st.id, s.id);
      return '<div class="row-between" style="padding:7px 0;border-bottom:1px solid var(--line-soft);"><span class="small">' + N.esc(s.name) + "</span>" + S.scoreLevel(mark) + "</div>";
    }).join("");

    var msgs = relevantMessages(st);
    document.getElementById("messageList").innerHTML = msgs.length ? msgs.map(function (m) {
      return '<div style="padding:8px 0;border-bottom:1px solid var(--line-soft);"><div class="row-between"><span class="small" style="font-weight:700;">' + N.esc(m.audience) + '</span><span class="small muted">' + N.fmtDate(m.date) + "</span></div><p class=\"small mt-1\">" + N.esc(m.body) + "</p></div>";
    }).join("") : '<p class="empty-note">No messages yet.</p>';

    var data = R.learner.data(st.id, "t3eot");
    var btnD = document.getElementById("btnDownload"), btnP = document.getElementById("btnPrint"), btnS = document.getElementById("btnShare");
    btnD.innerHTML = S.ic("download") + " Download PDF"; btnP.innerHTML = S.ic("print") + " Print"; btnS.innerHTML = S.ic("share") + " Share";
    btnD.onclick = function () { R.withCrest(function () { var doc = R.learner.pdf(data); doc.save(R.learner.filename(data)); S.toast("PDF downloaded", R.learner.filename(data)); }); };
    btnP.onclick = function () { R.withCrest(function () { R.openPdfTab(R.learner.pdf(data)); }); };
    btnS.onclick = function () { R.withCrest(function () { var doc = R.learner.pdf(data); R.shareOrDownload(doc, R.learner.filename(data), R.learner.title(data), R.learner.shareText(data)); }); };
  }
  childSelect.addEventListener("change", function () { N.Store.setParentStudent(childSelect.value); render(); });
  render();
})();
