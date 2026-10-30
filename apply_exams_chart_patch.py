"""Run once from the folder that holds reports.js, AFTER apply_photo_patch.py and apply_report_patch.py:
   python apply_exams_chart_patch.py
Adds exam columns (all assessments of the term), a term average, and a performance-history chart to the learner report."""
import shutil, sys
fn = sys.argv[1] if len(sys.argv) > 1 else "reports.js"
s = open(fn, encoding="utf-8").read()
if "teacherFor(" not in s or "photoHtml(" not in s:
    sys.exit("Please run apply_photo_patch.py and apply_report_patch.py first, then run this again.")
shutil.copy(fn, fn + ".bak3")

def rep(old, new):
    global s
    assert s.count(old) == 1, "Could not find (or found twice): " + old[:70]
    s = s.replace(old, new)

HELPERS = r'''  function shortLabel(a) { return String(a.label).replace(/^Term (\d+)\s*/, "T$1 ").replace(/ Assessment$/, ""); }
  function examHeadHtml(d) {
    return d.termAsms.map(function (a) { return '<th style="text-align:center">' + N.esc(shortLabel(a).replace(/^T\d+ /, "")) + "</th>"; }).join("") +
      (d.termAsms.length > 1 ? '<th style="text-align:center">Avg</th>' : "");
  }
  function examInner(r) {
    var sep = '</td><td class="tabular" style="text-align:center">';
    return r.exams.map(function (m) { return m == null ? "&mdash;" : m; }).join(sep) +
      (r.exams.length > 1 ? sep + "<strong>" + (r.termAvg == null ? "&mdash;" : r.termAvg.toFixed(0)) + "</strong>" : "");
  }
  function historyHtml(d) {
    var h = d.history, n = h.length;
    if (n < 2) return "";
    var W = 520, H = 150, L = 30, R = 14, T = 14, B = 30;
    var x = function (i) { return L + i * (W - L - R) / (n - 1); };
    var y = function (v) { return T + (100 - v) * (H - T - B) / 100; };
    var g = [0, 20, 40, 60, 80, 100].map(function (v) {
      return '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="#e1e6e3"/><text x="' + (L - 5) + '" y="' + (y(v) + 3) + '" font-size="8" fill="#8a938e" text-anchor="end">' + v + "</text>";
    }).join("");
    var pts = h.map(function (p, i) { return x(i) + "," + y(p.avg); }).join(" ");
    var dots = h.map(function (p, i) {
      return '<circle cx="' + x(i) + '" cy="' + y(p.avg) + '" r="3" fill="#2f6b4a"/><text x="' + x(i) + '" y="' + (y(p.avg) - 7) + '" font-size="9" fill="#333" text-anchor="middle">' + p.avg.toFixed(0) + '</text><text x="' + x(i) + '" y="' + (H - 10) + '" font-size="9" fill="#666" text-anchor="middle">' + N.esc(p.label) + "</text>";
    }).join("");
    return '<h3 class="rp-h3">Performance history</h3><div class="report-scroll"><svg viewBox="0 0 ' + W + " " + H + '" style="width:100%;min-width:360px;max-width:560px;height:auto" role="img" aria-label="Average score by assessment">' + g + '<polyline points="' + pts + '" fill="none" stroke="#2f6b4a" stroke-width="2"/>' + dots + "</svg></div>";
  }
  function pdfHistory(doc, y, h) {
    var m = doc.margin, n = h.length, ht = 80, left = m + 26, right = doc.pageW - m - 12;
    doc.text(m, y, "Performance history (average score)", { size: 11.5, bold: true, color: PDFDoc.COLORS.primary });
    var yt = y - 22, yb = yt - ht;
    var X = function (i) { return left + i * (right - left) / (n - 1); };
    var Y = function (v) { return yb + v * ht / 100; };
    [0, 20, 40, 60, 80, 100].forEach(function (v) {
      doc.line(left, Y(v), right, Y(v), { color: PDFDoc.COLORS.line, width: 0.4 });
      doc.text(left - 4, Y(v) - 2, String(v), { size: 6.5, color: PDFDoc.COLORS.faint, align: "right" });
    });
    for (var i = 0; i < n - 1; i++) doc.line(X(i), Y(h[i].avg), X(i + 1), Y(h[i + 1].avg), { color: PDFDoc.COLORS.primary, width: 1.5 });
    h.forEach(function (p, i) {
      doc.rect(X(i) - 2, Y(p.avg) - 2, 4, 4, { fill: PDFDoc.COLORS.primary });
      doc.text(X(i), Y(p.avg) + 5, p.avg.toFixed(0), { size: 7, align: "center" });
      doc.text(X(i), yb - 11, p.label, { size: 6.8, color: PDFDoc.COLORS.soft, align: "center" });
    });
    return yb - 28;
  }
'''
PDFCOLS = r'''var nEx = d.termAsms.length + (d.termAsms.length > 1 ? 1 : 0), cols = [{ x: m, w: 112 }], cx = m + 112;
    for (var ci = 0; ci < nEx; ci++) { cols.push({ x: cx, w: 34 }); cx += 34; }
    cols.push({ x: cx, w: 32 }); cx += 32;
    cols.push({ x: cx, w: 84 }); cx += 84;
    cols.push({ x: cx, w: doc.pageW - m - cx });
    var LV = nEx + 1, TC = nEx + 2, RC = nEx + 3;'''
PDFHEAD = r'''["Learning area"].concat(d.termAsms.map(function (a) { return shortLabel(a).replace(/^T\d+ /, ""); })).concat(d.termAsms.length > 1 ? ["Avg"] : []).concat(["Level", "Teacher", "Remark"]).forEach(function (t, i) { var mid = i >= 1 && i <= LV; doc.text(cols[i].x + (mid ? cols[i].w / 2 : 0), y, t, { size: 7.2, bold: true, color: PDFDoc.COLORS.soft, align: mid ? "center" : "left" }); });'''
PDFEX = r'''r.exams.forEach(function (mk, k) { doc.text(cols[1 + k].x + cols[1 + k].w / 2, y, mk == null ? "-" : String(mk), { size: 9, align: "center" }); });
      if (r.exams.length > 1) { var ta = cols[1 + r.exams.length]; doc.text(ta.x + ta.w / 2, y, r.termAvg == null ? "-" : r.termAvg.toFixed(0), { size: 9, bold: true, align: "center" }); }'''

rep('function learnerReportData(studentId, assessmentId) {', HELPERS + '  function learnerReportData(studentId, assessmentId) {')
rep('var subs = N.studentSubjects(st);', 'var subs = N.studentSubjects(st);\n    var termAsms = N.ASSESSMENTS.filter(function (a) { return a.term === asm.term; });')
rep('return { subject: s.name, teacher: teacherFor(st, s.id), mark: mark, code: code,',
    'var exams = termAsms.map(function (a) { return N.Store.scoreOf(a.id, st.id, s.id); });\n      return { subject: s.name, teacher: teacherFor(st, s.id), exams: exams, termAvg: N.averageMark(exams), mark: mark, code: code,')
rep('var standing = classStanding(st, assessmentId);',
    'var standing = classStanding(st, assessmentId);\n    var history = N.ASSESSMENTS.map(function (a) { return { label: shortLabel(a), avg: N.studentAverage(st, a.id) }; }).filter(function (p) { return p.avg != null; });')
rep('competencies: competencies, standing: standing,', 'competencies: competencies, standing: standing, termAsms: termAsms, history: history,')
# preview
rep('<th style="text-align:center">Score</th><th style="text-align:center">Level</th><th>Teacher</th>',
    '\' + examHeadHtml(d) + \'<th style="text-align:center">Level</th><th>Teacher</th>')
rep('(r.mark == null ? "&mdash;" : r.mark) +', 'examInner(r) +')
rep('standingHtml(d) + learnerNote()', 'standingHtml(d) + historyHtml(d) + learnerNote()')
# PDF
rep('var cols = [{ x: m, w: 118 }, { x: m + 118, w: 36 }, { x: m + 154, w: 34 }, { x: m + 194, w: 92 }, { x: m + 286, w: doc.pageW - m - (m + 286) }];', PDFCOLS)
rep('["Learning area", "Score", "Level", "Teacher", "Remark"].forEach(function (t, i) { var mid = i === 1 || i === 2; doc.text(cols[i].x + (mid ? cols[i].w / 2 : 0), y, t, { size: 7.5, bold: true, color: PDFDoc.COLORS.soft, align: mid ? "center" : "left" }); });', PDFHEAD)
rep('var lines = doc.wrap(r.remark, cols[4].w - 4, 7.8);', 'var lines = doc.wrap(r.remark, cols[RC].w - 4, 7.8);')
rep('doc.text(cols[1].x + cols[1].w / 2, y, r.mark == null ? "-" : String(r.mark), { size: 9, align: "center" });', PDFEX)
rep('doc.text(cols[2].x + cols[2].w / 2, y, r.code || "-",', 'doc.text(cols[LV].x + cols[LV].w / 2, y, r.code || "-",')
rep('doc.text(cols[3].x, y, String(r.teacher || "-").slice(0, 22),', 'doc.text(cols[TC].x, y, String(r.teacher || "-").slice(0, 22),')
rep('doc.text(cols[4].x, y - i * 9.5, ln,', 'doc.text(cols[RC].x, y - i * 9.5, ln,')
rep('if (y < 210) y = newPageWithHeader(doc, "Learner Progress Report");',
    'if (d.history.length > 1) {\n      if (y < 190) y = newPageWithHeader(doc, "Learner Progress Report");\n      y = pdfHistory(doc, y - 8, d.history);\n    }\n    if (y < 210) y = newPageWithHeader(doc, "Learner Progress Report");')
open(fn, "w", encoding="utf-8").write(s)
print("Done. Old file saved as " + fn + ".bak3")
