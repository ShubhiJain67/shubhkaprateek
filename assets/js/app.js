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
  // 1) Show the copy in /assets/js/data.js right away (no download → instant, and works even if downloads stall).
  // 2) The live data/ files are checked in the background (started in index.html); if they're newer — e.g. the
  //    bot just added a reel — remember them for this visit and reload once to show them.
  // 3) No built-in copy (older cached page)? Wait for the live files, with a timeout + one retry.
  const FILES = ["site", "categories", "products", "reels"];
  const fetchAll = () => Promise.all(FILES.map(f => fetch(`/data/${f}.json`, { cache: "no-cache" })
    .then(r => { if (!r.ok) throw new Error(f + " " + r.status); return r.json(); }).then(d => [f, d]))).then(Object.fromEntries);
  const timeout = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error("timed out")), ms))]);
  const readJSON = get => { try { return JSON.parse(get() || "null"); } catch { return null; } };
  const fresh = window.SKP_FRESH || fetchAll();
  let raw = readJSON(() => sessionStorage.getItem("skp-fresh")) || (window.SKP_SNAPSHOT || null);
  if (raw) {
    fresh.then(d => {
      if (JSON.stringify(d) === JSON.stringify(raw)) return;
      try { sessionStorage.setItem("skp-fresh", JSON.stringify(d)); } catch { return; }   // can't remember → don't loop
      location.reload();
    }).catch(() => {});
  } else {
    try { raw = await timeout(fresh, 8000).catch(() => timeout(fetchAll(), 8000)); }
    catch (e) {
      $("grid").innerHTML = `<p class="empty">Couldn't load the products right now — <a href="">tap to try again</a>.</p>`;
      console.error(e); return;
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
    slot.innerHTML = imgOr(v, esc(catOf(catsOf(p)[0]).emoji), slot.classList.contains("thumb") ? 120 : slot.closest(".pd-media") ? 600 : 400); watchMedia(slot);
    box.querySelector(".vbuy").innerHTML = box.dataset.short ? shortBuy(v) : buyBtn(v);
  });
  // Ask the store for a photo about the size it's shown at (phones: cards ~170px wide → 400px is plenty; little
  // reel-list thumbnails → 120px). Amazon "._SL600_." and Shopify "width=600" links can be resized like this.
  const sized = (url, px) => String(url).replace(/\._SL\d+_\./, `._SL${px}_.`).replace(/([?&]width=)\d+/, `$1${px}`);
  const imgOr = (p, fallback, px = 400) => p.image
    ? `${fallback}<img class="lazy-img" data-src="${esc(sized(p.image, px))}" alt="" decoding="async" referrerpolicy="no-referrer" onload="this.classList.add('loaded')" onerror="this.remove()">`
    : fallback;

  // ---------- Analytics (Umami — free, no cookies): turned on by "umamiWebsiteId" in data/site.json ----------
  // Page views (incl. which /reel/… or /product/… page) are counted automatically; the events below add what matters
  // for affiliate income: Buy clicks per product + store, searches, and "Can't find something?" use.
  // events that happen before Umami has finished loading wait in a queue
  const pending = [];
  const track = (name, data) => { try { window.umami ? window.umami.track(name, data) : pending.push([name, data]); } catch {} };
  if (site.umamiWebsiteId) {
    const s = document.createElement("script");
    s.defer = true; s.src = "https://cloud.umami.is/script.js";
    s.dataset.websiteId = site.umamiWebsiteId;
    s.dataset.domains = "shubhkaprateek.com,www.shubhkaprateek.com";     // local previews aren't counted
    s.onload = () => { while (pending.length) track(...pending.shift()); };
    document.head.appendChild(s);
  }
  document.addEventListener("click", e => {
    const buy = e.target.closest("a.buy");
    if (buy) {
      const box = buy.closest("[data-key]"), p = box && pmap.get(box.dataset.key);
      const where = buy.closest(".feat-tile") ? "featured" : buy.closest(".pd-grid") ? "product page" : buy.closest(".item") ? "reel list" : buy.closest("#view-reel") ? "reel page" : "products";
      track("buy", { product: p ? p.name : "?", id: p && p.id != null ? p.id : "?", store: storeOf(buy.href), where });
      return;
    }
    if (e.target.closest("#ask-dm")) track("ask-instagram");
    if (e.target.closest("a.watch, a.rp-watch, a.badge, a.feat-reel")) track("watch-reel");
  }, true);
  let searchTimer;
  document.addEventListener("input", e => {
    if (e.target.id !== "q") return;
    clearTimeout(searchTimer);   // count a search once the person stops typing
    searchTimer = setTimeout(() => { const q = e.target.value.trim(); if (q.length > 1) track("search", { q: q.slice(0, 60) }); }, 1500);
  });

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

  // ---------- Featured tile(s) on the landing page — ids in data/site.json → "featured" (set from Telegram: /feature) ----------
  function featuredTile(p) {
    const v = variantOf(p, 0), id = esc(p.id);
    const latest = p.reels.length ? permalink((reels.find(r => r.id === Math.max(...p.reels)) || {}).reel) : null;
    return `<div class="feat-tile" data-key="${esc(keyOf(p))}">
      <div class="media feat-media" data-product="${id}" role="link" tabindex="0" aria-label="${esc(p.name)}"><span class="vimg">${imgOr(v, esc(catOf(catsOf(p)[0]).emoji))}</span></div>
      <div class="feat-info">
        <span class="feat-label">⭐ Featured</span>
        <span class="cat">${catsOf(p).map(c => esc(catOf(c).name)).join(" · ")}</span>
        <h3 class="feat-name"><a href="/product/${id}" data-product="${id}">${esc(p.name)}</a></h3>
        ${variantPills(p)}
        <div class="feat-actions"><span class="vbuy">${buyBtn(v)}</span>
          ${latest ? `<a class="feat-reel" href="${esc(latest)}" target="_blank" rel="noopener">▶ Watch reel</a>` : ""}</div>
      </div>
    </div>`;
  }
  // A slim moving strip at the top of reel/product pages that points to the featured product(s) — just the name
  // and a link, no photo or Buy button, so it never competes with the reel/product whose page it is.
  function featuredTicker(excludeId) {
    const list = [].concat(site.featured || []).map(id => pmap.get(String(id))).filter(p => p && String(p.id) !== String(excludeId));
    if (!list.length) return "";
    const one = `<span class="tk-item">⭐ Our pick: ${list.map(p => `<a href="/product/${esc(p.id)}" data-product="${esc(p.id)}">${esc(p.name)}</a>`).join(" · ")} — take a look →</span>`;
    return `<div class="feat-ticker" aria-label="Featured"><div class="tk-track">${one}<span aria-hidden="true">${one}</span><span aria-hidden="true">${one}</span></div></div>`;
  }
  function renderFeatured() {
    const list = [].concat(site.featured || []).map(id => pmap.get(String(id))).filter(Boolean);
    const box = $("featured");
    if (!list.length) return;
    box.innerHTML = list.length === 1 ? featuredTile(list[0]) : `<div class="carousel">
        <button class="car-btn prev" type="button" aria-label="Previous" data-car="-1">‹</button>
        <div class="car-track feat-track">${list.map(featuredTile).join("")}</div>
        <button class="car-btn next" type="button" aria-label="Next" data-car="1">›</button>
      </div>`;
    box.dataset.ready = "1";
    watchMedia(box);
    box.querySelectorAll(".carousel").forEach(c => requestAnimationFrame(() => carState(c)));
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
        <p class="name">${pid ? `<a href="/product/${pid}" data-product="${pid}">${esc(p.name)}</a>` : esc(p.name)}</p>
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
      ? `<div class="lazy-media" data-url="${esc(url)}" data-code="${esc(code)}" data-cover="${esc(r.cover || `/assets/covers/${code}.jpg`)}" data-alt="${esc(r.title || "Reel")}"></div>` : "";
    const items = r.products.map(p0 => {
      const p = pmap.get(keyOf(p0)) || p0, v = variantOf(p, 0);
      return `<li class="item" data-key="${esc(keyOf(p))}" data-short="1">
        <span class="thumb vimg">${imgOr(v, esc(catOf(catsOf(p)[0]).emoji), 120)}</span>
        <div class="item-info">
          <p class="item-name">${p.id != null ? `<a href="/product/${esc(p.id)}" data-product="${esc(p.id)}">${esc(p.name)}</a>` : esc(p.name)}</p>
          ${variantPills(p)}
        </div>
        <span class="vbuy">${shortBuy(v)}</span>
      </li>`;
    }).join("");
    return `<article class="look">
      <div class="look-media">${media}</div>
      <div class="look-body">
        <p class="look-title">${code ? `<a href="/reel/${esc(code)}" data-reel="${esc(code)}">${esc(cleanTitle(r.title))}</a>` : esc(cleanTitle(r.title))}</p>
        <ul class="items">${items}</ul>
        ${url ? `<a class="watch" href="${esc(url)}" target="_blank" rel="noopener">▶ Watch on Instagram</a>` : ""}
      </div>
    </article>`;
  }

  // No cover image saved for this reel → fall back to Instagram's embed (cropped to the video)
  window.toEmbed = img => {
    const a = img.closest(".cover"); if (!a) return;
    const f = document.createElement("div"); f.className = "frame";
    f.innerHTML = `<iframe src="${a.dataset.embed}" loading="lazy" scrolling="no" allowtransparency="true" allow="encrypted-media; autoplay; clipboard-write"></iframe>`;
    a.replaceWith(f); fitFrames();
  };
  const EMBED_W = 326;
  // Instagram's player shows the reel inside a 4:5 box with black bars at the sides; the video itself is
  // 9/16 of that box's height wide. The reel page scales the player so exactly the video fills its 9:16 frame.
  const EMBED_VIDEO_W = EMBED_W * 1.25 * 9 / 16;      // ≈ 229px of the 326px-wide player
  function fitFrames() {
    document.querySelectorAll(".frame").forEach(f => f.style.setProperty("--s", f.clientWidth / EMBED_W));
    document.querySelectorAll(".reel-frame").forEach(f => f.style.setProperty("--s", f.clientWidth / EMBED_VIDEO_W));
  }
  new ResizeObserver(fitFrames).observe($("reels"));
  addEventListener("resize", fitFrames);

  // ---------- Lazy loading (both sections) ----------
  // a) Reel previews and product photos load only when they're about to come on screen
  const loadMedia = el => {
    if (el.tagName === "IMG") { el.src = el.dataset.src; el.removeAttribute("data-src"); return; }
    const url = el.dataset.url, code = el.dataset.code;
    el.outerHTML = `<a class="cover" href="/reel/${code}" data-reel="${code}" data-embed="${url}embed/">
        <img src="${el.dataset.cover}" alt="${el.dataset.alt}" onerror="toEmbed(this)"></a>`;
  };
  const mediaObserver = "IntersectionObserver" in window
    ? new IntersectionObserver(entries => entries.forEach(e => {
        if (e.isIntersecting) { mediaObserver.unobserve(e.target); loadMedia(e.target); }
      }), { rootMargin: "400px 0px" })
    : null;
  // Reel covers (the heaviest part of Shop by reel) load in a fixed rhythm: the first 3 when the tab opens,
  // then one more each time you scroll onto the next reel — always 2 ready ahead of the one you're looking at.
  const COVERS_AHEAD = 2;
  const loadCoversUpTo = n => [...$("reels").querySelectorAll(".look")].slice(0, n + 1)
    .forEach(look => { const m = look.querySelector(".lazy-media"); if (m) loadMedia(m); });
  const reelObserver = "IntersectionObserver" in window
    ? new IntersectionObserver(entries => entries.forEach(e => {
        if (!e.isIntersecting) return;
        reelObserver.unobserve(e.target);
        loadCoversUpTo([...$("reels").children].indexOf(e.target) + COVERS_AHEAD);
      }), { threshold: 0.25 })
    : null;
  const watchMedia = root => {
    root.querySelectorAll("img[data-src]").forEach(el => mediaObserver ? mediaObserver.observe(el) : loadMedia(el));
    // covers inside the Shop by reel list follow the rhythm above; covers anywhere else load as they come on screen
    root.querySelectorAll(".lazy-media").forEach(el => {
      const look = el.closest("#reels > .look");
      if (look && reelObserver) reelObserver.observe(look); else if (mediaObserver) mediaObserver.observe(el); else loadMedia(el);
    });
    if (root === $("reels") || root.closest?.("#reels")) {
      if (!$("reels").querySelector(".look .cover")) loadCoversUpTo(COVERS_AHEAD);   // tab just opened → first 3
    }
  };

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
    // featured tile only on the plain landing page (not while searching or filtering)
    $("featured").hidden = !$("featured").dataset.ready || !!raw || active !== "all";
    renderChips();
    draw();
    const u = new URLSearchParams();
    if (view !== "products") u.set("view", view);
    if (active !== "all") u.set("c", active);
    if (raw) u.set("q", raw);
    history.replaceState(null, "", "/" + (u.toString() ? "?" + u : ""));
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
        track("ask-email");
      status("Sent ✓ We'll reply on " + REPLY[replyType].label + " soon!", true); $("ask-form").reset();
      } catch (err) { status("Couldn't send right now — try the Instagram tab instead.", false); console.error(err); }
      $("ask-send").disabled = false;
    } else {
      const body = `Looking for: ${msg}` + (name ? `\nName: ${name}` : "") + `\nReply via ${replyTo}`;
      location.href = `mailto:${contact.email}?subject=${encodeURIComponent("Product request from website")}&body=${encodeURIComponent(body)}`;
    }
  });

  // ---------- Hamburger menu ----------
  const toggleGroup = (g, open) => {
    g.querySelector(".drawer-toggle").setAttribute("aria-expanded", open);
    g.querySelector(".drawer-subs").hidden = !open;
  };
  const openMenu = open => {
    // opening: show the sub-categories of the category you're browsing, keep the rest closed
    if (open) document.querySelectorAll(".drawer-group").forEach(g => toggleGroup(g, g.dataset.group === topOf(active)));
    document.body.classList.toggle("menu-open", open);
    $("menu-btn").setAttribute("aria-expanded", open);
    $("drawer").setAttribute("aria-hidden", !open);
    if (open) $("drawer-close").focus();
  };
  function buildMenu() {
    const counts = {};
    products.forEach(p => allCatsOf(p).forEach(c => counts[c] = (counts[c] || 0) + 1));
    const item = (c, sub) => `<button class="drawer-item${sub ? " sub" : ""}" data-cat="${esc(c.id)}">${sub ? "" : `<span class="ic">${esc(c.emoji || "")}</span>`}${esc(c.name)}<span class="n">${counts[c.id]}</span></button>`;
    // a category with sub-categories gets a ▾ button that opens/closes its list (closed by default)
    $("drawer-cats").innerHTML = tops().filter(c => counts[c.id]).map(c => {
      const subs = subsOf(c.id).filter(s => counts[s.id]);
      if (subs.length < 2) return item(c);
      return `<div class="drawer-group" data-group="${esc(c.id)}">
        <div class="drawer-row">${item(c)}<button class="drawer-toggle" type="button" aria-expanded="false" aria-controls="sub-${esc(c.id)}" aria-label="Show ${esc(c.name)} sub-categories"></button></div>
        <div class="drawer-subs" id="sub-${esc(c.id)}" hidden>${subs.map(s => item(s, true)).join("")}</div>
      </div>`;
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
    const tg = e.target.closest(".drawer-toggle");
    if (tg) { toggleGroup(tg.closest(".drawer-group"), tg.getAttribute("aria-expanded") !== "true"); return; }
    const b = e.target.closest(".drawer-item"); if (!b || b.tagName === "A") { if (b) openMenu(false); return; }
    openMenu(false);
    if (b.dataset.cat) { active = b.dataset.cat; $("q").value = ""; setView("products"); }
    else if (b.dataset.go === "ask") { goAsk(); return; }
    else { active = "all"; $("q").value = ""; setView(b.dataset.go); }
    document.querySelector(".toolbar").scrollIntoView({ behavior: "smooth" });
  });

  // Which page is open: shubhkaprateek.com/reel/<code> or /product/<id>.
  // Old links (/?reel=<code>, /?product=<id>) still work — they open the page and the address switches to the new one.
  function pageOf() {
    const m = location.pathname.match(/^\/(reel|product)\/([^/]+?)(?:\.html)?\/?$/), q = new URLSearchParams(location.search);
    const part = k => m && m[1] === k ? decodeURIComponent(m[2]) : q.get(k);
    return { code: part("reel"), prod: part("product") };
  }

  // ---------- Reel page: /reel/<code> shows one reel with all its products ----------
  function reelByCode(code) { return reels.find(r => codeOf(r) === String(code || "").toLowerCase()); }
  function openReel(code, push = true) {
    const r = reelByCode(code);
    const sec = $("view-reel");
    $("view-product").hidden = true; $("view-product").innerHTML = "";
    document.body.classList.add("on-reel-page");
    sec.hidden = false;
    const path = "/reel/" + encodeURIComponent(code);
    if (push) history.pushState({ reel: code }, "", path); else history.replaceState({ reel: code }, "", path);
    if (!r) {
      sec.innerHTML = `<button class="rp-back" data-back>← All reels</button><p class="empty">We couldn't find that reel 👀 — <a href="#ask">ask us</a> and we'll send you the links.</p>`;
      document.title = (site.title || "ShubhKaPrateek") + " — Reel not found";
      return;
    }
    const url = permalink(r.reel), c = url.split("/")[4]; // keep the code's original case (cover file names are case-sensitive)
    const prods = r.products.map(p0 => pmap.get(keyOf(p0)) || p0);
    sec.innerHTML = `${featuredTicker()}
      <button class="rp-back" data-back>← All reels</button>
      <div class="rp-grid">
        <div class="rp-media">
          <div class="rp-cover rp-player">
            <img src="${esc(r.cover || `/assets/covers/${c}.jpg`)}" alt="${esc(cleanTitle(r.title))}" onerror="this.remove()">
            <div class="reel-frame"><iframe src="${esc(url)}embed/" title="${esc(cleanTitle(r.title))}" scrolling="no" allowtransparency="true"
              allow="autoplay; encrypted-media; clipboard-write; picture-in-picture" onload="this.parentNode.classList.add('ready')"></iframe></div>
          </div>
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
    fitFrames();
    document.title = cleanTitle(r.title) + " — " + (site.title || "ShubhKaPrateek");
    window.scrollTo({ top: 0 });
  }
  function closeReel() {
    document.body.classList.remove("on-reel-page");
    $("view-reel").hidden = true; $("view-reel").innerHTML = "";
    $("view-product").hidden = true; $("view-product").innerHTML = "";
    document.title = (site.title || "ShubhKaPrateek") + " — Shop our reels";
  }
  // ---------- Product page: /product/<id> — photo, options, every reel it's in, similar products ----------
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
    return `<a class="pd-reel" href="/reel/${esc(c)}" data-reel="${esc(c)}">
      <span class="pd-reel-cover"><img loading="lazy" src="${esc(r.cover || `/assets/covers/${c}.jpg`)}" alt="" onerror="this.remove()"></span>
      <span class="pd-reel-title">${esc(cleanTitle(r.title))}</span></a>`;
  }
  function openProduct(id, push = true) {
    const p = productById(id), sec = $("view-product");
    $("view-reel").hidden = true; $("view-reel").innerHTML = "";
    document.body.classList.add("on-reel-page");
    sec.hidden = false;
    const path = "/product/" + encodeURIComponent(id);
    if (push) history.pushState({ product: id }, "", path); else history.replaceState({ product: id }, "", path);
    if (!p) {
      sec.innerHTML = `<button class="rp-back" data-back>← Back</button><p class="empty">We couldn't find that product 👀 — <a href="#ask">ask us</a>.</p>`;
      document.title = (site.title || "ShubhKaPrateek") + " — Product not found"; return;
    }
    const pcs = catsOf(p).map(catOf), v = variantOf(p, 0);
    const inReels = reels.filter(r => p.reels.includes(r.id));
    const rails = railsFor(p);
    sec.innerHTML = `${featuredTicker(p.id)}
      <button class="rp-back" data-back>← Back</button>
      <div class="pd-grid" data-key="${esc(keyOf(p))}">
        <div class="media pd-media"><span class="vimg">${imgOr(v, esc((pcs[0] || catOf("")).emoji), 600)}</span></div>
        <div class="pd-info">
          ${[].concat(site.featured || []).map(String).includes(String(p.id)) ? `<span class="feat-label pd-feat">⭐ Our pick</span>` : ""}
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
    const { code, prod } = pageOf();
    if (code) openReel(code, false);
    else if (prod) openProduct(prod, false);
    else { closeReel(); const v = new URLSearchParams(location.search).get("view"); setView(v === "reels" ? "reels" : view); }
  });

  renderFeatured();
  // Reel CTA links: shubhkaprateek.com/?from=<reel code> opens that reel's page and records which reel sent the
  // visitor (Umami → Events → "from-reel"). The bot sends this link after you add a reel; /link gets it any time.
  // Tracking links: shubhkaprateek.com/?from=<any name you like> (e.g. ?from=queaky in an auto-DM).
  // The visitor lands on whatever page the link is for; Umami's Events box shows one row per name ("from: queaky").
  const fromName = (params.get("from") || "").trim().slice(0, 60);
  // each name is its own event, so the Events box on the Umami dashboard lists "from: queaky — 12", "from: autodm — 5"…
  if (fromName) track(("from: " + fromName).slice(0, 50), { from: fromName });
  const { code: startReel, prod: startProduct } = pageOf();
  if (startReel) { setView(view); openReel(startReel, false); }
  else if (startProduct) { setView(view); openProduct(startProduct, false); }
  else setView(view);
})();
