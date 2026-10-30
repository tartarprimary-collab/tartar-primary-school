"""Run once from the folder that holds server.py:  python apply_level_patch.py
Adds a class 'level' (Pre-Primary / Primary / Junior School) and returns it to the learner portal."""
import re, shutil
fn = "server.py"
s = open(fn, encoding="utf-8").read()
shutil.copy(fn, fn + ".bak")
def sub(pattern, repl):
    global s
    s, n = re.subn(pattern, repl, s, count=1)
    assert n == 1, "Could not find: " + pattern
sub(r'"classes":(\s*)\["name", "teacher"\]', r'"classes":\1["name", "teacher", "level"]')
sub(r'\ndef load\(\):', '\nLEVELS = {"pre": "Pre-Primary", "primary": "Primary", "junior": "Junior School"}\n\n\ndef load():')
sub(r'( +)rec = clean\(col, data\)\n', r'\1rec = clean(col, data)\n\1if col == "classes" and rec.get("level") not in LEVELS:\n\1    rec["level"] = ""\n')
sub(r'\{"name": s\["name"\], "adm": s\["adm"\], "class": cname,',
    '{"name": s["name"], "adm": s["adm"], "class": cname,\n                "level": next((c.get("level", "") for c in db.get("classes", []) if c["id"] == s["class"]), ""),')
open(fn, "w", encoding="utf-8").write(s)
print("Done. A copy of the old file is saved as server.py.bak. Restart the server.")
