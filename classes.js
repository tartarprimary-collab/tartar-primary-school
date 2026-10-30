(function () {
  "use strict";
  var N = window.Tartar, S = window.Shell, R = window.Reports;
  N.Store.init();
  var me = N.Store.me || {}, role = me.role || "admin", isHead = role === "admin" || role === "principal";
  function mine(c) { return !!me.staffId && c.teacherId === me.staffId; }
  function boarders(ls) { return ls.filter(function (s) { return s.boarding === "Boarding"; }).length; }
  function staffOptions(sel) {
    return '<option value="">No class teacher yet</option>' + N.Store.state.staff.map(function (t) {
      return '<option value="' + t.id + '"' + (t.id === sel ? " selected" : "") + ">" + N.esc(t.name) + "</option>";
    }).join("");
  }

  function render() {
    var list = N.Store.state.classes.slice().sort(function (a, b) { return a.grade - b.grade || a.stream.localeCompare(b.stream); });
    document.getElementById("classBody").innerHTML = list.map(function (c) {
      var t = N.Store.staffById(c.teacherId), ls = N.Store.learnersIn(c.id), b = boarders(ls), id = ' data-id="' + c.id + '"';
      var acts = "";
      if (isHead || mine(c)) acts += '<button type="button" class="btn btn-outline btn-sm" data-act="stream"' + id + ">" + (c.stream ? "Rename stream" : "Name stream") + "</button> ";
      if (isHead) acts += '<button type="button" class="btn btn-outline btn-sm" data-act="teacher"' + id + ">Class teacher</button> " +
        '<button type="button" class="btn btn-outline btn-sm" data-act="delete"' + id + ">Delete</button> ";
      acts += '<button type="button" class="btn btn-primary btn-sm" data-act="pdf"' + id + ">Class list (PDF)</button> " +
        '<button type="button" class="btn btn-outline btn-sm" data-act="print"' + id + ">Print</button>";
      return "<tr><td><b>" + N.esc(N.Store.classLabel(c)) + "</b></td><td>" + N.SECTIONS[N.sectionOf(c.grade)] + "</td><td>" +
        (t ? N.esc(t.name) : '<span class="muted">No class teacher yet</span>') + "</td><td>" + ls.length +
        (b ? ' <span class="small muted">(' + b + " boarding)</span>" : "") + '</td><td style="white-space:nowrap;">' + acts + "</td></tr>";
    }).join("") || '<tr><td colspan="5" class="empty-note">' + (isHead ? "No classes yet. Click “Create class” to assign a class teacher to a grade." : "No classes have been created yet.") + "</td></tr>";
  }

  function simpleDialog(title, bodyHtml, onSubmit) {
    var h = S.openDialog("<h2>" + title + '</h2><form id="dlgForm">' + bodyHtml + '<button type="submit" class="btn btn-primary btn-block mt-2">Save</button></form>');
    var f = h.el.querySelector("#dlgForm");
    f.addEventListener("submit", function (e) { e.preventDefault(); onSubmit(new FormData(f), h); });
  }

  document.getElementById("classBody").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-act]"); if (!b) return;
    var c = N.Store.classOf(b.getAttribute("data-id")), act = b.getAttribute("data-act");
    if (!c) return;
    if (act === "stream") {
      simpleDialog("Name the stream for " + N.esc(N.gradeLabel(c.grade)), '<div class="field"><label>Stream name</label><input required type="text" name="stream" value="' + N.esc(c.stream) + '" placeholder="e.g. East"></div>',
        function (fd, h) { N.Store.setStream(c.id, fd.get("stream")); h.close(); S.toast("Stream saved", N.Store.classLabel(N.Store.classOf(c.id))); render(); });
    } else if (act === "teacher") {
      simpleDialog("Class teacher: " + N.esc(N.Store.classLabel(c)), '<div class="field"><label>Class teacher</label><div class="select-wrap"><select name="teacher">' + staffOptions(c.teacherId) + "</select></div></div>",
        function (fd, h) { N.Store.setClassTeacher(c.id, fd.get("teacher")); h.close(); S.toast("Class teacher saved", ""); render(); });
    } else if (act === "delete") {
      if (!confirm("Delete " + N.Store.classLabel(c) + "?")) return;
      if (!N.Store.removeClass(c.id)) S.toast("Class has learners", "Move the learners to another class first."); else render();
    } else {
      R.withCrest(function () {
        var d = R.classlist.data(c.id), doc = R.classlist.pdf(d);
        if (act === "pdf") { doc.save(R.classlist.filename(d)); S.toast("PDF downloaded", R.classlist.filename(d)); } else R.openPdfTab(doc);
      });
    }
  });

  var add = document.getElementById("btnAddClass");
  if (isHead) {
    add.hidden = false;
    add.addEventListener("click", function () {
      simpleDialog("Create a class",
        '<div class="field"><label>Grade</label><div class="select-wrap"><select name="grade">' + N.GRADES.map(function (g) { return '<option value="' + g + '">' + N.gradeLabel(g) + "</option>"; }).join("") + "</select></div></div>" +
        '<div class="field"><label>Class teacher</label><div class="select-wrap"><select name="teacher">' + staffOptions("") + "</select></div></div>" +
        '<div class="field"><label>Stream name (optional, the class teacher can fill this in)</label><input type="text" name="stream" placeholder="e.g. East"></div>',
        function (fd, h) { N.Store.addClass({ grade: Number(fd.get("grade")), teacherId: fd.get("teacher"), stream: fd.get("stream") }); h.close(); S.toast("Class created", ""); render(); });
    });
  }
  render();
})();
