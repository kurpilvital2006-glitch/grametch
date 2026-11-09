# Перекладає описи, для яких у Steam немає потрібної мови (Google Translate, публічний ендпоінт).
import json, os, time, urllib.request, urllib.parse, concurrent.futures as cf, threading

CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache")
need = json.load(open(os.path.join(CACHE, "need_translation.json"), encoding="utf-8"))
tp = os.path.join(CACHE, "translations.json")
tr = json.load(open(tp, encoding="utf-8")) if os.path.exists(tp) else {}
lock = threading.Lock()

def gt(text, tl):
    url = "https://translate.googleapis.com/translate_a/single?" + urllib.parse.urlencode(
        {"client": "gtx", "sl": "auto", "tl": tl, "dt": "t", "q": text})
    for i in range(40):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=30) as r:
                d = json.loads(r.read().decode("utf-8"))
            return "".join(seg[0] for seg in d[0] if seg and seg[0])
        except Exception as e:
            print("wait", e, flush=True)
            time.sleep(90 if "429" in str(e) else 5)
    return None

todo = [x for x in need if f'{x["lang"]}:{x["id"]}' not in tr]
print("todo", len(todo), flush=True)
done = 0
def work(x):
    global done
    res = gt(x["src"], x["lang"])
    with lock:
        if res:
            tr[f'{x["lang"]}:{x["id"]}'] = res.strip()
        done += 1
        if done % 25 == 0:
            json.dump(tr, open(tp, "w", encoding="utf-8"), ensure_ascii=False)
            print("done", done, flush=True)
    time.sleep(1.2)

with cf.ThreadPoolExecutor(1) as ex:
    list(ex.map(work, todo))
json.dump(tr, open(tp, "w", encoding="utf-8"), ensure_ascii=False)
print("FINISHED", len(tr), "missing", sum(1 for x in need if f'{x["lang"]}:{x["id"]}' not in tr), flush=True)
