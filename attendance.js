(function () {
  "use strict";
  var N = window.Tartar, S = window.Shell;
  N.Store.init();

  var aDate = document.getElementById("aDate"), aGrade = document.getElementById("aGrade"), aGroup = document.getElementById("aGroup");
  var rollBody = document.getElementById("rollBody"), aCount = document.getElementById("aCount");
  var STATUSES = [["present", "Present"], ["absent", "Absent"], ["late", "Late"], ["permission", "Perm."]];

  var days = N.TERM3_DAYS.slice().reverse();
  aDate.innerHTML = days.map(function (d, i) { return '<option value="' + d + '"' + (i === 0 ? " selected" : "") + ">" + N.fmtDate(d, { weekday: "short", day: "2-digit", month: "short" }) + "</option>"; }).join("");
  N.GRADES.forEach(function (g) { var o = document.createElement("option"); o.value = g; o.textContent = "" + N.gradeLabel(g); aGrade.appendChild(o); });
  aGrade.value = "9";

  function updateGroups() {
    var g = Number(aGrade.value);
    aGroup.innerHTML = N.groupsFor(g).map(function (x) { return "<option>" + x + "</option>"; }).join("");
  }

  function renderRoll() {
    var date = aDate.value, grade = Number(aGrade.value), group = aGroup.value;
    var students = N.Store.state.students.filter(function (s) { return s.grade === grade && s.stream === group; }).slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
    document.getElementById("pageDesc").textContent = "" + N.gradeLabel(grade) + " " + group + " \u2014 " + N.fmtDate(date, { weekday: "long", day: "2-digit", month: "short" }) + ".";

    rollBody.innerHTML = students.map(function (st) {
      var current = N.Store.attendanceOn(date, st.id);
      var termPct = N.attendancePct(st, date);
      var btns = STATUSES.map(function (s) {
        return '<button type="button" class="seg-btn' + (current === s[0] ? " on-" + s[0] : "") + '" data-status="' + s[0] + '">' + s[1] + "</button>";
      }).join("");
      return '<div class="card card-pad" data-sid="' + st.id + '">' +
        '<div class="row-between"><div><div style="font-weight:600;font-size:13.5px;">' + N.esc(st.name) + '</div><div class="small muted">' + N.esc(st.adm) + " \u00b7 term " + N.pct(termPct) + "</div></div></div>" +
        '<div class="mt-3" style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;">' + btns + "</div></div>";
    }).join("") || '<p class="empty-note">No learners in this grade &amp; group.</p>';

    function recount() {
      var marked = students.filter(function (st) { return N.Store.attendanceOn(date, st.id); }).length;
      var present = students.filter(function (st) { var s = N.Store.attendanceOn(date, st.id); return s === "present" || s === "late"; }).length;
      aCount.textContent = marked + "/" + students.length + " marked \u00b7 " + present + " present";
    }
    recount();

    rollBody.querySelectorAll("[data-sid]").forEach(function (card) {
      var sid = card.getAttribute("data-sid");
      card.querySelectorAll(".seg-btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var status = btn.getAttribute("data-status");
          N.Store.setAttendance(date, sid, status);
          card.querySelectorAll(".seg-btn").forEach(function (b) { b.className = "seg-btn" + (b === btn ? " on-" + status : ""); });
          recount();
        });
      });
    });
  }

  aGrade.addEventListener("change", function () { updateGroups(); renderRoll(); });
  aGroup.addEventListener("change", renderRoll);
  aDate.addEventListener("change", renderRoll);

  document.getElementById("btnAllPresent").addEventListener("click", function () {
    var date = aDate.value, grade = Number(aGrade.value), group = aGroup.value;
    N.Store.state.students.filter(function (s) { return s.grade === grade && s.stream === group; }).forEach(function (st) { N.Store.setAttendance(date, st.id, "present"); });
    renderRoll();
    S.toast("Marked all present", "" + N.gradeLabel(grade) + " " + group + " \u2014 " + N.fmtDate(date));
  });
  document.getElementById("btnSave").addEventListener("click", function () {
    S.toast("Register saved", aCount.textContent + " \u00b7 " + N.fmtDate(aDate.value));
  });

  updateGroups();
  renderRoll();
})();
