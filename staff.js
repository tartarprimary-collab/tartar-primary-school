(function () {
  "use strict";
  var N = window.Tartar, S = window.Shell;
  N.Store.init();
  var me = N.Store.me || {}, isHead = me.role === "admin" || me.role === "principal";
  var POS = { teacher: "Teacher", senior: "Senior Teacher", deputy: "Deputy Head of Institution" };

  function api(path, body) {
    return fetch(path, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + N.Store._token() }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (d) { d.ok = r.ok; return d; }); }).catch(function () { return { ok: false, error: "Cannot reach the server." }; });
  }
  function posOpts(sel) { return Object.keys(POS).map(function (k) { return '<option value="' + k + '"' + (k === sel ? " selected" : "") + ">" + POS[k] + "</option>"; }).join(""); }
  function suggest(name) { var p = String(name || "").toLowerCase().replace(/[^a-z ]/g, "").split(/\s+/).filter(Boolean); return p.length ? (p[0][0] + (p[p.length - 1] || "")).slice(0, 20) : ""; }
  function tempDialog(who, pw) {
    S.openDialog("<h2>Login ready</h2><p>Username: <b>" + N.esc(who) + '</b></p><p class="mt-2">Temporary password:</p><p style="font-family:monospace;font-size:22px;letter-spacing:2px;margin:8px 0;">' + N.esc(pw) +
      '</p><p class="small muted">Shown only once. Give it to the teacher; they must choose their own password at first login (Staff link on the login page).</p>');
  }
  function createLogin(p, username) {
    N.Store.flush();   // make sure the server already has this staff record
    return api("/api/staff-accounts", { staffId: p.id, name: p.name, username: username, role: p.position }).then(function (r) {
      if (!r.ok) { S.toast("Login not created", r.error || "Try again."); return; }
      N.Store.updateStaff(p.id, { username: username.toLowerCase() }); tempDialog(username.toLowerCase(), r.temp); render();
    });
  }

  function render() {
    var list = N.Store.state.staff;
    document.getElementById("staffGrid").innerHTML = list.length ? list.map(function (p) {
      var cls = N.Store.state.classes.filter(function (c) { return c.teacherId === p.id; }).map(function (c) { return N.esc(N.Store.classLabel(c)); });
      var pos = POS[p.position] || p.title || "Teacher";
      return '<div class="card card-pad"><div style="display:flex;gap:12px;align-items:flex-start;">' +
        '<span class="avatar" style="width:44px;height:44px;font-size:14px;">' + N.initials(p.name) + "</span>" +
        '<div style="min-width:0;"><div style="font-weight:700;font-size:14px;">' + N.esc(p.name) + '</div><div class="small muted">' + N.esc(pos) + "</div></div></div>" +
        '<div class="chip-row mt-3">' + (p.adminRole ? '<span class="badge badge-good">' + N.esc(p.adminRole) + "</span>" : "") +
          cls.map(function (c) { return '<span class="badge badge-outline">Class teacher: ' + c + "</span>"; }).join("") + "</div>" +
        '<div class="row-between small mt-3"><span class="muted">TSC No.</span><span class="mono">' + N.esc(p.tsc || "\u2014") + "</span></div>" +
        '<div class="row-between small mt-1"><span class="muted">Phone</span><span class="mono">' + N.esc(p.phone || "\u2014") + "</span></div>" +
        '<div class="row-between small mt-1"><span class="muted">Login</span><span class="mono">' + N.esc(p.username || "none yet") + "</span></div>" +
        '<div class="chip-row mt-3">' + (p.subjects || []).map(function (s) { return '<span class="badge badge-outline">' + N.esc(s) + "</span>"; }).join("") + "</div>" +
        (isHead ? '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px;" data-id="' + p.id + '">' +
          '<button type="button" class="btn btn-outline btn-sm" data-act="edit">Edit</button>' +
          (p.username ? '<button type="button" class="btn btn-outline btn-sm" data-act="reset">Reset password</button>' : '<button type="button" class="btn btn-primary btn-sm" data-act="login">Create login</button>') +
          '<button type="button" class="btn btn-outline btn-sm" data-act="remove">Remove</button></div>' : "") + "</div>";
    }).join("") : '<p class="muted">No staff added yet.' + (isHead ? " Click \u201cAdd staff\u201d to start." : "") + "</p>";
  }

  function staffForm(p) {
    var edit = !!p, locked = edit && p.username;
    var html = "<h2>" + (edit ? "Edit staff member" : "Add staff member") + '</h2><form id="staffForm">' +
      '<div class="field"><label>Full name</label><input required type="text" name="name" value="' + N.esc(edit ? p.name : "") + '" placeholder="e.g. Mrs. Jane Wanjiru Kamau"></div>' +
      '<div class="form-row-2"><div class="field"><label>Position</label><div class="select-wrap"><select name="position"' + (locked ? " disabled" : "") + ">" + posOpts(edit ? p.position : "teacher") + "</select></div></div>" +
      '<div class="field"><label>Administrative role</label><input type="text" name="adminRole" value="' + N.esc(edit ? p.adminRole || "" : "") + '" placeholder="e.g. Curriculum, Boarding, Games"></div></div>' +
      '<div class="form-row-2"><div class="field"><label>TSC number</label><input type="text" name="tsc" value="' + N.esc(edit ? p.tsc || "" : "") + '"></div>' +
      '<div class="field"><label>Phone</label><input type="tel" name="phone" value="' + N.esc(edit ? p.phone || "" : "") + '" placeholder="07XX XXX XXX"></div></div>' +
      '<div class="field"><label>Subjects / learning areas (comma separated)</label><input type="text" name="subjects" value="' + N.esc(edit ? (p.subjects || []).join(", ") : "") + '"></div>' +
      (edit ? "" : '<label style="display:flex;gap:8px;align-items:center;margin-top:8px;"><input type="checkbox" name="makeLogin" checked style="width:auto;"> Create a login for this person</label>' +
        '<div class="field"><label>Username</label><input type="text" name="username" placeholder="e.g. jkamau"></div>') +
      '<p class="small muted mt-2">Class teacher roles are assigned on the Classes page.</p>' +
      '<button type="submit" class="btn btn-primary btn-block mt-2">' + (edit ? "Save changes" : "Save staff member") + "</button></form>";
    var h = S.openDialog(html), f = h.el.querySelector("#staffForm");
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData(f), pos = locked ? p.position : fd.get("position");
      var data = { name: fd.get("name").trim(), position: pos, title: POS[pos], adminRole: fd.get("adminRole").trim(), tsc: fd.get("tsc").trim(), phone: fd.get("phone").trim(),
        subjects: fd.get("subjects").split(",").map(function (x) { return x.trim(); }).filter(Boolean) };
      if (edit) { N.Store.updateStaff(p.id, data); h.close(); S.toast("Staff member updated", data.name); render(); return; }
      var np = N.Store.addStaff(data); h.close(); S.toast("Staff member added", data.name); render();
      if (fd.get("makeLogin")) createLogin(np, (fd.get("username") || suggest(data.name)).trim());
    });
  }

  document.getElementById("staffGrid").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-act]"); if (!b) return;
    var p = N.Store.staffById(b.parentNode.getAttribute("data-id")), act = b.getAttribute("data-act");
    if (!p) return;
    if (act === "edit") staffForm(p);
    else if (act === "login") {
      var u = prompt("Username for " + p.name + " (letters and numbers, at least 3):", suggest(p.name));
      if (u) createLogin(p, u.trim());
    } else if (act === "reset") {
      if (!confirm("Reset the password for " + p.username + "? They will be logged out.")) return;
      api("/api/staff-accounts/reset", { username: p.username }).then(function (r) { if (r.ok) tempDialog(p.username, r.temp); else S.toast("Could not reset", r.error || ""); });
    } else if (act === "remove") {
      if (!confirm("Remove " + p.name + " from the staff list" + (p.username ? " and delete their login" : "") + "?")) return;
      var done = function () { N.Store.removeStaff(p.id); render(); };
      if (p.username) api("/api/staff-accounts/delete", { username: p.username }).then(done); else done();
    }
  });
  var addBtn = document.getElementById("btnAddStaff");
  if (isHead) addBtn.addEventListener("click", function () { staffForm(null); }); else addBtn.style.display = "none";
  render();
})();
