(function () {
  "use strict";
  var N = window.Tartar, S = window.Shell, R = window.Reports;
  N.Store.init();

  var fSearch = document.getElementById("fSearch"), fGrade = document.getElementById("fGrade"), fGroup = document.getElementById("fGroup"), fProfile = document.getElementById("fProfile");
  var studentBody = document.getElementById("studentBody"), countNote = document.getElementById("countNote");

  N.GRADES.forEach(function (g) { var o = document.createElement("option"); o.value = g; o.textContent = "" + N.gradeLabel(g); fGrade.appendChild(o); });
  var seenStream = {};
  N.Store.state.classes.forEach(function (c) { if (c.stream && !seenStream[c.stream]) { seenStream[c.stream] = 1; var o = document.createElement("option"); o.value = c.stream; o.textContent = c.stream; fGroup.appendChild(o); } });

  function hasCoreDetails(st) {
    return Boolean(String(st.adm || "").trim() && String(st.gender || "").trim() &&
      String(st.parent || "").trim() && String(st.parentPhone || "").trim() &&
      (st.boarding === "Boarding" || st.boarding === "Day"));
  }
  function matches(st) {
    var q = fSearch.value.trim().toLowerCase();
    if (q && [st.name, st.adm, st.parent].join(" ").toLowerCase().indexOf(q) === -1) return false;
    if (fGrade.value !== "all" && st.grade !== Number(fGrade.value)) return false;
    if (fGroup.value !== "all" && st.stream !== fGroup.value) return false;
    if (fProfile.value === "incomplete" && hasCoreDetails(st)) return false;
    if (fProfile.value === "complete" && !hasCoreDetails(st)) return false;
    return true;
  }
  function renderTable() {
    var rows = N.Store.state.students.filter(matches).slice().sort(function (a, b) { return a.grade - b.grade || a.name.localeCompare(b.name); });
    studentBody.innerHTML = rows.map(function (st) {
      var att = N.attendancePct(st);
      var ledger = N.Store.ledgerOf(st.id);
      var detailsBadge = hasCoreDetails(st) ? "" : '<span class="sub"><span class="badge badge-neutral">Details incomplete</span></span>';
      var feeHtml;
      if (st.boarding === "Boarding") {
        var bal = ledger.billed - ledger.paid;
        feeHtml = bal > 0 ? '<span class="badge badge-bad">' + N.ksh(bal) + "</span>" : '<span class="badge badge-good">Clear</span>';
      } else if (st.boarding === "Day") {
        feeHtml = '<span class="badge badge-neutral">Day \u00b7 capitation</span>';
      } else {
        feeHtml = '<span class="badge badge-neutral">Status not set</span>';
      }
      return '<tr class="row-click" data-sid="' + st.id + '"><td class="mono small">' + N.esc(st.adm || "Add number") + "</td>" +
        "<td>" + N.esc(st.name) + detailsBadge + '<span class="sub">' + N.esc(st.parent || "Guardian not recorded") + "</span></td>" +
        "<td>" + N.gradeLabel(st.grade) + '<span class="sub">' + N.esc(st.stream || "Class not assigned") + "</span></td>" +
        "<td>" + N.pct(att) + "</td><td>" + feeHtml + "</td></tr>";
    }).join("") || '<tr><td colspan="5" class="empty-note">No learners match these filters.</td></tr>';
    var incomplete = N.Store.state.students.filter(function (st) { return !hasCoreDetails(st); }).length;
    countNote.textContent = rows.length + " of " + N.Store.state.students.length + " learners shown. " +
      incomplete + " learner records need admission, gender, guardian, phone, or day/boarding details.";
    studentBody.querySelectorAll("tr[data-sid]").forEach(function (tr) {
      tr.addEventListener("click", function () { openStudentSheet(tr.getAttribute("data-sid")); });
    });
  }
  [fSearch, fGrade, fGroup, fProfile].forEach(function (el) { el.addEventListener("input", renderTable); el.addEventListener("change", renderTable); });

  function kvRow(l, v) { return '<div class="row-between" style="padding:7px 0;border-bottom:1px solid var(--line-soft);"><span class="small muted">' + N.esc(l) + '</span><span style="font-weight:600;font-size:13.5px;text-align:right;">' + N.esc(v) + "</span></div>"; }

  function openStudentSheet(sid) {
    var st = N.Store.student(sid);
    var ledger = N.Store.ledgerOf(sid);
    var att = N.attendancePct(st);
    var famHtml = kvRow("Parent / guardian", st.parent || "Not recorded") + kvRow("Phone", st.parentPhone || "Not recorded") + kvRow("Gender", st.gender || "Not recorded") + kvRow("Boarding status", st.boarding || "Not recorded") + kvRow("Class", N.gradeLabel(st.grade) + " " + (st.stream || "(not assigned)")) + kvRow("Assessment no.", st.assessmentNo || "\u2014");
    var role = (N.Store.me || {}).role || "admin";
    var canEditDetails = role === "admin" || role === "principal";
    var canAssign = role === "admin" || role === "principal" || (role === "bursar" && st.boarding === "Boarding");
    if (canEditDetails) {
      famHtml += '<button type="button" class="btn btn-outline btn-sm mt-3" id="editStudentBtn">Edit learner details</button>';
    }
    if (canAssign) {
      var clsOpts = N.Store.state.classes.filter(function (c) { return role === "bursar" ? c.grade >= 1 : true; }).map(function (c) {
        return '<option value="' + c.id + '"' + (c.id === st.classId ? " selected" : "") + ">" + N.esc(N.Store.classLabel(c)) + "</option>";
      }).join("");
      famHtml += '<div class="field mt-3"><label>Assign class</label><div class="select-wrap"><select id="assignClass"><option value="">Choose a class</option>' + clsOpts + "</select></div></div>" +
        '<button type="button" class="btn btn-outline btn-sm mt-2" id="assignBtn">Save class</button>';
    }
    var feesHtml;
    if (st.boarding === "Day") {
      feesHtml = '<p class="small muted">Day scholar \u2014 tuition is funded through Free Day Education capitation. No household fees are due this term.</p>';
    } else if (st.boarding === "Boarding") {
      var bal = ledger.billed - ledger.paid;
      feesHtml = kvRow("Annual boarding fee", N.ksh(ledger.billed)) + kvRow("Paid so far", N.ksh(ledger.paid)) + kvRow("Balance", N.ksh(bal)) +
        '<a class="btn btn-primary btn-block mt-3" href="finance.html">' + S.ic("finance") + " Go to Finance to record a receipt</a>";
    } else {
      feesHtml = '<p class="small muted">Boarding/day status has not been recorded yet.</p>';
    }
    var subjectRows = N.studentSubjects(st).map(function (s) {
      var mark = N.Store.scoreOf("t3eot", st.id, s.id);
      return '<div class="row-between" style="padding:6px 0;border-bottom:1px solid var(--line-soft);"><span class="small">' + N.esc(s.name) + "</span>" + S.scoreLevel(mark) + "</div>";
    }).join("");
    var repHtml = '<p class="small muted">Term 3 End-of-Term Assessment:</p><div class="mt-2">' + subjectRows + "</div>" +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;" class="mt-4">' +
      '<button type="button" class="btn btn-outline btn-sm" data-act="print">' + S.ic("print") + " Print</button>" +
      '<button type="button" class="btn btn-outline btn-sm" data-act="share">' + S.ic("share") + " Share</button>" +
      '<button type="button" class="btn btn-primary btn-sm" data-act="download">' + S.ic("download") + " Download PDF</button></div>";

    var html = "<h2>" + N.esc(st.name) + "</h2>" +
      '<p class="sheet-desc">' + N.esc(st.adm || "Admission number not recorded") + " \u00b7 " + N.gradeLabel(st.grade) + " \u00b7 " + N.esc(st.stream || "Class not assigned") + "</p>" +
      '<div class="chip-row mt-3">' +
      (st.boarding === "Boarding" ? '<span class="badge ' + ((ledger.billed - ledger.paid) > 0 ? "badge-bad" : "badge-good") + '">' + ((ledger.billed - ledger.paid) > 0 ? N.ksh(ledger.billed - ledger.paid) + " due" : "Fees clear") + "</span>" : st.boarding === "Day" ? '<span class="badge badge-neutral">Day scholar</span>' : '<span class="badge badge-neutral">Status not set</span>') +
      '<span class="badge badge-outline">' + N.pct(att) + " present</span></div>" +
      '<div class="tabs-wrap mt-4">' +
      '<div class="tabs-list"><button type="button" class="tab-btn active" data-tab="fam">Family</button><button type="button" class="tab-btn" data-tab="fees">Fees</button><button type="button" class="tab-btn" data-tab="rep">Report</button></div>' +
      '<div class="tab-panel" data-panel="fam">' + famHtml + "</div>" +
      '<div class="tab-panel" data-panel="fees" hidden>' + feesHtml + "</div>" +
      '<div class="tab-panel" data-panel="rep" hidden>' + repHtml + "</div></div>";

    var handle = S.openSheet(html);
    S.initTabs(handle.el);
    var editBtn = handle.el.querySelector("#editStudentBtn");
    if (editBtn) editBtn.addEventListener("click", function () {
      var storedGuardians = Array.isArray(st.guardians) ? st.guardians : [];
      function guardianName(g) {
        return [g.first, g.middle, g.surname].filter(Boolean).join(" ") || "";
      }
      function guardianBlock(n, g, fallbackName, fallbackPhone) {
        var rel = g.rel || "Guardian", relationships = ["Mother", "Father", "Guardian"];
        if (relationships.indexOf(rel) === -1) relationships.push(rel);
        return '<h3 style="margin:14px 0 6px;font-size:14px;">Parent / guardian ' + n + (n === 1 ? "" : " (optional)") + "</h3>" +
          '<div class="form-row-2"><div class="field"><label>Relationship</label><div class="select-wrap"><select name="g' + n + 'rel">' +
          relationships.map(function (option) { return '<option value="' + N.esc(option) + '"' + (option === rel ? " selected" : "") + ">" + N.esc(option) + "</option>"; }).join("") +
          "</select></div></div><div class=\"field\"><label>Full name</label><input type=\"text\" name=\"g" + n + 'name" value="' + N.esc(guardianName(g) || fallbackName || "") + '"></div></div>' +
          '<div class="form-row-2"><div class="field"><label>ID type</label><input type="text" name="g' + n + 'idType" value="' + N.esc(g.idType || "") + '"></div>' +
          '<div class="field"><label>ID number</label><input type="text" name="g' + n + 'id" value="' + N.esc(g.idNo || "") + '"></div></div>' +
          '<div class="field"><label>Phone</label><input type="tel" name="g' + n + 'phone" value="' + N.esc(g.phone || fallbackPhone || "") + '"></div>';
      }
      var boardingOptions = '<option value="">Not recorded</option><option value="Day"' + (st.boarding === "Day" ? " selected" : "") + '>Day</option>' +
        '<option value="Boarding"' + (st.boarding === "Boarding" ? " selected" : "") + (st.grade < 1 ? " disabled" : "") + '>Boarding</option>';
      var genderOptions = '<option value="">Not recorded</option><option value="Female"' + (st.gender === "Female" ? " selected" : "") + '>Female</option>' +
        '<option value="Male"' + (st.gender === "Male" ? " selected" : "") + '>Male</option>';
      var editHtml = '<h2>Edit learner details</h2><p class="dialog-desc">Update this learner\'s school record. Admission numbers must be unique.</p>' +
        '<form id="editStudentForm">' +
        '<div class="field"><label>Full name</label><input required type="text" name="name" value="' + N.esc(st.name) + '"></div>' +
        '<div class="form-row-2"><div class="field"><label>Admission number</label><input type="text" name="adm" value="' + N.esc(st.adm || "") + '" placeholder="Enter admission number"></div>' +
        '<div class="field"><label>Assessment number</label><input type="text" name="assessmentNo" value="' + N.esc(st.assessmentNo || "") + '"></div></div>' +
        '<div class="form-row-2"><div class="field"><label>Gender</label><div class="select-wrap"><select name="gender">' + genderOptions + '</select></div></div>' +
        '<div class="field"><label>Boarding or day</label><div class="select-wrap"><select name="boarding">' + boardingOptions + '</select></div></div></div>' +
        guardianBlock(1, storedGuardians[0] || {}, st.parent, st.parentPhone) +
        guardianBlock(2, storedGuardians[1] || {}, "", "") +
        '<button type="submit" class="btn btn-primary btn-block mt-2">Save learner details</button></form>';
      var editHandle = S.openDialog(editHtml), form = editHandle.el.querySelector("#editStudentForm");
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var fd = new FormData(form), adm = String(fd.get("adm") || "").trim();
        var name = String(fd.get("name") || "").trim();
        if (!name) { S.toast("Name required", "Enter the learner's full name."); return; }
        var duplicate = N.Store.state.students.some(function (other) {
          return other.id !== st.id && adm && String(other.adm || "").trim().toLowerCase() === adm.toLowerCase();
        });
        if (duplicate) { S.toast("Admission number in use", adm + " already belongs to another learner."); return; }
        var boarding = String(fd.get("boarding") || "");
        if (boarding === "Boarding" && st.grade < 1) { S.toast("Not available", "Boarding is for Primary and Junior School only."); return; }
        function guardianFromForm(n) {
          var name = String(fd.get("g" + n + "name") || "").trim();
          var idType = String(fd.get("g" + n + "idType") || "").trim();
          var idNo = String(fd.get("g" + n + "id") || "").trim();
          var phone = String(fd.get("g" + n + "phone") || "").trim();
          return name || idType || idNo || phone ? {
            rel: String(fd.get("g" + n + "rel") || "Guardian"),
            first: name, middle: "", surname: "", idType: idType, idNo: idNo, phone: phone,
          } : null;
        }
        var guardians = [guardianFromForm(1), guardianFromForm(2)].filter(Boolean);
        var primaryGuardian = guardians[0] || {};
        N.Store.updateStudent(st.id, {
          name: name,
          adm: adm,
          assessmentNo: String(fd.get("assessmentNo") || "").trim(),
          gender: String(fd.get("gender") || ""),
          boarding: boarding,
          parent: primaryGuardian.first || "",
          parentPhone: primaryGuardian.phone || "",
          guardians: guardians,
        });
        editHandle.close(); handle.close(); renderTable(); openStudentSheet(st.id);
        S.toast("Learner details saved", name);
      });
    });
    var asgBtn = handle.el.querySelector("#assignBtn");
    if (asgBtn) asgBtn.addEventListener("click", function () {
      var cid = handle.el.querySelector("#assignClass").value;
      if (!cid) { S.toast("Choose a class", "Pick a class from the list first."); return; }
      N.Store.assignClass(st.id, cid); handle.close(); S.toast("Class assigned", st.name); renderTable();
    });
    var data = R.learner.data(st.id, "t3eot");
    var dl = handle.el.querySelector('[data-act="download"]');
    if (dl) dl.addEventListener("click", function () { R.withCrest(function () { var doc = R.learner.pdf(data); doc.save(R.learner.filename(data)); S.toast("PDF downloaded", R.learner.filename(data)); }); });
    var pr = handle.el.querySelector('[data-act="print"]');
    if (pr) pr.addEventListener("click", function () { R.withCrest(function () { R.openPdfTab(R.learner.pdf(data)); }); });
    var sh = handle.el.querySelector('[data-act="share"]');
    if (sh) sh.addEventListener("click", function () { R.withCrest(function () { var doc = R.learner.pdf(data); R.shareOrDownload(doc, R.learner.filename(data), R.learner.title(data), R.learner.shareText(data)); }); });
  }

  var me = N.Store.me || {}, role = me.role || "admin";
  var canAdmitAny = role === "admin" || role === "principal" || role === "bursar";   // head and bursar handle fees first-hand
  function myClasses() { return N.Store.state.classes.filter(function (c) { return me.staffId && c.teacherId === me.staffId; }); }
  function gBlock(n, title, req) {
    var r = req ? "required " : "";
    return '<h3 style="margin:14px 0 6px;font-size:14px;">' + title + "</h3>" +
      '<div class="form-row-2"><div class="field"><label>Relationship</label><div class="select-wrap"><select name="g' + n + 'rel"><option>Mother</option><option>Father</option><option>Guardian</option></select></div></div>' +
      '<div class="field"><label>First name</label><input ' + r + 'type="text" name="g' + n + 'first"></div></div>' +
      '<div class="form-row-2"><div class="field"><label>Middle name</label><input type="text" name="g' + n + 'middle"></div>' +
      '<div class="field"><label>Surname</label><input ' + r + 'type="text" name="g' + n + 'surname"></div></div>' +
      '<div class="form-row-2"><div class="field"><label>ID type</label><input type="text" name="g' + n + 'idType"></div>' +
      '<div class="field"><label>ID number</label><input ' + r + 'type="text" name="g' + n + 'id"></div></div>' +
      '<div class="field"><label>Phone</label><input ' + r + 'type="tel" name="g' + n + 'phone" placeholder="07XX XXX XXX"></div>';
  }
  function openAdmitDialog() {
    var mine = myClasses();
    if (!canAdmitAny && !mine.length) { S.toast("No class assigned", "The head of institution must assign you as a class teacher first."); return; }
    var placement = canAdmitAny ?
      '<div class="form-row-2"><div class="field"><label>Grade</label><div class="select-wrap"><select name="grade" id="admitGrade">' + N.GRADES.map(function (g) { return '<option value="' + g + '">' + N.gradeLabel(g) + "</option>"; }).join("") + "</select></div></div>" +
      '<div class="field"><label>Day or boarding</label><div class="select-wrap"><select name="boarding" id="admitBoarding"><option>Day</option><option>Boarding</option></select></div></div></div>' +
      '<div id="feeRow" class="field" hidden><label>Boarding fee billed (KSh)</label><input type="number" min="0" name="boardingFee" value="0"></div>' +
      '<div class="field"><label>Class (you can assign later)</label><div class="select-wrap"><select name="classId" id="admitClass"></select></div></div>' :
      '<div class="field"><label>My class</label><div class="select-wrap"><select name="classId" id="admitClass">' + mine.map(function (c) { return '<option value="' + c.id + '">' + N.esc(N.Store.classLabel(c)) + "</option>"; }).join("") + "</select></div></div>" +
      '<p class="small muted">Class teachers add day scholars to their own class. Boarders are admitted by the head of institution or the bursar.</p>';
    var html = '<h2>' + (canAdmitAny ? "Admit a student" : "Add a day scholar") + '</h2><p class="dialog-desc">Adds a new learner to the school records.</p>' +
      '<form id="admitForm">' +
      '<div class="form-row-2"><div class="field"><label>First name</label><input required type="text" name="first"></div>' +
      '<div class="field"><label>Middle name</label><input type="text" name="middle"></div></div>' +
      '<div class="form-row-2"><div class="field"><label>Surname</label><input required type="text" name="surname"></div>' +
      '<div class="field"><label>Gender</label><div class="select-wrap"><select name="gender"><option>Female</option><option>Male</option></select></div></div></div>' +
      '<div class="form-row-2"><div class="field"><label>Admission number</label><input required type="text" name="adm" placeholder="e.g. TS/2026/001"></div>' +
      '<div class="field"><label>Assessment number</label><input type="text" name="assessmentNo" placeholder="KNEC assessment no."></div></div>' +
      placement + gBlock(1, "Parent / guardian 1 (required)", true) + gBlock(2, "Parent / guardian 2 (optional)", false) +
      '<button type="submit" class="btn btn-primary btn-block mt-2">' + (canAdmitAny ? "Admit student" : "Add to my class") + "</button></form>";
    var handle = S.openDialog(html), form = handle.el.querySelector("#admitForm");
    var gradeSel = handle.el.querySelector("#admitGrade"), boardSel = handle.el.querySelector("#admitBoarding"), clsSel = handle.el.querySelector("#admitClass");
    function refresh() {
      if (!canAdmitAny) return;
      var g = Number(gradeSel.value);
      var opts = N.Store.state.classes.filter(function (c) { return c.grade === g; }).map(function (c) { return '<option value="' + c.id + '">' + N.esc(N.Store.classLabel(c)) + "</option>"; }).join("");
      clsSel.innerHTML = '<option value="">Assign later</option>' + opts;
      if (g < 0) boardSel.value = "Day";            // boarding is for Primary and Junior School only
      boardSel.querySelector("option:nth-child(2)").disabled = g < 0;
      handle.el.querySelector("#feeRow").hidden = boardSel.value !== "Boarding";
    }
    if (canAdmitAny) { gradeSel.addEventListener("change", refresh); boardSel.addEventListener("change", refresh); refresh(); }
    function v(fd, k) { return String(fd.get(k) || "").trim(); }
    function nameOf(a, b, c) { return [a, b, c].filter(Boolean).join(" "); }
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData(form), adm = v(fd, "adm"), cid = v(fd, "classId"), cls = cid ? N.Store.classOf(cid) : null;
      var grade = canAdmitAny ? Number(fd.get("grade")) : cls.grade, boarding = canAdmitAny ? v(fd, "boarding") : "Day";
      if (boarding === "Boarding" && grade < 0) { S.toast("Not available", "Boarding is for Primary and Junior School only."); return; }
      if (N.Store.state.students.some(function (x) { return String(x.adm).toLowerCase() === adm.toLowerCase(); })) { S.toast("Admission number in use", adm + " already belongs to another learner."); return; }
      var guardians = [1, 2].map(function (n) {
        return { rel: v(fd, "g" + n + "rel"), first: v(fd, "g" + n + "first"), middle: v(fd, "g" + n + "middle"), surname: v(fd, "g" + n + "surname"), idType: v(fd, "g" + n + "idType"), idNo: v(fd, "g" + n + "id"), phone: v(fd, "g" + n + "phone") };
      }).filter(function (g) { return g.first || g.surname || g.idType || g.idNo || g.phone; });
      if (guardians[1] && !(guardians[1].first && guardians[1].surname && guardians[1].idNo && guardians[1].phone)) { S.toast("Guardian 2 incomplete", "Fill in all of guardian 2's details, or clear that section."); return; }
      var first = v(fd, "first"), middle = v(fd, "middle"), surname = v(fd, "surname");
      var newSt = N.Store.addStudent({
        adm: adm, assessmentNo: v(fd, "assessmentNo"), first: first, middle: middle, surname: surname, name: nameOf(first, middle, surname), gender: fd.get("gender"),
        parent: nameOf(guardians[0].first, guardians[0].middle, guardians[0].surname), parentPhone: guardians[0].phone, guardians: guardians,
        grade: grade, classId: cid, boarding: boarding, boardingFee: v(fd, "boardingFee"),
      });
      handle.close();
      S.toast("Student admitted", newSt.name + " \u2014 " + N.gradeLabel(newSt.grade) + (newSt.stream ? " " + newSt.stream : ""));
      renderTable();
    });
  }
  (function () {
    var btn = document.getElementById("btnAdmit");
    if (!canAdmitAny) { if (myClasses().length) btn.lastChild.textContent = " Add day scholar"; else btn.style.display = "none"; }
    btn.addEventListener("click", openAdmitDialog);
  })();

  renderTable();
})();
