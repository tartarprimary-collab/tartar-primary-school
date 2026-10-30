#!/usr/bin/env python3
"""
Merge the old portal learners (data.json) into the school system (state.json).

  python migrate_learners.py                   # DRY RUN: prints what would happen, changes nothing
  python migrate_learners.py --apply           # does it (stop server.py first!)
  python migrate_learners.py --apply --create-classes

Matching rule: a learner is "the same person" when the admission number matches
(ignoring case and spaces). Merging only FILLS EMPTY fields in the school system.
It never overwrites anything already there; differences are listed as conflicts
for you to settle by hand.

Moved:      learners, guardians, classes (when --create-classes), club-request links.
Not moved:  fees, results, attendance, resources. They are counted in the report so
            nothing is silently dropped; they need a separate decision.
Run it from the folder that holds server.py, or pass --dir.
"""
import argparse
import json
import os
import re
import secrets
import shutil
import sys
import time


def jload(path, default):
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def jsave(path, obj):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


def full(*parts):
    return " ".join(" ".join(str(p or "").split()) for p in parts if p and str(p).strip())


def norm_adm(v):
    return re.sub(r"\s+", "", str(v or "")).lower()


def norm_name(v):
    return " ".join(str(v or "").lower().split())


def digits(v):
    return re.sub(r"\D", "", str(v or ""))


def parse_class(name):
    """'Grade 4 East' -> (4, 'East'); 'PP1' -> (-2, ''); unreadable -> None.
    Grade numbers follow the school app: PP1 = -2, PP2 = -1, Grade n = n."""
    s = " ".join(str(name or "").split())
    m = re.search(r"\b(?:pp|pre[- ]?primary)\s*([12])(?!\d)", s, re.I)
    if m:
        grade, rest = int(m.group(1)) - 3, s[:m.start()] + " " + s[m.end():]
    else:
        m = re.search(r"\b(?:grade|class|std|standard)\s*([1-9])(?!\d)", s, re.I) or re.match(r"^\s*([1-9])(?!\d)", s)
        if not m:
            return None
        grade, rest = int(m.group(1)), s[:m.start()] + " " + s[m.end():]
    stream = re.sub(r"^[\s\-\u2013\u2014:,()]+|[\s\-\u2013\u2014:,()]+$", "", rest)
    return grade, " ".join(stream.split())


def guardians_from(rec):
    out = []
    for n in (1, 2):
        g = {
            "rel": str(rec.get("g%d_rel" % n) or "").strip() or "Guardian",
            "first": str(rec.get("g%d_first" % n) or "").strip(),
            "middle": str(rec.get("g%d_middle" % n) or "").strip(),
            "surname": str(rec.get("g%d_surname" % n) or "").strip(),
            "idType": "",
            "idNo": str(rec.get("g%d_id" % n) or "").strip(),
            "phone": str(rec.get("g%d_phone" % n) or "").strip(),
        }
        if g["first"] or g["surname"] or g["idNo"] or g["phone"]:
            out.append(g)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dir", default=os.path.dirname(os.path.abspath(__file__)), help="folder containing server.py and the .json files")
    ap.add_argument("--apply", action="store_true", help="write the changes (default is a dry run)")
    ap.add_argument("--create-classes", action="store_true", help="create school-system classes for old classes that have no match")
    args = ap.parse_args()
    P = lambda name: os.path.join(args.dir, name)

    data = jload(P("data.json"), {})
    cur = jload(P("state.json"), {})
    state = cur.get("state") or {}
    s_students = state.setdefault("students", [])
    s_classes = state.setdefault("classes", [])
    old_students = data.get("students", [])
    old_classes = {c.get("id"): c for c in data.get("classes", [])}

    by_adm = {norm_adm(s.get("adm")): s for s in s_students if norm_adm(s.get("adm"))}
    by_name_grade = {}
    for s in s_students:
        by_name_grade.setdefault((norm_name(s.get("name")), s.get("grade")), s)
    used_ids = {s.get("id") for s in s_students}

    rep = {k: [] for k in ("created", "merged", "conflicts", "skipped", "possible_dups", "unassigned", "new_classes", "bad_classes", "dup_in_source", "clubs")}
    idmap, class_cache, seen_adm = {}, {}, set()

    def state_class(old_class_id):
        """-> (grade, class_id or '') for an old class id, or (None, '') when the class name can't be read."""
        oc = old_classes.get(old_class_id)
        if not oc:
            return None, ""
        parsed = parse_class(oc.get("name"))
        if not parsed:
            if oc.get("name") not in rep["bad_classes"]:
                rep["bad_classes"].append(oc.get("name"))
            return None, ""
        grade, stream = parsed
        key = (grade, stream.casefold())
        if key in class_cache:
            return grade, class_cache[key]
        hit = next((c for c in s_classes if c.get("grade") == grade and str(c.get("stream", "")).casefold() == stream.casefold()), None)
        if not hit and not stream:
            same = [c for c in s_classes if c.get("grade") == grade]
            hit = same[0] if len(same) == 1 else None
        if not hit and args.create_classes:
            hit = {"id": "cl_" + secrets.token_hex(4), "grade": grade, "stream": stream, "teacherId": ""}
            s_classes.append(hit)
            rep["new_classes"].append(oc.get("name"))
        class_cache[key] = hit["id"] if hit else ""
        return grade, class_cache[key]

    for rec in old_students:
        label = "%s (adm %s)" % (rec.get("name") or full(rec.get("first"), rec.get("middle"), rec.get("surname")) or "?", rec.get("adm") or "none")
        first, middle, surname = (str(rec.get(k) or "").strip() for k in ("first", "middle", "surname"))
        name = full(first, middle, surname) or str(rec.get("name") or "").strip()
        if not name:
            rep["skipped"].append(label + ": no name")
            continue
        adm = norm_adm(rec.get("adm"))
        if adm:
            if adm in seen_adm:
                rep["dup_in_source"].append(label)
                continue
            seen_adm.add(adm)
        grade, class_id = state_class(rec.get("class"))
        gs = guardians_from(rec)
        g1 = gs[0] if gs else {}
        parent = full(g1.get("first"), g1.get("middle"), g1.get("surname"))
        parent_phone = g1.get("phone", "")

        existing = by_adm.get(adm) if adm else None
        if existing is None and not adm and grade is not None:
            dup = by_name_grade.get((norm_name(name), grade))
            if dup:
                rep["possible_dups"].append("%s may be the same as school-system learner %s (no admission number to confirm)" % (label, dup.get("adm") or dup.get("name")))
                idmap[rec["id"]] = dup["id"]
                continue

        if existing is not None:
            idmap[rec["id"]] = existing["id"]
            notes = []
            if norm_name(existing.get("name")) != norm_name(name):
                notes.append("name: school system '%s' vs old portal '%s'" % (existing.get("name"), name))
            eg = (existing.get("guardians") or [{}])[0]
            if g1 and eg.get("phone") and digits(eg.get("phone")) != digits(g1.get("phone")):
                notes.append("guardian phone: '%s' vs '%s'" % (eg.get("phone"), g1.get("phone")))
            if grade is not None and existing.get("grade") not in (None, grade) and existing.get("classId"):
                notes.append("class: grade %s vs old portal grade %s" % (existing.get("grade"), grade))
            filled = []
            for key, val in (("first", first), ("middle", middle), ("surname", surname), ("parent", parent), ("parentPhone", parent_phone)):
                if val and not str(existing.get(key) or "").strip():
                    existing[key] = val
                    filled.append(key)
            if gs and not existing.get("guardians"):
                existing["guardians"] = gs
                filled.append("guardians")
            if class_id and not existing.get("classId"):
                existing["classId"] = class_id
                existing["grade"] = grade
                filled.append("class")
            if filled:
                rep["merged"].append("%s: filled %s" % (label, ", ".join(filled)))
            if notes:
                rep["conflicts"].append("%s: %s" % (label, "; ".join(notes)))
            continue

        if grade is None:
            rep["skipped"].append(label + ": class not readable, set a class on the old record first")
            continue
        new_id = rec["id"] if rec.get("id") and rec["id"] not in used_ids else "st_" + secrets.token_hex(4)
        used_ids.add(new_id)
        idmap[rec["id"]] = new_id
        learner = {
            "id": new_id, "adm": str(rec.get("adm") or "").strip(), "assessmentNo": "",
            "first": first, "middle": middle, "surname": surname, "name": name,
            "gender": "", "parent": parent, "parentPhone": parent_phone, "guardians": gs,
            "grade": grade, "classId": class_id, "boarding": "",
        }
        s_students.append(learner)
        if adm:
            by_adm[adm] = learner
        by_name_grade.setdefault((norm_name(name), grade), learner)
        rep["created"].append(label)
        if not class_id:
            rep["unassigned"].append(label)

    # club requests point at learner ids; keep them pointing at the right learner
    clubs_path = P("club-requests.json")
    clubs = jload(clubs_path, [])
    taken = {c.get("studentId") for c in clubs}
    for c in clubs:
        new = idmap.get(c.get("studentId"))
        if new and new != c.get("studentId"):
            if new in taken:
                rep["clubs"].append("request %s: learner already has another request, left unchanged" % c.get("id"))
                continue
            taken.discard(c["studentId"])
            taken.add(new)
            c["studentId"] = new
            rep["clubs"].append("request %s re-linked" % c.get("id"))

    def show(title, items):
        print("\n%s: %d" % (title, len(items)))
        for x in items[:40]:
            print("   - " + str(x))
        if len(items) > 40:
            print("   ... and %d more" % (len(items) - 40))

    print("=== %s ===" % ("APPLYING" if args.apply else "DRY RUN (nothing is written)"))
    print("Old portal learners: %d   School-system learners now: %d" % (len(old_students), len(s_students) - len(rep["created"])))
    show("New learners added to the school system", rep["created"])
    show("Already in the school system (same admission number), empty fields filled", rep["merged"])
    show("CONFLICTS: nothing overwritten, please settle by hand", rep["conflicts"])
    show("Possible duplicates with no admission number (not added)", rep["possible_dups"])
    show("Added but without a class (assign on the Students page)", rep["unassigned"])
    show("Skipped", rep["skipped"] + ["same admission number twice in old portal: " + x for x in rep["dup_in_source"]])
    show("Old class names that could not be read as PP1/PP2/Grade 1-9", rep["bad_classes"])
    show("Classes " + ("created" if args.create_classes else "that would need --create-classes"), rep["new_classes"])
    show("Club requests", rep["clubs"])
    print("\nNot moved by this script (still only in data.json): fees %d, results %d, attendance %d, resources %d"
          % tuple(len(data.get(k, [])) for k in ("fees", "results", "attendance", "resources")))

    if not args.apply:
        print("\nDry run only. Re-run with --apply (server stopped) to make these changes.")
        return
    stamp = os.path.join(args.dir, "backups", "pre-merge-" + time.strftime("%Y%m%d-%H%M%S"))
    os.makedirs(stamp, exist_ok=True)
    for name in ("data.json", "state.json", "club-requests.json"):
        if os.path.exists(P(name)):
            shutil.copy2(P(name), stamp)
    cur["state"] = state
    cur["rev"] = int(cur.get("rev", 0)) + 1
    jsave(P("state.json"), cur)
    if clubs:
        jsave(clubs_path, clubs)
    print("\nDone. Copies of the old files are in %s" % stamp)


if __name__ == "__main__":
    sys.exit(main())
