#!/usr/bin/env python3
"""Tartar School login server for Render deployment."""
import base64, hashlib, mimetypes, json, logging, os, re, secrets, time, hmac, threading, socket, urllib.error, urllib.request, urllib.parse, shutil, ssl, subprocess, sys
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

# ================= SETTINGS =================
SCHOOL_CODE      = "24505103"
ADMIN_PASSWORD   = os.environ.get("ADMIN_PASSWORD", "")
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
ADMIN_EMAILS     = [email.strip().lower() for email in os.environ.get("GOOGLE_ADMIN_EMAILS", "").split(",") if email.strip()]
LOGIN_OTP_ENABLED = os.environ.get("LOGIN_OTP_ENABLED", "0").strip().lower() in ("1", "true", "yes", "on")
AT_USERNAME     = os.environ.get("AT_USERNAME", "").strip()
AT_API_KEY      = os.environ.get("AT_API_KEY", "").strip()
AT_SENDER       = os.environ.get("AT_SENDER", "").strip()
ADMIN_PHONE     = os.environ.get("ADMIN_PHONE", "").strip()

port = int(os.environ.get("PORT", 8000))
server_address = ('0.0.0.0', port)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
BASE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(BASE, "codes.json")
LOCK = threading.Lock()
SESSIONS, FAILS = {}, {}
OTP_LOCK = threading.Lock()
OTP_CHALLENGES, OTP_LAST_SENT = {}, {}

# Updated file mappings pointing directly to the root directory
FILES = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/index.html": ("index.html", "text/html; charset=utf-8"),
    "/manage.html": ("manage.html", "text/html; charset=utf-8"),
    "/student.html": ("student.html", "text/html; charset=utf-8"),
    "/dashboard.html": ("dashboard.html", "text/html; charset=utf-8"),
    "/classes.html": ("classes.html", "text/html; charset=utf-8"),
    "/assessment.html": ("assessment.html", "text/html; charset=utf-8"),
    "/attendance.html": ("attendance.html", "text/html; charset=utf-8"),
    "/clubs.html": ("clubs.html", "text/html; charset=utf-8"),
    "/finance.html": ("finance.html", "text/html; charset=utf-8"),
    "/messages.html": ("messages.html", "text/html; charset=utf-8"),
    "/parent.html": ("parent.html", "text/html; charset=utf-8"),
    "/profile.html": ("profile.html", "text/html; charset=utf-8"),
    "/staff.html": ("staff.html", "text/html; charset=utf-8"),
    "/students.html": ("students.html", "text/html; charset=utf-8"),
    "/timetable.html": ("timetable.html", "text/html; charset=utf-8"),
    "/crest.png": ("crest.png", "image/png"),
    "/favicon.png": ("favicon.png", "image/png"),
}

DATA = os.path.join(BASE, "data.json")
ID_RE = re.compile(r"^[\w|-]{1,60}$")
SCHEMA = {
    "students":   ["name", "first", "middle", "surname", "adm", "class", "fee_total", "g1_rel", "g1_first", "g1_middle", "g1_surname", "g1_id", "g1_phone", "g2_rel", "g2_first", "g2_middle", "g2_surname", "g2_id", "g2_phone"],
    "classes":    ["name", "teacher"],
    "attendance": ["date", "class", "student", "status"],
    "fees":       ["student", "amount", "paid_on", "method"],
    "results":    ["student", "term", "subject", "score"],
    "resources":  ["title", "subject", "class", "filename"],
}
UPLOADS = os.path.join(BASE, "uploads")
EXT = {"pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "txt", "png", "jpg", "jpeg"}
MAX_FILE = 8 * 1024 * 1024
USERS = os.path.join(BASE, "users.json")
STAFF_SESS = {}
TEACHER_LIKE = ("teacher", "senior", "deputy")
ROLES = ("principal", "bursar") + TEACHER_LIKE
ROLE_WRITE = {"bursar": {"ledgers", "receipts", "expenses", "pledges", "outbox"}}
for _r in TEACHER_LIKE:
    ROLE_WRITE[_r] = {"scores", "attendance", "outbox"}
USERNAME_RE = re.compile(r"^[a-z0-9._-]{3,30}$")
STU = {}
STATE = os.path.join(BASE, "state.json")
ADMISSIONS = os.path.join(BASE, "admissions.json")
CLUB_REQUESTS = os.path.join(BASE, "club-requests.json")
BACKUPS = os.path.join(BASE, "backups")
STATIC_EXT = {".html", ".js", ".css", ".png", ".svg", ".ico"}
ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
ADMISSION_LOCK = threading.Lock()
ADMISSION_SUBMISSIONS = {}
ADMISSION_GRADES = {"Early Years", "PP1", "PP2"} | {"Grade " + str(grade) for grade in range(1, 10)}
ADMISSION_STATUSES = {"New", "Contacted", "Accepted", "Declined"}
CLUB_OPTIONS = (
    "Chess Club", "Debate Club", "Scouts", "Coding and Robotics Club",
    "Science and Innovation Club", "Environmental Conservation (4K) Club",
    "Journalism and Media Club", "Music and Dance Club", "Drama Club",
    "Art and Craft Club", "Mathematics Club", "Young Farmers Club",
    "Red Cross and First Aid Club", "Community Service Club",
)
CLUB_MAX_SELECTIONS = 2
CLUB_STATUSES = {"Pending", "Approved", "Declined"}

def load():
    try:
        with open(DB) as f: return json.load(f)
    except Exception: return []

def save(d):
    with open(DB + ".tmp", "w") as f: json.dump(d, f, indent=2)
    os.replace(DB + ".tmp", DB)

def dload():
    try:
        with open(DATA) as f: return json.load(f)
    except Exception: return {}

def dsave(d):
    with open(DATA + ".tmp", "w") as f: json.dump(d, f, indent=1)
    os.replace(DATA + ".tmp", DATA)

def clean(col, rec):
    out = {}
    for k in SCHEMA[col]:
        v = rec.get(k, "")
        ok = isinstance(v, (int, float)) and not isinstance(v, bool)
        out[k] = v if ok else str(v).strip()[:100]
    return out

def full(*parts):
    return " ".join(" ".join(str(p or "").split()) for p in parts if p and str(p).strip())

def fnum(v):
    try: return float(v)
    except Exception: return 0.0

def as_int(value):
    if isinstance(value, bool): return None
    if isinstance(value, int): return value
    if isinstance(value, float): return int(value) if value.is_integer() else None
    if isinstance(value, str):
        s = value.strip()
        if re.fullmatch(r"[+-]?\d+", s): return int(s)
    return None

def student_status(db, s):
    need = ("first", "surname", "adm", "class", "g1_first", "g1_surname", "g1_id", "g1_phone")
    if not all(str(s.get(k) or "").strip() for k in need): return "incomplete"
    paid = sum(fnum(f.get("amount")) for f in db.get("fees", []) if f.get("student") == s["id"])
    fee = fnum(s.get("fee_total"))
    return "ok" if fee > 0 and paid >= fee else "fees"

def sload():
    try:
        with open(STATE) as f: return json.load(f)
    except Exception: return {}

def ssave(d):
    with open(STATE + ".tmp", "w") as f: json.dump(d, f)
    os.replace(STATE + ".tmp", STATE)

def admission_load():
    if not os.path.exists(ADMISSIONS): return []
    with open(ADMISSIONS, encoding="utf-8") as f:
        records = json.load(f)
        if not isinstance(records, list): raise ValueError("Admission records must be a list.")
        return records

def admission_save(records):
    temp = ADMISSIONS + ".tmp"
    with open(temp, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)
    os.replace(temp, ADMISSIONS)

def club_requests_load():
    if not os.path.exists(CLUB_REQUESTS): return []
    with open(CLUB_REQUESTS, encoding="utf-8") as f:
        records = json.load(f)
        return records

def club_requests_save(records):
    temp = CLUB_REQUESTS + ".tmp"
    with open(temp, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)
    os.replace(temp, CLUB_REQUESTS)

def admission_rate_limited(ip):
    now = time.time()
    with ADMISSION_LOCK:
        for old_ip, stamps in list(ADMISSION_SUBMISSIONS.items()):
            recent = [stamp for stamp in stamps if now - stamp < 3600]
            if recent: ADMISSION_SUBMISSIONS[old_ip] = recent
            else: ADMISSION_SUBMISSIONS.pop(old_ip, None)
        stamps = ADMISSION_SUBMISSIONS.setdefault(ip, [])
        if len(stamps) >= 10: return True
        stamps.append(now)
        return False

def backup(cur):
    if cur.get("state") is None: return
    os.makedirs(BACKUPS, exist_ok=True)
    fn = os.path.join(BACKUPS, "state-" + time.strftime("%Y%m%d") + ".json")
    if not os.path.exists(fn):
        with open(fn, "w") as f: json.dump(cur, f)
    for old in sorted(os.listdir(BACKUPS))[:-30]:
        os.remove(os.path.join(BACKUPS, old))

def uload():
    try:
        with open(USERS) as f: return json.load(f)
    except Exception: return []

def usave(d):
    with open(USERS + ".tmp", "w") as f: json.dump(d, f, indent=1)
    os.replace(USERS + ".tmp", USERS)

def hash_pw(pw, salt=None):
    salt = salt or secrets.token_bytes(16)
    return salt.hex(), hashlib.pbkdf2_hmac("sha256", pw.encode(), salt, 200000).hex()

def check_pw(pw, salt_hex, hash_hex):
    return hmac.compare_digest(hash_pw(pw, bytes.fromhex(salt_hex))[1], hash_hex)

class OTPError(Exception): pass

def normalize_phone(value):
    phone = str(value or "").strip()
    digits = re.sub(r"\D", "", phone)
    if digits.startswith("0") and len(digits) == 10: digits = "254" + digits[1:]
    if re.fullmatch(r"254\d{9}", digits): return "+" + digits
    elif phone.startswith("+") and re.fullmatch(r"\d{8,15}", digits): return "+" + digits
    return ""

def mask_phone(phone):
    return "number ending in " + phone[-4:]

def user_phone(user):
    phone = normalize_phone(user.get("phone"))
    if phone: return phone
    staff_id = user.get("staffId")
    if not staff_id: return ""
    staff = next((x for x in (sload().get("state") or {}).get("staff", []) if x.get("id") == staff_id), None)
    return normalize_phone(staff.get("phone")) if staff else ""

def send_sms(phone, message):
    if not AT_USERNAME or not AT_API_KEY: raise OTPError("SMS delivery is not configured.")
    fields = {"username": AT_USERNAME, "to": phone, "message": message}
    if AT_SENDER: fields["from"] = AT_SENDER
    request = urllib.request.Request("https://api.africastalking.com/version1/messaging", data=urllib.parse.urlencode(fields).encode(), headers={"apiKey": AT_API_KEY, "Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded"}, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            result = json.loads(response.read().decode("utf-8"))
    except (OSError, ValueError, urllib.error.URLError) as exc:
        raise OTPError("SMS provider request failed.") from exc
    message_data = result.get("SMSMessageData")
    recipients = message_data.get("Recipients") if isinstance(message_data, dict) else None
    if not isinstance(recipients, list) or not recipients or str(recipients[0].get("statusCode")) not in ("100", "101"):
        raise OTPError("SMS provider did not accept the verification message.")

def start_otp(kind, username, phone, fingerprint=""):
    phone = normalize_phone(phone)
    if not phone: raise OTPError("No valid phone number is configured for this account.")
    key = kind + ":" + username
    phone_key = "phone:" + phone
    now = time.time()
    with OTP_LOCK:
        for old_key, sent_at in list(OTP_LAST_SENT.items()):
            if now - sent_at >= 300: OTP_LAST_SENT.pop(old_key, None)
        if now - OTP_LAST_SENT.get(key, 0) < 60 or now - OTP_LAST_SENT.get(phone_key, 0) < 60:
            raise OTPError("A verification code was just sent. Wait one minute before trying again.")
        OTP_LAST_SENT[key] = now
        OTP_LAST_SENT[phone_key] = now
    challenge_id = secrets.token_urlsafe(24)
    code = str(secrets.randbelow(1000000)).zfill(6)
    code_hash = hmac.new(challenge_id.encode(), code.encode(), hashlib.sha256).hexdigest()
    try:
        send_sms(phone, "Your Tartar School sign-in code is " + code + ". It expires in 5 minutes.")
    except OTPError:
        with OTP_LOCK:
            OTP_LAST_SENT.pop(key, None)
            OTP_LAST_SENT.pop(phone_key, None)
        raise
    with OTP_LOCK:
        OTP_CHALLENGES[challenge_id] = {"key": key, "kind": kind, "username": username, "phone": phone, "fingerprint": fingerprint, "hash": code_hash, "expires": now + 300, "attempts": 0}
    return {"requires_otp": True, "challenge_id": challenge_id, "sent_to": mask_phone(phone)}

def revoke(username):
    for t in [t for t, v in STAFF_SESS.items() if v[0] == username]: del STAFF_SESS[t]

def view_for(me, st):
    role = me["role"]
    if st is None or role in ("admin", "principal"): return st
    v = dict(st)
    v["students"] = [{k: x[k] for k in x if k != "guardians"} for x in st.get("students", [])]
    for k in (("ledgers", "receipts", "expenses", "pledges") if role in TEACHER_LIKE else ("scores", "attendance")):
        v.pop(k, None)
    if role in TEACHER_LIKE:
        v["lessons"] = [x for x in st.get("lessons", []) if isinstance(x, dict) and x.get("teacherId") == me.get("staffId")]
    else:
        v["lessons"] = []
    return v

WEEKDAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday")
SUBJECTS_BY_GRADE = {
    **{-2: {"lan", "mat", "env", "pcr", "rea"}, -1: {"lan", "mat", "env", "pcr", "rea"}},
    **{grade: {"ind", "kis", "eng", "mat", "rea", "env", "cre"} for grade in range(1, 4)},
    **{grade: {"eng", "kis", "mat", "re", "sci", "agn", "sst", "cra"} for grade in range(4, 7)},
    **{grade: {"eng", "kis", "mat", "isc", "sst", "re", "pts", "agn", "cas"} for grade in range(7, 10)},
}

def lesson_error(st, lesson, excluding_id=""):
    if not isinstance(lesson, dict): return "Enter a complete lesson allocation."
    lesson_id = str(lesson.get("id", ""))
    class_id = str(lesson.get("classId", ""))
    teacher_id = str(lesson.get("teacherId", ""))
    day = lesson.get("day")
    start = lesson.get("start")
    end = lesson.get("end")
    room = str(lesson.get("room", "")).strip()
    classes = {item.get("id"): item for item in st.get("classes", [])}
    staff = {item.get("id"): item for item in st.get("staff", [])}
    class_record = classes.get(class_id)
    if not ID_RE.fullmatch(lesson_id): return "The lesson identifier is invalid."
    if not class_record: return "Choose a class that exists in the school records."
    subject = lesson.get("subject")
    if not isinstance(subject, str) or subject not in SUBJECTS_BY_GRADE.get(as_int(class_record.get("grade")), set()):
        return "Choose a learning area offered to this class."
    if not teacher_id or teacher_id not in staff: return "Choose a teacher in the staff list."
    if day and day not in WEEKDAYS: return "Choose a weekday from Monday to Friday."
    return ""

def student_op_ok(me, st, op):
    return True

def op_ok(me, st, op):
    role, p = me["role"], op["p"]
    if role in ("admin", "principal") or p[0] in ROLE_WRITE.get(role, ()): return True
    return False

def _step(cont, key, make):
    if isinstance(key, str) and key.startswith("@") and isinstance(cont, list):
        return next((x for x in cont if isinstance(x, dict) and x.get("id") == key[1:]), None)
    if isinstance(cont, dict):
        if key not in cont and make is not None: cont[key] = make
        return cont.get(key)
    return None

def apply_ops(st, ops):
    for op in ops:
        try:
            path = op["p"]
            cur = st
            for i, part in enumerate(path[:-1]):
                nxt = path[i + 1]
                cur = _step(cur, part, [] if isinstance(nxt, str) and nxt.startswith("@") else {})
                if cur is None: break
            if cur is None: continue
            last = path[-1]
            if isinstance(last, str) and last.startswith("@") and isinstance(cur, list):
                idx = next((i for i, x in enumerate(cur) if isinstance(x, dict) and x.get("id") == last[1:]), None)
                if op.get("d"):
                    if idx is not None: del cur[idx]
                elif idx is None:
                    cur.insert(min(int(op.get("i", len(cur))), len(cur)), op["v"])
                else:
                    cur[idx] = op["v"]
            elif isinstance(cur, dict) and isinstance(last, str):
                if op.get("d"): cur.pop(last, None)
                else: cur[last] = op["v"]
        except Exception: continue

def norm(s): return str(s or "").strip().upper()
def eq(a, b): return hmac.compare_digest(str(a).encode(), str(b).encode())
def locked(ip):
    now = time.time()
    FAILS[ip] = [t for t in FAILS.get(ip, []) if now - t < 300]
    return len(FAILS[ip]) >= 8
def fail(ip): FAILS.setdefault(ip, []).append(time.time())
def new_token():
    t = secrets.token_urlsafe(32)
    SESSIONS[t] = time.time() + 8 * 3600
    return t

class Handler(BaseHTTPRequestHandler):
    def reply(self, status, obj=None, ctype="application/json", raw=None, extra=None):
        body = raw if raw is not None else json.dumps(obj or {}).encode()
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra or {}).items(): self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def is_admin(self):
        exp = SESSIONS.get(self.headers.get("Authorization", "")[7:])
        return bool(exp and exp > time.time())

    def who(self):
        if self.is_admin(): return {"role": "admin"}
        v = STAFF_SESS.get(self.headers.get("Authorization", "")[7:])
        if v and v[1] > time.time():
            u = next((x for x in uload() if x["username"] == v[0]), None)
            if u: return {"role": u["role"], "name": u["name"], "username": u["username"], "staffId": u.get("staffId", "")}
        return None

    def student(self):
        v = STU.get(self.headers.get("Authorization", "")[7:])
        if not v or v[1] < time.time(): return None, None
        db = dload()
        s = next((x for x in db.get("students", []) if x["id"] == v[0]), None)
        if not s: return None, None
        return s, db

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        if path in FILES:
            name, ctype = FILES[path]
            try:
                with open(os.path.join(BASE, name), "rb") as f:
                    return self.reply(200, raw=f.read(), ctype=ctype)
            except OSError:
                return self.reply(404, {"error": "File missing: " + name})

        # Serve static application files directly from the root directory
        if path.startswith("/school/"):
            rel = os.path.normpath(urllib.parse.unquote(path[8:])).lstrip("/\\")
            target = os.path.realpath(os.path.join(BASE, rel))
            if (not target.startswith(os.path.realpath(BASE) + os.sep) or os.path.splitext(target)[1].lower() not in STATIC_EXT or not os.path.isfile(target)):
                return self.reply(404, {"error": "Not found"})
            with open(target, "rb") as f:
                return self.reply(200, raw=f.read(), ctype=mimetypes.guess_type(target)[0] or "application/octet-stream")

        if path == "/api/state":
            me = self.who()
            if not me: return self.reply(401, {"error": "Please log in."})
            cur = sload()
            return self.reply(200, {"rev": cur.get("rev", 0), "state": view_for(me, cur.get("state")), "me": me})

        if path == "/api/admin/users":
            if not self.is_admin(): return self.reply(401, {"error": "Admin login required."})
            return self.reply(200, {"users": [{"username": u["username"], "name": u["name"], "role": u["role"], "phone": user_phone(u), "last_login": u.get("last_login", ""), "must_change": u.get("must_change", False)} for u in uload()]})

        if path == "/api/admin/admissions":
            if not self.is_admin(): return self.reply(401, {"error": "Admin login required."})
            try: return self.reply(200, {"applications": admission_load()})
            except Exception: return self.reply(500, {"error": "Admission applications could not be loaded."})

        if path == "/api/config":
            return self.reply(200, {"google_client_id": GOOGLE_CLIENT_ID})

        self.reply(404, {"error": "Not found"})

    def do_POST(self):
        path, ip = urllib.parse.urlparse(self.path).path, self.client_address[0]
        try:
            n = min(int(self.headers.get("Content-Length") or 0), 12000000)
            data = json.loads(self.rfile.read(n) or b"{}")
        except Exception:
            return self.reply(400, {"error": "Bad request."})

        if path == "/api/login":
            if locked(ip): return self.reply(429, {"error": "Too many attempts. Wait 5 minutes."})
            school, code = norm(data.get("school")), norm(data.get("code"))
            if not eq(school, SCHOOL_CODE):
                fail(ip)
                return self.reply(401, {"error": "Invalid school code."})
            with LOCK:
                db = load()
                rec = next((r for r in db if r["code"] == code), None)
                if not rec or (rec["once"] and rec["used"]):
                    fail(ip)
                    return self.reply(401, {"error": "Invalid or already used access code."})
                rec["used"] = True
                rec["last_login"] = time.strftime("%Y-%m-%d %H:%M:%S")
                save(db)
            return self.reply(200, {"ok": True})

        if path == "/api/admin/login":
            if locked(ip): return self.reply(429, {"error": "Too many attempts. Wait 5 minutes."})
            if not eq(data.get("password", ""), ADMIN_PASSWORD):
                fail(ip)
                return self.reply(401, {"error": "Wrong admin password."})
            if not LOGIN_OTP_ENABLED:
                return self.reply(200, {"token": new_token(), "role": "admin"})
            try:
                challenge = start_otp("admin", "admin", ADMIN_PHONE)
            except OTPError as exc:
                return self.reply(503, {"error": str(exc)})
            return self.reply(200, challenge)

        if path == "/api/staff/login":
            if locked(ip): return self.reply(429, {"error": "Too many attempts. Wait 5 minutes."})
            uname = str(data.get("username", "")).strip().lower()
            users = uload()
            u = next((x for x in users if x["username"] == uname), None)
            if not u or not check_pw(str(data.get("password", "")), u["salt"], u["hash"]):
                fail(ip)
                return self.reply(401, {"error": "Wrong username or password."})
            if not LOGIN_OTP_ENABLED:
                tok = secrets.token_urlsafe(32)
                STAFF_SESS[tok] = (uname, time.time() + 8 * 3600)
                return self.reply(200, {"token": tok, "role": u["role"], "name": u["name"], "must_change": u.get("must_change", False)})
            try:
                challenge = start_otp("staff", uname, user_phone(u), u.get("salt", "") + ":" + u.get("hash", ""))
            except OTPError as exc:
                return self.reply(503, {"error": str(exc)})
            return self.reply(200, challenge)

        if path == "/api/student/login":
            if locked(ip): return self.reply(429, {"error": "Too many attempts. Wait 5 minutes."})
            uname = " ".join(str(data.get("name", "")).lower().split())
            pw = str(data.get("password", "")).strip().lower()
            db = dload()
            hit = None
            for x in db.get("students", []):
                names = {full(x.get("first"), x.get("middle"), x.get("surname")).lower(), full(x.get("first"), x.get("surname")).lower()}
                if uname and uname in names and eq(pw, str(x.get("adm", "")).strip().lower()):
                    hit = x
                    break
            if not hit:
                fail(ip)
                return self.reply(401, {"error": "Wrong name or admission number."})
            tok = secrets.token_urlsafe(32)
            STU[tok] = (hit["id"], time.time() + 4 * 3600)
            return self.reply(200, {"token": tok})

        self.reply(404, {"error": "Not found"})

    def log_message(self, *a): pass

if __name__ == "__main__":
    if len(ADMIN_PASSWORD) < 16 or not ADMIN_PASSWORD.strip():
        raise SystemExit("Set ADMIN_PASSWORD to a unique password of at least 16 characters before starting the server.")
    
    try:
        httpd = ThreadingHTTPServer(server_address, Handler)
        print(f"Tartar School portal running on port {port}.")
        httpd.serve_forever()
    except Exception as exc:
        logging.error("Server startup failed: %s", exc)
        raise SystemExit(1) from exc
