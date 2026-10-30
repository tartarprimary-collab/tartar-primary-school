(function () {
  "use strict";
  var N = window.Tartar, S = window.Shell;
  N.Store.init();

  function renderKpis() {
    var jss = N.capitationRow("jss"), ss = N.capitationRow("pri");
    var totalEnt = jss.entitlement + ss.entitlement, totalRec = jss.received + ss.received;
    var boarders = N.Store.state.students.filter(function (s) { return s.boarding === "Boarding"; });
    var collected = boarders.reduce(function (a, s) { return a + N.Store.ledgerOf(s.id).paid; }, 0);
    var outstanding = boarders.reduce(function (a, s) { var l = N.Store.ledgerOf(s.id); return a + Math.max(0, l.billed - l.paid); }, 0);
    var expenses = N.Store.state.expenses.reduce(function (a, e) { return a + e.amount; }, 0);
    document.getElementById("kpiGrid").innerHTML = [
      S.kpi({ label: "Capitation received", value: N.pct(totalEnt ? totalRec / totalEnt : 0), hint: N.ksh(totalRec) + " of " + N.ksh(totalEnt) }),
      S.kpi({ label: "Boarding fees collected", value: N.ksh(collected), hint: boarders.length + " boarders on the roll" }),
      S.kpi({ label: "Boarding balance outstanding", value: N.ksh(outstanding), hint: "across " + boarders.length + " boarders" }),
      S.kpi({ label: "Expenses this term", value: N.ksh(expenses), hint: N.Store.state.expenses.length + " entries logged" }),
    ].join("");
    var jssR = ss, ssR = jss;   // Primary first, then Junior School
    document.getElementById("capBody").innerHTML = [jssR, ssR].map(function (r) {
      return "<tr><td>" + N.esc(r.label) + "</td><td>" + r.enrolled + "</td><td>" + N.ksh(r.entitlement) + "</td><td>" + N.ksh(r.received) + " <span class=\"small muted\">(" + N.pct(r.pct) + ")</span></td><td>" + N.ksh(r.outstanding) + "</td></tr>";
    }).join("") + "<tr class=\"rt-foot\"><td>Total</td><td>" + (jssR.enrolled + ssR.enrolled) + "</td><td>" + N.ksh(jssR.entitlement + ssR.entitlement) + "</td><td>" + N.ksh(jssR.received + ssR.received) + "</td><td>" + N.ksh(jssR.outstanding + ssR.outstanding) + "</td></tr>";
  }

  var regSearch = document.getElementById("regSearch");
  function renderRegister() {
    var q = regSearch.value.trim().toLowerCase();
    var rows = N.Store.state.students.filter(function (s) { return !q || (s.name + " " + s.adm).toLowerCase().indexOf(q) > -1; })
      .slice().sort(function (a, b) { return a.grade - b.grade || a.name.localeCompare(b.name); });
    document.getElementById("regBody").innerHTML = rows.map(function (st) {
      if (st.boarding === "Day") {
        return "<tr><td>" + N.esc(st.name) + '<span class="sub">' + N.esc(st.adm) + " \u00b7 " + N.gradeLabel(st.grade) + "</span></td><td colspan=\"3\" class=\"small muted\">Day scholar \u2014 capitation-funded, no fees due</td></tr>";
      }
      if (st.boarding !== "Boarding") {
        return "<tr><td>" + N.esc(st.name) + '<span class="sub">' + N.esc(st.adm) + " \u00b7 " + N.gradeLabel(st.grade) + "</span></td><td colspan=\"3\" class=\"small muted\">Boarding/day status not recorded</td></tr>";
      }
      var l = N.Store.ledgerOf(st.id);
      var bal = l.billed - l.paid;
      return "<tr><td>" + N.esc(st.name) + '<span class="sub">' + N.esc(st.adm) + " \u00b7 " + N.gradeLabel(st.grade) + "</span></td><td>" + N.ksh(l.billed) + "</td><td>" + N.ksh(l.paid) + "</td><td>" +
        (bal > 0 ? '<span class="badge badge-bad">' + N.ksh(bal) + "</span>" : '<span class="badge badge-good">Clear</span>') + "</td></tr>";
    }).join("") || '<tr><td colspan="4" class="empty-note">No students match.</td></tr>';
  }
  regSearch.addEventListener("input", renderRegister);

  function renderReceipts() {
    document.getElementById("receiptBody").innerHTML = N.Store.state.receipts.map(function (r) {
      var st = N.Store.student(r.studentId);
      return "<tr><td>" + N.esc(st ? st.name : "\u2014") + '<span class="sub">' + (st ? N.esc(st.adm) : "") + "</span></td><td>" + N.esc(r.method) + '</td><td class="mono small">' + N.esc(r.ref) + "</td><td>" + N.fmtDate(r.date) + "</td><td class=\"tabular\" style=\"font-weight:700;\">" + N.ksh(r.amount) + "</td></tr>";
    }).join("") || '<tr><td colspan="5" class="empty-note">No receipts recorded yet.</td></tr>';
  }
  function renderExpenses() {
    document.getElementById("expenseBody").innerHTML = N.Store.state.expenses.map(function (e) {
      return "<tr><td>" + N.esc(e.category) + "</td><td>" + N.esc(e.note) + "</td><td>" + N.fmtDate(e.date) + '</td><td class="tabular" style="font-weight:700;">' + N.ksh(e.amount) + "</td></tr>";
    }).join("") || '<tr><td colspan="4" class="empty-note">No expenses logged yet.</td></tr>';
  }
  function renderPledges() {
    document.getElementById("pledgeBody").innerHTML = N.Store.state.pledges.map(function (p) {
      var frac = p.amount ? p.fulfilled / p.amount : 0;
      return '<div class="card card-pad">' +
        '<div class="row-between"><div><div style="font-weight:600;font-size:13.5px;">' + N.esc(p.purpose) + '</div><div class="small muted">' + N.esc(p.donor) + "</div></div>" +
        '<button type="button" class="btn btn-outline btn-sm" data-pid="' + p.id + '">Record payment</button></div>' +
        '<div class="row-between small mt-3"><span>' + N.ksh(p.fulfilled) + " received</span><span class=\"muted\">of " + N.ksh(p.amount) + "</span></div>" +
        '<div class="bar-track mt-1"><div class="bar-fill gold" style="width:' + Math.round(frac * 100) + '%"></div></div></div>';
    }).join("");
    document.querySelectorAll("#pledgeBody [data-pid]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var pid = btn.getAttribute("data-pid");
        var amt = prompt("Record a payment towards this pledge (KSh):");
        if (amt == null || amt === "" || isNaN(Number(amt))) return;
        N.Store.fulfillPledge(pid, Number(amt));
        renderPledges();
        S.toast("Pledge payment recorded", N.ksh(Number(amt)));
      });
    });
  }

  function renderAll() { renderKpis(); renderRegister(); renderReceipts(); renderExpenses(); renderPledges(); }

  function openReceiptDialog() {
    var boarders = N.Store.state.students.filter(function (s) { return s.boarding === "Boarding"; }).slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
    var html = "<h2>Record a receipt</h2><p class=\"dialog-desc\">Boarding fee payment \u2014 posts straight to the learner's ledger.</p>" +
      '<form id="rcForm">' +
      '<div class="field"><label>Student</label><div class="select-wrap"><select name="studentId">' + boarders.map(function (s) { var l = N.Store.ledgerOf(s.id); return '<option value="' + s.id + '">' + N.esc(s.name) + " \u2014 " + N.esc(s.adm) + " (balance " + N.ksh(l.billed - l.paid) + ")</option>"; }).join("") + "</select></div></div>" +
      '<div class="form-row-2"><div class="field"><label>Amount (KSh)</label><input required type="number" min="1" name="amount" placeholder="e.g. 15000"></div>' +
      '<div class="field"><label>Method</label><div class="select-wrap"><select name="method"><option>M-Pesa</option><option>Bank</option><option>Cash</option></select></div></div></div>' +
      '<button type="submit" class="btn btn-primary btn-block mt-2">Post receipt</button></form>';
    var handle = S.openDialog(html);
    handle.el.querySelector("#rcForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var st = N.Store.student(fd.get("studentId"));
      var r = N.Store.addReceipt(fd.get("studentId"), fd.get("amount"), fd.get("method"));
      handle.close();
      renderAll();
      S.toast("Receipt posted", (st ? st.name + " \u2014 " : "") + N.ksh(r.amount));
    });
  }
  function openExpenseDialog() {
    var cats = ["Wages & statutory", "Utilities", "Learning materials", "Boarding", "Assessment", "Transport", "Maintenance", "Other"];
    var html = "<h2>Log an expense</h2><p class=\"dialog-desc\">Recorded against Term 3 operating funds.</p>" +
      '<form id="exForm">' +
      '<div class="field"><label>Category</label><div class="select-wrap"><select name="category">' + cats.map(function (c) { return "<option>" + c + "</option>"; }).join("") + "</select></div></div>" +
      '<div class="field"><label>Note</label><input required type="text" name="note" placeholder="What was this for?"></div>' +
      '<div class="form-row-2"><div class="field"><label>Amount (KSh)</label><input required type="number" min="1" name="amount" placeholder="e.g. 25000"></div>' +
      '<div class="field"><label>Date</label><input type="text" name="date" value="' + N.SCHOOL.today + '"></div></div>' +
      '<button type="submit" class="btn btn-primary btn-block mt-2">Log expense</button></form>';
    var handle = S.openDialog(html);
    handle.el.querySelector("#exForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var ex = N.Store.addExpense(fd.get("category"), fd.get("note"), fd.get("amount"), fd.get("date"));
      handle.close();
      renderAll();
      S.toast("Expense logged", ex.category + " \u2014 " + N.ksh(ex.amount));
    });
  }
  document.getElementById("btnReceipt").addEventListener("click", openReceiptDialog);
  document.getElementById("btnExpense").addEventListener("click", openExpenseDialog);

  S.initTabs(document);
  renderAll();
})();
