(function () {
  "use strict";
  var N = window.Tartar, S = window.Shell;
  N.Store.init();

  var AUDIENCES = [
    { key: "boarding", label: "Boarding balance", template: N.MESSAGE_TEMPLATES.boarding },
    { key: "grade9", label: "Grade 9", template: N.MESSAGE_TEMPLATES.grade9 },
    { key: "absent", label: "Absent today", template: N.MESSAGE_TEMPLATES.absent },
    { key: "all", label: "All parents", template: N.MESSAGE_TEMPLATES.all },
  ];
  var current = "boarding";
  var chips = document.getElementById("audienceChips"), body = document.getElementById("msgBody"), charCount = document.getElementById("charCount"), recipientList = document.getElementById("recipientList");

  function recipientsFor(key) {
    var today = N.SCHOOL.today;
    if (key === "boarding") return N.Store.state.students.filter(function (s) { var l = N.Store.ledgerOf(s.id); return s.boarding === "Boarding" && l.billed - l.paid > 0; });
    if (key === "grade9") return N.Store.state.students.filter(function (s) { return s.grade === 9; });
    if (key === "absent") return N.Store.state.students.filter(function (s) { return N.Store.attendanceOn(today, s.id) === "absent"; });
    return N.Store.state.students.slice();
  }
  function renderChips() {
    chips.innerHTML = AUDIENCES.map(function (a) {
      return '<button type="button" class="btn btn-sm ' + (a.key === current ? "btn-primary" : "btn-outline") + '" data-key="' + a.key + '">' + a.label + " (" + recipientsFor(a.key).length + ")</button>";
    }).join("");
    chips.querySelectorAll("[data-key]").forEach(function (btn) {
      btn.addEventListener("click", function () { current = btn.getAttribute("data-key"); body.value = AUDIENCES.filter(function (a) { return a.key === current; })[0].template; renderAll(); });
    });
  }
  function renderRecipients() {
    var list = recipientsFor(current);
    recipientList.innerHTML = list.length ? list.map(function (s) {
      return '<div class="row-between" style="padding:7px 0;border-bottom:1px solid var(--line-soft);"><div><div style="font-weight:600;font-size:13px;">' + N.esc(s.parent) + '</div><div class="small muted">' + N.esc(s.name) + "</div></div><span class=\"mono small\">" + N.esc(s.parentPhone) + "</span></div>";
    }).join("") : '<p class="empty-note">No parents match this audience right now.</p>';
  }
  function renderCharCount() {
    var n = body.value.length;
    var sms = Math.max(1, Math.ceil(n / 160));
    charCount.textContent = n + " characters \u00b7 " + sms + " SMS \u00b7 " + recipientsFor(current).length + " parents";
  }
  function renderOutbox() {
    document.getElementById("outboxList").innerHTML = N.Store.state.outbox.map(function (m) {
      return '<div style="padding:9px 0;border-bottom:1px solid var(--line-soft);"><div class="row-between"><span style="font-weight:700;font-size:13px;">' + N.esc(m.audience) + "</span><span class=\"badge badge-neutral\">" + m.count + " sent</span></div>" +
        '<div class="small muted mt-1">' + N.fmtDate(m.date) + '</div><p class="small mt-1">' + N.esc(m.body) + "</p></div>";
    }).join("") || '<p class="empty-note">No messages sent yet.</p>';
  }
  function renderAll() { renderChips(); renderRecipients(); renderCharCount(); }

  body.addEventListener("input", renderCharCount);
  document.getElementById("btnSend").addEventListener("click", function () {
    var list = recipientsFor(current);
    if (!body.value.trim()) { S.toast("Write a message first"); return; }
    var label = AUDIENCES.filter(function (a) { return a.key === current; })[0].label;
    N.Store.sendMessage(label, list.length, body.value.trim());
    renderOutbox();
    S.toast("Sent to " + list.length + " parents", label);
  });

  body.value = AUDIENCES.filter(function (a) { return a.key === current; })[0].template;
  renderAll();
  renderOutbox();
})();
