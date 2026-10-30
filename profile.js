(function () {
  "use strict";
  var N = window.Tartar, S = window.Shell;
  N.Store.init();
  var me = N.Store.me || {}, canEdit = me.role === "admin" || me.role === "principal";

  function url(u) { u = String(u || "").trim(); if (!u) return ""; return /^https?:\/\//i.test(u) ? u : "https://" + u; }
  function link(u, label) { var h = url(u); return h ? '<a href="' + N.esc(h) + '" target="_blank" rel="noopener">' + N.esc(label || u) + "</a>" : ""; }
  function para(t) { return t ? '<p style="white-space:pre-line;line-height:1.6;margin-top:8px;">' + N.esc(t) + "</p>" : '<p class="small muted mt-2">Not added yet.</p>'; }
  function row(l, v) {
    return '<div class="row-between" style="padding:7px 0;border-bottom:1px solid var(--line-soft);gap:14px;"><span class="small muted">' + l +
      '</span><span style="font-weight:600;font-size:13.5px;text-align:right;">' + (v || '<span class="muted" style="font-weight:400;">Not added yet</span>') + "</span></div>";
  }

  function render() {
    var p = N.Store.state.profile, counts = { pp: 0, primary: 0, junior: 0 };
    N.Store.state.students.forEach(function (s) { counts[N.sectionOf(s.grade)]++; });
    var values = String(p.values || "").split(/\n|,/).map(function (x) { return x.trim(); }).filter(Boolean);
    document.getElementById("profileRoot").innerHTML =
      '<div class="card card-pad" style="display:flex;gap:18px;align-items:center;flex-wrap:wrap;">' +
        '<img src="../assets/img/crest.png" alt="Tartar School crest" width="96" height="96" style="border-radius:12px;">' +
        '<div style="min-width:200px;flex:1;"><div style="font-size:22px;font-weight:700;">' + N.esc(N.SCHOOL.name) + "</div>" +
        '<div style="color:var(--primary);font-weight:700;margin-top:2px;">' + N.esc(N.SCHOOL.motto) + "</div>" +
        '<div class="chip-row mt-2"><span class="badge badge-outline">Est. ' + N.SCHOOL.est + "</span>" +
        Object.keys(N.SECTIONS).map(function (k) { return '<span class="badge badge-outline">' + N.SECTIONS[k] + " &middot; " + counts[k] + " learners</span>"; }).join("") + "</div></div></div>" +
      '<div class="two-col mt-4"><div>' +
        '<div class="card card-pad"><div class="card-title">About us</div>' + para(p.about) + "</div>" +
        '<div class="card card-pad mt-4"><div class="card-title">Vision</div>' + para(p.vision) + '<div class="card-title mt-4">Mission</div>' + para(p.mission) + "</div>" +
        '<div class="card card-pad mt-4"><div class="card-title">Core values</div>' +
          (values.length ? '<div class="chip-row mt-2">' + values.map(function (v) { return '<span class="badge badge-good">' + N.esc(v) + "</span>"; }).join("") + "</div>" : '<p class="small muted mt-2">Not added yet.</p>') + "</div>" +
        '<div class="card card-pad mt-4"><div class="card-title">' + (p.principalName ? "Message from " + N.esc(p.principalName) : "Message from the head of institution") + "</div>" + para(p.principalMessage) + "</div>" +
      "</div><div>" +
        '<div class="card card-pad"><div class="card-title">Contact us</div>' +
          row("Phone", [p.phone, p.phone2].filter(Boolean).map(function (x) { return '<a href="tel:' + N.esc(x.replace(/\s+/g, "")) + '">' + N.esc(x) + "</a>"; }).join("<br>")) +
          row("Email", [p.email, p.email2].filter(Boolean).map(function (email) {
            var safeEmail = N.esc(email);
            return '<a href="mailto:' + safeEmail + '">' + safeEmail + "</a>";
          }).join("<br>")) +
          row("P.O. Box", N.esc(p.poBox)) + row("Address", [p.address, p.county].filter(Boolean).map(N.esc).join(", ")) +
          row("Opening hours", N.esc(p.hours)) + row("Website", link(p.website)) + row("Facebook", link(p.facebook)) + row("Location", link(p.mapLink, "Open map")) + "</div>" +
        '<div class="card card-pad mt-4"><div class="card-title">Admissions</div>' + para(p.admissions) + "</div>" +
        '<div class="card card-pad mt-4"><div class="card-title">Our sections</div><div class="small mt-2">Pre-Primary (PP1&ndash;PP2) &middot; Primary (Grades 1&ndash;6) &middot; Junior School (Grades 7&ndash;9). Boarding is offered from Grade 1.</div></div>' +
      "</div></div>";
  }

  var FIELDS = [["about", "About us", 1], ["vision", "Vision", 1], ["mission", "Mission", 1], ["values", "Core values (one per line)", 1],
    ["principalName", "Head of institution (name)"], ["principalMessage", "Message from the head of institution", 1],
    ["phone", "Phone"], ["phone2", "Second phone"], ["email", "Email"], ["email2", "Second email"], ["address", "Physical address / town"], ["poBox", "P.O. Box"], ["county", "County"],
    ["hours", "Opening hours"], ["website", "Website"], ["facebook", "Facebook page"], ["mapLink", "Map link (Google Maps)"], ["admissions", "Admissions information", 1]];

  var btn = document.getElementById("btnEditProfile");
  if (canEdit) {
    btn.hidden = false;
    btn.addEventListener("click", function () {
      var p = N.Store.state.profile;
      var html = "<h2>Edit school profile</h2><form id=\"profForm\">" + FIELDS.map(function (f) {
        var val = N.esc(p[f[0]] || "");
        return '<div class="field"><label>' + f[1] + "</label>" + (f[2]
          ? '<textarea name="' + f[0] + '" rows="3" style="width:100%;padding:10px;border:1px solid var(--line);border-radius:8px;font:inherit;">' + val + "</textarea>"
          : '<input type="text" name="' + f[0] + '" value="' + val + '">') + "</div>";
      }).join("") + '<button type="submit" class="btn btn-primary btn-block mt-2">Save profile</button></form>';
      var h = S.openDialog(html), f = h.el.querySelector("#profForm");
      f.addEventListener("submit", function (e) {
        e.preventDefault();
        var fd = new FormData(f), out = {};
        FIELDS.forEach(function (x) { out[x[0]] = String(fd.get(x[0]) || "").trim(); });
        N.Store.saveProfile(out); h.close(); S.toast("Profile saved", "The school profile has been updated."); render();
      });
    });
  }
  render();
})();
