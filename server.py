#!/usr/bin/env python3
"""Tartar School login server. No installs needed: run  python server.py"""
import base64, hashlib, mimetypes, json, logging, os, re, secrets, time, hmac, threading, socket, urllib.error, urllib.request, urllib.parse, shutil, ssl, subprocess, sys
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

# ================= SETTINGS (edit these) =================
SCHOOL_CODE      = "24505103"
ADMIN_PASSWORD   = os.environ.get("ADMIN_PASSWORD", "")
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
ADMIN_EMAILS     = [email.strip().lower() for email in os.environ.get("GOOGLE_ADMIN_EMAILS", "").split(",") if email.strip()]
LOGIN_OTP_ENABLED = os.environ.get("LOGIN_OTP_ENABLED", "0").strip().lower() in ("1", "true", "yes", "on")
AT_USERNAME     = os.environ.get("AT_USERNAME", "").strip()
AT_API_KEY      = os.environ.get("AT_API_KEY", "").strip()
AT_SENDER       = os.environ.get("AT_SENDER", "").strip()
ADMIN_PHONE     = os.environ.get("ADMIN_PHONE", "").strip()
import os
from http.server import HTTPServer

port = int(os.environ.get("PORT", 8000))
server_address = ('0.0.0.0', port)
# Start normal HTTP server without SSL wrapping or HTTPS redirects on Render

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
BASE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(BASE, "codes.json")
LOCK = threading.Lock()
SESSIONS, FAILS = {}, {}
OTP_LOCK = threading.Lock()
OTP_CHALLENGES, OTP_LAST_SENT = {}, {}
FILES = {"/": ("portal/pages/index.html", "text/html; charset=utf-8"),
         "/index.html": ("portal/pages/index.html", "text/html; charset=utf-8"),
         "/manage.html": ("portal/pages/manage.html", "text/html; charset=utf-8"),
         "/student.html": ("portal/pages/student.html", "text/html; charset=utf-8"),
         "/crest.png": ("portal/assets/img/crest.png", "image/png")}
DATA = os.path.join(BASE, "data.json")
ID_RE = re.compile(r"^[\w|-]{1,60}$")
SCHEMA = {  # fields kept for each school-management collection
    "students":   ["name", "first", "middle", "surname", "adm", "class", "fee_total",
                   "g1_rel", "g1_first", "g1_middle", "g1_surname", "g1_id", "g1_phone",
                   "g2_rel", "g2_first", "g2_middle", "g2_surname", "g2_id", "g2_phone"],
    "classes":    ["name", "teacher"],
    "attendance": ["date", "class", "student", "status"],
    "fees":       ["student", "amount", "paid_on", "method"],
    "results":    ["student", "term", "subject", "score"],
    "resources":  ["title", "subject", "class", "filename"],   # files live in /uploads
}
UPLOADS = os.path.join(BASE, "uploads")
EXT = {"pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "txt", "png", "jpg", "jpeg"}
MAX_FILE = 8 * 1024 * 1024
USERS = os.path.join(BASE, "users.json")           # staff accounts (passwords stored hashed)
STAFF_SESS = {}   # staff session token -> (username, expiry)
TEACHER_LIKE = ("teacher", "senior", "deputy")   # senior teacher / deputy head of institution share the teacher permissions
ROLES = ("principal", "bursar") + TEACHER_LIKE
# which parts of the school records each role may change (admin and principal: everything)
ROLE_WRITE = {"bursar": {"ledgers", "receipts", "expenses", "pledges", "outbox"}}
for _r in TEACHER_LIKE:
    ROLE_WRITE[_r] = {"scores", "attendance", "outbox"}
USERNAME_RE = re.compile(r"^[a-z0-9._-]{3,30}$")
STU = {}      # student session token -> (student id, expiry)
STATE = os.path.join(BASE, "state.json")           # the school system's records
ADMISSIONS = os.path.join(BASE, "admissions.json")
CLUB_REQUESTS = os.path.join(BASE, "club-requests.json")
BACKUPS = os.path.join(BASE, "backups")
SCHOOL_DIR = os.path.join(BASE, "school")           # the Tartar School app (static files)
STATIC_EXT = {".html", ".js", ".css", ".png", ".svg", ".ico"}
ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
ADMISSION_LOCK = threading.Lock()
ADMISSION_SUBMISSIONS = {}
ADMISSION_GRADES = {"Early Years", "PP1", "PP2"} | {"Grade " + str(grade) for grade in range(1, 10)}
ADMISSION_STATUSES = {"New", "Contacted", "Accepted", "Declined"}
CLUB_OPTIONS = (
    "Chess Club",
    "Debate Club",
    "Scouts",
    "Coding and Robotics Club",
    "Science and Innovation Club",
    "Environmental Conservation (4K) Club",
    "Journalism and Media Club",
    "Music and Dance Club",
    "Drama Club",
    "Art and Craft Club",
    "Mathematics Club",
    "Young Farmers Club",
    "Red Cross and First Aid Club",
    "Community Service Club",
)
CLUB_MAX_SELECTIONS = 2
CLUB_STATUSES = {"Pending", "Approved", "Declined"}


def load():
    try:
        with open(DB) as f:
            return json.load(f)
    except Exception:
        return []

def save(d):
    with open(DB + ".tmp", "w") as f:
        json.dump(d, f, indent=2)
    os.replace(DB + ".tmp", DB)

def dload():
    try:
        with open(DATA) as f:
            return json.load(f)
    except Exception:
        return {}

def dsave(d):
    with open(DATA + ".tmp", "w") as f:
        json.dump(d, f, indent=1)
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
    try:
        return float(v)
    except Exception:
        return 0.0

def as_int(value):
    """Return an integer grade from an integer-like value, excluding booleans and fractions."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value) if value.is_integer() else None
    if isinstance(value, str):
        s = value.strip()
        if re.fullmatch(r"[+-]?\d+", s):
            return int(s)
    return None

def student_status(db, s):
    """'ok' only when the profile + guardian names are captured AND fees are fully paid."""
    need = ("first", "surname", "adm", "class", "g1_first", "g1_surname", "g1_id", "g1_phone")
    if not all(str(s.get(k) or "").strip() for k in need):
        return "incomplete"
    paid = sum(fnum(f.get("amount")) for f in db.get("fees", []) if f.get("student") == s["id"])
    fee = fnum(s.get("fee_total"))
    return "ok" if fee > 0 and paid >= fee else "fees"

def sload():
    try:
        with open(STATE) as f:
            return json.load(f)
    except Exception:
        return {}

def ssave(d):
    with open(STATE + ".tmp", "w") as f:
        json.dump(d, f)
    os.replace(STATE + ".tmp", STATE)

def admission_load():
    if not os.path.exists(ADMISSIONS):
        return []
    with open(ADMISSIONS, encoding="utf-8") as f:
        records = json.load(f)
    if not isinstance(records, list):
        raise ValueError("Admission records must be a list.")
    return records

def admission_save(records):
    temp = ADMISSIONS + ".tmp"
    with open(temp, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)
    os.replace(temp, ADMISSIONS)

def club_requests_load():
    if not os.path.exists(CLUB_REQUESTS):
        return []
    with open(CLUB_REQUESTS, encoding="utf-8") as f:
        records = json.load(f)
    if (not isinstance(records, list)
            or any(not isinstance(record, dict)
                   or not isinstance(record.get("id"), str)
                   or not re.fullmatch(r"[0-9a-f]{24}", record["id"])
                   or not isinstance(record.get("studentId"), str)
                   or not isinstance(record.get("activities"), list)
                   or not 1 <= len(record["activities"]) <= CLUB_MAX_SELECTIONS
                   or any(not isinstance(activity, str) or activity not in CLUB_OPTIONS
                          for activity in record["activities"])
                   or len(set(record["activities"])) != len(record["activities"])
                   or not isinstance(record.get("status"), str)
                   or record["status"] not in CLUB_STATUSES
                   or not isinstance(record.get("submitted"), str)
                   or not isinstance(record.get("reviewed", ""), str)
                   for record in records)
            or len({record["id"] for record in records}) != len(records)
            or len({record["studentId"] for record in records}) != len(records)):
        raise ValueError("Club request data is invalid.")
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
            if recent:
                ADMISSION_SUBMISSIONS[old_ip] = recent
            else:
                ADMISSION_SUBMISSIONS.pop(old_ip, None)
        stamps = ADMISSION_SUBMISSIONS.setdefault(ip, [])
        if len(stamps) >= 10:
            return True
        stamps.append(now)
        return False

def backup(cur):
    """Keep one snapshot per day (the state before that day's first save), last 30 days."""
    if cur.get("state") is None:
        return
    os.makedirs(BACKUPS, exist_ok=True)
    fn = os.path.join(BACKUPS, "state-" + time.strftime("%Y%m%d") + ".json")
    if not os.path.exists(fn):
        with open(fn, "w") as f:
            json.dump(cur, f)
        for old in sorted(os.listdir(BACKUPS))[:-30]:
            os.remove(os.path.join(BACKUPS, old))

def uload():
    try:
        with open(USERS) as f:
            return json.load(f)
    except Exception:
        return []

def usave(d):
    with open(USERS + ".tmp", "w") as f:
        json.dump(d, f, indent=1)
    os.replace(USERS + ".tmp", USERS)

def hash_pw(pw, salt=None):
    salt = salt or secrets.token_bytes(16)
    return salt.hex(), hashlib.pbkdf2_hmac("sha256", pw.encode(), salt, 200000).hex()

def check_pw(pw, salt_hex, hash_hex):
    return hmac.compare_digest(hash_pw(pw, bytes.fromhex(salt_hex))[1], hash_hex)

class OTPError(Exception):
    pass

def normalize_phone(value):
    phone = str(value or "").strip()
    digits = re.sub(r"\D", "", phone)
    if digits.startswith("0") and len(digits) == 10:
        digits = "254" + digits[1:]
    if re.fullmatch(r"254\d{9}", digits):
        phone = "+" + digits
    elif phone.startswith("+") and re.fullmatch(r"\d{8,15}", digits):
        phone = "+" + digits
    else:
        return ""
    return phone

def mask_phone(phone):
    return "number ending in " + phone[-4:]

def user_phone(user):
    phone = normalize_phone(user.get("phone"))
    if phone:
        return phone
    staff_id = user.get("staffId")
    if not staff_id:
        return ""
    staff = next((x for x in (sload().get("state") or {}).get("staff", [])
                  if x.get("id") == staff_id), None)
    return normalize_phone(staff.get("phone")) if staff else ""

def send_sms(phone, message):
    if not AT_USERNAME or not AT_API_KEY:
        raise OTPError("SMS delivery is not configured.")
    fields = {"username": AT_USERNAME, "to": phone, "message": message}
    if AT_SENDER:
        fields["from"] = AT_SENDER
    request = urllib.request.Request(
        "https://api.africastalking.com/version1/messaging",
        data=urllib.parse.urlencode(fields).encode(),
        headers={
            "apiKey": AT_API_KEY,
            "Accept": "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            result = json.loads(response.read().decode("utf-8"))
    except (OSError, ValueError, urllib.error.URLError) as exc:
        raise OTPError("SMS provider request failed.") from exc
    if not isinstance(result, dict):
        raise OTPError("SMS provider returned an invalid response.")
    message_data = result.get("SMSMessageData")
    recipients = message_data.get("Recipients") if isinstance(message_data, dict) else None
    if (not isinstance(recipients, list) or not recipients or not isinstance(recipients[0], dict)
            or str(recipients[0].get("statusCode")) not in ("100", "101")):
        raise OTPError("SMS provider did not accept the verification message.")

def start_otp(kind, username, phone, fingerprint=""):
    phone = normalize_phone(phone)
    if not phone:
        raise OTPError("No valid phone number is configured for this account.")
    if not AT_USERNAME or not AT_API_KEY:
        raise OTPError("SMS verification is not configured.")
    key = kind + ":" + username
    phone_key = "phone:" + phone
    now = time.time()
    with OTP_LOCK:
        for old_key, sent_at in list(OTP_LAST_SENT.items()):
            if now - sent_at >= 300:
                OTP_LAST_SENT.pop(old_key, None)
        previous = OTP_LAST_SENT.get(key, 0)
        phone_previous = OTP_LAST_SENT.get(phone_key, 0)
        if now - previous < 60 or now - phone_previous < 60:
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
            if OTP_LAST_SENT.get(key) == now:
                OTP_LAST_SENT.pop(key, None)
            if OTP_LAST_SENT.get(phone_key) == now:
                OTP_LAST_SENT.pop(phone_key, None)
        raise
    with OTP_LOCK:
        for old_id, old in list(OTP_CHALLENGES.items()):
            if old["key"] == key or old["expires"] <= now:
                OTP_CHALLENGES.pop(old_id, None)
        OTP_CHALLENGES[challenge_id] = {
            "key": key, "kind": kind, "username": username, "phone": phone,
            "fingerprint": fingerprint, "hash": code_hash,
            "expires": now + 300, "attempts": 0,
        }
    return {"requires_otp": True, "challenge_id": challenge_id, "sent_to": mask_phone(phone)}

def revoke(username):
    for t in [t for t, v in STAFF_SESS.items() if v[0] == username]:
        del STAFF_SESS[t]

def view_for(me, st):
    """What a role is allowed to read: teachers get no finance, bursars no marks, and only admin/principal see guardian ID numbers."""
    role = me["role"]
    if st is None or role in ("admin", "principal"):
        return st
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
    if not isinstance(lesson, dict):
        return "Enter a complete lesson allocation."
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
    if not ID_RE.fullmatch(lesson_id):
        return "The lesson identifier is invalid."
    if not class_record:
        return "Choose a class that exists in the school records."
    subject = lesson.get("subject")
    if not isinstance(subject, str) or subject not in SUBJECTS_BY_GRADE.get(as_int(class_record.get("grade")), set()):
        return "Choose a learning area offered to this class."
    if not teacher_id or teacher_id not in staff:
        return "Choose a teacher in the staff list."
    if day and day not in WEEKDAYS:
        return "Choose a weekday from Monday to Friday."
    if day:
        if not isinstance(start, str) or not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", start):
            return "Enter a valid lesson start time."
        if not isinstance(end, str) or not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", end) or start >= end:
            return "The lesson end time must be later than its start time."
    elif start or end:
        return "Assign a weekday before setting lesson times."
    if len(room) > 50:
        return "Room names must be 50 characters or fewer."
    for other in st.get("lessons", []):
        if not isinstance(other, dict):
            continue
        if other.get("id") == excluding_id or other.get("id") == lesson_id:
            continue
        other_start = other.get("start")
        other_end = other.get("end")
        if (other.get("day") != day or not isinstance(other_start, str) or not isinstance(other_end, str)
                or start >= other_end or other_start >= end):
            continue
        if (other.get("classId") == class_id
                or other.get("teacherId") == teacher_id
                or (room and str(other.get("room") or "").strip().casefold() == room.casefold())):
            return "This time overlaps another lesson for the same class, teacher, or room."
    return ""

def student_op_ok(me, st, op):
    """Who may add or change learners: the bursar admits boarders and assigns their class; class teachers add day scholars to their own class."""
    role, p, sid = me["role"], op["p"], me.get("staffId") or ""
    classes = {c.get("id"): c for c in st.get("classes", [])}
    students = {x.get("id"): x for x in st.get("students", [])}
    if len(p) == 2 and p[1].startswith("@") and not op.get("d"):            # a new learner
        v = op.get("v")
        if not isinstance(v, dict) or v.get("id") != p[1][1:] or v["id"] in students:
            return False
        cid = v.get("classId") or ""
        c = classes.get(cid)
        g = as_int(v.get("grade"))
        if role in TEACHER_LIKE:
            c_grade = as_int(c.get("grade")) if c else None
            return bool(
                c and sid and c.get("teacherId") == sid
                and v.get("boarding") == "Day" and g is not None and c_grade == g
            )
        if role == "bursar":
            class_matches = not cid or bool(c and as_int(c.get("grade")) == g)
            return v.get("boarding") == "Boarding" and g is not None and g >= 1 and class_matches
        return False
    if role == "bursar" and len(p) == 3 and p[1].startswith("@") and p[2] in ("classId", "grade") and not op.get("d"):
        x = students.get(p[1][1:])
        v = op.get("v")
        if not x or x.get("boarding") != "Boarding":
            return False
        if p[2] == "classId":
            c = classes.get(v)
            class_grade = as_int(c.get("grade", 0)) if c else None
            return class_grade is not None and class_grade >= 1
        g = as_int(v)
        return g is not None and g >= 1
    return False

def op_ok(me, st, op):
    role, p = me["role"], op["p"]
    if role == "bursar" and p[0] in ("ledgers", "receipts"):     # fees belong to real boarders only
        boarders = {x.get("id") for x in st.get("students", []) if x.get("boarding") == "Boarding"}
        if p[0] == "ledgers":
            return len(p) > 1 and p[1] in boarders
        v = op.get("v")
        return not (len(p) == 2 and p[1].startswith("@") and isinstance(v, dict)) or v.get("studentId") in boarders
    if role in ("admin", "principal") or p[0] in ROLE_WRITE.get(role, ()):
        return True
    if p[0] == "classes":          # a class teacher names the stream of their own class
        if role in TEACHER_LIKE and len(p) == 3 and p[1].startswith("@") and p[2] == "stream" and not op.get("d") and isinstance(op.get("v"), str) and len(op["v"]) <= 40:
            c = next((x for x in st.get("classes", []) if x.get("id") == p[1][1:]), None)
            return bool(c and me.get("staffId") and c.get("teacherId") == me["staffId"])
        return False
    if p[0] == "students":
        return student_op_ok(me, st, op)
    return False

def _step(cont, key, make):
    if isinstance(key, str) and key.startswith("@") and isinstance(cont, list):
        return next((x for x in cont if isinstance(x, dict) and x.get("id") == key[1:]), None)
    if isinstance(cont, dict):
        if key not in cont and make is not None:
            cont[key] = make
        return cont.get(key)
    return None

def apply_ops(st, ops):
    """Apply small changes (set/delete at a path) so two people saving at once never overwrite each other's work."""
    for op in ops:
        try:
            path = op["p"]
            cur = st
            for i, part in enumerate(path[:-1]):
                nxt = path[i + 1]
                cur = _step(cur, part, [] if isinstance(nxt, str) and nxt.startswith("@") else {})
                if cur is None:
                    break
            if cur is None:
                continue
            last = path[-1]
            if isinstance(last, str) and last.startswith("@") and isinstance(cur, list):
                idx = next((i for i, x in enumerate(cur) if isinstance(x, dict) and x.get("id") == last[1:]), None)
                if op.get("d"):
                    if idx is not None:
                        del cur[idx]
                elif idx is None:
                    cur.insert(min(int(op.get("i", len(cur))), len(cur)), op["v"])
                else:
                    cur[idx] = op["v"]
            elif isinstance(cur, dict) and isinstance(last, str):
                if op.get("d"):
                    cur.pop(last, None)
                else:
                    cur[last] = op["v"]
        except Exception:
            continue

def norm(s):  return str(s or "").strip().upper()
def eq(a, b): return hmac.compare_digest(str(a).encode(), str(b).encode())

def locked(ip):
    now = time.time()
    FAILS[ip] = [t for t in FAILS.get(ip, []) if now - t < 300]
    return len(FAILS[ip]) >= 8          # 8 wrong tries -> wait 5 minutes

def fail(ip): FAILS.setdefault(ip, []).append(time.time())

def new_token():
    t = secrets.token_urlsafe(32)
    SESSIONS[t] = time.time() + 8 * 3600
    return t

def make_code():
    s = "".join(secrets.choice(ALPHABET) for _ in range(8))
    return s[:4] + "-" + s[4:]


class Handler(BaseHTTPRequestHandler):
    def reply(self, status, obj=None, ctype="application/json", raw=None, extra=None):
        body = raw if raw is not None else json.dumps(obj or {}).encode()
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def is_admin(self):
        exp = SESSIONS.get(self.headers.get("Authorization", "")[7:])
        return bool(exp and exp > time.time())

    def who(self):
        if self.is_admin():
            return {"role": "admin"}
        v = STAFF_SESS.get(self.headers.get("Authorization", "")[7:])
        if v and v[1] > time.time():
            u = next((x for x in uload() if x["username"] == v[0]), None)
            if u:
                return {"role": u["role"], "name": u["name"], "username": u["username"], "staffId": u.get("staffId", "")}
        return None

    def student(self):
        v = STU.get(self.headers.get("Authorization", "")[7:])
        if not v or v[1] < time.time():
            return None, None
        db = dload()
        s = next((x for x in db.get("students", []) if x["id"] == v[0]), None)
        if not s or student_status(db, s) != "ok":      # re-checked on every request
            return None, None
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
        if path in ("/school", "/school/"):
            self.send_response(302)
            self.send_header("Location", "/school/app/dashboard.html")
            self.end_headers()
            return
        if path.startswith("/school/"):
            rel = os.path.normpath(urllib.parse.unquote(path[8:])).lstrip("/\\")
            target = os.path.realpath(os.path.join(SCHOOL_DIR, rel))
            if (not target.startswith(os.path.realpath(SCHOOL_DIR) + os.sep)
                    or os.path.splitext(target)[1].lower() not in STATIC_EXT or not os.path.isfile(target)):
                return self.reply(404, {"error": "Not found"})
            with open(target, "rb") as f:
                return self.reply(200, raw=f.read(), ctype=mimetypes.guess_type(target)[0] or "application/octet-stream")
        if path == "/api/public/profile":
            pr = (sload().get("state") or {}).get("profile", {})
            return self.reply(200, {"profile": {k: pr.get(k, "") for k in ("phone", "phone2", "email", "address", "poBox", "county", "hours", "website")}})
        if path == "/api/state":
            me = self.who()
            if not me:
                return self.reply(401, {"error": "Please log in."})
            cur = sload()
            return self.reply(200, {"rev": cur.get("rev", 0), "state": view_for(me, cur.get("state")), "me": me})
        if path == "/api/admin/users":
            if not self.is_admin():
                return self.reply(401, {"error": "Admin login required."})
            return self.reply(200, {"users": [{"username": u["username"], "name": u["name"], "role": u["role"],
                                               "phone": user_phone(u), "last_login": u.get("last_login", ""),
                                               "must_change": u.get("must_change", False)} for u in uload()]})
        if path == "/api/admin/admissions":
            if not self.is_admin():
                return self.reply(401, {"error": "Admin login required."})
            try:
                return self.reply(200, {"applications": admission_load()})
            except (OSError, ValueError, json.JSONDecodeError) as exc:
                logging.error("Could not read admission applications: %s", exc)
                return self.reply(500, {"error": "Admission applications could not be loaded."})
        if path == "/api/admin/clubs":
            me = self.who()
            if not me or me.get("role") not in ("admin", "principal"):
                return self.reply(401, {"error": "Head of institution or admin access required."})
            try:
                requests = club_requests_load()
                db = dload()
                students = {item.get("id"): item for item in db.get("students", [])}
                classes = {item.get("id"): item for item in db.get("classes", [])}
                items = []
                for request in requests:
                    student = students.get(request.get("studentId"), {})
                    class_record = classes.get(student.get("class"), {})
                    items.append({
                        "id": request.get("id", ""),
                        "student_name": full(student.get("first"), student.get("middle"), student.get("surname")),
                        "class_name": class_record.get("name", ""),
                        "activities": request.get("activities", []),
                        "status": request.get("status", "Pending"),
                        "submitted": request.get("submitted", ""),
                        "reviewed": request.get("reviewed", ""),
                    })
                return self.reply(200, {"requests": items, "activities": CLUB_OPTIONS})
            except (OSError, ValueError, json.JSONDecodeError) as exc:
                logging.error("Could not read club requests: %s", exc)
                return self.reply(500, {"error": "Club requests could not be loaded."})
        if path == "/api/student/me":
            s, db = self.student()
            if not s:
                return self.reply(401, {"error": "Please log in."})
            cname = next((c["name"] for c in db.get("classes", []) if c["id"] == s["class"]), "")
            try:
                request = next((item for item in club_requests_load() if item.get("studentId") == s["id"]), None)
            except (OSError, ValueError, json.JSONDecodeError) as exc:
                logging.error("Could not read learner club request: %s", exc)
                return self.reply(500, {"error": "Your club selections could not be loaded."})
            return self.reply(200, {"name": s["name"], "adm": s["adm"], "class": cname,
                "results": [x for x in db.get("results", []) if x.get("student") == s["id"]],
                "resources": [x for x in db.get("resources", []) if x.get("class") in ("", s["class"])],
                "clubs": {"activities": request.get("activities", []), "status": request.get("status", "Pending"),
                          "submitted": request.get("submitted", "")} if request else None,
                "club_options": CLUB_OPTIONS, "club_max_selections": CLUB_MAX_SELECTIONS})
        if path.startswith("/api/file/"):
            rid = path[10:]
            db = dload()
            rec = next((x for x in db.get("resources", []) if x["id"] == rid), None) if ID_RE.match(rid) else None
            if not rec:
                return self.reply(404, {"error": "Not found"})
            if not self.is_admin():
                s, _ = self.student()
                if not s or rec["class"] not in ("", s["class"]):
                    return self.reply(401, {"error": "Not allowed."})
            try:
                with open(os.path.join(UPLOADS, rid), "rb") as f:
                    blob = f.read()
            except OSError:
                return self.reply(404, {"error": "File missing."})
            safe = re.sub(r"[^\w.\- ]", "_", rec["filename"])
            return self.reply(200, raw=blob, ctype=mimetypes.guess_type(rec["filename"])[0] or "application/octet-stream",
                              extra={"Content-Disposition": 'attachment; filename="%s"' % safe, "X-Content-Type-Options": "nosniff"})
        if path.startswith("/api/m/"):
            if not self.is_admin():
                return self.reply(401, {"error": "Admin login required."})
            col = path[7:]
            if col not in SCHEMA:
                return self.reply(404, {"error": "Not found"})
            return self.reply(200, {"items": dload().get(col, [])})
        if path == "/api/config":
            return self.reply(200, {"google_client_id": GOOGLE_CLIENT_ID})
        if path == "/api/admin/codes":
            if not self.is_admin():
                return self.reply(401, {"error": "Admin login required."})
            return self.reply(200, {"codes": load()})
        self.reply(404, {"error": "Not found"})

    def do_POST(self):
        path, ip = urllib.parse.urlparse(self.path).path, self.client_address[0]
        try:
            n = min(int(self.headers.get("Content-Length") or 0), 12000000 if path in ("/api/admin/upload", "/api/state") else 10000)
            data = json.loads(self.rfile.read(n) or b"{}")
        except Exception:
            return self.reply(400, {"error": "Bad request."})
        if not isinstance(data, dict):
            return self.reply(400, {"error": "Bad request."})

        if path == "/api/admissions":
            text_fields = ("learner_name", "date_of_birth", "grade", "guardian_name", "guardian_phone")
            if data.get("website"):
                return self.reply(400, {"error": "Could not submit the application."})
            if data.get("consent") != "yes":
                return self.reply(400, {"error": "Confirm that you are authorized to submit this application."})
            if any(not isinstance(data.get(field), str) for field in text_fields):
                return self.reply(400, {"error": "Complete all required application fields."})
            learner_name = data["learner_name"].strip()
            date_of_birth = data["date_of_birth"].strip()
            grade = data["grade"].strip()
            guardian_name = data["guardian_name"].strip()
            guardian_phone = data["guardian_phone"].strip()
            digits = re.sub(r"\D", "", guardian_phone)
            if not learner_name or len(learner_name) > 120:
                return self.reply(400, {"error": "Enter the learner's name (up to 120 characters)."})
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date_of_birth):
                return self.reply(400, {"error": "Enter a valid date of birth."})
            try:
                time.strptime(date_of_birth, "%Y-%m-%d")
                if date_of_birth > time.strftime("%Y-%m-%d"):
                    return self.reply(400, {"error": "Date of birth cannot be in the future."})
            except ValueError:
                return self.reply(400, {"error": "Enter a valid date of birth."})
            if grade not in ADMISSION_GRADES:
                return self.reply(400, {"error": "Choose a valid class or grade."})
            if not guardian_name or len(guardian_name) > 120:
                return self.reply(400, {"error": "Enter the parent or guardian's name (up to 120 characters)."})
            if (len(guardian_phone) > 24 or not re.fullmatch(r"[+0-9() .-]{7,24}", guardian_phone)
                    or not 7 <= len(digits) <= 15):
                return self.reply(400, {"error": "Enter a valid parent or guardian phone number."})
            if admission_rate_limited(ip):
                return self.reply(429, {"error": "Too many applications were submitted from this connection. Please try again later."})
            record = {
                "id": secrets.token_hex(12),
                "learner_name": learner_name,
                "date_of_birth": date_of_birth,
                "grade": grade,
                "guardian_name": guardian_name,
                "guardian_phone": guardian_phone,
                "submitted": time.strftime("%Y-%m-%d %H:%M:%S"),
                "status": "New",
            }
            try:
                with LOCK:
                    records = admission_load()
                    records.append(record)
                    admission_save(records)
            except (OSError, ValueError, json.JSONDecodeError) as exc:
                logging.error("Could not save admission application: %s", exc)
                return self.reply(500, {"error": "The application could not be saved. Please contact the school."})
            return self.reply(201, {"ok": True})

        if path == "/api/student/clubs":
            student, _ = self.student()
            if not student:
                return self.reply(401, {"error": "Please log in."})
            activities = data.get("activities")
            if (not isinstance(activities, list) or not 1 <= len(activities) <= CLUB_MAX_SELECTIONS
                    or any(not isinstance(activity, str) or activity not in CLUB_OPTIONS for activity in activities)
                    or len(set(activities)) != len(activities)):
                return self.reply(400, {"error": "Choose one or two different activities from the list."})
            now = time.strftime("%Y-%m-%d %H:%M:%S")
            try:
                with LOCK:
                    requests = club_requests_load()
                    existing = next((item for item in requests if item.get("studentId") == student["id"]), None)
                    if existing:
                        existing["activities"] = activities
                        existing["status"] = "Pending"
                        existing["submitted"] = now
                        existing["reviewed"] = ""
                    else:
                        requests.append({
                            "id": secrets.token_hex(12),
                            "studentId": student["id"],
                            "activities": activities,
                            "status": "Pending",
                            "submitted": now,
                            "reviewed": "",
                        })
                    club_requests_save(requests)
            except (OSError, ValueError, json.JSONDecodeError) as exc:
                logging.error("Could not save learner club request: %s", exc)
                return self.reply(500, {"error": "Your club selections could not be saved. Please try again."})
            return self.reply(200, {"ok": True, "status": "Pending"})

        # ---- user login: school code + admin-generated access code ----
        if path == "/api/login":
            if locked(ip):
                return self.reply(429, {"error": "Too many attempts. Wait 5 minutes."})
            school, code = norm(data.get("school")), norm(data.get("code"))
            if not eq(school, SCHOOL_CODE):
                fail(ip); return self.reply(401, {"error": "Invalid school code."})
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

        # ---- admin login (password) ----
        if path == "/api/admin/login":
            if locked(ip):
                return self.reply(429, {"error": "Too many attempts. Wait 5 minutes."})
            if not eq(data.get("password", ""), ADMIN_PASSWORD):
                fail(ip); return self.reply(401, {"error": "Wrong admin password."})
            if not LOGIN_OTP_ENABLED:
                return self.reply(200, {"token": new_token(), "role": "admin"})
            try:
                challenge = start_otp("admin", "admin", ADMIN_PHONE)
            except OTPError as exc:
                logging.warning("Could not start admin OTP: %s", exc)
                status = 429 if "Wait one minute" in str(exc) else 503
                return self.reply(status, {"error": str(exc)})
            return self.reply(200, challenge)

        # ---- admin login (Google, verified here on the server) ----
        if path == "/api/admin/google":
            if locked(ip):
                return self.reply(429, {"error": "Too many attempts. Wait 5 minutes."})
            try:
                url = "https://oauth2.googleapis.com/tokeninfo?id_token=" + urllib.parse.quote(data.get("credential", ""))
                with urllib.request.urlopen(url, timeout=10) as r:
                    info = json.load(r)
                ok = (GOOGLE_CLIENT_ID and info.get("aud") == GOOGLE_CLIENT_ID
                      and str(info.get("email_verified")).lower() == "true"
                      and info.get("email", "").lower() in [e.lower() for e in ADMIN_EMAILS])
            except Exception:
                ok, info = False, {}
            if not ok:
                fail(ip)
                return self.reply(401, {"error": (info.get("email") or "That account") + " is not an authorised admin."})
            if not LOGIN_OTP_ENABLED:
                return self.reply(200, {"token": new_token(), "role": "admin"})
            try:
                challenge = start_otp("admin", "admin", ADMIN_PHONE)
            except OTPError as exc:
                logging.warning("Could not start admin OTP: %s", exc)
                status = 429 if "Wait one minute" in str(exc) else 503
                return self.reply(status, {"error": str(exc)})
            return self.reply(200, challenge)

        if path in ("/api/admin/verify-otp", "/api/staff/verify-otp"):
            if not LOGIN_OTP_ENABLED:
                return self.reply(404, {"error": "SMS verification is currently disabled."})
            if locked(ip):
                return self.reply(429, {"error": "Too many attempts. Wait 5 minutes."})
            expected_kind = "admin" if path.startswith("/api/admin/") else "staff"
            challenge_id = str(data.get("challenge_id", ""))
            code = str(data.get("code", "")).strip()
            with OTP_LOCK:
                challenge = OTP_CHALLENGES.get(challenge_id)
                if not challenge or challenge["kind"] != expected_kind:
                    return self.reply(400, {"error": "Invalid or expired verification request."})
                if challenge["expires"] <= time.time():
                    OTP_CHALLENGES.pop(challenge_id, None)
                    return self.reply(401, {"error": "The verification code expired. Sign in again."})
                expected = hmac.new(challenge_id.encode(), code.encode(), hashlib.sha256).hexdigest()
                if not re.fullmatch(r"\d{6}", code) or not hmac.compare_digest(challenge["hash"], expected):
                    challenge["attempts"] += 1
                    if challenge["attempts"] >= 5:
                        OTP_CHALLENGES.pop(challenge_id, None)
                    fail(ip)
                    return self.reply(401, {"error": "Incorrect verification code."})
                OTP_CHALLENGES.pop(challenge_id, None)

            if expected_kind == "admin":
                return self.reply(200, {"token": new_token(), "role": "admin"})

            with LOCK:
                users = uload()
                user = next((x for x in users if x["username"] == challenge["username"]), None)
                if (not user
                        or challenge["fingerprint"] != user.get("salt", "") + ":" + user.get("hash", "")
                        or user_phone(user) != challenge["phone"]):
                    return self.reply(401, {"error": "This sign-in request is no longer valid. Sign in again."})
                user["last_login"] = time.strftime("%Y-%m-%d %H:%M")
                usave(users)
                token = secrets.token_urlsafe(32)
                STAFF_SESS[token] = (user["username"], time.time() + 8 * 3600)
                return self.reply(200, {"token": token, "role": user["role"], "name": user["name"],
                                        "must_change": user.get("must_change", False)})

        # ---- learner login: full name + admission number ----
        if path == "/api/student/login":
            if locked(ip):
                return self.reply(429, {"error": "Too many attempts. Wait 5 minutes."})
            uname = " ".join(str(data.get("name", "")).lower().split())
            pw = str(data.get("password", "")).strip().lower()
            db = dload()
            hit = None
            for x in db.get("students", []):
                names = {full(x.get("first"), x.get("middle"), x.get("surname")).lower(),
                         full(x.get("first"), x.get("surname")).lower()}
                if uname and uname in names and eq(pw, str(x.get("adm", "")).strip().lower()):
                    hit = x
                    break
            if not hit:
                fail(ip)
                return self.reply(401, {"error": "Wrong name or admission number."})
            st = student_status(db, hit)
            if st == "incomplete":
                return self.reply(403, {"error": "Your profile is not complete yet. Please contact the school office."})
            if st == "fees":
                return self.reply(403, {"error": "Portal access opens once your fees are fully paid. Please contact the school office."})
            tok = secrets.token_urlsafe(32)
            STU[tok] = (hit["id"], time.time() + 4 * 3600)
            return self.reply(200, {"token": tok})

        # ---- staff login (teacher / bursar / principal) ----
        if path == "/api/staff/login":
            if locked(ip):
                return self.reply(429, {"error": "Too many attempts. Wait 5 minutes."})
            uname = str(data.get("username", "")).strip().lower()
            users = uload()
            u = next((x for x in users if x["username"] == uname), None)
            if not u or not check_pw(str(data.get("password", "")), u["salt"], u["hash"]):
                fail(ip)
                return self.reply(401, {"error": "Wrong username or password."})
            if not LOGIN_OTP_ENABLED:
                tok = secrets.token_urlsafe(32)
                STAFF_SESS[tok] = (uname, time.time() + 8 * 3600)
                with LOCK:
                    users = uload()
                    for x in users:
                        if x["username"] == uname:
                            x["last_login"] = time.strftime("%Y-%m-%d %H:%M")
                    usave(users)
                return self.reply(200, {"token": tok, "role": u["role"], "name": u["name"],
                                        "must_change": u.get("must_change", False)})
            phone = user_phone(u)
            try:
                challenge = start_otp("staff", uname, phone, u.get("salt", "") + ":" + u.get("hash", ""))
            except OTPError as exc:
                logging.warning("Could not start staff OTP for %s: %s", uname, exc)
                status = 429 if "Wait one minute" in str(exc) else 503
                return self.reply(status, {"error": str(exc)})
            return self.reply(200, challenge)

        if path == "/api/staff/password":
            me = self.who()
            if not me or "username" not in me:
                return self.reply(401, {"error": "Please log in."})
            if locked(ip):
                return self.reply(429, {"error": "Too many attempts. Wait 5 minutes."})
            old, new = str(data.get("old", "")), str(data.get("new", ""))
            if len(new) < 8:
                return self.reply(400, {"error": "Use at least 8 characters."})
            with LOCK:
                users = uload()
                u = next(x for x in users if x["username"] == me["username"])
                if not check_pw(old, u["salt"], u["hash"]):
                    fail(ip)
                    return self.reply(401, {"error": "Current password is wrong."})
                if old == new:
                    return self.reply(400, {"error": "Choose a different password."})
                u["salt"], u["hash"] = hash_pw(new)
                u["must_change"] = False
                usave(users)
            return self.reply(200, {"ok": True})

        # ---- the head of institution (or admin) manages teacher logins ----
        if path in ("/api/staff-accounts", "/api/staff-accounts/reset", "/api/staff-accounts/delete"):
            me = self.who()
            if not me or me["role"] not in ("admin", "principal"):
                return self.reply(401, {"error": "Only the head of institution can do this."})
            uname = str(data.get("username", "")).strip().lower()
            with LOCK:
                users = uload()
                if path == "/api/staff-accounts":
                    sid, role = str(data.get("staffId", "")), data.get("role")
                    staff = next((x for x in (sload().get("state") or {}).get("staff", []) if x.get("id") == sid), None)
                    if not staff or role not in TEACHER_LIKE or not USERNAME_RE.match(uname):
                        return self.reply(400, {"error": "Choose a staff member, a position and a username of 3-30 letters, numbers, dots, dashes or underscores."})
                    if not normalize_phone(staff.get("phone")):
                        return self.reply(400, {"error": "Add a valid mobile number to this staff profile before creating a login."})
                    if any(u["username"] == uname for u in users) or any(u.get("staffId") == sid for u in users):
                        return self.reply(400, {"error": "That username is taken, or this person already has a login."})
                    temp = make_code()
                    salt, h = hash_pw(temp)
                    users.append({"username": uname, "name": str(staff.get("name", ""))[:80], "role": role, "staffId": sid, "salt": salt, "hash": h,
                                  "must_change": True, "created": time.strftime("%Y-%m-%d %H:%M")})
                    usave(users)
                    return self.reply(200, {"ok": True, "temp": temp})
                u = next((x for x in users if x["username"] == uname and x["role"] in TEACHER_LIKE), None)
                if not u:
                    return self.reply(404, {"error": "No such teacher login."})
                revoke(uname)
                if path.endswith("delete"):
                    usave([x for x in users if x["username"] != uname])
                    return self.reply(200, {"ok": True})
                temp = make_code()
                u["salt"], u["hash"] = hash_pw(temp)
                u["must_change"] = True
                usave(users)
            return self.reply(200, {"ok": True, "temp": temp})

        if path == "/api/timetable":
            me = self.who()
            if not me or me["role"] not in ("admin", "principal"):
                return self.reply(403, {"error": "Only the head of institution can manage the timetable."})
            action = data.get("action")
            with LOCK:
                cur = sload()
                st = cur.get("state") or {}
                lessons = st.setdefault("lessons", [])
                if not isinstance(lessons, list):
                    return self.reply(409, {"error": "Timetable records are invalid; restore a verified backup before editing."})
                if action in ("create", "update"):
                    lesson = data.get("lesson")
                    if not isinstance(lesson, dict):
                        return self.reply(400, {"error": "Enter a complete lesson allocation."})
                    lesson_id = str(lesson.get("id", ""))
                    existing = next((x for x in lessons if isinstance(x, dict) and x.get("id") == lesson_id), None)
                    if action == "create" and existing:
                        return self.reply(409, {"error": "That lesson already exists. Refresh and try again."})
                    if action == "update" and not existing:
                        return self.reply(404, {"error": "That lesson no longer exists. Refresh the timetable."})
                    error = lesson_error(st, lesson, lesson_id if action == "update" else "")
                    if error:
                        status = 409 if error.startswith("This time overlaps") else 400
                        return self.reply(status, {"error": error})
                    saved = {
                        "id": lesson_id,
                        "classId": str(lesson.get("classId", "")),
                        "subject": str(lesson.get("subject", "")),
                        "teacherId": str(lesson.get("teacherId", "")),
                        "day": lesson.get("day") or "",
                        "start": lesson.get("start") or "",
                        "end": lesson.get("end") or "",
                        "room": str(lesson.get("room", "")).strip(),
                    }
                    if existing:
                        lessons[lessons.index(existing)] = saved
                    else:
                        lessons.append(saved)
                elif action == "delete":
                    lesson_id = str(data.get("lessonId", ""))
                    existing = next((x for x in lessons if isinstance(x, dict) and x.get("id") == lesson_id), None)
                    if not existing:
                        return self.reply(404, {"error": "That lesson no longer exists. Refresh the timetable."})
                    lessons.remove(existing)
                    saved = None
                else:
                    return self.reply(400, {"error": "Choose create, update, or delete."})
                backup(cur)
                rev = cur.get("rev", 0) + 1
                ssave({"rev": rev, "state": st})
            return self.reply(200, {"ok": True, "rev": rev, "lesson": saved})

        # ---- school records: saved as small changes, filtered by role ----
        if path == "/api/state":
            me = self.who()
            if not me:
                return self.reply(401, {"error": "Please log in."})
            ops = data.get("ops")
            if not isinstance(ops, list) or len(ops) > 5000:
                return self.reply(400, {"error": "Bad data."})
            ops = [o for o in ops if isinstance(o, dict) and isinstance(o.get("p"), list) and o["p"] and all(isinstance(x, str) for x in o["p"])]
            if any(o["p"][0] == "lessons" for o in ops):
                return self.reply(400, {"error": "Use the timetable page to manage lesson allocations."})
            with LOCK:
                cur = sload()
                rev = cur.get("rev", 0)
                st = cur.get("state") or {}
                ops.sort(key=lambda o: 0 if o["p"][0] in ("classes", "students") else 1)   # learners/classes first, then their fees and marks
                applied = 0
                for o in ops:                       # one at a time, so later changes can rely on earlier accepted ones
                    if op_ok(me, st, o):
                        apply_ops(st, [o])
                        applied += 1
                if applied:
                    backup(cur)
                    rev += 1
                    ssave({"rev": rev, "state": st})
            return self.reply(200, {"rev": rev})

        # ---- everything below needs an admin session, except the principal club reviewer ----
        if not self.is_admin() and not (
                path == "/api/admin/clubs/update"
                and (self.who() or {}).get("role") == "principal"):
            return self.reply(401, {"error": "Admin login required."})

        if path in ("/api/admin/admissions/update", "/api/admin/admissions/delete"):
            record_id = str(data.get("id", ""))
            if not re.fullmatch(r"[0-9a-f]{24}", record_id):
                return self.reply(400, {"error": "Invalid application."})
            try:
                with LOCK:
                    records = admission_load()
                    record = next((item for item in records if item.get("id") == record_id), None)
                    if not record:
                        return self.reply(404, {"error": "That application no longer exists."})
                    if path.endswith("/delete"):
                        records.remove(record)
                    else:
                        status = data.get("status")
                        if not isinstance(status, str) or status not in ADMISSION_STATUSES:
                            return self.reply(400, {"error": "Choose a valid application status."})
                        record["status"] = status
                    admission_save(records)
            except (OSError, ValueError, json.JSONDecodeError) as exc:
                logging.error("Could not update admission application: %s", exc)
                return self.reply(500, {"error": "The application could not be updated."})
            return self.reply(200, {"ok": True})

        if path == "/api/admin/clubs/update":
            me = self.who()
            if not me or me.get("role") not in ("admin", "principal"):
                return self.reply(401, {"error": "Head of institution or admin access required."})
            request_id = str(data.get("id", ""))
            status = data.get("status")
            if not re.fullmatch(r"[0-9a-f]{24}", request_id):
                return self.reply(400, {"error": "Invalid club request."})
            if not isinstance(status, str) or status not in CLUB_STATUSES:
                return self.reply(400, {"error": "Choose a valid club request status."})
            try:
                with LOCK:
                    requests = club_requests_load()
                    request = next((item for item in requests if item.get("id") == request_id), None)
                    if not request:
                        return self.reply(404, {"error": "That club request no longer exists."})
                    request["status"] = status
                    request["reviewed"] = "" if status == "Pending" else time.strftime("%Y-%m-%d %H:%M:%S")
                    club_requests_save(requests)
            except (OSError, ValueError, json.JSONDecodeError) as exc:
                logging.error("Could not update club request: %s", exc)
                return self.reply(500, {"error": "The club request could not be updated."})
            return self.reply(200, {"ok": True})

        if path == "/api/admin/generate":
            with LOCK:
                db = load()
                code = make_code()
                while any(r["code"] == code for r in db):
                    code = make_code()
                db.append({"label": str(data.get("label", ""))[:60], "code": code,
                           "once": bool(data.get("once", True)), "used": False,
                           "created": time.strftime("%Y-%m-%d %H:%M:%S")})
                save(db)
            return self.reply(200, {"code": code})

        if path == "/api/admin/revoke":
            with LOCK:
                save([r for r in load() if r["code"] != norm(data.get("code"))])
            return self.reply(200, {"ok": True})

        if path == "/api/admin/users/phone":
            uname = str(data.get("username", "")).strip().lower()
            phone = normalize_phone(data.get("phone"))
            if not phone:
                return self.reply(400, {"error": "Enter a valid phone number, for example +254712345678."})
            with LOCK:
                users = uload()
                user = next((x for x in users if x["username"] == uname), None)
                if not user:
                    return self.reply(404, {"error": "No such user."})
                user["phone"] = phone
                usave(users)
                revoke(uname)
            return self.reply(200, {"ok": True})

        if path == "/api/admin/users":
            name = str(data.get("name", "")).strip()[:80]
            uname = str(data.get("username", "")).strip().lower()
            role = data.get("role")
            phone = normalize_phone(data.get("phone"))
            if not name or role not in ROLES or not USERNAME_RE.match(uname) or not phone:
                return self.reply(400, {"error": "Enter a name, a role, a valid phone number and a username of 3-30 letters, numbers, dots, dashes or underscores."})
            temp = make_code()
            with LOCK:
                users = uload()
                if any(x["username"] == uname for x in users):
                    return self.reply(400, {"error": "That username is already taken."})
                salt, h = hash_pw(temp)
                users.append({"username": uname, "name": name, "role": role, "phone": phone, "salt": salt, "hash": h,
                              "must_change": True, "created": time.strftime("%Y-%m-%d %H:%M")})
                usave(users)
            return self.reply(200, {"ok": True, "temp": temp})

        if path in ("/api/admin/users/reset", "/api/admin/users/delete"):
            uname = str(data.get("username", "")).strip().lower()
            with LOCK:
                users = uload()
                u = next((x for x in users if x["username"] == uname), None)
                if not u:
                    return self.reply(404, {"error": "No such user."})
                revoke(uname)
                if path.endswith("delete"):
                    usave([x for x in users if x["username"] != uname])
                    return self.reply(200, {"ok": True})
                temp = make_code()
                u["salt"], u["hash"] = hash_pw(temp)
                u["must_change"] = True
                usave(users)
            return self.reply(200, {"ok": True, "temp": temp})

        if path == "/api/admin/upload":
            fn = os.path.basename(str(data.get("filename", "")))
            ext = fn.rsplit(".", 1)[-1].lower() if "." in fn else ""
            title = str(data.get("title", "")).strip()[:100]
            if ext not in EXT or not title:
                return self.reply(400, {"error": "A title and an allowed file type (pdf, doc, docx, ppt, pptx, xls, xlsx, txt, png, jpg) are required."})
            try:
                blob = base64.b64decode(data.get("data", ""), validate=True)
            except Exception:
                return self.reply(400, {"error": "Bad file data."})
            if not blob or len(blob) > MAX_FILE:
                return self.reply(400, {"error": "File must be under 8 MB."})
            rid = secrets.token_hex(6)
            os.makedirs(UPLOADS, exist_ok=True)
            with open(os.path.join(UPLOADS, rid), "wb") as f:
                f.write(blob)
            with LOCK:
                db = dload()
                db.setdefault("resources", []).append({"id": rid, "title": title, "filename": fn[:100],
                    "subject": str(data.get("subject", "")).strip()[:60], "class": str(data.get("class", ""))[:60]})
                dsave(db)
            return self.reply(200, {"ok": True})

        if path.startswith("/api/m/"):
            parts = path[7:].split("/")
            col = parts[0]
            if col not in SCHEMA:
                return self.reply(404, {"error": "Not found"})
            with LOCK:
                db = dload()
                items = db.setdefault(col, [])
                if len(parts) == 2 and parts[1] == "delete":
                    rid = str(data.get("id", ""))
                    if col == "classes" and any(x.get("class") == rid for x in db.get("students", [])):
                        return self.reply(400, {"error": "Move or remove this class's students first."})
                    if col == "resources" and ID_RE.match(rid):
                        try:
                            os.remove(os.path.join(UPLOADS, rid))
                        except OSError:
                            pass
                    db[col] = [x for x in items if x["id"] != rid]
                    if col == "students":      # remove the student's own records too
                        for c in ("attendance", "fees", "results"):
                            db[c] = [x for x in db.get(c, []) if x.get("student") != rid]
                    dsave(db)
                    return self.reply(200, {"ok": True})
                if col == "resources":
                    return self.reply(400, {"error": "Use the upload button for resources."})
                rid = str(data.get("id") or "") or secrets.token_hex(4)
                if not ID_RE.match(rid):
                    return self.reply(400, {"error": "Bad id."})
                rec = clean(col, data)
                rec["id"] = rid
                if col == "students":
                    rec["name"] = full(rec["first"], rec["middle"], rec["surname"]) or rec["name"]
                    adm = str(rec["adm"]).lower()
                    if adm and any(x["id"] != rid and str(x.get("adm", "")).lower() == adm for x in items):
                        return self.reply(400, {"error": "That admission number already exists."})
                for i, x in enumerate(items):
                    if x["id"] == rid:
                        items[i] = rec
                        break
                else:
                    items.append(rec)
                dsave(db)
            return self.reply(200, {"ok": True, "id": rid})

        self.reply(404, {"error": "Not found"})

    def log_message(self, *a):
        pass


def lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "your-computer-ip"


def tls_directory():
    if os.environ.get("TARTAR_TLS_DIR"):
        return os.path.abspath(os.environ["TARTAR_TLS_DIR"])
    if os.name == "nt":
        root = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
    else:
        root = os.environ.get("XDG_CONFIG_HOME") or os.path.join(os.path.expanduser("~"), ".config")
    return os.path.join(root, "TartarSchool", "https")


def openssl_executable():
    executable = shutil.which("openssl")
    if executable:
        return executable
    if os.name == "nt":
        for candidate in (
            os.path.join(os.environ.get("ProgramFiles", r"C:\Program Files"), "Git", "usr", "bin", "openssl.exe"),
            os.path.join(os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)"), "Git", "usr", "bin", "openssl.exe"),
        ):
            if os.path.isfile(candidate):
                return candidate
    return None


def ensure_tls_certificate():
    cert_file = os.environ.get("TARTAR_TLS_CERT")
    key_file = os.environ.get("TARTAR_TLS_KEY")
    if bool(cert_file) != bool(key_file):
        raise RuntimeError("Set both TARTAR_TLS_CERT and TARTAR_TLS_KEY, or leave both unset for a local self-signed certificate.")
    if cert_file:
        cert_file, key_file = os.path.abspath(cert_file), os.path.abspath(key_file)
        if not os.path.isfile(cert_file) or not os.path.isfile(key_file):
            raise RuntimeError("The configured TLS certificate or private key file does not exist.")
        return cert_file, key_file, False

    directory = tls_directory()
    os.makedirs(directory, exist_ok=True)
    cert_file = os.path.join(directory, "tartar-school-local.crt")
    key_file = os.path.join(directory, "tartar-school-local.key")
    openssl = openssl_executable()
    if not openssl:
        raise RuntimeError("OpenSSL is required to create the local HTTPS certificate. Install OpenSSL or set TARTAR_TLS_CERT and TARTAR_TLS_KEY.")

    local_ip = lan_ip()
    hostname = socket.gethostname()
    san = ["DNS:localhost", "IP:127.0.0.1"]
    if hostname and re.fullmatch(r"[A-Za-z0-9.-]+", hostname):
        san.append("DNS:" + hostname)
    if local_ip != "your-computer-ip":
        san.append("IP:" + local_ip)

    regenerate = not os.path.isfile(cert_file) or not os.path.isfile(key_file)
    if not regenerate:
        checks = []
        if hostname:
            checks.append(["-checkhost", hostname])
        if local_ip != "your-computer-ip":
            checks.append(["-checkip", local_ip])
        for check in checks:
            result = subprocess.run(
                [openssl, "x509", "-in", cert_file, "-noout"] + check,
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False,
            )
            if result.returncode:
                regenerate = True
                break
    if regenerate:
        try:
            subprocess.run(
                [
                    openssl, "req", "-x509", "-newkey", "rsa:2048", "-sha256", "-nodes",
                    "-days", "825", "-keyout", key_file, "-out", cert_file,
                    "-subj", "/CN=Tartar Primary and Junior School",
                    "-addext", "subjectAltName=" + ",".join(san),
                ],
                check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True,
            )
        except subprocess.CalledProcessError as exc:
            raise RuntimeError("Could not generate the local HTTPS certificate: " + (exc.stderr or "").strip()) from exc
        except OSError as exc:
            raise RuntimeError("Could not run OpenSSL to generate the HTTPS certificate: " + str(exc)) from exc
    return cert_file, key_file, True


class HTTPSRedirectHandler(BaseHTTPRequestHandler):
    def redirect(self, include_body=True):
        if self.command not in ("GET", "HEAD"):
            body = b"HTTPS required. Reopen the page using its secure HTTPS address."
            self.send_response(426)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body) if include_body else 0))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            if include_body:
                self.wfile.write(body)
            return

        requested_host = urllib.parse.urlsplit("//" + self.headers.get("Host", "")).hostname
        allowed_hosts = {"localhost", "127.0.0.1", socket.gethostname().lower()}
        local_ip = lan_ip()
        if local_ip != "your-computer-ip":
            allowed_hosts.add(local_ip.lower())
        host = requested_host.lower() if requested_host and requested_host.lower() in allowed_hosts else "localhost"
        location = "https://" + host + ":" + str(HTTPS_PORT) + self.path
        self.send_response(308)
        self.send_header("Location", location)
        self.send_header("Content-Length", "0")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

    def do_GET(self):
        self.redirect()

    def do_HEAD(self):
        self.redirect(include_body=False)

    def do_POST(self):
        self.redirect()

    def do_PUT(self):
        self.redirect()

    def do_PATCH(self):
        self.redirect()

    def do_DELETE(self):
        self.redirect()

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    if len(ADMIN_PASSWORD) < 16 or not ADMIN_PASSWORD.strip():
        raise SystemExit("Set ADMIN_PASSWORD to a unique password of at least 16 characters before starting the server.")
    if not 1 <= HTTP_PORT <= 65535 or not 1 <= HTTPS_PORT <= 65535 or HTTP_PORT == HTTPS_PORT:
        raise SystemExit("HTTP_PORT and HTTPS_PORT must be different valid TCP ports.")
    try:
        certificate, private_key, local_certificate = ensure_tls_certificate()
        tls_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        tls_context.minimum_version = ssl.TLSVersion.TLSv1_2
        tls_context.load_cert_chain(certificate, private_key)
        https_server = ThreadingHTTPServer(("0.0.0.0", HTTPS_PORT), Handler)
        https_server.socket = tls_context.wrap_socket(https_server.socket, server_side=True)
    except (OSError, RuntimeError, ssl.SSLError) as exc:
        logging.error("HTTPS startup failed: %s", exc)
        raise SystemExit(1) from exc

    try:
        http_server = ThreadingHTTPServer(("0.0.0.0", HTTP_PORT), HTTPSRedirectHandler)
    except OSError as exc:
        http_server = None
        logging.warning("Could not start the HTTP-to-HTTPS redirect on port %s: %s", HTTP_PORT, exc)
        logging.warning("Stop the older server using that port; HTTPS is still available.")
    if http_server:
        threading.Thread(target=http_server.serve_forever, name="http-redirect", daemon=True).start()

    print("Tartar School portal running over HTTPS.")
    print(f"  This computer : https://localhost:{HTTPS_PORT}")
    print(f"  Other devices : https://{lan_ip()}:{HTTPS_PORT}  (same Wi-Fi/network)")
    if local_certificate:
        print(f"  Local certificate: {certificate}")
        print("  This is self-signed; browsers will show a trust warning until you trust the certificate.")
    if http_server:
        print(f"  HTTP page visits redirect to HTTPS on port {HTTP_PORT}.")
    print("Press Ctrl+C to stop.")
    try:
        https_server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping Tartar School server.")
    finally:
        https_server.server_close()
        if http_server:
            http_server.shutdown()
            http_server.server_close()
