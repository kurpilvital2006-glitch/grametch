# Збирає кандидатів зі SteamSpy і деталі з Steam IStoreBrowseService/GetItems (en/uk/ru).
import json, os, sys, time, urllib.request, urllib.parse

CACHE = os.path.dirname(os.path.abspath(__file__)) + os.sep + "cache"
os.makedirs(CACHE, exist_ok=True)
UA = {"User-Agent": "Mozilla/5.0 (GameMatch data builder)"}

def get(url, tries=5):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:
            print("  retry", i, e, flush=True)
            time.sleep(5 * (i + 1))
    raise RuntimeError("failed " + url)

def cached(name, fn):
    p = os.path.join(CACHE, name)
    if os.path.exists(p):
        return json.load(open(p, encoding="utf-8"))
    data = fn()
    json.dump(data, open(p, "w", encoding="utf-8"), ensure_ascii=False)
    return data

# 1. Кандидати
cands = {}
for page in range(7):
    def f(page=page):
        d = get(f"https://steamspy.com/api.php?request=all&page={page}")
        time.sleep(62)
        return d
    d = cached(f"spy_all_{page}.json", f)
    print("steamspy page", page, len(d), flush=True)
    for k, v in d.items():
        cands[int(k)] = (v.get("positive", 0) or 0) + (v.get("negative", 0) or 0)
for tag in ["VR", "VR Only"]:
    d = cached(f"spy_tag_{tag.replace(' ', '_')}.json",
               lambda tag=tag: get("https://steamspy.com/api.php?request=tag&tag=" + urllib.parse.quote(tag)))
    print("steamspy tag", tag, len(d), flush=True)
    top_vr = sorted(d.values(), key=lambda v: -((v.get("positive", 0) or 0) + (v.get("negative", 0) or 0)))[:500]
    for v in top_vr:
        cands.setdefault(int(v["appid"]), (v.get("positive", 0) or 0) + (v.get("negative", 0) or 0))
extra = [int(x) for x in sys.argv[1:]]
for x in extra:
    cands.setdefault(x, 0)
ids = sorted(cands, key=lambda i: -cands[i])
print("candidates", len(ids), flush=True)

# 2. Деталі
def items(lang, ids, full):
    full_p = os.path.join(CACHE, f"items_{lang}.json")
    part = os.path.join(CACHE, f"partial_{lang}.json")
    out = json.load(open(full_p, encoding="utf-8")) if os.path.exists(full_p) else {}
    if os.path.exists(part):
        out.update(json.load(open(part, encoding="utf-8")))
    done = set(json.load(open(part + ".ids"))) if os.path.exists(part + ".ids") else set()
    done |= {int(k) for k in out}
    ids = [a for a in ids if a not in done]
    print(" ", lang, "to fetch", len(ids), flush=True)
    req = {"include_basic_info": True}
    if full:
        req.update({"include_tag_count": 20, "include_assets": True, "include_release": True, "include_reviews": True})
    for i in range(0, len(ids), 50):
        chunk = ids[i:i + 50]
        inp = {"ids": [{"appid": a} for a in chunk],
               "context": {"language": lang, "country_code": "US", "steam_realm": 1},
               "data_request": req}
        url = "https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=" + urllib.parse.quote(json.dumps(inp))
        d = get(url)
        for it in d.get("response", {}).get("store_items", []):
            if it.get("success") == 1:
                out[str(it["appid"])] = it
        done.update(chunk)
        time.sleep(0.3)
        if i % 500 == 0:
            print(" ", lang, i, len(out), flush=True)
            json.dump(out, open(part, "w", encoding="utf-8"), ensure_ascii=False)
            json.dump(list(done), open(part + ".ids", "w"))
    json.dump(out, open(full_p, "w", encoding="utf-8"), ensure_ascii=False)
    json.dump(list(done), open(part + ".ids", "w"))
    return out

en = items("english", ids, True)
print("english items", len(en), flush=True)

tags = cached("tags_english.json", lambda: get("https://api.steampowered.com/IStoreService/GetTagList/v1/?language=english"))
print("tags", len(tags.get("response", {}).get("tags", [])), flush=True)

# Відбір: лише ігри, без контенту 18+
BAD_DESC = {3, 4}
tagname = {t["tagid"]: t["name"] for t in tags["response"]["tags"]}
BAD_TAGS = {"Sexual Content", "Nudity", "Hentai", "NSFW"}
good = []
for a in ids:
    it = en.get(str(a)) or en.get(a)
    if not it or it.get("type") != 0 or not it.get("visible", True):
        continue
    if a not in extra:  # вручну відібрані ігри не фільтруємо
        if set(it.get("content_descriptorids", [])) & BAD_DESC:
            continue
        # відсіюємо лише ігри, де такий тег серед п’яти головних (тобто гра саме про це)
        if {tagname.get(t) for t in it.get("tagids", [])[:5]} & BAD_TAGS:
            continue
    if not it.get("basic_info", {}).get("short_description") and a not in extra:
        continue
    if not it.get("assets", {}).get("header"):
        continue
    good.append(a)
print("good games", len(good), flush=True)
json.dump(good, open(os.path.join(CACHE, "good_ids.json"), "w"))

uk = items("ukrainian", good, False)
ru = items("russian", good, False)
print("uk", len(uk), "ru", len(ru), flush=True)
print("DONE", flush=True)
