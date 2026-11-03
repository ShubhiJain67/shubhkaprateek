// 🗂 The dashboard's back end: shubhkaprateek.com/admin talks to <worker>/admin/api.
//
// Where things live:
//   • enquiries + deals + their history → your Cloudflare database (D1, binding STATS: tables "enquiries", "events")
//   • products, reels, categories, featured → data/*.json in GitHub (what the website is built from); every save
//     here commits them, rebuilds assets/js/data.js and the site goes live in about a minute
//   • brand page numbers → bot/brands.json (new brands get a number the moment a product gets that brand)
//
// Login: the X-Passcode header must equal the ADMIN_PASSCODE secret  (cd bot && npx wrangler secret put ADMIN_PASSCODE)
// Public: POST /enquiry — the media kit's enquiry form (shubhkaprateek.com/portfolio) saves into the database here.

const STATUSES = ["new", "replied", "hold", "confirmed", "product", "live", "delivered", "declined"];   // delivered = everything done, deal closed
const DEAL_FIELDS = ["brand", "email", "package", "product_link", "message", "price", "payment", "payment_due", "product_value", "shoot_by", "post_by", "contact", "contacts", "notes", "source", "dispatched_on", "received_on", "live_on", "paid_on", "script", "non_negotiables", "instagram", "deliverables", "draft_on", "draft_link", "trial_reels", "txn_id", "payment_notes", "pitch_stats", "collab_on"];
const now = () => new Date().toISOString();
const clip = (v, n = 2000) => String(v ?? "").slice(0, n);
const LONG = { script: 20000, non_negotiables: 5000, contacts: 5000, deliverables: 5000, trial_reels: 10000 };   // fields allowed to be longer than 2,000 characters
const slugOf = s => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

let ready = false;
async function tables(env) {
  if (ready) return;
  await env.STATS.batch([
    env.STATS.prepare(`CREATE TABLE IF NOT EXISTS enquiries (id INTEGER PRIMARY KEY AUTOINCREMENT, created TEXT, updated TEXT, status TEXT,
      brand TEXT, email TEXT, package TEXT, product_link TEXT, message TEXT, price TEXT, payment TEXT, product_value TEXT,
      shoot_by TEXT, post_by TEXT, contact TEXT, notes TEXT, product_ids TEXT, reel_code TEXT)`),
    env.STATS.prepare("CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, enquiry_id INTEGER, at TEXT, text TEXT)")
  ]);
  // columns added later — tables made before them get them here (fails harmlessly once they exist)
  for (const col of ["payment_due TEXT", "contacts TEXT", "source TEXT", "dispatched_on TEXT", "received_on TEXT", "live_on TEXT", "paid_on TEXT", "script TEXT", "non_negotiables TEXT", "instagram TEXT", "deliverables TEXT", "draft_on TEXT", "draft_link TEXT", "trial_reels TEXT", "txn_id TEXT", "payment_notes TEXT", "pitched TEXT", "pitch_stats TEXT", "collab_on TEXT"]) { try { await env.STATS.prepare(`ALTER TABLE enquiries ADD COLUMN ${col}`).run(); } catch {} }
  ready = true;
}
const logEvent = (env, id, text) => env.STATS.prepare("INSERT INTO events (enquiry_id, at, text) VALUES (?, ?, ?)").bind(id, now(), clip(text, 300)).run();
const getEnquiry = async (env, id) => env.STATS.prepare("SELECT * FROM enquiries WHERE id = ?").bind(id).first();

function cors(env, extra = {}) {
  return { "Access-Control-Allow-Origin": env.SITE_URL || "https://shubhkaprateek.com", "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Passcode", "Vary": "Origin", "Cache-Control": "no-store", ...extra };
}
const json = (env, body, status = 200) => new Response(JSON.stringify(body), { status, headers: cors(env, { "Content-Type": "application/json" }) });

// A package's price + payment type, from the media kit (data/portfolio.json): "Option 2 — …" → ₹3,000 · Paid,
// the barter card → Barter. Used to pre-fill a new enquiry's deal — you can change them in the dashboard.
async function packageDefaults(env, h, name) {
  let k = {}; try { k = await h.readJson(env, "data/portfolio.json"); } catch {}
  const p = [...(k.packages || []), ...(k.privatePackages || [])].find(x => x.name === name);
  if (p) return { price: p.price || "", payment: "Paid" };
  if (k.barter && k.barter.title && k.barter.title === name) return { price: "", payment: "Barter" };
  return { price: "", payment: "" };
}

// ---------------------------------------------------------------- public: the media kit's enquiry form
async function onEnquiry(req, env, h) {
  if (!env.STATS) return json(env, { error: "not set up" }, 503);
  let b; try { b = await req.json(); } catch { return json(env, { error: "bad request" }, 400); }
  if (b.botcheck) return json(env, { ok: true });                                 // a spam bot filled the hidden box
  const brand = clip(b.brand, 120).trim(), email = clip(b.email, 200).trim();
  if (!brand || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(env, { error: "Please add your brand name and email." }, 400);
  await tables(env);
  const t = now();
  const d = await packageDefaults(env, h, clip(b.package, 120));
  const r = await env.STATS.prepare(`INSERT INTO enquiries (created, updated, status, brand, email, package, product_link, message, price, payment, product_ids, source)
    VALUES (?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, '[]', 'brand')`).bind(t, t, brand, email, clip(b.package, 120), clip(b.link, 500), clip(b.message, 2000), d.price, d.payment).run();
  const id = r.meta && r.meta.last_row_id;
  if (id) await logEvent(env, id, "Enquiry received");
  for (const chat of String(env.ALLOWED_CHAT_IDS || "").split(/[\s,]+/).filter(Boolean))   // a ping on your phone
    await h.say(env, chat, `📩 <b>New enquiry</b> — ${h.esc(brand)}\n${h.esc(clip(b.package, 120))}\nOpen the dashboard: ${h.esc((env.SITE_URL || "https://shubhkaprateek.com") + "/admin")}`).catch(() => {});
  return json(env, { ok: true });
}

// ---------------------------------------------------------------- brand page numbers (bot/brands.json)
async function withBrandNumbers(env, h, products, files) {
  let B; try { B = await h.readJson(env, "bot/brands.json"); } catch { B = { brands: {} }; }
  B.brands = B.brands || {};
  const used = new Set(Object.values(B.brands).map(b => b.id)); let changed = false;
  for (const p of products) {
    const s = slugOf(p.brand); if (!s || B.brands[s]) continue;
    let id; do { id = String(10000 + Math.floor(Math.random() * 90000)); } while (used.has(id));
    used.add(id); B.brands[s] = { name: String(p.brand).trim(), id, link: `${env.SITE_URL || "https://shubhkaprateek.com"}/brand/${id}` }; changed = true;
  }
  if (changed) {
    B.brands = Object.fromEntries(Object.entries(B.brands).sort());
    files.push({ path: "bot/brands.json", text: JSON.stringify(B, null, 2) + "\n" });
  }
  return B;
}

// ---------------------------------------------------------------- the dashboard's API
export async function adminHttp(req, env, url, h) {
  if (url.pathname !== "/admin/api" && url.pathname !== "/enquiry") return null;
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(env) });
  if (url.pathname === "/enquiry") return req.method === "POST" ? onEnquiry(req, env, h) : json(env, { error: "POST only" }, 405);
  if (!env.ADMIN_PASSCODE || req.headers.get("X-Passcode") !== env.ADMIN_PASSCODE)
    return json(env, { error: env.ADMIN_PASSCODE ? "wrong passcode" : "no passcode set" }, 401);
  if (!env.STATS) return json(env, { error: "The database (STATS) isn't connected." }, 503);
  let a; try { a = await req.json(); } catch { return json(env, { error: "bad request" }, 400); }
  try {
    await tables(env);
    const out = await run(a, env, h);
    return json(env, out ?? { ok: true });
  } catch (e) {
    console.error(e);
    return json(env, { error: String(e.message || e).slice(0, 300) }, 400);
  }
}

async function load(env, h) {
  const [products, reels, categories, site] = await Promise.all(["products", "reels", "categories", "site"].map(f => h.readJson(env, `data/${f}.json`)));
  let brands = {}; try { brands = (await h.readJson(env, "bot/brands.json")).brands || {}; } catch {}
  const enquiries = (await env.STATS.prepare("SELECT * FROM enquiries ORDER BY id DESC").all()).results || [];
  const events = (await env.STATS.prepare("SELECT * FROM events ORDER BY id DESC LIMIT 2000").all()).results || [];
  enquiries.forEach(e => { try { e.product_ids = JSON.parse(e.product_ids || "[]"); } catch { e.product_ids = []; } });
  let kit = {}; try { kit = await h.readJson(env, "data/portfolio.json"); } catch {}
  const packages = [...[...(kit.packages || []), ...(kit.privatePackages || []).map(p => ({ ...p, private: true }))].map(p => ({ name: p.name, price: p.price || "", payment: "Paid", items: p.items || [], private: !!p.private })), ...(kit.barter && kit.barter.title ? [{ name: kit.barter.title, price: "", payment: "Barter" }] : [])];
  return { products, reels, categories, featured: (site.site || {}).featured || [], brands, enquiries, events, packages };
}

async function run(a, env, h) {
  const op = String(a.op || "");
  const S = () => Promise.all(["products", "reels"].map(f => h.readJson(env, `data/${f}.json`))).then(([products, reels]) => ({ products, reels }));
  const codeOf = r => ((r.reel || "").match(h.REEL_RE) || [])[1] || "";

  if (op === "load") return load(env, h);

  // ---- enquiries / deals
  if (op === "enquiry.add" || op === "enquiry.update") {
    const p = a.patch || {};
    if (op === "enquiry.add") {
      const t = now();
      const d = await packageDefaults(env, h, clip(p.package, 120));
      const r = await env.STATS.prepare("INSERT INTO enquiries (created, updated, status, brand, email, package, price, payment, product_ids) VALUES (?, ?, 'new', ?, ?, ?, ?, ?, '[]')")
        .bind(t, t, clip(p.brand, 120) || "New brand", clip(p.email, 200), clip(p.package, 120), d.price, d.payment).run();
      const id = r.meta.last_row_id;
      // everything else filled in the form (price/payment here replace the package's defaults)
      const sets = [], vals = [];
      for (const k of DEAL_FIELDS) if (!["brand", "email", "package"].includes(k) && clip(p[k], LONG[k] || 2000).trim()) { sets.push(`${k} = ?`); vals.push(clip(p[k], LONG[k] || 2000)); }
      if (sets.length) await env.STATS.prepare(`UPDATE enquiries SET ${sets.join(", ")} WHERE id = ?`).bind(...vals, id).run();
      await logEvent(env, id, "Added by you");
      // pitched from a reel you already posted: link the reel + its products to this deal
      const pm = String(a.reel || "").match(/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]{5,})/) || String(a.reel || "").match(/^([A-Za-z0-9_-]{5,})$/);
      if (pm) {
        const code = pm[1]; let ids = [];
        try { const { reels } = await S(); const r = reels.find(x => codeOf(x).toLowerCase() === code.toLowerCase()); if (r) ids = (r.products || []).map(Number); } catch {}
        await env.STATS.prepare("UPDATE enquiries SET reel_code = ?, product_ids = ?, pitched = '1', source = COALESCE(source, 'us') WHERE id = ?").bind(code, JSON.stringify(ids), id).run();
        await logEvent(env, id, `Pitched from your reel ${code}`);
      }
      return { ...(await load(env, h)), newId: id };
    }
    const e = await getEnquiry(env, a.id); if (!e) throw new Error("That enquiry is gone");
    const sets = [], vals = [];
    for (const k of DEAL_FIELDS) if (k in p) { sets.push(`${k} = ?`); vals.push(clip(p[k], LONG[k] || 2000)); }
    let status = p.status;
    // a pitched reel is already up: confirming the collab makes it Live straight away, and puts the brand on the reel's products
    if (status === "confirmed" && e.pitched === "1" && e.reel_code) {
      status = "live";
      await logEvent(env, e.id, "Collab confirmed — the reel was already live");
      const ids = (() => { try { return JSON.parse(e.product_ids || "[]").map(Number); } catch { return []; } })();
      if (ids.length) {
        const { products } = await S(), files = [];
        let changed = false;
        for (const pr of products) if (ids.includes(+pr.id) && !String(pr.brand || "").trim()) { pr.brand = e.brand; changed = true; }
        await withBrandNumbers(env, h, products, files);                    // gives the brand its page number if it's new
        if (changed) files.push({ path: "data/products.json", text: h.pretty(products, "category") });
        if (files.length) await h.commitFiles(env, `${e.brand}: collab on reel ${e.reel_code} (dashboard)`, files);
      }
    }
    if (status && STATUSES.includes(status) && status !== e.status) { sets.push("status = ?"); vals.push(status); await logEvent(env, e.id, `Status → ${status}`); }
    if (sets.length) await env.STATS.prepare(`UPDATE enquiries SET ${sets.join(", ")}, updated = ? WHERE id = ?`).bind(...vals, now(), e.id).run();
    return load(env, h);
  }
  if (op === "enquiry.delete") {
    await env.STATS.batch([env.STATS.prepare("DELETE FROM enquiries WHERE id = ?").bind(a.id), env.STATS.prepare("DELETE FROM events WHERE enquiry_id = ?").bind(a.id)]);
    return load(env, h);
  }

  // ---- read a product page: name, photo, guessed categories + brand
  if (op === "fetch") {
    const p = { name: clip(a.name, 200), variants: [{ name: "Default", link: clip(a.link, 1000) }] };
    await h.enrichProduct(p);
    const cats = h.flattenCats(await h.readJson(env, "data/categories.json"));
    return { name: p.needsName ? "" : p.name, image: p.variants[0].image || "", category: h.guessCategories(p.name + " " + (p.pageTitle || ""), cats), brand: h.guessBrand(p.variants[0].link) };
  }

  // ---- products
  if (op === "product.save") {
    const { products } = await S();
    const x = a.product || {}, files = [];
    if (!clip(x.name, 200).trim()) throw new Error("Add the product's name");
    let p = x.id != null ? products.find(q => q.id === +x.id) : null;
    const isNew = !p;
    if (isNew) { p = { id: Math.max(0, ...products.map(q => +q.id || 0)) + 1 }; products.push(p); }
    let image = clip(x.image, 1000);
    if (a.photo) {                                                     // uploaded from the phone (base64 jpg/png)
      image = `assets/products/${p.id}-${h.slug(x.name)}.jpg`;
      files.push({ path: image, base64: String(a.photo).replace(/^data:[^,]+,/, "") });
    }
    const variants = (p.variants && p.variants.length ? p.variants : [{ name: "Default" }]).map((v, i) => i ? v : { ...v, link: clip(x.link, 1000), image });
    Object.assign(p, { name: clip(x.name, 200).trim(), brand: clip(x.brand, 120).trim(), category: [].concat(x.category || []).map(c => clip(c, 60)), variants });
    await withBrandNumbers(env, h, products, files);
    files.push({ path: "data/products.json", text: h.pretty(products, "category") });
    await h.commitFiles(env, `${isNew ? "Add" : "Update"} product ${p.id} ${p.name} (dashboard)`, files);
    if (a.enquiryId) {                                                 // part of a collab → link it + move the status on
      const e = await getEnquiry(env, a.enquiryId);
      if (e) {
        const ids = [...new Set([...(JSON.parse(e.product_ids || "[]")), p.id])];
        const status = ["new", "replied", "hold", "confirmed"].includes(e.status) ? "product" : e.status;
        await env.STATS.prepare("UPDATE enquiries SET product_ids = ?, status = ?, brand = COALESCE(NULLIF(brand, ''), ?), updated = ? WHERE id = ?").bind(JSON.stringify(ids), status, p.brand, now(), e.id).run();
        await logEvent(env, e.id, `Product added: ${p.name}`);
      }
    }
    return { ...(await load(env, h)), savedId: p.id };
  }
  if (op === "product.delete" || op === "reel.delete") {
    const { products, reels } = await S();
    const target = op === "reel.delete" ? { reel: clip(a.code, 40) } : { products: products.filter(p => p.id === +a.id) };
    if (!target.reel && !target.products.length) throw new Error("Already gone");
    const plan = h.planDelete(target, products, reels); if (!plan) throw new Error("Already gone");
    const outp = h.applyDelete(plan, products, reels);
    const files = [{ path: "data/products.json", text: h.pretty(outp.products, "category") }, { path: "data/reels.json", text: h.pretty(outp.reels, "products") }];
    for (const path of [...new Set([...plan.reels.map(r => `assets/covers/${codeOf(r)}.jpg`), ...plan.products.flatMap(p => (p.variants || []).map(v => v.image).filter(i => /^assets\//.test(i || "")))])])
      try { await h.gh(env, `/contents/${path}?ref=${env.GITHUB_BRANCH || "main"}`); files.push({ path, remove: true }); } catch {}
    await h.commitFiles(env, `Remove ${op === "reel.delete" ? "reel " + a.code : "product " + a.id} (dashboard)`, files);
    return load(env, h);
  }

  // ---- reels: paste the link + pick its products → live
  if (op === "reel.save") {
    const code = (String(a.link || a.code || "").match(h.REEL_RE) || [])[1] || (/^[\w-]{5,}$/.test(a.code || "") ? a.code : "");
    if (!code) throw new Error("That doesn't look like an Instagram reel link");
    const { reels } = await S(), files = [];
    const ids = [...new Set([].concat(a.products || []).map(Number).filter(Boolean))];
    if (!ids.length) throw new Error("Pick at least one product for this reel");
    let r = reels.find(x => codeOf(x).toLowerCase() === code.toLowerCase());
    const isNew = !r;
    if (isNew) {
      const info = await h.enrichReel(code);
      r = { id: Math.max(0, ...reels.map(x => +x.id || 0)) + 1, reel: `https://www.instagram.com/reel/${code}/`, title: clip(a.title, 200) || info.title || "New reel", products: ids };
      reels.push(r);
      if (info.cover) try { files.push({ path: `assets/covers/${code}.jpg`, base64: await h.fetchBytes(info.cover) }); } catch {}
    } else {
      r.products = ids;
      if (a.title) r.title = clip(a.title, 200);
    }
    files.push({ path: "data/reels.json", text: h.pretty(reels, "products") });
    await h.commitFiles(env, `${isNew ? "Add" : "Update"} reel ${code} (dashboard)`, files);
    if (a.enquiryId) {
      // live date: the one picked in the form, else keep the saved one, else today. A closed (delivered) deal stays closed.
      const liveOn = /^\d{4}-\d{2}-\d{2}$/.test(a.liveOn || "") ? a.liveOn : null;
      await env.STATS.prepare("UPDATE enquiries SET reel_code = ?, status = CASE WHEN status = 'delivered' THEN status ELSE 'live' END, live_on = COALESCE(?, live_on, date('now')), updated = ? WHERE id = ?").bind(code, liveOn, now(), a.enquiryId).run();
      await logEvent(env, a.enquiryId, `Reel live: ${code}`);
    }
    return { ...(await load(env, h)), cover: isNew ? files.some(f => f.path.startsWith("assets/covers/")) : true };
  }

  // ---- featured (max 2)
  if (op === "featured") {
    const site = await h.readJson(env, "data/site.json");
    site.site = { ...site.site, featured: [].concat(a.ids || []).map(Number).filter(Boolean).slice(0, 2) };
    await h.commitFiles(env, "Featured products (dashboard)", [{ path: "data/site.json", text: h.pretty(site, "featured") }]);
    return load(env, h);
  }
  throw new Error("Unknown action: " + op);
}
