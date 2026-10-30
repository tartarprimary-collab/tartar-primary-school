/*!
 * pdfkit-mini — a minimal, dependency-free PDF writer.
 * Produces real PDF 1.4 byte-streams (objects + xref + trailer) using the
 * built-in Helvetica / Helvetica-Bold core fonts, entirely client-side, with
 * no network access required. Text is real & selectable (not a rasterised
 * screenshot). Intentionally scoped to what a tabular/text report needs:
 * positioned text, rules, filled rectangles and simple table rows.
 */
(function (global) {
  "use strict";

  // Helvetica width table, 1000-unit em, for char codes 32..126.
  var W_REG = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,
    556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,
    1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,
    667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,
    333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,
    556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
  var W_BOLD = W_REG.map(function (w) { return Math.round(w * 1.07); });

  function sanitize(s) {
    s = String(s == null ? "" : s);
    s = s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
         .replace(/[\u2013\u2014]/g, "-").replace(/\u2026/g, "...")
         .replace(/\u00a0/g, " ");
    var out = "";
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c === 10) { out += "\n"; }
      else if (c >= 32 && c <= 126) { out += s[i]; }
      else if (c === 9) { out += " "; }
      // else: drop silently (kept content is plain-ASCII by construction)
    }
    return out;
  }
  function escStr(s) { return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)"); }
  function fnum(n) { return (Math.round(n * 100) / 100).toString(); }
  function pad10(n) { var s = String(Math.max(0, Math.floor(n))); while (s.length < 10) s = "0" + s; return s; }

  function textWidth(str, size, bold) {
    str = sanitize(str);
    var table = bold ? W_BOLD : W_REG;
    var w = 0;
    for (var i = 0; i < str.length; i++) {
      var idx = str.charCodeAt(i) - 32;
      w += (idx >= 0 && idx < table.length) ? table[idx] : 556;
    }
    return w / 1000 * size;
  }
  function wrap(str, maxWidth, size, bold) {
    str = sanitize(str);
    var lines = [];
    str.split("\n").forEach(function (para) {
      var words = para.split(" ");
      var cur = "";
      words.forEach(function (word) {
        var test = cur ? cur + " " + word : word;
        if (!cur || textWidth(test, size, bold) <= maxWidth) { cur = test; }
        else { lines.push(cur); cur = word; }
      });
      lines.push(cur);
    });
    return lines;
  }

  var C = {
    ink: [0.149, 0.200, 0.173], soft: [0.290, 0.357, 0.318], faint: [0.478, 0.514, 0.486],
    primary: [0.184, 0.420, 0.290], gold: [0.851, 0.706, 0.290], good: [0.173, 0.478, 0.294],
    bad: [0.651, 0.251, 0.165], line: [0.886, 0.847, 0.745], white: [1, 1, 1],
    tableHead: [0.945, 0.929, 0.878], tableAlt: [0.976, 0.965, 0.925],
  };

  function PDFDoc(opts) {
    opts = opts || {};
    this.pageW = opts.pageW || 595.28;
    this.pageH = opts.pageH || 841.89;
    this.margin = opts.margin != null ? opts.margin : 40;
    this.objs = [];
    this.pages = [];
    this.fontRegNum = null;
    this.fontBoldNum = null;
    this.xObjects = {};
    this.graphicsStates = {};
    this.imageSerial = 0;
    this.graphicsStateSerial = 0;
    this._ensureFonts();
    this.newPage();
  }
  PDFDoc.COLORS = C;
  PDFDoc.prototype.textWidth = textWidth;
  PDFDoc.prototype.wrap = wrap;

  PDFDoc.prototype._addObj = function (body) { this.objs.push(body); return this.objs.length; };
  PDFDoc.prototype._ensureFonts = function () {
    if (this.fontRegNum) return;
    this.fontRegNum = this._addObj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    this.fontBoldNum = this._addObj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  };
  PDFDoc.prototype.addPngImage = function (source) {
    var bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
    function readUint32(offset) {
      return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
    }
    if (bytes.length < 33 || bytes[0] !== 137 || bytes[1] !== 80 || bytes[2] !== 78 || bytes[3] !== 71 ||
        bytes[4] !== 13 || bytes[5] !== 10 || bytes[6] !== 26 || bytes[7] !== 10) {
      throw new Error("The school crest is not a valid PNG image.");
    }
    var width = readUint32(16), height = readUint32(20);
    if (!width || !height || bytes[24] !== 8 || bytes[25] !== 2 || bytes[26] !== 0 || bytes[27] !== 0 || bytes[28] !== 0) {
      throw new Error("The school crest PNG format is not supported.");
    }
    var chunks = [], offset = 8, ended = false;
    while (offset + 12 <= bytes.length) {
      var length = readUint32(offset), type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
      var start = offset + 8, end = start + length;
      if (end + 4 > bytes.length) throw new Error("The school crest PNG is incomplete.");
      if (type === "IDAT") {
        var chunk = "";
        for (var i = start; i < end; i += 8192) {
          chunk += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + 8192, end)));
        }
        chunks.push(chunk);
      }
      offset = end + 4;
      if (type === "IEND") { ended = true; break; }
    }
    if (!ended || !chunks.length) throw new Error("The school crest PNG has no image data.");
    var compressed = chunks.join("");
    var imageBody = "<< /Type /XObject /Subtype /Image /Width " + width + " /Height " + height +
      " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns " + width +
      " >> /Length " + compressed.length + " >>\nstream\n" + compressed + "\nendstream";
    this.imageSerial += 1;
    var name = "Im" + this.imageSerial;
    this.xObjects[name] = this._addObj(imageBody);
    return name;
  };
  PDFDoc.prototype.image = function (name, x, y, w, h, opacity) {
    if (!this.xObjects[name]) throw new Error("The PDF image has not been added.");
    var graphicsState = "";
    if (opacity != null && opacity < 1) {
      opacity = Math.max(0, Math.min(1, Number(opacity)));
      var stateKey = String(opacity);
      if (!this.graphicsStates[stateKey]) {
        this.graphicsStateSerial += 1;
        var stateName = "GS" + this.graphicsStateSerial;
        this.graphicsStates[stateKey] = {
          name: stateName,
          object: this._addObj("<< /Type /ExtGState /ca " + fnum(opacity) + " /CA " + fnum(opacity) + " >>"),
        };
      }
      graphicsState = "/" + this.graphicsStates[stateKey].name + " gs ";
    }
    this._append("q " + graphicsState + fnum(w) + " 0 0 " + fnum(h) + " " + fnum(x) + " " + fnum(y) + " cm /" + name + " Do Q\n");
  };
  PDFDoc.prototype.newPage = function () {
    var page = { stream: "" };
    this.pages.push(page);
    this.cur = page;
    return page;
  };
  PDFDoc.prototype._append = function (s) { this.cur.stream += s; };
  PDFDoc.prototype._col = function (rgb, op) {
    this._append(rgb[0].toFixed(3) + " " + rgb[1].toFixed(3) + " " + rgb[2].toFixed(3) + " " + op + "\n");
  };

  // Draw text with its baseline at (x, y). align: left | center | right.
  PDFDoc.prototype.text = function (x, y, str, opts) {
    opts = opts || {};
    var size = opts.size || 10, bold = !!opts.bold, color = opts.color || C.ink, align = opts.align || "left";
    str = sanitize(str);
    if (!str) return 0;
    var w = textWidth(str, size, bold);
    var xx = x; if (align === "right") xx = x - w; else if (align === "center") xx = x - w / 2;
    this._col(color, "rg");
    this._append("BT /" + (bold ? "F2" : "F1") + " " + fnum(size) + " Tf " + fnum(xx) + " " + fnum(y) + " Td (" + escStr(str) + ") Tj ET\n");
    return w;
  };
  // Draw a wrapped block starting at (x,y), returns the y after the last line.
  PDFDoc.prototype.block = function (x, y, str, maxWidth, opts) {
    opts = opts || {};
    var size = opts.size || 10, lh = opts.lineHeight || size * 1.42;
    var lines = wrap(str, maxWidth, size, !!opts.bold);
    var yy = y;
    for (var i = 0; i < lines.length; i++) {
      this.text(x, yy, lines[i], opts);
      yy -= lh;
    }
    return yy;
  };
  PDFDoc.prototype.line = function (x1, y1, x2, y2, opts) {
    opts = opts || {};
    this._append((opts.width || 0.75).toFixed(2) + " w\n");
    this._col(opts.color || C.line, "RG");
    if (opts.dash) this._append("[" + opts.dash.join(" ") + "] 0 d\n"); else this._append("[] 0 d\n");
    this._append(fnum(x1) + " " + fnum(y1) + " m " + fnum(x2) + " " + fnum(y2) + " l S\n");
  };
  PDFDoc.prototype.rect = function (x, y, w, h, opts) {
    opts = opts || {};
    // Fill and stroke are emitted as two independent, unambiguous paint ops
    // (re f / re S) rather than combined into a single PDF operator — simpler
    // and avoids any risk of emitting an invalid operator token.
    if (opts.fill) {
      this._col(opts.fill, "rg");
      this._append(fnum(x) + " " + fnum(y) + " " + fnum(w) + " " + fnum(h) + " re f\n");
    }
    if (opts.stroke) {
      this._col(opts.stroke, "RG");
      this._append((opts.lineWidth || 0.75).toFixed(2) + " w\n");
      this._append(fnum(x) + " " + fnum(y) + " " + fnum(w) + " " + fnum(h) + " re S\n");
    }
  };
  // A single row of pre-positioned cells: [{x, w, text, align, bold, size, color}]
  PDFDoc.prototype.row = function (y, cells) {
    var self = this;
    cells.forEach(function (c) {
      var w = c.w || 100, align = c.align || "left";
      var tx = align === "right" ? c.x + w : align === "center" ? c.x + w / 2 : c.x;
      self.text(tx, y, c.text, { size: c.size || 9, bold: c.bold, color: c.color, align: align });
    });
  };

  PDFDoc.prototype._bytes = function () {
    var pagesNum = this._addObj("__PAGES__");
    var pageObjNums = [];
    var self = this;
    this.pages.forEach(function (pg) {
      var contentBody = "<< /Length " + pg.stream.length + " >>\nstream\n" + pg.stream + "\nendstream";
      var contentNum = self._addObj(contentBody);
      var xObjectResources = Object.keys(self.xObjects).length
        ? "/XObject << " + Object.keys(self.xObjects).map(function (name) { return "/" + name + " " + self.xObjects[name] + " 0 R"; }).join(" ") + " >> "
        : "";
      var graphicsStateResources = Object.keys(self.graphicsStates).length
        ? "/ExtGState << " + Object.keys(self.graphicsStates).map(function (key) {
          var state = self.graphicsStates[key];
          return "/" + state.name + " " + state.object + " 0 R";
        }).join(" ") + " >> "
        : "";
      var pageBody = "<< /Type /Page /Parent " + pagesNum + " 0 R /Resources << /Font << /F1 " +
        self.fontRegNum + " 0 R /F2 " + self.fontBoldNum + " 0 R >> " + xObjectResources + graphicsStateResources + ">> /MediaBox [0 0 " +
        fnum(self.pageW) + " " + fnum(self.pageH) + "] /Contents " + contentNum + " 0 R >>";
      pageObjNums.push(self._addObj(pageBody));
    });
    this.objs[pagesNum - 1] = "<< /Type /Pages /Kids [" + pageObjNums.map(function (n) { return n + " 0 R"; }).join(" ") + "] /Count " + pageObjNums.length + " >>";
    var catalogNum = this._addObj("<< /Type /Catalog /Pages " + pagesNum + " 0 R >>");

    var head = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
    var out = [head];
    var offsets = [];
    var pos = head.length;
    for (var i = 0; i < this.objs.length; i++) {
      offsets.push(pos);
      var s = (i + 1) + " 0 obj\n" + this.objs[i] + "\nendobj\n";
      out.push(s);
      pos += s.length;
    }
    var xrefStart = pos;
    var xref = "xref\n0 " + (this.objs.length + 1) + "\n0000000000 65535 f \n";
    for (var j = 0; j < this.objs.length; j++) xref += pad10(offsets[j]) + " 00000 n \n";
    out.push(xref);
    out.push("trailer\n<< /Size " + (this.objs.length + 1) + " /Root " + catalogNum + " 0 R >>\nstartxref\n" + xrefStart + "\n%%EOF");
    return out.join("");
  };
  PDFDoc.prototype.blob = function () {
    var byteStr = this._bytes();
    var buf = new Uint8Array(byteStr.length);
    for (var i = 0; i < byteStr.length; i++) buf[i] = byteStr.charCodeAt(i) & 0xff;
    return new Blob([buf], { type: "application/pdf" });
  };
  PDFDoc.prototype.file = function (filename) {
    return new File([this.blob()], filename, { type: "application/pdf" });
  };
  PDFDoc.prototype.dataUri = function () {
    return "data:application/pdf;base64," + btoa(this._bytes());
  };
  PDFDoc.prototype.save = function (filename) {
    var url = URL.createObjectURL(this.blob());
    var a = document.createElement("a");
    a.href = url; a.download = filename || "report.pdf";
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 400);
  };

  global.PDFDoc = PDFDoc;
})(window);
