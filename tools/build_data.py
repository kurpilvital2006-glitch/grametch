# Будує data/games.js і data/desc.{en,uk,ru}.js з кешу Steam + перекладів.
# Використання: python build_data.py <project_dir> [limit]
import json, os, re, sys, html, math, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "cache")
PROJ = sys.argv[1]
LIMIT = int(sys.argv[2]) if len(sys.argv) > 2 else 2000

def load(name, default=None):
    p = os.path.join(CACHE, name)
    return json.load(open(p, encoding="utf-8")) if os.path.exists(p) else default

en = load("items_english.json")
uk = load("items_ukrainian.json", {})
ru = load("items_russian.json", {})
good = load("good_ids.json")
tags = {t["tagid"]: t["name"] for t in load("tags_english.json")["response"]["tags"]}
tr = load("translations.json", {})  # {"uk:123": "...", "ru:123": "...", "en:123": "..."}
tr.update(load("manual_translations.json", {}))  # переклади, зроблені вручну

GENRE_TAGS = {
    "action": ["Action"],
    "shooter": ["Shooter", "FPS", "Third-Person Shooter", "Hero Shooter", "Looter Shooter", "Arena Shooter", "Tactical Shooter"],
    "rpg": ["RPG", "Action RPG", "CRPG", "Party-Based RPG", "Strategy RPG"],
    "jrpg": ["JRPG"],
    "adventure": ["Adventure", "Action-Adventure"],
    "strategy": ["Strategy", "RTS", "Grand Strategy", "4X", "Real-Time with Pause", "Wargame"],
    "tactics": ["Tactical", "Turn-Based Tactics", "Turn-Based Strategy", "Tactical RPG"],
    "sim": ["Simulation", "Life Sim", "Immersive Sim", "Job Simulator"],
    "management": ["Management", "Resource Management", "Economy", "Colony Sim", "Automation", "Business"],
    "citybuilder": ["City Builder"],
    "building": ["Building", "Base Building", "Crafting"],
    "horror": ["Horror", "Psychological Horror", "Survival Horror"],
    "survival": ["Survival", "Open World Survival Craft"],
    "sandbox": ["Sandbox"],
    "openworld": ["Open World"],
    "story": ["Story Rich", "Choices Matter", "Multiple Endings"],
    "souls": ["Souls-like"],
    "roguelike": ["Roguelike", "Roguelite", "Action Roguelike", "Roguelike Deckbuilder", "Traditional Roguelike"],
    "platformer": ["Platformer", "2D Platformer", "3D Platformer", "Precision Platformer", "Puzzle Platformer"],
    "metroidvania": ["Metroidvania"],
    "puzzle": ["Puzzle", "Logic", "Puzzle Platformer"],
    "racing": ["Racing", "Driving", "Automobile Sim", "Offroad"],
    "sports": ["Sports", "Football (Soccer)", "Basketball", "Golf", "Skateboarding", "Baseball", "Tennis", "Hockey", "Boxing", "Wrestling", "Snowboarding", "Football (American)", "Cycling", "Skiing", "Bowling", "Mini Golf"],
    "fighting": ["Fighting", "2D Fighter", "3D Fighter", "Beat 'em up", "Martial Arts", "Boxing", "Wrestling"],
    "hackslash": ["Hack and Slash", "Character Action Game"],
    "rhythm": ["Rhythm", "Music"],
    "card": ["Card Game", "Card Battler", "Deckbuilding", "Trading Card Game", "Roguelike Deckbuilder"],
    "party": ["Party Game", "Party"],
    "indie": ["Indie"],
    "moba": ["MOBA"],
    "battleroyale": ["Battle Royale"],
    "mmo": ["MMORPG", "Massively Multiplayer"],
    "stealth": ["Stealth"],
    "visualnovel": ["Visual Novel", "Interactive Fiction"],
    "anime": ["Anime"],
    "pixel": ["Pixel Graphics"],
    "cozy": ["Cozy", "Relaxing", "Wholesome"],
    "farming": ["Farming Sim", "Agriculture", "Farming"],
    "space": ["Space", "Space Sim"],
    "scifi": ["Sci-fi"],
    "fantasy": ["Fantasy", "Dark Fantasy"],
    "postapoc": ["Post-apocalyptic"],
    "zombies": ["Zombies"],
    "military": ["Military", "War", "World War II", "World War I", "Cold War", "Naval Combat", "Tanks"],
    "historical": ["Historical", "Medieval"],
    "cyberpunk": ["Cyberpunk"],
    "mystery": ["Mystery", "Detective", "Investigation"],
    "pointclick": ["Point & Click"],
    "comedy": ["Comedy", "Funny"],
    "physics": ["Physics"],
    "towerdefense": ["Tower Defense"],
    "shmup": ["Shoot 'Em Up", "Bullet Hell", "Twin Stick Shooter"],
    "flight": ["Flight"],
    "freetoplay": ["Free to Play"],
    "retro": ["Retro"],
}
name2genres = {}
for g, names in GENRE_TAGS.items():
    for n in names:
        name2genres.setdefault(n.lower(), []).append(g)
tagname_l = {tid: n.lower() for tid, n in tags.items()}
VR_TAGS = {tid for tid, n in tags.items() if n in ("VR", "VR Only")}
TAG_ID = {n: tid for tid, n in tags.items()}

def clean(s):
    s = html.unescape(s or "").replace("﻿", "")
    s = re.sub(r"<[^>]+>", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s

CJK_T = re.compile(r"[　-ヿ㐀-鿿가-힯＀-￯《》~]")
def clean_title(s):
    s = re.sub(r"[™®©]", "", html.unescape(s)).replace("：", ":")
    if CJK_T.search(s):
        # залишаємо лише латинську назву: "月圆之夜 (Night of Full Moon)" → "Night of Full Moon"
        s = CJK_T.sub(" ", s)
        s = re.sub(r"^[\s/()\-:Ⅱ]+|[\s/()\-:]+$", "", s)
        s = re.sub(r"\(\s*\)", "", s)
        s = re.sub(r"\s+:", ":", s)
        if len(re.findall(r"[A-Za-z]", s)) < 3:
            return None
    return re.sub(r"\s+", " ", s).strip()

CYR = re.compile(r"[А-Яа-яЁёІіЇїЄєҐґ]")
CJK = re.compile(r"[぀-ヿ㐀-鿿가-힯]")
UK_ONLY = re.compile(r"[ІіЇїЄєҐґ]")
RU_ONLY = re.compile(r"[ЫыЭэЪъЁё]")

def cyr_share(s):
    letters = re.findall(r"[^\W\d_]", s)
    return len(CYR.findall(s)) / max(1, len(letters))
def is_en(s):
    return bool(s) and not CYR.search(s) and not CJK.search(s)
def is_uk(s, en_s=None):
    if not s or s == en_s or RU_ONLY.search(s): return False
    return cyr_share(s) > 0.5 and (bool(UK_ONLY.search(s)) or len(s) < 90)
def is_ru(s, en_s=None):
    if not s or s == en_s or UK_ONLY.search(s): return False
    return cyr_share(s) > 0.5
CHECK = {"en": is_en, "uk": is_uk, "ru": is_ru}
# Відкидаємо машинні переклади, що повернулися не тією мовою
tr = {k: v for k, v in tr.items() if CHECK[k.split(":")[0]](v)}

def get(d, a):
    return d.get(str(a)) or d.get(a)

# ── Відбір і сортування за популярністю ──
rows = []
for a in good:
    it = get(en, a)
    rc = it.get("reviews", {}).get("summary_filtered", {}).get("review_count", 0)
    ids = it.get("tagids", [])
    pc = set(it.get("categories", {}).get("supported_player_categoryids", []))
    fc = set(it.get("categories", {}).get("feature_categoryids", []))
    tagset = set(ids)
    modes = []
    if 2 in pc or TAG_ID.get("Singleplayer") in tagset: modes.append("s")
    if pc & {1, 49, 36, 47, 37, 20, 27} or tagset & {TAG_ID.get("Multiplayer"), TAG_ID.get("PvP"), TAG_ID.get("Online PvP"), TAG_ID.get("Massively Multiplayer")}: modes.append("m")
    if pc & {9, 38, 48, 39} or tagset & {TAG_ID.get("Co-op"), TAG_ID.get("Online Co-Op"), TAG_ID.get("Local Co-Op")}: modes.append("c")
    if fc & {31, 53, 54} or tagset & VR_TAGS: modes.append("v")
    if not modes: modes = ["s"]
    genres = []
    for tid in ids:  # уже відсортовані за вагою
        for g in name2genres.get(tagname_l.get(tid, ""), []):
            if g not in genres:
                genres.append(g)
    if it.get("is_free") and "freetoplay" not in genres:
        genres.append("freetoplay")
    genres = genres[:7]
    title = clean_title(it["name"])
    if not genres or not title:
        continue
    rel = it.get("release", {}).get("steam_release_date") or it.get("release", {}).get("original_release_date")
    year = datetime.datetime.fromtimestamp(rel, datetime.timezone.utc).year if rel else 0
    assets = it.get("assets", {})
    rows.append({"id": a, "title": title, "year": year, "genres": genres, "modes": modes,
                 "lib": assets.get("library_capsule", ""), "hdr": assets.get("header", ""),
                 "t": (re.search(r"\?t=(\d+)", assets.get("asset_url_format", "")) or [None, ""])[1], "rc": rc})

rows.sort(key=lambda r: -r["rc"])
own = set()
own_js = os.path.join(PROJ, "data", "curated_uk.js")
own_uk = {}
if os.path.exists(own_js):
    for m in re.finditer(r'\[(\d+), "(?:[^"\\]|\\.)*", \d{4}, "[^"]*", "[^"]*", "((?:[^"\\]|\\.)*)"\]', open(own_js, encoding="utf-8").read()):
        own.add(int(m.group(1))); own_uk[int(m.group(1))] = m.group(2)
# ── Описи для всіх кандидатів ──
desc = {"en": {}, "uk": {}, "ru": {}}
need_all = {}
for r in rows:
    a = r["id"]
    need = []
    e = clean(get(en, a).get("basic_info", {}).get("short_description", ""))
    u = clean((get(uk, a) or {}).get("basic_info", {}).get("short_description", ""))
    rr = clean((get(ru, a) or {}).get("basic_info", {}).get("short_description", ""))
    raw = e
    if not is_en(e):
        e = tr.get(f"en:{a}") or need.append(("en", a, raw)) or None
    if a in own_uk:
        u = own_uk[a]
    elif not is_uk(u, raw):
        u = tr.get(f"uk:{a}") or need.append(("uk", a, raw)) or None
    if not is_ru(rr, raw):
        rr = tr.get(f"ru:{a}") or need.append(("ru", a, raw)) or None
    desc["en"][a], desc["uk"][a], desc["ru"][a] = e, u, rr
    need_all[a] = need

# ── Відбір: за популярністю, лише ігри з описами всіма трьома мовами ──
# (вручну відібрані ігри — завжди; їм бракуючі описи ставимо в чергу перекладу)
picked, vr = [], 0
for r in rows:
    complete = not need_all[r["id"]]
    is_vr = "v" in r["modes"]
    if r["id"] in own or (complete and (len(picked) < LIMIT or (is_vr and vr < 160))):
        picked.append(r); vr += is_vr
need = [x for r in picked for x in need_all[r["id"]]]
pid = {r["id"] for r in picked}
for l in desc:
    desc[l] = {a: v for a, v in desc[l].items() if a in pid}

json.dump([{"lang": l, "id": a, "src": s} for l, a, s in need], open(os.path.join(CACHE, "need_translation.json"), "w", encoding="utf-8"), ensure_ascii=False)
print("picked", len(picked), "vr", sum("v" in r["modes"] for r in picked), "need translation", len(need),
      {l: sum(1 for x in need if x[0] == l) for l in ("en", "uk", "ru")})

# ── Запис ──
os.makedirs(os.path.join(PROJ, "data"), exist_ok=True)
def js_str(s): return json.dumps(s, ensure_ascii=False)
lines = []
for r in picked:
    lib = "" if r["lib"] == "library_600x900.jpg" else r["lib"]
    hdr = "" if r["hdr"] == "header.jpg" else r["hdr"]
    lines.append(f'[{r["id"]},{js_str(r["title"])},{r["year"]},"{" ".join(r["genres"])}","{" ".join(r["modes"])}",{js_str(lib)},{js_str(hdr)},{js_str(r["t"])},{r["rc"]}]')
with open(os.path.join(PROJ, "data", "games.js"), "w", encoding="utf-8") as f:
    f.write("// Згенеровано build_data.py з даних Steam. [appid, назва, рік, жанри, режими, обкладинка, хедер, версія, відгуки]\n")
    f.write("window.GAMES = [\n" + ",\n".join(lines) + "\n].map(([id,title,year,genres,modes,lib,hdr,t,rc]) => ({id,title,year,genres:genres.split(' '),modes:modes.split(' '),lib,hdr,t,rc}));\n")
for l in ("en", "uk", "ru"):
    with open(os.path.join(PROJ, "data", f"desc.{l}.js"), "w", encoding="utf-8") as f:
        f.write(f"window.DESC = window.DESC || {{}};\nwindow.DESC.{l} = " + json.dumps({str(k): v for k, v in desc[l].items() if v}, ensure_ascii=False, indent=0) + ";\n")
manual = load("manual_translations.json", {})
for l in ("en", "uk", "ru"):
    mt = sum(1 for a in pid if desc[l].get(a) and desc[l][a] == tr.get(f"{l}:{a}") and f"{l}:{a}" not in manual)
    hand = sum(1 for a in pid if f"{l}:{a}" in manual) + (len(own_uk.keys() & pid) if l == "uk" else 0)
    print(l, "steam-native", len(pid) - mt - hand, "machine", mt, "hand-written", hand)
print("written")
