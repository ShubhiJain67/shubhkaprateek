// ShubhKaPrateek — site logic.
// Reads the files in data/ and renders: All products, Shop by reel, category tabs,
// search, lazy loading, hamburger menu, variations and the "Can't find something?" form.
//
//   data/site.json        site title/tagline/Instagram + contact form settings
//   data/categories.json  category tabs (id, name, emoji)
//   data/products.json    every product ONCE: id, name, category, variants (link + photo)
//   data/reels.json       every reel: link, title, cover, and the ids of its products

(async function () {
  const PAGE = { reels: 9, products: 12 }; // cards added per batch while scrolling
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  const $ = id => document.getElementById(id);

  // ---- load data/ (each file has one job) ----
  const FILES = ["site", "categories", "products", "reels"];
  let raw = {};
  for (const f of FILES) {
    try {
      raw[f] = await (await fetch(`data/${f}.json`, { cache: "no-cache" })).json();
    } catch (e) {
      $("grid").innerHTML = `<p class="empty">Couldn't load data/${f}.json — check it for a JSON typo (missing comma or quote).</p>`;
      console.error(f, e); return;
    }
  }
  // Join reels → products by id, so the rest of the app sees full product objects
  const catalogue = new Map((raw.products || []).map(p => [p.id, p]));
  const used = new Set();
  const missing = [];
  const data = {
    ...raw.site,
    categories: raw.categories || [],
    reels: (raw.reels || []).map(r => ({
      ...r,
      products: (r.products || []).map(id => {
        const p = catalogue.get(id);
        if (!p) { missing.push(`${id} (in "${r.title}")`); return null; }
        used.add(id); return p;
      }).filter(Boolean)
    })),
    // products that aren't in any reel still show under All products
    products: (raw.products || []).filter(p => !used.has(p.id))
  };
  if (missing.length) console.warn("reels.json points to product ids that aren't in products.json:", missing);

  const site = data.site || {};
  // categories.json is a tree: top-level categories (the tabs), each with optional "sub" categories.
  // Products use the most specific id ("mugs"); they automatically count under the parent ("home") too.
  // "theme": true marks a cross-cutting collection like Marvel (gets its own "More in Marvel" rail, shown last).
  const cats = (data.categories || []).flatMap(c => [
    { ...c, sub: undefined, parent: null },
    ...(c.sub || []).map(s => ({ emoji: c.emoji, ...s, parent: c.id }))
  ]);
  const catById = Object.fromEntries(cats.map(c => [c.id, c]));
  const tops = () => cats.filter(c => !c.parent);
  const subsOf = id => cats.filter(c => c.parent === id);
  const topOf = id => (catById[id] && catById[id].parent) || id;
  const catOf = id => catById[id] || { id, name: id || "Other", emoji: "🛍️" };

  // A product's "category" can be one value ("toys") or a list (["toys", "Home Decor"]).
  // Each value can be a category id OR its name. Anything not in "categories" becomes a new tab automatically.
  const slug = v => String(v).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const pretty = v => String(v).trim().replace(/[-_]+/g, " ").replace(/\b\w/g, ch => ch.toUpperCase());
  function resolveCat(v) {
    if (v == null || String(v).trim() === "") return null;
    if (catById[v]) return v;
    const byName = cats.find(c => c.name.toLowerCase() === String(v).trim().toLowerCase() || c.id.toLowerCase() === String(v).trim().toLowerCase());
    if (byName) return byName.id;
    const id = slug(v);
    if (!catById[id]) { const c = { id, name: pretty(v), emoji: "🛍️" }; cats.push(c); catById[id] = c; }
    return id;
  }
  const normalize = p => { p.category = [...new Set((Array.isArray(p.category) ? p.category : [p.category]).map(resolveCat).filter(Boolean))]; };
  (data.reels || []).forEach(r => (r.products || []).forEach(normalize));
  (data.products || []).forEach(normalize);
  const catsOf = p => (Array.isArray(p.category) ? p.category : [p.category]).filter(Boolean);
  const keyOf = p => String(p.id);   // products are matched by id everywhere
  // a product's own categories + their parents (a "mugs" product is also in "home")
  const allCatsOf = p => [...new Set(catsOf(p).flatMap(id => [id, catById[id] && catById[id].parent].filter(Boolean)))];
  const inCat = (p, id) => allCatsOf(p).includes(id);

  // Reels with products, newest first
  const reels = (data.reels || [])
    .filter(r => (r.products || []).length)
    .sort((a, b) => (b.id ?? 0) - (a.id ?? 0));

  // Every product once (by id), with the ids of the reels it's in
  const pmap = new Map();
  const addProduct = (p, reelId) => {
    const key = keyOf(p);
    if (!pmap.has(key)) pmap.set(key, { ...p, reels: [] });
    const e = pmap.get(key);
    if (reelId != null && !e.reels.includes(reelId)) e.reels.push(reelId);
  };
  reels.forEach(r => r.products.forEach(p => addProduct(p, r.id)));
  (data.products || []).forEach(p => addProduct(p, null));
  const products = [...pmap.values()].sort((a, b) => Math.max(0, ...b.reels) - Math.max(0, ...a.reels));

  // Header / hero
  if (site.title) document.title = site.title + " — Shop our reels";
  if (site.heroTitle) $("hero-title").textContent = site.heroTitle;
  $("tagline").textContent = site.tagline || "";
  if (site.instagram) { $("ig").href = site.instagram; $("ig").hidden = false; }
  if (site.handle) $("ig-label").textContent = "@" + site.handle;
  if (site.youtube) { $("yt").href = site.youtube; $("yt").hidden = false; }

  // "Buy on Amazon" etc. from the link's domain
  const STORES = { amazon: "Amazon", amzn: "Amazon", myntra: "Myntra", nykaafashion: "Nykaa", flipkart: "Flipkart", fkrt: "Flipkart",
    ajio: "AJIO", nykaa: "Nykaa", meesho: "Meesho", souledstore: "Souled Store", thesouledstore: "Souled Store",
    tatacliq: "Tata CLiQ", bewakoof: "Bewakoof", firstcry: "FirstCry" };
  function storeOf(link) {
    try {
      const host = new URL(link).hostname.replace(/^www\./, "");
      for (const k in STORES) if (host.split(".").includes(k)) return STORES[k];
      return host.split(".")[0].replace(/^\w/, c => c.toUpperCase());
    } catch { return ""; }
  }
  const buyBtn = p => p.link
    ? `<a class="buy" href="${esc(p.link)}" target="_blank" rel="noopener sponsored">Buy${storeOf(p.link) ? " on " + esc(storeOf(p.link)) : ""} →</a>`
    : `<span class="soon">Link coming soon</span>`;
  // ---- Variations: "variants": [{ "name": "Red", "link": "...", "image": "..." }] ----
  // The selected variation: { name, link, image }
  const variantOf = (p, i) => (p.variants || [])[i] || {};
  const variantPills = p => (p.variants || []).length > 1
    ? `<div class="variants" role="radiogroup" aria-label="Options">${p.variants.map((v, i) =>
        `<button type="button" class="vbtn" data-i="${i}" aria-pressed="${i === 0}">${esc(v.name || "Option " + (i + 1))}</button>`).join("")}</div>`
    : "";
  const shortBuy = p => p.link
    ? `<a class="buy" href="${esc(p.link)}" target="_blank" rel="noopener sponsored">Buy →</a>`
    : `<span class="soon">Soon</span>`;
  document.addEventListener("click", e => {
    const b = e.target.closest(".vbtn"); if (!b) return;
    const box = b.closest("[data-key]"), p = pmap.get(box.dataset.key); if (!p) return;
    const v = variantOf(p, +b.dataset.i);
    box.querySelectorAll(".vbtn").forEach(x => x.setAttribute("aria-pressed", x === b));
    const slot = box.querySelector(".vimg");
    slot.innerHTML = imgOr(v, esc(catOf(catsOf(p)[0]).emoji)); watchMedia(slot);
    box.querySelector(".vbuy").innerHTML = box.dataset.short ? shortBuy(v) : buyBtn(v);
  });
  const imgOr = (p, fallback) => p.image
    ? `${fallback}<img class="lazy-img" data-src="${esc(p.image)}" alt="" referrerpolicy="no-referrer" onload="this.classList.add('loaded')" onerror="this.remove()">`
    : fallback;

  // ---- state (in the URL so links can be shared) ----
  const params = new URLSearchParams(location.search);
  let view = params.get("view") === "reels" ? "reels" : "products";
  let active = params.get("c") || "all";
  if (active !== "all" && !catById[active]) active = "all";
  $("q").value = params.get("q") || "";
  let shown = 0, filtered = [];

  function permalink(url) {
    const m = String(url || "").match(/instagram\.com\/(?:[\w.]+\/)?(reel|reels|p|tv)\/([A-Za-z0-9_-]+)/);
    if (!m) return null;
    return `https://www.instagram.com/${m[1] === "reels" ? "reel" : m[1]}/${m[2]}/`;
  }

  // Category tabs ("facets") — counts reflect the current search, not the whole catalogue
  let searched = null;
  function renderChips() {
    const pool = searched || (view === "reels" ? reels : products);
    const counts = {};
    if (view === "reels") pool.forEach(r => new Set(r.products.flatMap(allCatsOf)).forEach(c => counts[c] = (counts[c] || 0) + 1));
    else pool.forEach(p => allCatsOf(p).forEach(c => counts[c] = (counts[c] || 0) + 1));
    // top level: hide empty categories, but keep the selected one visible so it can be switched off
    const top = topOf(active);
    const list = [{ id: "all", name: "All", emoji: "✨" }, ...tops().filter(c => counts[c.id] || c.id === top)];
    $("chips").innerHTML = list.map(c =>
      `<button class="cat-btn" data-id="${esc(c.id)}" aria-pressed="${c.id === top}">
         <span class="ic">${esc(c.emoji || "")}</span>${esc(c.name)} <span class="n">${c.id === "all" ? pool.length : (counts[c.id] || 0)}</span>
       </button>`).join("");
    // second row: the sub-categories of the selected category
    const subs = top === "all" ? [] : subsOf(top).filter(c => counts[c.id] || c.id === active);
    $("subchips").hidden = subs.length < 2;
    $("subchips").innerHTML = subs.length < 2 ? "" : [{ id: top, name: "All " + catOf(top).name }, ...subs].map(c =>
      `<button class="sub-btn" data-id="${esc(c.id)}" aria-pressed="${c.id === active}">${esc(c.name)}<span class="n">${counts[c.id] || 0}</span></button>`).join("");
    // keep the selected chips in view (rows scroll sideways on phones)
    ["chips", "subchips"].forEach(id => {
      const row = $(id), on = row.querySelector('[aria-pressed="true"]');
      if (!on) return;
      const r = row.getBoundingClientRect(), o = on.getBoundingClientRect();
      if (o.left < r.left || o.right > r.right) row.scrollLeft += o.left - r.left - 16;
    });
  }

  function productCard(p) {
    const pcs = catsOf(p).map(catOf), c = pcs[0] || catOf("");
    const latest = p.reels.length ? Math.max(...p.reels) : null;
    const latestUrl = latest != null ? permalink((reels.find(r => r.id === latest) || {}).reel) : null;
    const v = variantOf(p, 0);
    const pid = p.id != null ? esc(p.id) : "";
    return `<div class="card" data-key="${esc(keyOf(p))}">
      <div class="media"${pid ? ` data-product="${pid}" role="link" tabindex="0" aria-label="${esc(p.name)}"` : ""}><span class="vimg">${imgOr(v, esc(c.emoji))}</span>
        ${latestUrl ? `<a class="badge" href="${esc(latestUrl)}" target="_blank" rel="noopener">▶ Watch reel</a>` : ""}
      </div>
      <div class="body">
        <span class="cat">${pcs.map(x => esc(x.name)).join(" · ")}</span>
        <p class="name">${pid ? `<a href="?product=${pid}" data-product="${pid}">${esc(p.name)}</a>` : esc(p.name)}</p>
        ${variantPills(p)}
        <div class="foot"><span class="vbuy">${buyBtn(v)}</span></div>
      </div>
    </div>`;
  }

  const cleanTitle = t => (t || "").replace(/^Day\s*\d+\s*\/\s*\d+\s*[—–-]\s*/i, "");

  function lookCard(r) {
    const url = permalink(r.reel);
    const code = url ? url.split("/")[4] : "";
    // Lazy: nothing is fetched until this card scrolls near the screen (see mediaObserver)
    const media = url
      ? `<div class="lazy-media" data-url="${esc(url)}" data-code="${esc(code)}" data-cover="${esc(r.cover || `assets/covers/${code}.jpg`)}" data-alt="${esc(r.title || "Reel")}"></div>` : "";
    const items = r.products.map(p0 => {
      const p = pmap.get(keyOf(p0)) || p0, v = variantOf(p, 0);
      return `<li class="item" data-key="${esc(keyOf(p))}" data-short="1">
        <span class="thumb vimg">${imgOr(v, esc(catOf(catsOf(p)[0]).emoji))}</span>
        <div class="item-info">
          <p class="item-name">${p.id != null ? `<a href="?product=${esc(p.id)}" data-product="${esc(p.id)}">${esc(p.name)}</a>` : esc(p.name)}</p>
          ${variantPills(p)}
        </div>
        <span class="vbuy">${shortBuy(v)}</span>
      </li>`;
    }).join("");
    return `<article class="look">
      <div class="look-media">${media}</div>
      <div class="look-body">
        <p class="look-title">${code ? `<a href="?reel=${esc(code)}" data-reel="${esc(code)}">${esc(cleanTitle(r.title))}</a>` : esc(cleanTitle(r.title))}</p>
        <ul class="items">${items}</ul>
        ${url ? `<a class="watch" href="${esc(url)}" target="_blank" rel="noopener">▶ Watch on Instagram</a>` : ""}
      </div>
    </article>`;
  }

  // No cover image saved for this reel → fall back to Instagram's embed (cropped to the video)
  window.toEmbed = img => {
    const a = img.closest(".cover, .rp-cover"); if (!a) return;
    if (a.classList.contains("rp-cover")) {       // reel page: keep the 9:16 box, put the embed inside it
      const f = document.createElement("div"); f.className = "frame";
      f.innerHTML = `<iframe src="${a.dataset.embed}" loading="lazy" scrolling="no" allowtransparency="true" allow="encrypted-media; autoplay; clipboard-write"></iframe>`;
      a.replaceChildren(f); fitFrames(); return;
    }
    const f = document.createElement("div"); f.className = "frame";
    f.innerHTML = `<iframe src="${a.dataset.embed}" loading="lazy" scrolling="no" allowtransparency="true" allow="encrypted-media; autoplay; clipboard-write"></iframe>`;
    a.replaceWith(f); fitFrames();
  };
  const EMBED_W = 326;
  function fitFrames() {
    document.querySelectorAll(".frame").forEach(f => f.style.setProperty("--s", f.clientWidth / EMBED_W));
  }
  new ResizeObserver(fitFrames).observe($("reels"));

  // ---------- Lazy loading (both sections) ----------
  // a) Reel previews and product photos load only when they're about to come on screen
  const loadMedia = el => {
    if (el.tagName === "IMG") { el.src = el.dataset.src; el.removeAttribute("data-src"); return; }
    const url = el.dataset.url, code = el.dataset.code;
    el.outerHTML = `<a class="cover" href="?reel=${code}" data-reel="${code}" data-embed="${url}embed/">
        <img src="${el.dataset.cover}" alt="${el.dataset.alt}" onerror="toEmbed(this)"></a>`;
  };
  const mediaObserver = "IntersectionObserver" in window
    ? new IntersectionObserver(entries => entries.forEach(e => {
        if (e.isIntersecting) { mediaObserver.unobserve(e.target); loadMedia(e.target); }
      }), { rootMargin: "400px 0px" })
    : null;
  const watchMedia = root => root.querySelectorAll(".lazy-media, img[data-src]")
    .forEach(el => mediaObserver ? mediaObserver.observe(el) : loadMedia(el));

  // b) More cards are added automatically as you scroll down
  const listEl = () => view === "reels" ? $("reels") : $("grid");
  const cardFn = () => view === "reels" ? lookCard : productCard;
  const appendBatch = () => {
    if (shown >= filtered.length) return;
    const from = shown; shown += PAGE[view];
    const tmp = document.createElement("div");
    tmp.innerHTML = filtered.slice(from, shown).map(cardFn()).join("");
    const added = [...tmp.children]; added.forEach(n => listEl().appendChild(n));
    added.forEach(watchMedia);
    requestAnimationFrame(fillScreen);
  };
  // Keep adding while the end of the list is still on (or near) screen
  function fillScreen() {
    if (shown >= filtered.length) return;
    if ($("sentinel").getBoundingClientRect().top < innerHeight + 600) appendBatch();
  }
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) appendBatch(); }, { rootMargin: "600px 0px" })
      .observe($("sentinel"));
  } else {
    addEventListener("scroll", fillScreen, { passive: true });
  }

  // Jump to "Can't find something?" — first add the rest of the list, otherwise lazy loading keeps
  // pushing the box further down while we scroll to it (photos still load only when seen)
  function goAsk() {
    while (shown < filtered.length) { const from = shown; shown += PAGE[view];
      listEl().insertAdjacentHTML("beforeend", filtered.slice(from, shown).map(cardFn()).join("")); }
    watchMedia(listEl());
    $("ask").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function draw() {
    $("view-reels").hidden = view !== "reels";
    $("view-products").hidden = view !== "products";
    $("reels").innerHTML = ""; $("grid").innerHTML = "";
    shown = Math.min(PAGE[view], filtered.length);
    listEl().innerHTML = filtered.slice(0, shown).map(cardFn()).join("");
    watchMedia(listEl());
    requestAnimationFrame(fillScreen);
    $("empty").hidden = filtered.length > 0;
    $("count").textContent = `${filtered.length} ${view === "reels" ? "reel" : "product"}${filtered.length === 1 ? "" : "s"}`;
  }

  // ---- search: words, categories, and pasted reel links ----
  const REEL_RE = /instagram\.com\/(?:[\w.]+\/)?(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i;
  const codeOf = r => ((String(r.reel || "").match(REEL_RE) || [])[1] || "").toLowerCase();
  const codeById = Object.fromEntries(reels.map(r => [r.id, codeOf(r)]));
  const catWords = p => allCatsOf(p).flatMap(id => [id, catOf(id).name]);
  const reelText = r => [r.title, codeOf(r), ...r.products.flatMap(p => [p.name, ...catWords(p), ...(p.variants || []).map(v => v.name)])].join(" ").toLowerCase();
  const productText = p => [p.name, ...catWords(p), ...(p.variants || []).flatMap(v => [v.name, storeOf(v.link || "")]), ...p.reels.map(id => codeById[id])].join(" ").toLowerCase();

  function apply() {
    // searching, switching tabs or picking a category leaves the reel page
    if (document.body.classList.contains("on-reel-page")) closeReel();
    const raw = $("q").value.trim();
    const q = raw.toLowerCase().replace(/^#/, "");
    // A pasted Instagram link (or just its code) finds that exact reel
    const link = raw.match(REEL_RE);
    const code = link ? link[1].toLowerCase()
      : (/^[a-z0-9_-]{9,14}$/i.test(raw) && reels.some(r => codeOf(r) === raw.toLowerCase()) ? raw.toLowerCase() : null);
    // Every word must match somewhere (name, category, store…) — e.g. "marvel hoodie"
    const words = q.split(/\s+/).filter(Boolean);
    const matches = text => words.every(w => text.includes(w));
    // 1) everything matching the search  2) then narrowed by the selected category
    if (view === "reels") {
      searched = reels.filter(r => code ? codeOf(r) === code : (!words.length || matches(reelText(r))));
      filtered = searched.filter(r => active === "all" || r.products.some(p => inCat(p, active)));
    } else {
      searched = products.filter(p => code ? p.reels.some(id => codeById[id] === code) : (!words.length || matches(productText(p))));
      filtered = searched.filter(p => active === "all" || inCat(p, active));
    }
    renderChips();
    draw();
    const u = new URLSearchParams();
    if (view !== "products") u.set("view", view);
    if (active !== "all") u.set("c", active);
    if (raw) u.set("q", raw);
    history.replaceState(null, "", u.toString() ? "?" + u : location.pathname);
  }

  function setView(v) {
    view = v;
    document.querySelectorAll(".tab").forEach(t => t.setAttribute("aria-selected", t.dataset.view === v));
    $("q").placeholder = v === "reels" ? "Search reels, categories or paste a reel link" : "Search products, categories or paste a reel link";
    apply();
  }

  document.querySelector(".seg").addEventListener("click", e => {
    const t = e.target.closest(".tab"); if (!t || t.dataset.view === view) return;
    active = "all"; $("q").value = ""; setView(t.dataset.view);
  });
  $("subchips").addEventListener("click", e => {
    const b = e.target.closest(".sub-btn"); if (!b) return;
    active = b.dataset.id; apply();
  });
  $("chips").addEventListener("click", e => {
    const b = e.target.closest(".cat-btn"); if (!b) return;
    active = b.dataset.id; apply();
  });
  let t;
  $("q").addEventListener("input", () => { clearTimeout(t); t = setTimeout(apply, 250); });

  // ---------- "Can't find something?" ----------
  const contact = data.contact || {};
  const igHandle = contact.instagram || site.handle || "";
  $("ask-dm").href = `https://ig.me/m/${encodeURIComponent(igHandle)}`;
  if (!contact.formKey && !contact.email) $("ask-mail-tab").hidden = true;

  document.querySelector(".ask-tabs").addEventListener("click", e => {
    const t = e.target.closest(".ask-tab"); if (!t) return;
    document.querySelectorAll(".ask-tab").forEach(x => x.setAttribute("aria-selected", x === t));
    document.querySelectorAll(".ask-pane").forEach(p => p.hidden = p.dataset.pane !== t.dataset.pane);
  });

  const REPLY = {
    instagram: { ph: "@yourhandle", ok: v => /^@?[A-Za-z0-9._]{1,30}$/.test(v), err: "Add your Instagram handle so we can reply", label: "Instagram" },
    email:     { ph: "you@example.com", ok: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), err: "Add a valid email so we can reply", label: "Email" },
    phone:     { ph: "+91 98765 43210", ok: v => v.replace(/[^0-9]/g, "").length >= 10, err: "Add a valid phone number so we can reply", label: "Phone" },
  };
  let replyType = "instagram";
  document.querySelector(".reply-opts").addEventListener("click", e => {
    const b = e.target.closest(".ropt"); if (!b) return;
    replyType = b.dataset.type;
    document.querySelectorAll(".ropt").forEach(x => x.setAttribute("aria-pressed", x === b));
    const c = $("ask-contact"); c.placeholder = REPLY[replyType].ph;
    c.type = replyType === "email" ? "email" : replyType === "phone" ? "tel" : "text";
    c.focus();
  });

  const status = (msg, ok) => { const el = $("ask-status"); el.textContent = msg; el.className = "ask-status " + (ok ? "ok" : "err"); el.hidden = false; };
  $("ask-form").addEventListener("submit", async e => {
    e.preventDefault();
    const msg = $("ask-msg").value.trim(), name = $("ask-name").value.trim(), who = $("ask-contact").value.trim();
    if (!msg) { status("Tell us what you're looking for 🙂", false); $("ask-msg").focus(); return; }
    if (!REPLY[replyType].ok(who)) { status(REPLY[replyType].err, false); $("ask-contact").focus(); return; }
    const replyTo = `${REPLY[replyType].label}: ${who}`;
    if (contact.formKey) {
      if (Date.now() - (window.__lastSend || 0) < 30000) { status("Just sent — give it a few seconds 🙂", false); return; }
      $("ask-send").disabled = true;
      try {
        const r = await fetch("https://api.web3forms.com/submit", {
          method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ access_key: contact.formKey, botcheck: $("ask-botcheck").checked,
            subject: "Product request from website", from_name: name || "Website visitor",
            message: msg, "reply via": replyTo, ...(replyType === "email" ? { replyto: who } : {}) })
        });
        const j = await r.json();
        if (!j.success) throw new Error(j.message);
        window.__lastSend = Date.now();
        status("Sent ✓ We'll reply on " + REPLY[replyType].label + " soon!", true); $("ask-form").reset();
      } catch (err) { status("Couldn't send right now — try the Instagram tab instead.", false); console.error(err); }
      $("ask-send").disabled = false;
    } else {
      const body = `Looking for: ${msg}` + (name ? `\nName: ${name}` : "") + `\nReply via ${replyTo}`;
      location.href = `mailto:${contact.email}?subject=${encodeURIComponent("Product request from website")}&body=${encodeURIComponent(body)}`;
    }
  });

  // ---------- Hamburger menu ----------
  const openMenu = open => {
    document.body.classList.toggle("menu-open", open);
    $("menu-btn").setAttribute("aria-expanded", open);
    $("drawer").setAttribute("aria-hidden", !open);
    if (open) $("drawer-close").focus();
  };
  function buildMenu() {
    const counts = {};
    products.forEach(p => allCatsOf(p).forEach(c => counts[c] = (counts[c] || 0) + 1));
    const item = (c, sub) => `<button class="drawer-item${sub ? " sub" : ""}" data-cat="${esc(c.id)}">${sub ? "" : `<span class="ic">${esc(c.emoji || "")}</span>`}${esc(c.name)}<span class="n">${counts[c.id]}</span></button>`;
    $("drawer-cats").innerHTML = tops().filter(c => counts[c.id]).map(c => {
      const subs = subsOf(c.id).filter(s => counts[s.id]);
      return item(c) + (subs.length > 1 ? subs.map(s => item(s, true)).join("") : "");
    }).join("");
    $("drawer-ig").href = site.instagram || "#";
    if (!site.instagram) $("drawer-ig").hidden = true;
    if (site.youtube) { $("drawer-yt").href = site.youtube; $("drawer-yt").hidden = false; }
  }
  buildMenu();

  // ---------- Floating "Can't find it?" button (phones): jump to the ask box, hide while it's on screen ----------
  const fab = $("ask-fab");
  if (fab) {
    fab.addEventListener("click", e => { e.preventDefault(); goAsk(); });
    if ("IntersectionObserver" in window)
      new IntersectionObserver(([en]) => fab.classList.toggle("hide", en.isIntersecting), { threshold: 0.15 }).observe($("ask"));
  }
  $("menu-btn").addEventListener("click", () => openMenu(true));
  $("drawer-close").addEventListener("click", () => openMenu(false));
  $("scrim").addEventListener("click", () => openMenu(false));
  document.addEventListener("keydown", e => { if (e.key === "Escape") openMenu(false); });
  $("drawer").addEventListener("click", e => {
    const b = e.target.closest(".drawer-item"); if (!b || b.tagName === "A") { if (b) openMenu(false); return; }
    openMenu(false);
    if (b.dataset.cat) { active = b.dataset.cat; $("q").value = ""; setView("products"); }
    else if (b.dataset.go === "ask") { goAsk(); return; }
    else { active = "all"; $("q").value = ""; setView(b.dataset.go); }
    document.querySelector(".toolbar").scrollIntoView({ behavior: "smooth" });
  });

  // ---------- Reel page: ?reel=<code> shows one reel with all its products ----------
  function reelByCode(code) { return reels.find(r => codeOf(r) === String(code || "").toLowerCase()); }
  function openReel(code, push = true) {
    const r = reelByCode(code);
    const sec = $("view-reel");
    $("view-product").hidden = true; $("view-product").innerHTML = "";
    document.body.classList.add("on-reel-page");
    sec.hidden = false;
    if (push) history.pushState({ reel: code }, "", "?reel=" + encodeURIComponent(code));
    else history.replaceState({ reel: code }, "", "?reel=" + encodeURIComponent(code));
    if (!r) {
      sec.innerHTML = `<button class="rp-back" data-back>← All reels</button><p class="empty">We couldn't find that reel 👀 — <a href="#ask">ask us</a> and we'll send you the links.</p>`;
      document.title = (site.title || "ShubhKaPrateek") + " — Reel not found";
      return;
    }
    const url = permalink(r.reel), c = url.split("/")[4]; // keep the code's original case (cover file names are case-sensitive)
    const prods = r.products.map(p0 => pmap.get(keyOf(p0)) || p0);
    sec.innerHTML = `
      <button class="rp-back" data-back>← All reels</button>
      <div class="rp-grid">
        <div class="rp-media">
          <a class="rp-cover" href="${esc(url)}" target="_blank" rel="noopener" data-embed="${esc(url)}embed/">
            <img src="${esc(r.cover || `assets/covers/${c}.jpg`)}" alt="${esc(cleanTitle(r.title))}" onerror="toEmbed(this)">
          </a>
          <div class="rp-actions">
            <a class="rp-watch" href="${esc(url)}" target="_blank" rel="noopener">▶ Watch reel</a>
            <button class="rp-share" type="button" data-share>🔗 Copy link</button>
          </div>
        </div>
        <div class="rp-products">
          <h2 class="rp-title">${esc(cleanTitle(r.title))}</h2>
          <p class="rp-sub">${prods.length} product${prods.length === 1 ? "" : "s"} in this reel</p>
          <div class="grid">${prods.map(productCard).join("")}</div>
        </div>
      </div>`;
    watchMedia(sec);
    document.title = cleanTitle(r.title) + " — " + (site.title || "ShubhKaPrateek");
    window.scrollTo({ top: 0 });
  }
  function closeReel() {
    document.body.classList.remove("on-reel-page");
    $("view-reel").hidden = true; $("view-reel").innerHTML = "";
    $("view-product").hidden = true; $("view-product").innerHTML = "";
    document.title = (site.title || "ShubhKaPrateek") + " — Shop our reels";
  }
  // ---------- Product page: ?product=<id> — photo, options, every reel it's in, similar products ----------
  const productById = id => [...pmap.values()].find(p => String(p.id) === String(id));
  // "More in …" rails on a product page, in this order (each one only if it has something to show):
  //   1) same character — names listed in data/site.json → "characters" (e.g. "More in Hulk")
  //   2) same sub-category (e.g. "More in Comforters & Blankets")
  //   3) same theme (e.g. "More in Marvel")
  // A product appears in only one rail (the first that fits).
  const norm = v => " " + String(v).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() + " ";
  const characters = (site.characters || []).map(n => ({ name: n, key: norm(n) }));
  function railsFor(p, limit = 12) {
    const others = [...pmap.values()].filter(o => o !== p);
    const mine = new Set(catsOf(p)), myReels = new Set(p.reels), used = new Set(), rails = [];
    const rank = o => catsOf(o).filter(c => mine.has(c)).length * 2 + o.reels.filter(r => myReels.has(r)).length;
    const add = (title, list) => {
      list = list.filter(o => !used.has(o))
        .sort((a, b) => rank(b) - rank(a) || Math.max(0, ...b.reels) - Math.max(0, ...a.reels)).slice(0, limit);
      if (!list.length) return;
      list.forEach(o => used.add(o)); rails.push({ title, list });
    };
    characters.filter(c => norm(p.name).includes(c.key))
      .forEach(c => add("More in " + c.name, others.filter(o => norm(o.name).includes(c.key))));
    const own = catsOf(p);
    own.filter(c => !(catById[c] || {}).theme).forEach(c => add("More in " + catOf(c).name, others.filter(o => catsOf(o).includes(c))));
    own.filter(c => (catById[c] || {}).theme).forEach(c => add("More in " + catOf(c).name, others.filter(o => catsOf(o).includes(c))));
    return rails;
  }
  function reelTile(r) {
    const url = permalink(r.reel); if (!url) return "";
    const c = url.split("/")[4];
    return `<a class="pd-reel" href="?reel=${esc(c)}" data-reel="${esc(c)}">
      <span class="pd-reel-cover"><img loading="lazy" src="${esc(r.cover || `assets/covers/${c}.jpg`)}" alt="" onerror="this.remove()"></span>
      <span class="pd-reel-title">${esc(cleanTitle(r.title))}</span></a>`;
  }
  function openProduct(id, push = true) {
    const p = productById(id), sec = $("view-product");
    $("view-reel").hidden = true; $("view-reel").innerHTML = "";
    document.body.classList.add("on-reel-page");
    sec.hidden = false;
    const qs = "?product=" + encodeURIComponent(id);
    if (push) history.pushState({ product: id }, "", qs); else history.replaceState({ product: id }, "", qs);
    if (!p) {
      sec.innerHTML = `<button class="rp-back" data-back>← Back</button><p class="empty">We couldn't find that product 👀 — <a href="#ask">ask us</a>.</p>`;
      document.title = (site.title || "ShubhKaPrateek") + " — Product not found"; return;
    }
    const pcs = catsOf(p).map(catOf), v = variantOf(p, 0);
    const inReels = reels.filter(r => p.reels.includes(r.id));
    const rails = railsFor(p);
    sec.innerHTML = `
      <button class="rp-back" data-back>← Back</button>
      <div class="pd-grid" data-key="${esc(keyOf(p))}">
        <div class="media pd-media"><span class="vimg">${imgOr(v, esc((pcs[0] || catOf("")).emoji))}</span></div>
        <div class="pd-info">
          <span class="cat">${pcs.map(x => esc(x.name)).join(" · ")}</span>
          <h2 class="rp-title">${esc(p.name)}</h2>
          ${variantPills(p)}
          <div class="pd-actions"><span class="vbuy">${buyBtn(v)}</span>
            <button class="rp-share" type="button" data-share>🔗 Copy link</button></div>
          ${inReels.length ? `<p class="rp-sub">Featured in ${inReels.length} reel${inReels.length === 1 ? "" : "s"}</p>` : ""}
        </div>
      </div>
      ${inReels.length ? `<h3 class="pd-h">Seen in ${inReels.length === 1 ? "this reel" : "these reels"}</h3>
        <div class="carousel">
          <button class="car-btn prev" type="button" aria-label="Previous reels" data-car="-1">‹</button>
          <div class="pd-reels car-track">${inReels.map(reelTile).join("")}</div>
          <button class="car-btn next" type="button" aria-label="Next reels" data-car="1">›</button>
        </div>` : ""}
      ${rails.map(r => `<h3 class="pd-h">${esc(r.title)}</h3>
        <div class="carousel">
          <button class="car-btn prev" type="button" aria-label="Previous" data-car="-1">‹</button>
          <div class="car-track rail">${r.list.map(productCard).join("")}</div>
          <button class="car-btn next" type="button" aria-label="Next" data-car="1">›</button>
        </div>`).join("")}`;
    watchMedia(sec);
    sec.querySelectorAll(".carousel").forEach(c => requestAnimationFrame(() => carState(c)));
    document.title = p.name + " — " + (site.title || "ShubhKaPrateek");
    window.scrollTo({ top: 0 });
  }

  // ---------- Carousels: swipe on phones, arrows on desktop ----------
  const carState = car => {
    const t = car.querySelector(".car-track"); if (!t) return;
    const max = t.scrollWidth - t.clientWidth - 2;
    car.querySelector(".prev").disabled = t.scrollLeft <= 2;
    car.querySelector(".next").disabled = t.scrollLeft >= max;
    car.classList.toggle("no-scroll", max <= 0);
  };
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-car]"); if (!b) return;
    const t = b.closest(".carousel").querySelector(".car-track");
    t.scrollBy({ left: +b.dataset.car * t.clientWidth * 0.85, behavior: "smooth" });
  });
  document.addEventListener("scroll", e => { if (e.target.classList?.contains("car-track")) carState(e.target.closest(".carousel")); }, true);
  addEventListener("resize", () => document.querySelectorAll(".carousel").forEach(carState));

  // Clicks on a reel's cover / title open its page inside the site
  document.addEventListener("click", e => {
    const pr = e.target.closest("[data-product]");
    if (pr && !e.target.closest("a.badge, .buy, .vbtn, .soon") && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault(); openProduct(pr.dataset.product); return;
    }
    const a = e.target.closest("[data-reel]");
    if (a && !e.metaKey && !e.ctrlKey && !e.shiftKey) { e.preventDefault(); openReel(a.dataset.reel); return; }
    if (e.target.closest("[data-back]")) {
      e.preventDefault();
      if (history.state && (history.state.reel || history.state.product)) history.back();
      else { closeReel(); view = "reels"; setView("reels"); }
      return;
    }
    const sh = e.target.closest("[data-share]");
    if (sh) {
      navigator.clipboard?.writeText(location.href).then(() => { sh.textContent = "✓ Link copied"; setTimeout(() => sh.textContent = "🔗 Copy link", 1800); });
    }
  });
  // Browser back/forward
  addEventListener("popstate", () => {
    const q = new URLSearchParams(location.search), code = q.get("reel"), prod = q.get("product");
    if (code) openReel(code, false);
    else if (prod) openProduct(prod, false);
    else { closeReel(); const v = new URLSearchParams(location.search).get("view"); setView(v === "reels" ? "reels" : view); }
  });

  const startReel = params.get("reel"), startProduct = params.get("product");
  if (startReel) { setView(view); openReel(startReel, false); }
  else if (startProduct) { setView(view); openProduct(startProduct, false); }
  else setView(view);
})();
