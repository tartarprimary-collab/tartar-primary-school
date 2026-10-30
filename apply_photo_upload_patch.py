classmethod"""Run once on the assessment page script (the file that starts with N.Store.init();), after apply_photo_patch.py:
   python apply_photo_upload_patch.py <that-file.js>
Adds an Add/Change photo button beside the learner picker on the Learner report (head of institution and admin only)."""
import shutil, sys
if len(sys.argv) < 2: sys.exit("Usage: python apply_photo_upload_patch.py <assessment page script.js>")
fn = sys.argv[1]
s = open(fn, encoding="utf-8").read()
shutil.copy(fn, fn + ".bak")
def rep(old, new):
    global s
    assert s.count(old) == 1, "Could not find (or found twice): " + old[:70]
    s = s.replace(old, new)
rep('''if (!pool.length) html += '<p class="empty-note" style="margin:0 4px;">No learners in this group.</p>';''',
'''if (!pool.length) html += '<p class="empty-note" style="margin:0 4px;">No learners in this group.</p>';
      if (pool.length && ["admin", "principal"].indexOf((N.Store.me || {}).role) > -1) html += '<label style="display:inline-flex;align-items:center;padding:0 12px;height:36px;border:1px solid #cfd6d2;border-radius:8px;cursor:pointer;font-size:13px;">' + ((N.Store.student(effStudent) || {}).photo ? "Change photo" : "Add photo") + '<input type="file" id="rPhoto" accept="image/jpeg,image/png" style="display:none"></label>';''')
rep('''wire("rScopeClass", function (v) { reportState.scopeClassId = v; renderReportPreview(); });''',
'''wire("rScopeClass", function (v) { reportState.scopeClassId = v; renderReportPreview(); });
    var ph = document.getElementById("rPhoto");
    if (ph) ph.addEventListener("change", function () {
      var f = ph.files && ph.files[0], sid = reportState.studentId;
      if (!f || !sid) return;
      R.photoFromFile(f).then(function (url) {
        N.Store.updateStudent(sid, { photo: url });
        S.toast("Photo saved", (N.Store.student(sid) || {}).name || "");
        renderReportControls(); renderReportPreview();
      }).catch(function (e) { S.toast("Photo not added", e.message || "Please try another picture."); });
    });''')
open(fn, "w", encoding="utf-8").write(s)
print("Done. Old file saved as " + fn + ".bak")
