(function () {
  "use strict";
  var N = window.Tartar, S = window.Shell;
  N.Store.init();
  var role = N.Store.state.role;

  function shortKsh(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
    if (n >= 1000) return Math.round(n / 1000) + "K";
    return String(Math.round(n));
  }
  function moneyChart(rows) {
    var max = Math.max.apply(null, rows.map(function (r) { return r.entitlement; })) * 1.18;
    var W = 400, H = 190, padL = 10, padR = 10, padT = 14, padB = 26;
    var groupW = (W - padL - padR) / rows.length;
    var barW = Math.min(46, groupW * 0.3);
    var yBase = H - padB;
    var bars = rows.map(function (r, i) {
      var cx = padL + groupW * i + groupW / 2;
      var hEnt = (r.entitlement / max) * (H - padT - padB);
      var hRec = (r.received / max) * (H - padT - padB);
      var x1 = cx - barW - 3, x2 = cx + 3;
      return '<rect x="' + x1 + '" y="' + (yBase - hEnt) + '" width="' + barW + '" height="' + Math.max(hEnt, 1) + '" rx="3" fill="var(--line)"/>' +
        '<rect x="' + x2 + '" y="' + (yBase - hRec) + '" width="' + barW + '" height="' + Math.max(hRec, 1) + '" rx="3" fill="var(--primary)"/>' +
        '<text x="' + cx + '" y="' + (H - 8) + '" text-anchor="middle" font-size="10.5" fill="var(--ink-soft)">' + N.esc(r.label) + "</text>" +
        '<text x="' + (x1 + barW / 2) + '" y="' + (yBase - hEnt - 6) + '" text-anchor="middle" font-size="9" fill="var(--ink-soft)">' + shortKsh(r.entitlement) + "</text>" +
        '<text x="' + (x2 + barW / 2) + '" y="' + (yBase - hRec - 6) + '" text-anchor="middle" font-size="9" font-weight="700" fill="var(--primary)">' + shortKsh(r.received) + "</text>";
    }).join("");
    return '<svg viewBox="0 0 ' + W + " " + H + '" style="width:100%;height:auto;display:block;" role="img" aria-label="Capitation entitlement versus received">' +
      '<line x1="' + padL + '" y1="' + yBase + '" x2="' + (W - padR) + '" y2="' + yBase + '" stroke="var(--line)"/>' + bars + "</svg>";
  }

  document.getElementById("hdrEyebrow").textContent = N.SCHOOL.termLabel;
  document.getElementById("hdrTitle").textContent = role === "bursar" ? "Finance this morning" : role === "teacher" ? "Your classes this morning" : "Tartar School this morning";
  if (role === "bursar") document.getElementById("hdrDesc").textContent = "Capitation received, boarding balances, and this week's receipts.";
  else if (role === "teacher") document.getElementById("hdrDesc").textContent = "Attendance, marks entry, and who needs a closer look this term.";

  var enrolled = N.Store.state.students.length;
  var jssCap = N.capitationRow("jss"), ssCap = N.capitationRow("pri");
  var totalEntitlement = jssCap.entitlement + ssCap.entitlement, totalReceived = jssCap.received + ssCap.received;
  var share = N.schoolBandShare("t3eot");
  var lastSchoolDay = null;
  for (var dayIndex = N.TERM3_DAYS.length - 1; dayIndex >= 0; dayIndex--) {
    if (N.TERM3_DAYS[dayIndex] < N.SCHOOL.today) {
      lastSchoolDay = N.TERM3_DAYS[dayIndex];
      break;
    }
  }
  var presentYest = 0, countedYest = 0;
  if (lastSchoolDay) N.Store.state.students.forEach(function (st) {
    var s = N.Store.attendanceOn(lastSchoolDay, st.id);
    if (s) { countedYest++; if (s === "present" || s === "late") presentYest++; }
  });

  document.getElementById("kpiGrid").innerHTML = [
    S.kpi({ label: "Enrolment", value: enrolled, hint: "PP1 to Grade 9 \u00b7 " + N.Store.state.classes.length + " classes" }),
    S.kpi({ label: "Capitation received", value: N.pct(totalEntitlement ? totalReceived / totalEntitlement : 0), hint: N.ksh(totalReceived) + " of " + N.ksh(totalEntitlement) }),
    S.kpi({ label: "Meeting expectation +", value: N.pct(share.meetingPlus), hint: share.total + " entries \u00b7 Term 3 End-of-Term Assessment" }),
    S.kpi({ label: "Last school day present", value: countedYest ? N.pct(presentYest / countedYest) : "\u2014", hint: lastSchoolDay ? N.fmtDate(lastSchoolDay) : "No previous school day" }),
  ].join("");

  var actions = "";
  if (role === "principal") actions += '<a class="btn btn-outline" href="clubs.html">' + S.ic("clubs") + " Clubs &amp; Societies</a>";
  if (role === "teacher") actions += '<a class="btn btn-primary" href="assessment.html">' + S.ic("assessment") + " Enter marks</a>";
  if (role === "principal" || role === "teacher") actions += '<a class="btn btn-outline" href="attendance.html">' + S.ic("attendance") + " Mark register</a>";
  if (role === "principal" || role === "bursar") actions += '<a class="btn btn-primary" href="finance.html">' + S.ic("finance") + " Record a receipt</a>";
  document.getElementById("hdrActions").innerHTML = actions;

  document.getElementById("capChart").innerHTML = moneyChart([
    { label: "Primary (1\u20136)", entitlement: ssCap.entitlement, received: ssCap.received },
    { label: "Junior School (7\u20139)", entitlement: jssCap.entitlement, received: jssCap.received },
  ]) + '<div class="row-between small muted mt-2"><span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:var(--line);margin-right:5px;"></span>Entitlement</span><span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:var(--primary);margin-right:5px;"></span>Received</span></div>';

  var seenSub = {}, allSubs = [];
  N.GRADES.forEach(function (g) { N.subjectsFor(g).forEach(function (sub) { if (!seenSub[sub.id]) { seenSub[sub.id] = 1; allSubs.push(sub); } }); });
  var bars = allSubs.map(function (sub) { return { sub: sub, sh: N.subjectShare("t3eot", sub.id, N.Store.state.students) }; }).filter(function (x) { return x.sh.total; });
  document.getElementById("subjBars").innerHTML = bars.map(function (x) {
    return '<div><div class="row-between small"><span>' + N.esc(x.sub.name) + '</span><span class="mono">' + N.pct(x.sh.meetingPlus) + "</span></div>" +
      '<div class="thin-track mt-1"><div class="thin-fill" style="width:' + Math.round(x.sh.meetingPlus * 100) + '%"></div></div></div>';
  }).join("") || '<p class="empty-note">No marks entered yet.</p>';

  var watch = N.atRiskStudents().slice(0, 6);
  document.getElementById("watchList").innerHTML = watch.length ? watch.map(function (w) {
    return '<div class="row-between" style="padding:8px 0;border-bottom:1px solid var(--line-soft);gap:10px;">' +
      '<div style="min-width:0;"><div style="font-weight:600;font-size:13px;">' + N.esc(w.student.name) + '</div><div class="small muted">' + N.gradeLabel(w.student.grade) + " " + N.esc(w.student.stream) + "</div></div>" +
      '<div style="text-align:right;flex-shrink:0;">' + w.reasons.map(function (r) { return '<div class="small" style="color:var(--bad)">' + N.esc(r) + "</div>"; }).join("") + "</div></div>";
  }).join("") : '<p class="empty-note">Nobody flagged right now \u2014 a good run so far.</p>';

  var receipts = N.Store.state.receipts.slice(0, 6);
  document.getElementById("receiptList").innerHTML = receipts.length ? receipts.map(function (r) {
    var st = N.Store.student(r.studentId);
    return '<div class="row-between" style="padding:8px 0;border-bottom:1px solid var(--line-soft);gap:10px;">' +
      '<div style="min-width:0;"><div style="font-weight:600;font-size:13px;">' + N.esc(st ? st.name : "Learner") + '</div><div class="small muted">' + N.esc(r.method) + " \u00b7 " + N.fmtDate(r.date) + "</div></div>" +
      '<div class="tabular" style="font-weight:700;flex-shrink:0;">' + N.ksh(r.amount) + "</div></div>";
  }).join("") : '<p class="empty-note">No receipts recorded yet.</p>';
})();
