# Перевіряє, що описи ігор у data/desc.*.js написані правильною мовою.
import json, re, sys, os
PROJ = sys.argv[1]
CYR = re.compile(r"[А-Яа-яЁёІіЇїЄєҐґ]")
CJK = re.compile(r"[぀-ヿ㐀-鿿가-힯]")
UK_ONLY = re.compile(r"[ІіЇїЄєҐґ]")
RU_ONLY = re.compile(r"[ЫыЭэЪъЁё]")
src = open(os.path.join(PROJ, "data", "games.js"), encoding="utf-8").read()
ids = [int(x) for x in re.findall(r"^\[(\d+),", src, re.M)]
print("games", len(ids))
for l in ("en", "uk", "ru"):
    t = open(os.path.join(PROJ, "data", f"desc.{l}.js"), encoding="utf-8").read()
    d = json.loads(t[t.index("=", t.index(f"DESC.{l}")) + 1:].strip().rstrip(";"))
    missing = [i for i in ids if str(i) not in d]
    bad = []
    for k, v in d.items():
        letters = re.findall(r"[^\W\d_]", v)
        share = len(CYR.findall(v)) / max(1, len(letters))
        if l == "en" and (CYR.search(v) or CJK.search(v)): bad.append((k, "not english"))
        if l == "uk" and (RU_ONLY.search(v) or share < 0.35): bad.append((k, "not ukrainian"))
        if l == "uk" and not RU_ONLY.search(v) and share >= 0.35 and not UK_ONLY.search(v) and len(v) >= 90: bad.append((k, "maybe russian"))
        if l == "ru" and (UK_ONLY.search(v) or share < 0.35): bad.append((k, "not russian"))
    print(l, "have", len(d), "missing", len(missing), "bad", len(bad))
    for k, why in bad[:15]:
        print("   ", k, why, "|", d[k][:110])
