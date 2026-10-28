// ShubhKaPrateek — site logic.
// Reads data/products.json and renders: All products, Shop by reel, category tabs,
// search, lazy loading, hamburger menu, variations and the "Can't find something?" form.

(async function () {
  const PAGE = { reels: 9, products: 12 }; // cards added per batch while scrolling
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  const $ = id => document.getElementById(id);

  let data;
  try {
    data = await (await fetch("data/products.json", { cache: "no-cache" })).json();
  } catch (e) {
    $("grid").innerHTML = '<p class="empty">Couldn\'t load data/products.json — check it for a JSON typo (missing comma or quote).</p>';
    console.error(e); return;
  }

  const site = data.site || {};
  const cats = (data.categories || []).slice();
  const catById = Object.fromEntries(cats.map(c => [c.id, c]));
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
  const inCat = (p, id) => catsOf(p).includes(id);

  // Reels with products, newest first (featured pinned)
  const reels = (data.reels || [])
    .filter(r => (r.products || []).length)
    .sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || (b.id ?? 0) - (a.id ?? 0));

  // Products from reels + standalone list, de-duplicated by name
  const pmap = new Map();
  const addProduct = (p, reelId) => {
    const key = (p.name || "").trim().toLowerCase();
    if (!key) return;
    if (!pmap.has(key)) pmap.set(key, { ...p, reels: [] });
    const e = pmap.get(key);
    if (reelId != null && !e.reels.includes(reelId)) e.reels.push(reelId);
    for (const f of ["link", "price", "image"]) if (!e[f] && p[f]) e[f] = p[f];
    if (!(e.variants || []).length && (p.variants || []).length) e.variants = p.variants;
    e.category = [...new Set([...catsOf(e), ...catsOf(p)])];
  };
  reels.forEach(r => r.products.forEach(p => addProduct(p, r.id)));
  (data.products || []).forEach(p => addProduct(p, p.reel ?? null));
  const products = [...pmap.values()].sort((a, b) =>
    (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || Math.max(0, ...b.reels) - Math.max(0, ...a.reels));

  // Header / hero
  if (site.title) document.title = site.title + " — Shop our reels";
  if (site.heroTitle) $("hero-title").textContent = site.heroTitle;
  $("tagline").textContent = site.tagline || "";
  if (site.instagram) { $("ig").href = site.instagram; $("ig").hidden = false; }
  if (site.handle) $("ig-label").textContent = "@" + site.handle;

  // "Buy on Amazon" etc. from the link's domain
  const STORES = { amazon: "Amazon", amzn: "Amazon", myntra: "Myntra", flipkart: "Flipkart", fkrt: "Flipkart",
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
  const keyOf = p => (p.name || "").trim().toLowerCase();
  // The selected variation, falling back to the product's own link/photo
  const variantOf = (p, i) => {
    const v = (p.variants || [])[i] || {};
    return { ...p, link: v.link || p.link, image: v.image || p.image };
  };
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
    if (!m || /PASTE/i.test(m[2])) return null;
    return `https://www.instagram.com/${m[1] === "reels" ? "reel" : m[1]}/${m[2]}/`;
  }

  // Category tabs ("facets") — counts reflect the current search, not the whole catalogue
  let searched = null;
  function renderChips() {
    const pool = searched || (view === "reels" ? reels : products);
    const counts = {};
    if (view === "reels") pool.forEach(r => new Set(r.products.flatMap(catsOf)).forEach(c => counts[c] = (counts[c] || 0) + 1));
    else pool.forEach(p => catsOf(p).forEach(c => counts[c] = (counts[c] || 0) + 1));
    // hide empty categories, but keep the selected one visible so it can be switched off
    const list = [{ id: "all", name: "All", emoji: "✨" }, ...cats.filter(c => counts[c.id] || c.id === active)];
    $("chips").innerHTML = list.map(c =>
      `<button class="cat-btn" data-id="${esc(c.id)}" aria-pressed="${c.id === active}">
         <span class="ic">${esc(c.emoji || "")}</span>${esc(c.name)} <span class="n">${c.id === "all" ? pool.length : (counts[c.id] || 0)}</span>
       </button>`).join("");
  }

  function productCard(p) {
    const pcs = catsOf(p).map(catOf), c = pcs[0] || catOf("");
    const latest = p.reels.length ? Math.max(...p.reels) : null;
    const latestUrl = latest != null ? permalink((reels.find(r => r.id === latest) || {}).reel) : null;
    const v = variantOf(p, 0);
    return `<div class="card" data-key="${esc(keyOf(p))}">
      <div class="media"><span class="vimg">${imgOr(v, esc(c.emoji))}</span>
        ${latestUrl ? `<a class="badge" href="${esc(latestUrl)}" target="_blank" rel="noopener">▶ Watch reel</a>` : ""}
      </div>
      <div class="body">
        <span class="cat">${pcs.map(x => esc(x.name)).join(" · ")}</span>
        <p class="name">${esc(p.name)}</p>
        ${variantPills(p)}
        <div class="foot"><span class="vbuy">${buyBtn(v)}</span></div>
      </div>
    </div>`;
  }

  function lookCard(r) {
    const url = permalink(r.reel);
    const code = url ? url.split("/")[4] : "";
    // Lazy: nothing is fetched until this card scrolls near the screen (see mediaObserver)
    const media = url
      ? `<div class="lazy-media" data-url="${esc(url)}" data-cover="${esc(r.cover || `assets/covers/${code}.jpg`)}" data-alt="${esc(r.title || "Reel")}"></div>` : "";
    const items = r.products.map(p0 => {
      const p = pmap.get(keyOf(p0)) || p0, v = variantOf(p, 0);
      return `<li class="item" data-key="${esc(keyOf(p))}" data-short="1">
        <span class="thumb vimg">${imgOr(v, esc(catOf(catsOf(p)[0]).emoji))}</span>
        <div class="item-info">
          <p class="item-name">${esc(p.name)}</p>
          ${variantPills(p)}
        </div>
        <span class="vbuy">${shortBuy(v)}</span>
      </li>`;
    }).join("");
    return `<article class="look">
      <div class="look-media">${media}</div>
      <div class="look-body">
        <p class="look-title">${esc((r.title || "").replace(/^Day\s*\d+\s*\/\s*\d+\s*[—–-]\s*/i, ""))}</p>
        <ul class="items">${items}</ul>
        ${url ? `<a class="watch" href="${esc(url)}" target="_blank" rel="noopener">▶ Watch on Instagram</a>` : ""}
      </div>
    </article>`;
  }

  // No cover image saved for this reel → fall back to Instagram's embed (cropped to the video)
  window.toEmbed = img => {
    const a = img.closest(".cover");
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
    const url = el.dataset.url;
    el.outerHTML = `<a class="cover" href="${url}" target="_blank" rel="noopener" data-embed="${url}embed/">
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
  const catWords = p => catsOf(p).flatMap(id => [id, catOf(id).name]);
  const reelText = r => [r.title, codeOf(r), ...r.products.flatMap(p => [p.name, ...catWords(p), ...(p.variants || []).map(v => v.name)])].join(" ").toLowerCase();
  const productText = p => [p.name, ...catWords(p), storeOf(p.link), ...(p.variants || []).flatMap(v => [v.name, storeOf(v.link || "")]), ...p.reels.map(id => codeById[id])].join(" ").toLowerCase();

  function apply() {
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
    products.forEach(p => catsOf(p).forEach(c => counts[c] = (counts[c] || 0) + 1));
    $("drawer-cats").innerHTML = cats.filter(c => counts[c.id]).map(c =>
      `<button class="drawer-item" data-cat="${esc(c.id)}"><span class="ic">${esc(c.emoji || "")}</span>${esc(c.name)}<span class="n">${counts[c.id]}</span></button>`
    ).join("");
    $("drawer-ig").href = site.instagram || "#";
    if (!site.instagram) $("drawer-ig").hidden = true;
  }
  buildMenu();
  $("menu-btn").addEventListener("click", () => openMenu(true));
  $("drawer-close").addEventListener("click", () => openMenu(false));
  $("scrim").addEventListener("click", () => openMenu(false));
  document.addEventListener("keydown", e => { if (e.key === "Escape") openMenu(false); });
  $("drawer").addEventListener("click", e => {
    const b = e.target.closest(".drawer-item"); if (!b || b.tagName === "A") { if (b) openMenu(false); return; }
    openMenu(false);
    if (b.dataset.cat) { active = b.dataset.cat; $("q").value = ""; setView("products"); }
    else if (b.dataset.go === "ask") { $("ask").scrollIntoView({ behavior: "smooth" }); return; }
    else { active = "all"; $("q").value = ""; setView(b.dataset.go); }
    document.querySelector(".toolbar").scrollIntoView({ behavior: "smooth" });
  });

  setView(view);
})();
