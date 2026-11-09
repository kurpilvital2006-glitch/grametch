(() => {
  const GAMES = window.GAMES, I18N = window.I18N, LANGS = window.LANGS, GENRE_NAMES = window.GENRE_NAMES;
  const LANG_IDX = { en: 0, uk: 1, ru: 2 };
  const byId = new Map(GAMES.map(g => [g.id, g]));
  const $ = s => document.querySelector(s);
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ── Стан (localStorage) ──
  const KEY = "grametch-v2";
  const blank = () => ({ liked: [], noped: [], order: null, mode: "all", genres: [], lang: null });
  let st = blank();
  try {
    const raw = localStorage.getItem(KEY) || localStorage.getItem("grametch-v1");
    st = Object.assign(blank(), JSON.parse(raw) || {});
  } catch (e) {}
  st.liked = st.liked.filter(l => byId.has(l.id));
  st.noped = st.noped.filter(id => byId.has(id));
  st.genres = st.genres.filter(k => GENRE_NAMES[k]);
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} };

  // Порядок колоди: випадковий, але популярні ігри трапляються частіше (зважена вибірка)
  function makeOrder() {
    return GAMES.map(g => {
      const w = Math.pow(Math.log10((g.rc || 0) + 10), 2.2);
      return [g.id, Math.pow(Math.random(), 1 / w)];
    }).sort((a, b) => b[1] - a[1]).map(x => x[0]);
  }
  if (!Array.isArray(st.order) || st.order.length !== GAMES.length || !st.order.every(id => byId.has(id))) {
    st.order = makeOrder(); save();
  }

  // ── Мова ──
  let lang = LANGS[st.lang] ? st.lang : null;
  const t = (k, vars = {}) => String(I18N[lang || "uk"][k] ?? I18N.en[k] ?? k).replace(/\{(\w+)\}/g, (_, v) => vars[v] ?? "");
  const genreName = k => GENRE_NAMES[k][LANG_IDX[lang || "uk"]];
  const modeName = m => t("mode_" + m);
  const steamUrl = id => `https://store.steampowered.com/app/${id}/?l=${LANGS[lang || "uk"].steam}`;
  const descOf = g => ((window.DESC || {})[lang] || {})[g.id] || t("noDesc");

  const descLoaded = {};
  function loadDesc(l) {
    if (descLoaded[l]) return descLoaded[l];
    return descLoaded[l] = new Promise(res => {
      const s = document.createElement("script");
      s.src = `data/desc.${l}.js?v=2`;
      s.onload = res; s.onerror = res;
      document.head.appendChild(s);
    });
  }

  function applyStatic() {
    document.documentElement.lang = LANGS[lang].html;
    document.title = t("brand");
    document.querySelector('meta[name="description"]').setAttribute("content", t("metaDesc"));
    document.querySelectorAll("[data-i18n]").forEach(el => el.textContent = t(el.dataset.i18n));
    document.querySelectorAll("[data-i18n-attr]").forEach(el => {
      el.dataset.i18nAttr.split(";").forEach(pair => {
        const [attr, key] = pair.split(":");
        el.setAttribute(attr, t(key));
      });
    });
    $("#langCode").textContent = lang.toUpperCase();
  }

  // ── Картинки Steam ──
  const CDN = "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps";
  const coverUrl = g => `${CDN}/${g.id}/${g.lib || "library_600x900.jpg"}${g.t ? "?t=" + g.t : ""}`;
  const headerUrl = g => `${CDN}/${g.id}/${g.hdr || "header.jpg"}${g.t ? "?t=" + g.t : ""}`;

  let query = "";
  let history = [];
  let matchTab = "all";
  let genresExpanded = false;

  const MODE_LIST = [
    { key: "all", icon: '<rect x="3" y="6" width="18" height="12" rx="4"/><path d="M8 10v4M6 12h4M15 11h.01M17.5 13h.01"/>' },
    { key: "m", icon: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M15 14.2c3 0 6 1.6 6 4.8"/>' },
    { key: "c", icon: '<path d="M7 11 4 14l4 4 3-3M17 11l3 3-4 4-3-3"/><path d="m8 12 4-4 4 4-4 4z"/>' },
    { key: "s", icon: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.9 3.1-6.5 7-6.5s7 2.6 7 6.5"/>' },
    { key: "v", icon: '<path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-4l-3-3-3 3H5a2 2 0 0 1-2-2z"/>' }
  ];

  // ── Фільтрація ──
  const norm = s => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  GAMES.forEach(g => g._n = norm(g.title));
  const matchesFilter = (g, o = {}) => {
    const mode = o.mode ?? st.mode, genres = o.genres ?? st.genres;
    if (mode !== "all" && !g.modes.includes(mode)) return false;
    if (genres.length && !genres.some(x => g.genres.includes(x))) return false;
    if (query && !g._n.includes(query)) return false;
    return true;
  };
  const seenSet = () => new Set([...st.liked.map(l => l.id), ...st.noped]);
  const deckList = () => {
    const s = seenSet();
    return st.order.map(id => byId.get(id)).filter(g => !s.has(g.id) && matchesFilter(g));
  };

  // ── Сумісність ──
  let weights = null;
  function computeWeights() {
    weights = null;
    if (st.liked.length < 3) return;
    const w = {};
    st.liked.forEach(l => byId.get(l.id).genres.forEach(x => w[x] = (w[x] || 0) + (l.super ? 2 : 1)));
    const max = Math.max(...Object.values(w));
    weights = { w, max };
  }
  const compat = g => {
    if (!weights) return null;
    const s = g.genres.reduce((a, x) => a + (weights.w[x] || 0) / weights.max, 0) / g.genres.length;
    return Math.round(40 + Math.min(1, s * 1.4) * 59);
  };

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ── Фільтри ──
  function renderFilters() {
    const s = seenSet();
    const modeCount = { all: 0, m: 0, c: 0, s: 0, v: 0 };
    const genreCount = {};
    for (const g of GAMES) {
      if (s.has(g.id)) continue;
      if (matchesFilter(g, { mode: "all", genres: [] })) {
        modeCount.all++;
        g.modes.forEach(m => modeCount[m]++);
      }
      if (matchesFilter(g, { genres: [] })) g.genres.forEach(k => genreCount[k] = (genreCount[k] || 0) + 1);
    }
    $("#modes").innerHTML = MODE_LIST.map(m => `
      <button class="mode" role="tab" data-mode="${m.key}" aria-selected="${st.mode === m.key}">
        <span class="ico"><svg viewBox="0 0 24 24">${m.icon}</svg></span>${m.key === "all" ? t("modeAll") : modeName(m.key)}<span class="count">${modeCount[m.key]}</span>
      </button>`).join("");

    const keys = Object.keys(GENRE_NAMES).sort((a, b) => (genreCount[b] || 0) - (genreCount[a] || 0));
    const SHOW = 16;
    $("#genres").innerHTML = keys.map((k, i) => {
      const on = st.genres.includes(k);
      const extra = i >= SHOW && !on ? " extra" : "";
      return `<button class="chip${extra}" data-genre="${k}" aria-pressed="${on}">${genreName(k)}<span class="n">${genreCount[k] || 0}</span></button>`;
    }).join("");
    $("#clearGenres").hidden = !st.genres.length;
    const hiddenCount = keys.length - SHOW;
    $("#moreGenres").textContent = genresExpanded ? t("lessGenres") : `${t("moreGenres")} (${hiddenCount})`;
    $("#filters").classList.toggle("expanded", genresExpanded);
  }

  // ═════════ Колода ═════════
  const deckEl = $("#deck");
  const DEPTH = 3;
  let stack = []; // DOM-картки, [0] — верхня

  function cardHTML(g) {
    const c = compat(g);
    return `
      <img class="cover" alt="" draggable="false">
      <div class="fallback">${esc(g.title)}</div>
      <div class="shade"></div>
      ${c !== null ? `<div class="compat">${t("compat")} <b>${c}%</b></div>` : ""}
      <div class="stamp like">${t("stampLike")}</div>
      <div class="stamp nope">${t("stampNope")}</div>
      <div class="stamp super">${t("stampSuper")}</div>
      <div class="body">
        <h3>${esc(g.title)}${g.year ? `<span class="year">${g.year}</span>` : ""}</h3>
        <div class="modes-row">${g.modes.map(m => `<span class="tag m-${m}">${modeName(m)}</span>`).join("")}</div>
        <p class="desc">${esc(descOf(g))}</p>
        <div class="more"><div>
          <div class="genres-row">${g.genres.map(x => `<span class="tag">${genreName(x)}</span>`).join("")}</div>
          <a class="steam-link" href="${steamUrl(g.id)}" target="_blank" rel="noopener">${t("steamPage")}</a>
        </div></div>
      </div>`;
  }

  function makeCard(g) {
    const el = document.createElement("article");
    el.className = "card";
    el.dataset.id = g.id;
    el.setAttribute("aria-label", t("cardAria", { title: g.title, year: g.year }));
    el.innerHTML = cardHTML(g);
    const img = el.querySelector(".cover");
    const srcs = [coverUrl(g), headerUrl(g)];
    let i = 0;
    img.onerror = () => {
      i++;
      if (i < srcs.length) { el.classList.add("wide"); img.src = srcs[i]; }
      else el.classList.add("noimg");
    };
    img.src = srcs[0];
    attachDrag(el);
    return el;
  }

  function layout() {
    stack.forEach((el, i) => {
      el.style.setProperty("--d", i);
      el.style.zIndex = 10 - i;
      el.classList.toggle("is-top", i === 0);
      el.setAttribute("aria-hidden", i === 0 ? "false" : "true");
    });
  }

  function nextGame() {
    const inStack = new Set(stack.map(el => +el.dataset.id));
    return deckList().find(g => !inStack.has(g.id));
  }

  function refill(animate) {
    const added = [];
    while (stack.length < DEPTH) {
      const g = nextGame();
      if (!g) break;
      const el = makeCard(g);
      deckEl.appendChild(el);
      stack.push(el);
      added.push(el);
    }
    layout();
    if (animate && !reduceMotion) {
      // нова картка з’являється з глибини стопки
      added.forEach(el => { el.classList.add("entering"); el.style.setProperty("--d", DEPTH); });
      void deckEl.offsetHeight; // фіксуємо початковий стан, щоб перехід відбувся
      setTimeout(() => {
        added.forEach(el => { el.classList.remove("entering"); if (stack.includes(el)) el.style.setProperty("--d", stack.indexOf(el)); });
      }, 20);
    }
    renderEmpty();
    updateStatus();
  }

  // Повна перебудова — при зміні фільтрів, мови й на старті
  function buildDeck(deal) {
    stack.forEach(el => el.remove());
    stack = [];
    deckEl.querySelector(".empty")?.remove();
    deckEl.style.setProperty("--p", 0);
    const list = deckList().slice(0, DEPTH);
    list.forEach((g, i) => {
      const el = makeCard(g);
      deckEl.appendChild(el);
      stack.push(el);
      if (deal && !reduceMotion) {
        el.animate([
          { transform: `translateY(60px) rotate(${(i - 1) * 6}deg) scale(.9)`, opacity: 0 },
          { opacity: 1, offset: .6 },
          { transform: "none", opacity: 1 }
        ], { duration: 520, delay: (DEPTH - 1 - i) * 90, easing: "cubic-bezier(.2,.9,.3,1.15)", fill: "backwards", composite: "add" });
      }
    });
    layout();
    renderEmpty();
    updateStatus();
  }

  function renderEmpty() {
    deckEl.querySelector(".empty")?.remove();
    if (stack.length) return updateButtons();
    const total = GAMES.filter(g => matchesFilter(g)).length;
    const anyNoped = st.noped.some(id => matchesFilter(byId.get(id)));
    const filtered = st.mode !== "all" || st.genres.length || query;
    const div = document.createElement("div");
    div.className = "empty";
    div.innerHTML = `
      <h3>${total ? t("emptyAllTitle") : t("emptyNoneTitle")}</h3>
      <p>${total ? t("emptyAllText") : t("emptyNoneText")}</p>
      ${anyNoped ? `<button class="btn btn-primary" data-act="retry">${t("retry")}</button>` : ""}
      ${filtered ? `<button class="btn btn-ghost" data-act="clear">${t("clearFilters")}</button>` : ""}`;
    deckEl.appendChild(div);
    updateButtons();
  }

  function updateStatus() {
    const s = seenSet();
    let left = 0, total = 0;
    for (const g of GAMES) if (matchesFilter(g)) { total++; if (!s.has(g.id)) left++; }
    $("#deckStatus").textContent = left ? t("left", { n: left, total }) : "";
  }

  function updateButtons() {
    const has = stack.length > 0;
    ["#btnNope", "#btnLike", "#btnSuper", "#btnInfo"].forEach(s => $(s).disabled = !has);
    $("#btnUndo").disabled = !history.length;
  }

  // ── Перетягування ──
  const THRESH = 110;
  function attachDrag(card) {
    let sx = 0, sy = 0, dx = 0, dy = 0, active = false, moved = false, sign = 1, samples = [];
    const stamps = {
      like: card.querySelector(".stamp.like"),
      nope: card.querySelector(".stamp.nope"),
      super: card.querySelector(".stamp.super")
    };
    const rot = () => Math.max(-25, Math.min(25, dx * 0.07 * sign));
    const paint = () => {
      card.style.transform = `translate3d(${dx}px, ${dy}px, 0) rotate(${rot()}deg)`;
      const up = dy < 0 && Math.abs(dy) > Math.abs(dx);
      stamps.like.style.opacity = up ? 0 : Math.max(0, Math.min(1, (dx - 20) / (THRESH - 20)));
      stamps.nope.style.opacity = up ? 0 : Math.max(0, Math.min(1, (-dx - 20) / (THRESH - 20)));
      stamps.super.style.opacity = up ? Math.max(0, Math.min(1, (-dy - 20) / (THRESH - 20))) : 0;
      deckEl.style.setProperty("--p", Math.min(1, Math.hypot(dx, dy) / (THRESH * 1.4)).toFixed(3));
    };
    card.addEventListener("pointerdown", e => {
      if (stack[0] !== card || e.button > 0 || e.target.closest("a")) return;
      const r = card.getBoundingClientRect();
      sign = e.clientY - r.top < r.height / 2 ? 1 : -1; // як у Тіндері: хапаєш зверху — нахил в один бік, знизу — в інший
      active = true; moved = false; sx = e.clientX; sy = e.clientY; dx = dy = 0;
      samples = [{ x: e.clientX, y: e.clientY, t: e.timeStamp }];
      card.getAnimations().forEach(a => a.cancel());
      card.setPointerCapture(e.pointerId);
      deckEl.classList.add("dragging");
    });
    card.addEventListener("pointermove", e => {
      if (!active) return;
      dx = e.clientX - sx; dy = e.clientY - sy;
      if (Math.abs(dx) + Math.abs(dy) > 5) moved = true;
      samples.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
      while (samples.length > 2 && e.timeStamp - samples[0].t > 90) samples.shift();
      paint();
    });
    const end = e => {
      if (!active) return;
      active = false;
      deckEl.classList.remove("dragging");
      const a = samples[0], b = samples[samples.length - 1];
      const dt = Math.max(16, b.t - a.t);
      const vx = (b.x - a.x) / dt, vy = (b.y - a.y) / dt; // px/мс
      const flickX = Math.abs(vx) > 0.55 && Math.abs(dx) > 35;
      const flickY = vy < -0.55 && dy < -35;
      const upward = dy < 0 && Math.abs(dy) > Math.abs(dx);
      const info = { dx, dy, vx, vy, rot: rot() };
      if (upward && (dy < -THRESH || flickY)) return decide("super", info);
      if (dx > THRESH || (flickX && vx > 0)) return decide("like", info);
      if (dx < -THRESH || (flickX && vx < 0)) return decide("nope", info);
      // пружинне повернення
      card.style.transform = "";
      Object.values(stamps).forEach(s => s.style.opacity = "");
      deckEl.style.setProperty("--p", 0);
      if (!moved && e.type === "pointerup") toggleInfo();
    };
    card.addEventListener("pointerup", end);
    card.addEventListener("pointercancel", end);
  }

  // ── Рішення ──
  function decide(action, drag) {
    const el = stack[0];
    if (!el) return;
    const id = +el.dataset.id;
    const g = byId.get(id);
    stack.shift();
    el.classList.remove("is-top");
    el.classList.add("leaving");
    el.style.zIndex = 20;

    const W = window.innerWidth, H = window.innerHeight;
    const r = el.getBoundingClientRect();
    const dir = action === "like" ? 1 : action === "nope" ? -1 : 0;
    const stamp = el.querySelector(`.stamp.${action}`);
    let frames, duration, easing;

    if (drag) {
      // Продовжуємо рух пальця з урахуванням швидкості
      const from = `translate3d(${drag.dx}px, ${drag.dy}px, 0) rotate(${drag.rot}deg)`;
      let tx, ty, rz;
      if (action === "super") {
        ty = -(H / 2 + r.height * 1.2);
        tx = drag.dx + drag.vx * 220;
        rz = drag.rot;
      } else {
        tx = dir * (W / 2 + r.width * 1.1) + drag.dx * 0.3;
        ty = drag.dy + Math.max(-300, Math.min(300, drag.vy * 260));
        rz = drag.rot + dir * 18;
      }
      const speed = Math.hypot(drag.vx, drag.vy);
      duration = Math.round(Math.max(230, Math.min(460, 480 - speed * 140)));
      easing = "cubic-bezier(.25,.6,.4,1)";
      frames = [{ transform: from }, { transform: `translate3d(${tx}px, ${ty}px, 0) rotate(${rz}deg)` }];
      stamp.style.opacity = 1;
    } else {
      // Кнопка чи клавіша: короткий замах, потім політ
      if (action === "super") {
        frames = [
          { transform: "none" },
          { transform: "translate3d(0, 18px, 0) scale(.97)", offset: .22 },
          { transform: `translate3d(0, ${-(H / 2 + r.height * 1.2)}px, 0) scale(1.02)` }
        ];
      } else {
        frames = [
          { transform: "none" },
          { transform: `translate3d(${-dir * 16}px, 6px, 0) rotate(${-dir * 3}deg)`, offset: .2 },
          { transform: `translate3d(${dir * (W / 2 + r.width * 1.1)}px, 70px, 0) rotate(${dir * 30}deg)` }
        ];
      }
      duration = 560;
      easing = "cubic-bezier(.45,0,.3,1)";
      stamp.animate([{ opacity: 0, transform: getComputedStyle(stamp).transform + " scale(1.6)" }, { opacity: 1 }],
        { duration: 160, fill: "forwards", easing: "ease-out" });
    }
    if (reduceMotion) { duration = 1; }
    const anim = el.animate(frames, { duration, easing, fill: "forwards" });
    anim.onfinish = () => el.remove();
    setTimeout(() => el.remove(), duration + 120); // якщо вкладка у фоні й анімація не завершилась
    el.style.transform = "";
    deckEl.style.setProperty("--p", 0);

    // Стан
    if (action === "nope") st.noped.push(id);
    else st.liked.unshift({ id, super: action === "super", t: Date.now() });
    history.push({ id, action });
    save();
    computeWeights();

    refill(true);
    renderFilters();
    renderMatches();
    if (action === "like") { bumpCount(); toast(t("toastLiked", { title: g.title })); }
    if (action === "super") { bumpCount(); setTimeout(() => showMatch(g), reduceMotion ? 0 : 260); }
  }

  function undo() {
    const last = history.pop();
    if (!last) return;
    st.noped = st.noped.filter(x => x !== last.id);
    st.liked = st.liked.filter(l => l.id !== last.id);
    st.order = [last.id, ...st.order.filter(x => x !== last.id)];
    const g = byId.get(last.id);
    if (!matchesFilter(g)) { query = ""; $("#search").value = ""; if (!matchesFilter(g)) { st.mode = "all"; st.genres = []; } }
    save();
    computeWeights();

    deckEl.querySelectorAll(`.card.leaving[data-id="${last.id}"]`).forEach(x => x.remove());
    deckEl.querySelector(".empty")?.remove();
    const el = makeCard(g);
    deckEl.appendChild(el);
    stack.unshift(el);
    while (stack.length > DEPTH) stack.pop().remove();
    layout();
    const dir = last.action === "like" ? 1 : last.action === "nope" ? -1 : 0;
    const from = dir
      ? `translate3d(${dir * (window.innerWidth / 2 + 300)}px, 60px, 0) rotate(${dir * 28}deg)`
      : `translate3d(0, ${-window.innerHeight}px, 0)`;
    if (!reduceMotion) el.animate([{ transform: from }, { transform: "none" }], { duration: 480, easing: "cubic-bezier(.2,.9,.25,1.08)" });
    renderEmpty(); updateStatus(); renderFilters(); renderMatches();
  }

  function toggleInfo() {
    stack[0]?.classList.toggle("open");
  }

  // ── Метчі ──
  function renderMatches() {
    $("#matchCount").textContent = st.liked.length;
    const list = st.liked.filter(l => matchTab === "all" || l.super);
    const ul = $("#matchList");
    if (!list.length) {
      ul.innerHTML = `<li class="match-empty">${matchTab === "super" ? t("emptySuper") : t("emptyLikes")}</li>`;
      return;
    }
    ul.innerHTML = list.map(l => {
      const g = byId.get(l.id);
      return `<li class="match">
        <img src="${headerUrl(g)}" alt="" loading="lazy">
        <div>
          <div class="t">${l.super ? `<span class="star" title="${esc(t("starAria"))}" aria-label="${esc(t("starAria"))}">★</span> ` : ""}<a href="${steamUrl(g.id)}" target="_blank" rel="noopener">${esc(g.title)}</a></div>
          <div class="g">${g.genres.slice(0, 2).map(genreName).join(", ")}</div>
        </div>
        <button class="rm" data-rm="${g.id}" aria-label="${esc(t("remove", { title: g.title }))}" title="${esc(t("remove", { title: g.title }))}"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      </li>`;
    }).join("");
  }

  function bumpCount() {
    const b = $("#matchCount");
    b.classList.remove("bump"); void b.offsetWidth; b.classList.add("bump");
  }

  function showMatch(g) {
    $("#mmImg").src = headerUrl(g);
    $("#mmTitle").textContent = g.title;
    $("#mmSteam").href = steamUrl(g.id);
    $("#matchModal").hidden = false;
    $("#mmClose").focus();
  }
  const closeMatch = () => { $("#matchModal").hidden = true; };

  let toastT;
  function toast(text) {
    const el = $("#toast");
    el.textContent = text; el.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove("show"), 1600);
  }

  const openDrawer = () => { $("#matches").classList.add("open"); $("#scrim").hidden = false; };
  const closeDrawer = () => { $("#matches").classList.remove("open"); $("#scrim").hidden = true; };

  // ── Вибір мови ──
  function guessLang() {
    const n = (navigator.languages || [navigator.language || ""]).map(x => x.slice(0, 2).toLowerCase());
    return n.find(x => LANGS[x]) || "uk";
  }
  function openLang(first) {
    const cur = lang || guessLang();
    $("#langTitle").innerHTML = first
      ? ["uk", "en", "ru"].map(l => `<span lang="${LANGS[l].html}">${esc(I18N[l].langTitle)}</span>`).join("")
      : esc(t("langTitle"));
    $("#langList").innerHTML = Object.entries(LANGS).map(([k, v]) =>
      `<button class="lang-opt${k === cur ? " current" : ""}" data-lang="${k}" lang="${v.html}">
        <span class="code">${k.toUpperCase()}</span><span class="nm">${v.name}</span>
      </button>`).join("");
    $("#langClose").hidden = first;
    $("#langModal").hidden = false;
    $(`#langList [data-lang="${cur}"]`).focus();
  }
  const closeLang = () => { if (lang) $("#langModal").hidden = true; };

  async function setLang(l, firstTime) {
    lang = l; st.lang = l; save();
    clearTimeout(toastT); $("#toast").classList.remove("show"); $("#toast").textContent = "";
    await loadDesc(l);
    applyStatic();
    renderFilters();
    buildDeck(firstTime);
    renderMatches();
    $("#langModal").hidden = true;
  }

  // ── Події ──
  $("#modes").addEventListener("click", e => {
    const b = e.target.closest("[data-mode]"); if (!b) return;
    st.mode = b.dataset.mode; save(); renderFilters(); buildDeck(false);
  });
  $("#genres").addEventListener("click", e => {
    const b = e.target.closest("[data-genre]"); if (!b) return;
    const k = b.dataset.genre;
    st.genres = st.genres.includes(k) ? st.genres.filter(x => x !== k) : [...st.genres, k];
    save(); renderFilters(); buildDeck(false);
  });
  $("#clearGenres").addEventListener("click", () => { st.genres = []; save(); renderFilters(); buildDeck(false); });
  $("#moreGenres").addEventListener("click", () => { genresExpanded = !genresExpanded; renderFilters(); });
  let searchT;
  $("#search").addEventListener("input", e => {
    clearTimeout(searchT);
    searchT = setTimeout(() => { query = norm(e.target.value); renderFilters(); buildDeck(false); }, 120);
  });

  deckEl.addEventListener("click", e => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    if (b.dataset.act === "retry") {
      st.noped = st.noped.filter(id => !matchesFilter(byId.get(id)));
      history = history.filter(h => h.action !== "nope" || st.noped.includes(h.id));
    }
    if (b.dataset.act === "clear") { st.mode = "all"; st.genres = []; query = ""; $("#search").value = ""; }
    save(); renderFilters(); buildDeck(true);
  });

  $("#btnNope").addEventListener("click", () => decide("nope"));
  $("#btnLike").addEventListener("click", () => decide("like"));
  $("#btnSuper").addEventListener("click", () => decide("super"));
  $("#btnUndo").addEventListener("click", undo);
  $("#btnInfo").addEventListener("click", toggleInfo);

  $("#matchTabs").addEventListener("click", e => {
    const b = e.target.closest("[data-tab]"); if (!b) return;
    matchTab = b.dataset.tab;
    document.querySelectorAll("#matchTabs button").forEach(x => x.setAttribute("aria-selected", x === b));
    renderMatches();
  });
  $("#matchList").addEventListener("click", e => {
    const b = e.target.closest("[data-rm]"); if (!b) return;
    const id = +b.dataset.rm;
    st.liked = st.liked.filter(l => l.id !== id);
    history = history.filter(h => h.id !== id);
    save(); computeWeights(); renderMatches(); renderFilters(); refill(true); updateButtons();
  });
  $("#resetAll").addEventListener("click", () => {
    if (!confirm(t("resetConfirm"))) return;
    const keepLang = st.lang;
    st = blank(); st.lang = keepLang; st.order = makeOrder(); history = [];
    save(); computeWeights(); renderFilters(); buildDeck(true); renderMatches();
  });

  $("#openMatches").addEventListener("click", openDrawer);
  $("#closeMatches").addEventListener("click", closeDrawer);
  $("#scrim").addEventListener("click", closeDrawer);
  $("#mmClose").addEventListener("click", closeMatch);
  $("#matchModal").addEventListener("click", e => { if (e.target.id === "matchModal") closeMatch(); });
  $("#openLang").addEventListener("click", () => openLang(false));
  $("#langClose").addEventListener("click", closeLang);
  $("#langModal").addEventListener("click", e => {
    const b = e.target.closest("[data-lang]");
    if (b) return setLang(b.dataset.lang, !lang);
    if (e.target.id === "langModal") closeLang();
  });

  document.addEventListener("keydown", e => {
    if (!$("#langModal").hidden) { if (e.key === "Escape") closeLang(); return; }
    if (e.target.matches("input, textarea")) return;
    if (!$("#matchModal").hidden) { if (e.key === "Escape" || e.key === "Enter") { e.preventDefault(); closeMatch(); } return; }
    if (e.key === "Escape") return closeDrawer();
    if (e.repeat) return;
    if (e.key === "ArrowRight") { e.preventDefault(); decide("like"); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); decide("nope"); }
    else if (e.key === "ArrowUp") { e.preventDefault(); decide("super"); }
    else if (e.code === "KeyZ" || e.key === "Backspace") { e.preventDefault(); undo(); }
    else if (e.key === " " && !e.target.closest("button, a")) { e.preventDefault(); toggleInfo(); }
  });

  // ── Старт ──
  computeWeights();
  if (lang) setLang(lang, true);
  else openLang(true);

  // Для перевірки перекладів з консолі
  window.__grametch = { setLang, t, I18N };
})();
