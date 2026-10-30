/*!
 * Tartar School — data layer for the school's CBC assessment system.
 * Grounded in the actual 2026 Competency-Based Curriculum: 2-6-3-3-3 structure,
 * KICD's four-band achievement rubric, real 2026 capitation rates, and the
 * 2026 MoE academic calendar.
 */
(function (global) {
  "use strict";

  // ---------------------------------------------------------------------
  // Deterministic randomness. hash() turns a string into a 32-bit seed;
  // mulberry32() turns that seed into a small, well-mixed PRNG so a single
  // seed can safely produce several independent-looking draws (gender,
  // name, ability, ...) without the clustering you get from re-hashing
  // near-identical short strings ("key"+"a", "key"+"b", ...).
  // ---------------------------------------------------------------------
  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h >>> 0;
  }
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rngFor(key) { return mulberry32(hash(key)); }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  // ---------------------------------------------------------------------
  // School meta
  // ---------------------------------------------------------------------
  var SCHOOL = {
    name: "Tartar School",
    short: "Tartar",
    motto: "Toil for Excellence",
    est: 1943,
    // Fill these in with your real details (blank lines are simply left out of reports):
    county: "",
    subcounty: "",
    address: "",
    code: "24505103",
    knecCentre: "",
    phone: "",
    email: "tartarprimary@gmail.com",
    year: 2026,
    term: 3,
    termLabel: "Term 3 · 2026",
    termOpened: "2026-08-24",
    termCloses: "2026-10-23",
    nextTermOpens: "2027-01-05",
    today: new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10), // East Africa Time
    kjseaStart: "2026-10-26",
    principal: "Principal",
    dpJunior: "",
    dpSenior: "",
    bursarName: "Bursar",
    established: 1943,
    transitioned: 1943,
    boardChair: "",
    sponsor: "",
    category: "",
  };

  // ---------------------------------------------------------------------
  // Curriculum: CBC. Tartar School runs Pre-Primary (PP1-PP2), Primary
  // (Grades 1-6) and Junior School (Grades 7-9). Learning areas follow the
  // KICD rationalisation: 5 (PP), 7 (Grades 1-3), 8 (Grades 4-6), 9 (Grades 7-9).
  // Grades are stored as numbers: PP1 = -2, PP2 = -1, Grade 1..9 = 1..9.
  // ---------------------------------------------------------------------
  var GRADES = [-2, -1, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  var SECTIONS = { pp: "Pre-Primary", primary: "Primary", junior: "Junior School" };
  function gradeLabel(g) { return g < 0 ? "PP" + (g + 3) : "Grade " + g; }
  function sectionOf(g) { return g < 0 ? "pp" : g <= 6 ? "primary" : "junior"; }

  var SUBJECTS_PP = [
    { id: "lan", name: "Language Activities" },
    { id: "mat", name: "Mathematical Activities" },
    { id: "env", name: "Environmental Activities" },
    { id: "pcr", name: "Psychomotor and Creative Activities" },
    { id: "rea", name: "Religious Education Activities" },
  ];
  var SUBJECTS_LP = [
    { id: "ind", name: "Indigenous Language Activities" },
    { id: "kis", name: "Kiswahili Language Activities" },
    { id: "eng", name: "English Language Activities" },
    { id: "mat", name: "Mathematical Activities" },
    { id: "rea", name: "Religious Education Activities" },
    { id: "env", name: "Environmental Activities" },
    { id: "cre", name: "Creative Activities" },
  ];
  var SUBJECTS_UP = [
    { id: "eng", name: "English" },
    { id: "kis", name: "Kiswahili" },
    { id: "mat", name: "Mathematics" },
    { id: "re", name: "Religious Education" },
    { id: "sci", name: "Science and Technology" },
    { id: "agn", name: "Agriculture and Nutrition" },
    { id: "sst", name: "Social Studies" },
    { id: "cra", name: "Creative Arts" },
  ];
  var SUBJECTS_JSS = [
    { id: "eng", name: "English" },
    { id: "kis", name: "Kiswahili" },
    { id: "mat", name: "Mathematics" },
    { id: "isc", name: "Integrated Science" },
    { id: "sst", name: "Social Studies" },
    { id: "re", name: "Religious Education" },
    { id: "pts", name: "Pre-Technical Studies" },
    { id: "agn", name: "Agriculture and Nutrition" },
    { id: "cas", name: "Creative Arts and Sports" },
  ];

  var CORE_COMPETENCIES = [
    "Communication and Collaboration",
    "Critical Thinking and Problem Solving",
    "Creativity and Imagination",
    "Citizenship",
    "Digital Literacy",
    "Learning to Learn",
    "Self-Efficacy",
  ];

  function subjectsFor(grade) {
    return (grade < 0 ? SUBJECTS_PP : grade <= 3 ? SUBJECTS_LP : grade <= 6 ? SUBJECTS_UP : SUBJECTS_JSS).slice();
  }
  // Streams are created by the head of institution when a class teacher is assigned,
  // and named by that class teacher.
  function groupsFor(grade) {
    var seen = {};
    return ((Store.state && Store.state.classes) || []).filter(function (c) {
      return c.grade === grade && c.stream && !seen[c.stream] && (seen[c.stream] = 1);
    }).map(function (c) { return c.stream; });
  }
  function groupLabel() { return "Stream"; }

  var DEFAULT_PROFILE = {
    about: "", vision: "", mission: "", values: "", principalName: "", principalMessage: "",
    address: "", poBox: "169-30600 KAPENGURIA", county: "", phone: "", phone2: "", email: "tartarprimary@gmail.com", email2: "tartarprimary26@gmail.com", website: "",
    hours: "Monday to Friday, 7:30 am to 4:30 pm", mapLink: "", facebook: "", admissions: "",
  };

  // ---------------------------------------------------------------------
  // Achievement rubric — KICD's standard four-band descriptors, used on
  // every internal / termly report in this app.
  //   EE 80–100 · ME 50–79 · AE 30–49 · BE 0–29
  // KNEC's newer eight-point scale (EE1..BE2) is specific to the KJSEA
  // national exam sat only at the end of Grade 9 — see kjseaLevel() below,
  // referenced only where KJSEA itself is discussed.
  // ---------------------------------------------------------------------
  var BANDS = [
    { code: "EE", label: "Exceeding Expectation", lo: 80, hi: 100,
      desc: "Demonstrates the knowledge and skills beyond the level descriptors and applies them independently in new contexts." },
    { code: "ME", label: "Meeting Expectation", lo: 50, hi: 79,
      desc: "Has acquired the competencies at the expected level and applies them consistently in familiar contexts." },
    { code: "AE", label: "Approaching Expectation", lo: 30, hi: 49,
      desc: "Is working towards the level descriptors; shows partial mastery and needs continued guidance." },
    { code: "BE", label: "Below Expectation", lo: 0, hi: 29,
      desc: "Has not yet met the baseline competency; requires targeted support and remediation." },
  ];

  function band(mark) {
    if (mark == null || isNaN(mark)) return null;
    for (var i = 0; i < BANDS.length; i++) {
      if (mark >= BANDS[i].lo && mark <= BANDS[i].hi) return BANDS[i];
    }
    return BANDS[BANDS.length - 1];
  }
  function bandCode(mark) { var b = band(mark); return b ? b.code : "—"; }
  function bandTone(code) {
    return code === "EE" ? "ee" : code === "ME" ? "me" : code === "AE" ? "ae" : code === "BE" ? "be" : "none";
  }
  function bandRemark(code, subjectName) {
    var s = subjectName || "this learning area";
    switch (code) {
      case "EE": return "Exceeds expectations in " + s + " — ready for extension work.";
      case "ME": return "Meets expectations in " + s + " — consistent grasp of the competencies.";
      case "AE": return "Approaching expectations in " + s + " — needs continued guided practice.";
      case "BE": return "Below expectations in " + s + " — requires targeted remedial support.";
      default: return "Not yet assessed in " + s + ".";
    }
  }
  // KNEC's 8-point KJSEA-only scale (percentage bands), quoted where the
  // national Grade 9 exam is discussed specifically.
  var KJSEA_SCALE = [
    { code: "EE1", lo: 90, hi: 100, level: 8 }, { code: "EE2", lo: 75, hi: 89, level: 7 },
    { code: "ME1", lo: 58, hi: 74, level: 6 }, { code: "ME2", lo: 41, hi: 57, level: 5 },
    { code: "AE1", lo: 31, hi: 40, level: 4 }, { code: "AE2", lo: 21, hi: 30, level: 3 },
    { code: "BE1", lo: 11, hi: 20, level: 2 }, { code: "BE2", lo: 1, hi: 10, level: 1 },
  ];
  function kjseaLevel(mark) {
    for (var i = 0; i < KJSEA_SCALE.length; i++) { var b = KJSEA_SCALE[i]; if (mark >= b.lo && mark <= b.hi) return b; }
    return KJSEA_SCALE[KJSEA_SCALE.length - 1];
  }

  // ---------------------------------------------------------------------
  // Finance: government capitation per learner per year. Junior School KSh 15,042;
  // Primary KSh 1,420 (an increase has been announced for 2026/27: update here when
  // it takes effect). Pre-Primary has no national capitation. "receivedPct" is the
  // share of the entitlement received so far; it starts at 0 for a new school.
  // ---------------------------------------------------------------------
  var FUNDING = {
    jss: { label: "Junior School (Grades 7\u20139)", annualCapitation: 15042, receivedPct: 0 },
    pri: { label: "Primary (Grades 1\u20136)", annualCapitation: 1420, receivedPct: 0 },
    boardingCluster1: 53554,
    boardingCluster2: 40535,
    boardingClusterUsed: 40535,
    splitByTerm: [0.5, 0.3, 0.2],
  };

  // ---------------------------------------------------------------------
  // Utils
  // ---------------------------------------------------------------------
  function ksh(n) {
    n = Math.round(n || 0);
    var sign = n < 0 ? "-" : "";
    return sign + "KSh " + Math.abs(n).toLocaleString("en-KE");
  }
  function pct(n, digits) {
    digits = digits == null ? 0 : digits;
    return (n * 100).toFixed(digits) + "%";
  }
  function initials(name) {
    var parts = String(name || "").replace(/^(Mrs|Mr|Ms|Dr|Eng|Prof)\.?\s+/i, "").split(" ").filter(Boolean);
    var first = parts[0] ? parts[0][0] : "";
    var last = parts.length > 1 ? parts[parts.length - 1][0] : "";
    return (first + last).toUpperCase();
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function fmtDate(iso, opts) {
    try {
      var d = new Date(iso + "T00:00:00");
      return d.toLocaleDateString("en-KE", opts || { day: "2-digit", month: "short", year: "numeric" });
    } catch (e) { return iso; }
  }
  function uid(prefix) { return prefix + "_" + Math.random().toString(36).slice(2, 9); }
  function pad(n, w) { var s = String(n); while (s.length < w) s = "0" + s; return s; }
  function uidStable(key) { return "st_" + hash(key).toString(36); }

  // ---------------------------------------------------------------------
  // Seed: students — each student draws several sequential values from one
  // seeded PRNG, so a single stable seed yields good, non-clustered spread
  // across gender / name / ability / boarding instead of re-hashing similar
  // short strings (which was tried first and clustered badly — fixed here).
  // ---------------------------------------------------------------------
  var FIRST_M = ["Brian", "Kevin", "Ian", "Daniel", "David", "Eric", "Michael", "Peter", "Samuel", "John", "Anthony", "Dennis", "Victor", "Felix", "Joseph", "James", "Kelvin", "Emmanuel", "Patrick", "Hassan", "Simon", "Paul", "Stanley", "Elvis"];
  var FIRST_F = ["Faith", "Sharon", "Mary", "Grace", "Beatrice", "Purity", "Joy", "Esther", "Naomi", "Winnie", "Ann", "Lucy", "Mercy", "Diana", "Caroline", "Ruth", "Agnes", "Nancy", "Brenda", "Jane", "Christine", "Rose", "Eunice", "Susan"];
  var SURNAMES = ["Wanjiru", "Kariuki", "Mwangi", "Njoroge", "Nyambura", "Kamau", "Wambui", "Gitau", "Waweru", "Muthoni", "Ndungu", "Njeri", "Maina", "Wairimu", "Karanja", "Wangari", "Githinji", "Kimani", "Nyawira", "Macharia", "Otieno", "Achieng", "Odhiambo", "Chebet", "Kiptoo", "Cherono", "Mutiso", "Wafula", "Nekesa", "Barasa"];
  var PHONE_PREFIXES = ["0722", "0733", "0700", "0710", "0790", "0701", "0711", "0729", "0714", "0798"];

  function pickFrom(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
  function drawPerson(rng) {
    var isM = rng() < 0.5;
    var first = pickFrom(rng, isM ? FIRST_M : FIRST_F);
    var last = pickFrom(rng, SURNAMES);
    return { first: first, last: last, gender: isM ? "Male" : "Female" };
  }
  function drawPhone(rng) {
    var p = pickFrom(rng, PHONE_PREFIXES);
    var n = Math.floor(100000 + rng() * 900000);
    var s = String(n);
    return p + " " + s.slice(0, 3) + " " + s.slice(3);
  }

  var STUDENTS = [];
  // Learners are admitted through the app and stored on the school server.

  function studentSubjects(st) { return subjectsFor(st.grade, st.pathway); }

  // ---------------------------------------------------------------------
  // Seed: staff
  // ---------------------------------------------------------------------
  var STAFF = []; // staff are added in the app and stored on the server

  // ---------------------------------------------------------------------
  // Seed: assessments + scores (deterministic marks from per-student ability)
  // ---------------------------------------------------------------------
  var ASSESSMENTS = [
    { id: "t2eot", label: "Term 2 End-of-Term", term: 2, status: "closed", subjects: "all" },
    { id: "t3cat1", label: "Term 3 CAT 1", term: 3, status: "open", subjects: "all" },
    { id: "t3eot", label: "Term 3 End-of-Term Assessment", term: 3, status: "closed", subjects: "all" },
  ];

  function markFor(assessmentId, student, subjectId) {
    var rng = rngFor("mark|" + assessmentId + "|" + student.id + "|" + subjectId);
    var noise = Math.round((rng() - 0.5) * 26); // ± 13
    var subjBias = Math.round((rng() - 0.5) * 10); // ± 5
    var drift = assessmentId === "t3cat1" ? 3 : 0; // slight term-on-term growth
    return clamp(Math.round(student.ability + noise + subjBias + drift), 2, 99);
  }

  var SCORES = {}; // scores[assessmentId][studentId][subjectId] = mark
  ASSESSMENTS.forEach(function (asm) {
    SCORES[asm.id] = {};
    STUDENTS.forEach(function (st) {
      SCORES[asm.id][st.id] = {};
      var subs = studentSubjects(st);
      var entered = asm.subjects === "all" ? subs.map(function (s) { return s.id; }) : asm.subjects;
      subs.forEach(function (s) {
        if (entered.indexOf(s.id) > -1) {
          SCORES[asm.id][st.id][s.id] = markFor(asm.id, st, s.id);
        }
      });
    });
  });

  // ---------------------------------------------------------------------
  // Seed: attendance (weekdays of Term 3 so far: Aug 24 – Sep 23 2026)
  // ---------------------------------------------------------------------
  function termWeekdays(startIso, endIso) {
    var out = [];
    var d = new Date(startIso + "T00:00:00");
    var end = new Date(endIso + "T00:00:00");
    while (d <= end) {
      var day = d.getDay();
      if (day !== 0 && day !== 6) out.push(d.toISOString().slice(0, 10));
      d.setDate(d.getDate() + 1);
    }
    return out;
  }
  var TERM3_DAYS = termWeekdays(SCHOOL.termOpened, SCHOOL.today);

  var ATTENDANCE = {}; // ATTENDANCE[date][studentId] = 'present'|'absent'|'late'|'permission'
  TERM3_DAYS.forEach(function (date) {
    ATTENDANCE[date] = {};
    STUDENTS.forEach(function (st) {
      var rng = rngFor("att|" + date + "|" + st.id);
      var r = rng();
      var base = st.ability > 60 ? 0.95 : 0.88;
      var status = r < base ? "present" : r < base + 0.05 ? "late" : r < base + 0.08 ? "permission" : "absent";
      ATTENDANCE[date][st.id] = status;
    });
  });

  // ---------------------------------------------------------------------
  // Seed: finance — boarding ledgers, receipts, expenses, pledges
  // ---------------------------------------------------------------------
  var LEDGERS = {}; // studentId -> {billed, paid} (boarding top-up only; day = capitation-funded)
  STUDENTS.forEach(function (st) {
    if (st.boarding === "Boarding") {
      var billed = FUNDING.boardingClusterUsed;
      var rng = rngFor("ledger|" + st.id);
      var payFrac = 0.3 + rng() * 0.68;
      LEDGERS[st.id] = { billed: billed, paid: Math.round(billed * payFrac) };
    } else {
      LEDGERS[st.id] = { billed: 0, paid: 0 };
    }
  });

  var RECEIPT_METHODS = ["M-Pesa", "Bank", "Cash"];
  var RECEIPTS = [];
  (function seedReceipts() {
    var n = 1;
    STUDENTS.forEach(function (st) {
      if (st.boarding !== "Boarding") return;
      var l = LEDGERS[st.id];
      if (l.paid <= 0) return;
      var rng = rngFor("receipt|" + st.id);
      var parts = rng() > 0.5 ? 2 : 1;
      var remaining = l.paid;
      for (var i = 0; i < parts; i++) {
        var amt = i === parts - 1 ? remaining : Math.round(l.paid * (0.35 + rng() * 0.3));
        remaining -= amt;
        if (amt <= 0) continue;
        var day = 1 + Math.floor(rng() * 23);
        RECEIPTS.push({
          id: "rc" + n++,
          studentId: st.id,
          amount: amt,
          method: pickFrom(rng, RECEIPT_METHODS),
          ref: "N" + Math.floor(10000000 + rng() * 89999999),
          date: "2026-09-" + pad(day, 2),
        });
      }
    });
    RECEIPTS.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  })();

  var EXPENSES = [];

  var PLEDGES = [];

  // ---------------------------------------------------------------------
  // Seed: messages / bulk SMS outbox
  // ---------------------------------------------------------------------
  var MESSAGE_TEMPLATES = {
    boarding: "Dear parent, Tartar School reminds you that the Term 3 boarding balance is outstanding. Kindly clear via Paybill 400522, acc. admission number. — Bursar",
    grade9: "Dear parent, KJSEA begins on 26 Oct 2026. Grade 9 candidates should report in full uniform with KNEC index cards. Revision timetable is out. — Principal",
    absent: "Dear parent, your child was marked absent today without prior notice. Kindly confirm and share a reason with the class teacher. — Tartar School School",
    all: "Dear parent, Tartar School wishes all learners a productive Term 3. PTA AGM is set for Saturday. — Principal",
  };
  var OUTBOX = [];

  // ---------------------------------------------------------------------
  // Roles
  // ---------------------------------------------------------------------
  var ROLE_PERSON = {
    principal: { name: SCHOOL.principal, title: "Head of Institution" },
    teacher: { name: "Teacher", title: "Class teacher" },
    bursar: { name: SCHOOL.bursarName, title: "Bursar" },
    parent: { name: "Parent / Guardian", title: "Parent portal" },
  };

  function defaultParentStudent() { return (STUDENTS[0] || {}).id || null; }

  // ---------------------------------------------------------------------
  // Store — persists to localStorage so the multi-page static site behaves
  // like one coherent app across full page loads.
  // ---------------------------------------------------------------------
  var KEY = "tartar_school_v1";
  var Store = {
    state: null,
    _snapshot: function () {
      return {
        role: "principal",
        parentStudentId: defaultParentStudent(),
        students: JSON.parse(JSON.stringify(STUDENTS)),
        scores: JSON.parse(JSON.stringify(SCORES)),
        attendance: JSON.parse(JSON.stringify(ATTENDANCE)),
        ledgers: JSON.parse(JSON.stringify(LEDGERS)),
        receipts: JSON.parse(JSON.stringify(RECEIPTS)),
        expenses: JSON.parse(JSON.stringify(EXPENSES)),
        pledges: JSON.parse(JSON.stringify(PLEDGES)),
        outbox: JSON.parse(JSON.stringify(OUTBOX)),
        staff: [],
        classes: [],
        lessons: [],
        profile: JSON.parse(JSON.stringify(DEFAULT_PROFILE)),
      };
    },
    // ---- persistence: the school server is the single source of truth ----
    rev: 0, me: { role: "admin" }, base: null,
    _token: function () { try { return sessionStorage.getItem("tt"); } catch (e) { return null; } },
    _toLogin: function () { try { sessionStorage.removeItem("tt"); } catch (e) {} location.replace("/"); throw new Error("Login required"); },
    _warn: function (msg) {
      var el = document.getElementById("saveWarn");
      if (!el) { el = document.createElement("div"); el.id = "saveWarn"; el.style.cssText = "position:fixed;left:12px;right:12px;bottom:12px;z-index:99;background:#a6402a;color:#fff;padding:10px 14px;border-radius:8px;font-size:13px;text-align:center;"; document.body.appendChild(el); }
      el.textContent = msg; el.style.display = msg ? "block" : "none";
    },
    _plain: function () {
      var c = Object.assign({}, this.state); delete c.role; delete c.parentStudentId;
      var o = JSON.parse(JSON.stringify(c));
      o.students.forEach(function (s) { delete s.stream; });   // derived from the class, never stored
      return o;
    },
    // A learner's stream (and grade) always comes from the class they belong to.
    _derive: function () {
      var cls = {}; this.state.classes.forEach(function (c) { cls[c.id] = c; });
      this.state.students.forEach(function (s) {
        var c = cls[s.classId];
        if (c) { s.grade = c.grade; s.stream = c.stream; } else { s.stream = ""; }
      });
    },
    init: function () {
      if (this.state) return this.state;
      var tok = this._token();
      if (!tok) this._toLogin();
      var x = new XMLHttpRequest();
      x.open("GET", "/api/state", false);
      x.setRequestHeader("Authorization", "Bearer " + tok);
      try { x.send(); } catch (e) { document.body.innerHTML = "<p style='padding:24px'>Cannot reach the school server. Please check that it is running.</p>"; throw e; }
      if (x.status === 401) this._toLogin();
      var d = {};
      try { d = JSON.parse(x.responseText); } catch (e) {}
      this.me = d.me || { role: "admin" };
      var snap = this._snapshot();
      this.state = d.state || snap;
      (function fill(t, d) {   // the server stores only real data; restore the app's empty placeholders (e.g. a term with no marks yet)
        Object.keys(d).forEach(function (k) {
          if (!(k in t)) t[k] = d[k];
          else if (t[k] && d[k] && typeof t[k] === "object" && typeof d[k] === "object" && !Array.isArray(t[k]) && !Array.isArray(d[k])) fill(t[k], d[k]);
        });
      })(this.state, snap);
      this.rev = d.rev || 0;
      if (this.me.role !== "admin") {
        // staff accounts get the role the head/admin gave them; only the admin can switch views
        var ui = (this.me.role === "deputy" || this.me.role === "senior") ? "teacher" : this.me.role;
        var titles = { principal: "Head of Institution", deputy: "Deputy Head of Institution", senior: "Senior Teacher", teacher: "Teacher", bursar: "Bursar" };
        this.state.role = ui;
        ROLE_PERSON[ui] = { name: this.me.name || this.me.role, title: titles[this.me.role] || this.me.role };
      } else {
        this.state.role = localStorage.getItem("tartar_role") || "principal";
      }
      this._derive();
      this.state.parentStudentId = localStorage.getItem("tartar_parent") || null;
      this.base = this._plain();
      return this.state;
    },
    // Work out what changed since the last save, so people saving at the same time never overwrite each other.
    _diff: function (a, b, path, ops) {
      var self = this;
      function isObj(v) { return v && typeof v === "object" && !Array.isArray(v); }
      function isIds(v) { return Array.isArray(v) && v.every(function (e) { return isObj(e) && typeof e.id === "string"; }); }
      if (isObj(a) && isObj(b)) {
        Object.keys(b).forEach(function (k) { if (!(k in a)) ops.push({ p: path.concat(k), v: b[k] }); else self._diff(a[k], b[k], path.concat(k), ops); });
        Object.keys(a).forEach(function (k) { if (!(k in b)) ops.push({ p: path.concat(k), d: 1 }); });
      } else if (isIds(a) && isIds(b)) {
        var am = {}, bm = {};
        a.forEach(function (e) { am[e.id] = e; }); b.forEach(function (e) { bm[e.id] = e; });
        b.forEach(function (e, i) { if (!am[e.id]) ops.push({ p: path.concat("@" + e.id), v: e, i: i }); else self._diff(am[e.id], e, path.concat("@" + e.id), ops); });
        a.forEach(function (e) { if (!bm[e.id]) ops.push({ p: path.concat("@" + e.id), d: 1 }); });
      } else if (JSON.stringify(a) !== JSON.stringify(b)) ops.push({ p: path, v: b });
    },
    save: function () {
      var self = this; clearTimeout(this._t);
      this._t = setTimeout(function () { self._t = null; self._push(); }, 300);
    },
    _push: function () {
      var self = this, sent = this._plain(), ops = [];
      this._diff(this.base, sent, [], ops);
      if (!ops.length) return;
      fetch("/api/state", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + this._token() }, body: JSON.stringify({ ops: ops }) })
        .then(function (r) { if (r.status === 401) self._toLogin(); return r.json(); })
        .then(function (d) {
          if (d.error) { self._warn("Not saved: " + d.error); return; }
          self.rev = d.rev; self.base = sent; self._warn("");
        })
        .catch(function () { self._warn("Not saved: cannot reach the school server. Please check the connection."); });
    },
    flush: function () {
      if (!this._t) return;
      clearTimeout(this._t); this._t = null;
      var sent = this._plain(), ops = []; this._diff(this.base, sent, [], ops);
      if (!ops.length) return;
      try {
        var x = new XMLHttpRequest(); x.open("POST", "/api/state", false);
        x.setRequestHeader("Content-Type", "application/json"); x.setRequestHeader("Authorization", "Bearer " + this._token());
        x.send(JSON.stringify({ ops: ops })); if (x.status === 200) this.base = sent;
      } catch (e) {}
    },
    logout: function () { this.flush(); try { sessionStorage.removeItem("tt"); } catch (e) {} location.href = "/"; },

    setRole: function (role) { this.state.role = role; localStorage.setItem("tartar_role", role); },
    setParentStudent: function (id) { this.state.parentStudentId = id; localStorage.setItem("tartar_parent", id); },
    addStaff: function (data) {
      var p = Object.assign({ id: uid("sf") }, data);
      this.state.staff.push(p); this.save(); return p;
    },
    staffById: function (id) { return this.state.staff.filter(function (x) { return x.id === id; })[0]; },
    updateStaff: function (id, patch) { var p = this.staffById(id); if (p) { Object.assign(p, patch); this.save(); } return p; },
    removeStaff: function (id) {
      this.state.staff = this.state.staff.filter(function (x) { return x.id !== id; });
      this.state.classes.forEach(function (c) { if (c.teacherId === id) c.teacherId = ""; });
      this.save();
    },
    // ---- classes: the head creates a class by assigning a class teacher; the teacher names the stream ----
    classOf: function (id) { return this.state.classes.filter(function (c) { return c.id === id; })[0]; },
    classLabel: function (c) { return gradeLabel(c.grade) + (c.stream ? " " + c.stream : " (stream not named)"); },
    learnersIn: function (classId) { return this.state.students.filter(function (s) { return s.classId === classId; }); },
    addClass: function (data) {
      var c = { id: uid("cl"), grade: Number(data.grade), stream: (data.stream || "").trim(), teacherId: data.teacherId || "" };
      this.state.classes.push(c); this.save(); return c;
    },
    setClassTeacher: function (id, teacherId) { var c = this.classOf(id); if (c) { c.teacherId = teacherId || ""; this.save(); } },
    setStream: function (id, stream) { var c = this.classOf(id); if (c) { c.stream = String(stream || "").trim(); this._derive(); this.save(); } },
    saveLesson: function (data) {
      var self = this, lesson = Object.assign({}, data);
      if (!lesson.id) lesson.id = uid("ls");
      this.flush();
      return fetch("/api/timetable", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + this._token() },
        body: JSON.stringify({ action: data.id ? "update" : "create", lesson: lesson })
      }).then(function (response) {
        return response.json().then(function (result) {
          if (!response.ok) throw new Error(result.error || "Could not save the lesson.");
          var index = self.state.lessons.findIndex(function (item) { return item.id === result.lesson.id; });
          if (index < 0) self.state.lessons.push(result.lesson);
          else self.state.lessons[index] = result.lesson;
          self.rev = result.rev;
          self.base = self._plain();
          return result.lesson;
        });
      });
    },
    deleteLesson: function (id) {
      var self = this;
      this.flush();
      return fetch("/api/timetable", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + this._token() },
        body: JSON.stringify({ action: "delete", lessonId: id })
      }).then(function (response) {
        return response.json().then(function (result) {
          if (!response.ok) throw new Error(result.error || "Could not remove the lesson.");
          self.state.lessons = self.state.lessons.filter(function (item) { return item.id !== id; });
          self.rev = result.rev;
          self.base = self._plain();
        });
      });
    },
    removeClass: function (id) {
      if (this.learnersIn(id).length) return false;
      this.state.classes = this.state.classes.filter(function (c) { return c.id !== id; }); this.save(); return true;
    },
    assignClass: function (studentId, classId) {
      var st = this.student(studentId), c = this.classOf(classId);
      if (!st || !c) return false;
      st.classId = c.id; st.grade = c.grade; st.stream = c.stream; this.save(); return true;
    },
    saveProfile: function (patch) { Object.assign(this.state.profile, patch); this.save(); },

    student: function (id) { return this.state.students.filter(function (s) { return s.id === id; })[0]; },
    updateStudent: function (id, patch) {
      var s = this.student(id);
      if (!s) return false;
      Object.assign(s, patch);
      this.save();
      return s;
    },
    studentsBy: function (grade, group) {
      return this.state.students.filter(function (s) {
        return (!grade || s.grade === grade) && (!group || group === "all" || s.stream === group);
      });
    },
    mark: function (assessmentId, studentId, subjectId, value) {
      var a = this.state.scores[assessmentId] || (this.state.scores[assessmentId] = {});
      var s = a[studentId] || (a[studentId] = {});
      if (value === null || value === "" || isNaN(value)) { delete s[subjectId]; }
      else { s[subjectId] = clamp(Math.round(Number(value)), 0, 100); }
      this.save();
    },
    scoreOf: function (assessmentId, studentId, subjectId) {
      var a = this.state.scores[assessmentId]; if (!a) return null;
      var s = a[studentId]; if (!s) return null;
      var v = s[subjectId]; return v == null ? null : v;
    },
    setAttendance: function (date, studentId, status) {
      var d = this.state.attendance[date] || (this.state.attendance[date] = {});
      d[studentId] = status; this.save();
    },
    attendanceOn: function (date, studentId) {
      var d = this.state.attendance[date]; return d ? (d[studentId] || null) : null;
    },
    addStudent: function (data) {
      var id = uid("st"), c = data.classId ? this.classOf(data.classId) : null;
      var s = Object.assign({ id: id, classId: "" }, data);
      delete s.boardingFee;
      if (c) { s.grade = c.grade; s.stream = c.stream; } else { s.stream = ""; }
      this.state.students.push(s);
      if (data.boarding === "Boarding") this.state.ledgers[id] = { billed: Math.round(Number(data.boardingFee) || 0), paid: 0 };
      this.save(); return s;
    },
    addReceipt: function (studentId, amount, method) {
      var r = { id: uid("rc"), studentId: studentId, amount: Math.round(Number(amount) || 0), method: method || "M-Pesa", ref: "N" + Math.floor(10000000 + Math.random() * 89999999), date: SCHOOL.today };
      this.state.receipts.unshift(r);
      var l = this.state.ledgers[studentId] || (this.state.ledgers[studentId] = { billed: 0, paid: 0 });
      l.paid += r.amount;
      this.save(); return r;
    },
    addExpense: function (category, note, amount, date) {
      var e = { id: uid("ex"), category: category, note: note, amount: Math.round(Number(amount) || 0), date: date || SCHOOL.today };
      this.state.expenses.unshift(e); this.save(); return e;
    },
    fulfillPledge: function (id, amount) {
      var p = this.state.pledges.filter(function (x) { return x.id === id; })[0];
      if (p) { p.fulfilled = clamp(p.fulfilled + Math.round(Number(amount) || 0), 0, p.amount); this.save(); }
      return p;
    },
    sendMessage: function (audienceLabel, count, body) {
      var m = { id: uid("ob"), audience: audienceLabel, count: count, date: SCHOOL.today, body: body };
      this.state.outbox.unshift(m); this.save(); return m;
    },
    ledgerOf: function (studentId) { return this.state.ledgers[studentId] || { billed: 0, paid: 0 }; },
  };

  // ---------------------------------------------------------------------
  // Selectors
  // ---------------------------------------------------------------------
  function averageMark(list) {
    var vals = list.filter(function (v) { return v != null && !isNaN(v); });
    if (!vals.length) return null;
    return vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
  }
  function studentAssessmentMarks(st, assessmentId) {
    var subs = studentSubjects(st);
    return subs.map(function (s) { return Store.scoreOf(assessmentId, st.id, s.id); });
  }
  function studentAverage(st, assessmentId) {
    return averageMark(studentAssessmentMarks(st, assessmentId));
  }
  function attendancePct(st, uptoDate) {
    var days = TERM3_DAYS.filter(function (d) { return !uptoDate || d <= uptoDate; });
    var present = 0, counted = 0;
    days.forEach(function (d) {
      var s = Store.attendanceOn(d, st.id);
      if (!s) return;
      counted++;
      if (s === "present" || s === "late") present++;
    });
    return counted ? present / counted : 1;
  }
  function bandCounts(marks) {
    var out = { EE: 0, ME: 0, AE: 0, BE: 0, none: 0 };
    marks.forEach(function (m) {
      if (m == null) { out.none++; return; }
      out[bandCode(m)]++;
    });
    return out;
  }
  function schoolBandShare(assessmentId, gradeFilter) {
    var pool = [];
    Store.state.students.forEach(function (st) {
      if (gradeFilter && st.grade !== gradeFilter) return;
      studentAssessmentMarks(st, assessmentId).forEach(function (m) { if (m != null) pool.push(m); });
    });
    var c = bandCounts(pool);
    var total = pool.length || 1;
    return { total: pool.length, EE: c.EE / total, ME: c.ME / total, AE: c.AE / total, BE: c.BE / total, meetingPlus: (c.EE + c.ME) / total };
  }
  function subjectShare(assessmentId, subjectId, students) {
    var marks = students.map(function (st) { return Store.scoreOf(assessmentId, st.id, subjectId); }).filter(function (m) { return m != null; });
    var c = bandCounts(marks);
    var total = marks.length || 1;
    return { total: marks.length, avg: averageMark(marks), EE: c.EE / total, ME: c.ME / total, AE: c.AE / total, BE: c.BE / total, meetingPlus: (c.EE + c.ME) / total };
  }
  function capitationRow(key) {
    var f = FUNDING[key];
    var enrolled = Store.state.students.filter(function (s) { return key === "jss" ? s.grade >= 7 : s.grade >= 1 && s.grade <= 6; }).length;
    var entitlement = enrolled * f.annualCapitation;
    var received = entitlement * f.receivedPct;
    return { label: f.label, enrolled: enrolled, entitlement: entitlement, received: received, outstanding: entitlement - received, pct: f.receivedPct };
  }
  function atRiskStudents() {
    var out = [];
    Store.state.students.forEach(function (st) {
      var avg = studentAverage(st, "t3eot"); if (avg == null) avg = studentAverage(st, "t3cat1");
      if (avg == null) avg = studentAverage(st, "t2eot");
      var att = attendancePct(st);
      var l = Store.ledgerOf(st.id);
      var reasons = [];
      if (avg != null && avg < 40) reasons.push("Below expectation average");
      if (att < 0.82) reasons.push("Low attendance (" + pct(att) + ")");
      if (l.billed - l.paid > 15000) reasons.push("Boarding balance " + ksh(l.billed - l.paid));
      if (reasons.length) out.push({ student: st, reasons: reasons });
    });
    return out;
  }

  // ---------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------
  global.addEventListener("beforeunload", function () { Store.flush(); });
  global.addEventListener("pageshow", function (event) {
    if (event.persisted) global.location.reload();
  });
  global.Tartar = {
    SCHOOL: SCHOOL, GRADES: GRADES, SECTIONS: SECTIONS, gradeLabel: gradeLabel, sectionOf: sectionOf,
    SUBJECTS_PP: SUBJECTS_PP, SUBJECTS_LP: SUBJECTS_LP, SUBJECTS_UP: SUBJECTS_UP, SUBJECTS_JSS: SUBJECTS_JSS,
    CORE_COMPETENCIES: CORE_COMPETENCIES, ASSESSMENTS: ASSESSMENTS, FUNDING: FUNDING,
    STAFF: STAFF, MESSAGE_TEMPLATES: MESSAGE_TEMPLATES, TERM3_DAYS: TERM3_DAYS,
    subjectsFor: subjectsFor, groupsFor: groupsFor, groupLabel: groupLabel, studentSubjects: studentSubjects,
    band: band, bandCode: bandCode, bandTone: bandTone, bandRemark: bandRemark, kjseaLevel: kjseaLevel, BANDS: BANDS,
    ksh: ksh, pct: pct, initials: initials, esc: esc, fmtDate: fmtDate, uid: uid, clamp: clamp, pad: pad,
    hash: hash, rngFor: rngFor,
    Store: Store,
    averageMark: averageMark, studentAssessmentMarks: studentAssessmentMarks, studentAverage: studentAverage,
    attendancePct: attendancePct, bandCounts: bandCounts, schoolBandShare: schoolBandShare, subjectShare: subjectShare,
    capitationRow: capitationRow, atRiskStudents: atRiskStudents, ROLE_PERSON: ROLE_PERSON,
  };
})(window);
