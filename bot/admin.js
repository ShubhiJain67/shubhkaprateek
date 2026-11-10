// 🗂 The dashboard's back end: shubhkaprateek.com/admin talks to <worker>/admin/api.
//
// Where things live — all in your Cloudflare database (D1, binding STATS), nothing is committed to GitHub:
//   • enquiries + deals + their history → tables "enquiries", "events"
//   • products, brands (with their fixed 5-digit page numbers), reels, categories, featured, photos → bot/store.js
//     Every save is on the website within seconds (it reads GET /data live) — no deployment.
//
// Login: the X-Passcode header must equal the ADMIN_PASSCODE secret  (cd bot && npx wrangler secret put ADMIN_PASSCODE)
// Public: POST /enquiry — the media kit's enquiry form (shubhkaprateek.com/mediakit and /collab) saves into the database here.

import * as store from "./store.js";

const STATUSES = ["new", "hold", "confirmed", "product", "live", "delivered", "declined"];   // delivered = everything done, deal closed
const DEAL_FIELDS = ["brand", "email", "package", "product_link", "message", "price", "payment", "payment_due", "product_value", "shoot_by", "post_by", "contact", "contacts", "notes", "source", "dispatched_on", "received_on", "live_on", "paid_on", "script", "non_negotiables", "instagram", "deliverables", "draft_on", "draft_link", "trial_reels", "txn_id", "payment_notes", "pitch_stats", "collab_on", "reels", "show_kit", "kit_views", "return_product", "returned_on", "deal_type"];
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
    env.STATS.prepare("CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, enquiry_id INTEGER, at TEXT, text TEXT)"),
    // content ideas: quick notes of reel / video ideas, for any of your accounts
    env.STATS.prepare("CREATE TABLE IF NOT EXISTS ideas (id INTEGER PRIMARY KEY AUTOINCREMENT, created TEXT, updated TEXT, text TEXT, account TEXT, status TEXT, link TEXT, notes TEXT, type TEXT)")
  ]);
  try { if (!((((await env.STATS.prepare("PRAGMA table_info(ideas)").all()).results) || []).some(c => c.name === "type"))) await env.STATS.prepare("ALTER TABLE ideas ADD COLUMN type TEXT").run(); } catch {}
  // columns added later — only the missing ones are added (one quick look instead of ~25 tries every cold start)
  const have = new Set((((await env.STATS.prepare("PRAGMA table_info(enquiries)").all()).results) || []).map(c => c.name));
  for (const col of ["payment_due TEXT", "contacts TEXT", "source TEXT", "dispatched_on TEXT", "received_on TEXT", "live_on TEXT", "paid_on TEXT", "script TEXT", "non_negotiables TEXT", "instagram TEXT", "deliverables TEXT", "draft_on TEXT", "draft_link TEXT", "trial_reels TEXT", "txn_id TEXT", "payment_notes TEXT", "pitched TEXT", "pitch_stats TEXT", "collab_on TEXT", "reels TEXT", "show_kit TEXT", "kit_views TEXT", "return_product TEXT", "returned_on TEXT", "deal_type TEXT"]) { if (!have.has(col.split(" ")[0])) try { await env.STATS.prepare(`ALTER TABLE enquiries ADD COLUMN ${col}`).run(); } catch {} }
  // there's no "replied" status any more: those go back to New, and their "Status → replied" log lines are dropped
  // there's no "Product received" status: those deals are Ongoing
  try { await env.STATS.batch([env.STATS.prepare("UPDATE enquiries SET status = 'live' WHERE status = 'received'"),
    env.STATS.prepare("UPDATE enquiries SET status = 'new' WHERE status = 'replied'"),
    env.STATS.prepare("UPDATE enquiries SET deal_type = 'ugc' WHERE (deal_type IS NULL OR deal_type = '') AND package LIKE 'UGC%'"),   // deal type: UGC deals from their package name
    env.STATS.prepare("DELETE FROM events WHERE text = 'Status → replied'")]); } catch {}
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
  const k = await kitFile(env, h);
  const p = [...(k.packages || []), ...(k.privatePackages || []), ...((k.ugc || {}).packages || [])].find(x => x.name === name);
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
  const via = b.via === "ugc" ? "Sent from the UGC packages link (/ugc) — they saw your UGC rates" : b.via === "collab" ? "Sent from the collab packages link (/collab) — they saw your rates" : b.via === "mediakit" ? "Sent from the media kit link (/mediakit) — no rates shown" : "";
  const r = await env.STATS.prepare(`INSERT INTO enquiries (created, updated, status, brand, email, package, product_link, message, price, payment, product_ids, source, notes, deal_type)
    VALUES (?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, '[]', 'brand', ?, ?)`).bind(t, t, brand, email, clip(b.package, 120), clip(b.link, 500), clip(b.message, 2000), d.price, d.payment, via, b.via === "ugc" ? "ugc" : "collab").run();
  const id = r.meta && r.meta.last_row_id;
  if (id) await logEvent(env, id, "Enquiry received");
  await h.notify(env, `📩 <b>New enquiry</b> — ${h.esc(brand)}${b.package ? "\n" + h.esc(clip(b.package, 120)) : ""}\nOpen the dashboard: ${h.esc((env.SITE_URL || "https://shubhkaprateek.com") + "/admin")}`).catch(() => {});   // a ping on your phone
  return json(env, { ok: true });
}

// ---------------------------------------------------------------- brand page numbers (bot/brands.json)

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

// data/portfolio.json (packages for the deal forms) — read from GitHub at most every 10 minutes
async function kitFile(env, h) {
  try { const c = env.DRAFTS && await env.DRAFTS.get("file:portfolio"); if (c) return JSON.parse(c); } catch {}
  let k = {}; try { k = await h.readJson(env, "data/portfolio.json"); if (env.DRAFTS) await env.DRAFTS.put("file:portfolio", JSON.stringify(k), { expirationTtl: 600 }); } catch {}
  return k;
}

async function load(env, h) {
  await store.ensure(env, h);
  const [products, reels, categories, featured, brands] = await Promise.all([store.readProducts(env), store.readReels(env), store.readCategories(env), store.getFeatured(env), store.readBrands(env)]);
  const enquiries = (await env.STATS.prepare("SELECT * FROM enquiries ORDER BY id DESC").all()).results || [];
  const events = (await env.STATS.prepare("SELECT * FROM events ORDER BY id DESC LIMIT 2000").all()).results || [];
  const ideas = await readIdeas(env);
  enquiries.forEach(e => { try { e.product_ids = JSON.parse(e.product_ids || "[]"); } catch { e.product_ids = []; } });
  const kit = await kitFile(env, h);
  const packages = [...[...(kit.packages || []), ...(kit.privatePackages || []).map(p => ({ ...p, private: true }))].map(p => ({ name: p.name, price: p.price || "", payment: "Paid", items: p.items || [], private: !!p.private })), ...((kit.ugc || {}).packages || []).map(p => ({ name: p.name, price: p.price || "", payment: "Paid", items: p.items || [], ugc: true })), ...(kit.barter && kit.barter.title ? [{ name: kit.barter.title, price: "", payment: "Barter" }] : [])];
  // one-time: the 3 Samvardhan Mart collabs (not the link swap) send their products back
  if (!(await store.getSetting(env, "fix:samvardhan-return", null))) {
    await env.STATS.prepare("UPDATE enquiries SET return_product = '1' WHERE lower(brand) LIKE 'samvardhan%' AND COALESCE(package, '') <> 'After-live pitch' AND COALESCE(reel_code, '') <> 'DfJSWTLSvaV' AND status <> 'declined'").run();
    await store.setSetting(env, "fix:samvardhan-return", new Date().toISOString());
    for (const e of enquiries) if (/^samvardhan/i.test(e.brand || "") && (e.package || "") !== "After-live pitch" && (e.reel_code || "") !== "DfJSWTLSvaV" && e.status !== "declined") e.return_product = "1";
  }
  await syncKit(env, h, reels, enquiries);
  return { products, reels, categories, featured, brands, enquiries, events, packages, ideas };
}
const readIdeas = async env => (await env.STATS.prepare("SELECT * FROM ideas ORDER BY id DESC").all()).results || [];

// ---------------------------------------------------------------- the media kit's brand lists, from your deals
// The media kit's brandCollabs (the reels carousel) + brands ("Brands we've worked with") come from your deals:
// every Live or Delivered deal with a reel on the website, unless you untick "Show on media kit".
// Worked out whenever the dashboard loads or saves; the media kit reads them live at GET /kit.
async function syncKit(env, h, reels, enquiries) {
  if (!Array.isArray(reels)) return;
  const codeOf = r => ((r.reel || "").match(h.REEL_RE) || [])[1] || "";
  const order = new Map(reels.map(r => [codeOf(r).toLowerCase(), { id: +r.id || 0, code: codeOf(r), cover: r.cover || "" }]));
  const shown = enquiries.filter(e => ["live", "delivered"].includes(e.status) && e.show_kit !== "0");
  const collabs = [], seen = new Set();
  for (const e of shown) {
    let more = []; try { more = JSON.parse(e.reels || "[]"); } catch {}
    [e.reel_code, ...(Array.isArray(more) ? more : [])].filter(Boolean).forEach((c, i) => {
      const r = order.get(String(c).toLowerCase()); if (!r || seen.has(r.code)) return;   // only reels that are on the website (they have a cover)
      seen.add(r.code); collabs.push({ id: r.id, brand: String(e.brand || "").trim(), code: r.code, cover: r.cover || "", views: i === 0 ? String(e.kit_views || "").trim() : "" });
    });
  }
  collabs.sort((a, b) => b.id - a.id);
  const brandCollabs = collabs.map(({ brand, code, cover, views }) => ({ brand, code, views, ...(cover ? { cover } : {}) }));
  const ig = v => !v ? "" : /^https?:/.test(v) ? v : "https://www.instagram.com/" + String(v).replace(/^@/, "") + "/";
  const brandsSeen = new Map();
  for (const c of collabs) if (!brandsSeen.has(c.brand.toLowerCase())) {
    const e = shown.find(x => String(x.brand || "").trim().toLowerCase() === c.brand.toLowerCase() && x.instagram);
    brandsSeen.set(c.brand.toLowerCase(), { name: c.brand, link: e ? ig(e.instagram) : "" });
  }
  const brandsList = [...brandsSeen.values()];
  const next = { brandCollabs, brands: brandsList };
  if (JSON.stringify(await store.getSetting(env, "kit", null)) !== JSON.stringify(next)) await store.setSetting(env, "kit", next);   // the media kit reads it at GET /kit
}

async function run(a, env, h) {
  const op = String(a.op || "");
  await store.ensure(env, h);
  const S = () => Promise.all([store.readProducts(env), store.readReels(env)]).then(([products, reels]) => ({ products, reels }));
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
    // the product arrived (📬 button or the date filled in) → the deal is Ongoing
    if (!status && p.received_on && !e.received_on && ["new", "hold", "confirmed", "product"].includes(e.status)) status = "live";
    // a pitched reel is already up: confirming the collab makes it Live straight away, and puts the brand on the reel's products
    if (status === "confirmed" && e.pitched === "1" && e.reel_code) {
      status = "live";
      await logEvent(env, e.id, "Collab confirmed — the reel was already live");
      const ids = (() => { try { return JSON.parse(e.product_ids || "[]").map(Number); } catch { return []; } })();
      if (ids.length) {
        const { products } = await S();
        let changed = false;
        for (const pr of products) if (ids.includes(+pr.id) && !String(pr.brand || "").trim()) { pr.brand = e.brand; changed = true; }
        if (changed) await store.writeProducts(env, products);
        else await store.brandId(env, e.brand);                            // gives the brand its page number if it's new
      }
    }
    if (status && STATUSES.includes(status) && status !== e.status) { sets.push("status = ?"); vals.push(status); await logEvent(env, e.id, `Status → ${status}`); }
    if (sets.length) await env.STATS.prepare(`UPDATE enquiries SET ${sets.join(", ")}, updated = ? WHERE id = ?`).bind(...vals, now(), e.id).run();
    return load(env, h);
  }
  // ---- your own notes in a deal's history ("Shared product links with the brand"), at the time you pick
  if (op === "enquiry.note") {
    const text = clip(a.text, 300).trim(); if (!text) throw new Error("Write what happened first");
    const e = await getEnquiry(env, a.id); if (!e) throw new Error("That enquiry is gone");
    const at = !isNaN(Date.parse(a.at)) ? new Date(a.at).toISOString() : now();
    await env.STATS.batch([env.STATS.prepare("INSERT INTO events (enquiry_id, at, text) VALUES (?, ?, ?)").bind(e.id, at, "✍️ " + text),
      env.STATS.prepare("UPDATE enquiries SET updated = ? WHERE id = ?").bind(now(), e.id)]);
    return load(env, h);
  }
  if (op === "enquiry.noteDelete") {
    await env.STATS.prepare("DELETE FROM events WHERE id = ? AND text LIKE '✍️ %'").bind(+a.eventId).run();
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
    const cats = h.flattenCats(await store.readCategories(env));
    return { name: p.needsName ? "" : p.name, image: p.variants[0].image || "", category: h.guessCategories(p.name + " " + (p.pageTitle || ""), cats), brand: h.guessBrand(p.variants[0].link) };
  }

  // ---- products
  if (op === "product.save") {
    const { products } = await S();
    const x = a.product || {};
    if (!clip(x.name, 200).trim()) throw new Error("Add the product's name");
    let p = x.id != null ? products.find(q => q.id === +x.id) : null;
    const isNew = !p;
    if (isNew) { p = { id: Math.max(0, ...products.map(q => +q.id || 0)) + 1 }; products.push(p); }
    let image = clip(x.image, 1000);
    const oldImage = ((p.variants || [])[0] || {}).image || "";
    if (a.photo) image = await store.putImage(env, `p${p.id}-${h.slug(x.name)}-${Date.now().toString(36)}.jpg`, a.photo);   // uploaded from the phone (base64 jpg)
    const variants = (p.variants && p.variants.length ? p.variants : [{ name: "Default" }]).map((v, i) => i ? v : { ...v, link: clip(x.link, 1000), image });
    Object.assign(p, { name: clip(x.name, 200).trim(), brand: clip(x.brand, 120).trim(), category: [].concat(x.category || []).map(c => clip(c, 60)), variants });
    await store.writeProducts(env, products);
    if (oldImage && oldImage !== image) await store.deleteImageUrls(env, [oldImage]);
    if (a.enquiryId) {                                                 // part of a collab → link it + move the status on
      const e = await getEnquiry(env, a.enquiryId);
      if (e) {
        const ids = [...new Set([...(JSON.parse(e.product_ids || "[]")), p.id])];
        const status = ["new", "hold", "confirmed"].includes(e.status) ? "product" : e.status;
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
    await store.writeReels(env, outp.reels);
    await store.writeProducts(env, outp.products);
    await store.deleteImageUrls(env, [...plan.reels.map(r => r.cover), ...plan.products.flatMap(p => (p.variants || []).map(v => v.image))]);
    return load(env, h);
  }

  // ---- reels: paste the link + pick its products → live
  if (op === "reel.save") {
    const code = (String(a.link || a.code || "").match(h.REEL_RE) || [])[1] || (/^[\w-]{5,}$/.test(a.code || "") ? a.code : "");
    if (!code) throw new Error("That doesn't look like an Instagram reel link");
    const { reels } = await S(); let gotCover = true;
    const ids = [...new Set([].concat(a.products || []).map(Number).filter(Boolean))];
    if (!ids.length) throw new Error("Pick at least one product for this reel");
    let r = reels.find(x => codeOf(x).toLowerCase() === code.toLowerCase());
    const isNew = !r;
    if (isNew) {
      const info = await h.enrichReel(code);
      r = { id: Math.max(0, ...reels.map(x => +x.id || 0)) + 1, reel: `https://www.instagram.com/reel/${code}/`, title: clip(a.title, 200) || info.title || "New reel", products: ids };
      reels.push(r);
      gotCover = false;
      if (info.cover) try { r.cover = await store.putImage(env, `cover-${code}.jpg`, await h.fetchBytes(info.cover)); gotCover = true; } catch {}
    } else {
      r.products = ids;
      if (a.title) r.title = clip(a.title, 200);
    }
    await store.writeReels(env, reels);
    if (a.enquiryId) {
      // live date: the one picked in the form, else keep the saved one, else today. A closed (delivered) deal stays closed.
      const liveOn = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(a.liveOn || "") ? a.liveOn : null;   // date, or date + time
      await env.STATS.prepare("UPDATE enquiries SET reel_code = ?, status = CASE WHEN status = 'delivered' THEN status ELSE 'live' END, live_on = COALESCE(?, live_on, date('now')), updated = ? WHERE id = ?").bind(code, liveOn, now(), a.enquiryId).run();
      await logEvent(env, a.enquiryId, `Reel live: ${code}`);
    }
    return { ...(await load(env, h)), cover: gotCover };
  }

  // ---- featured (max 2)
  if (op === "featured") {
    await store.setFeatured(env, a.ids);
    return load(env, h);
  }
  // ---- categories: add / rename / change keywords / delete (a deleted one is also taken off its products)
  if (op === "categories.save") {
    const clean = (c, top) => {
      const name = clip(c.name, 60).trim(); if (!name) throw new Error("Every category needs a name");
      const id = slugOf(c.id || name); if (!id) throw new Error(`"${name}" needs a name with letters or numbers`);
      const keywords = [...new Set([].concat(c.keywords || []).map(k => clip(k, 40).trim().toLowerCase()).filter(Boolean))];
      const out = { id, name };
      if (top && c.emoji) out.emoji = clip(c.emoji, 8).trim();
      if (top && c.theme) out.theme = true;
      out.keywords = keywords;
      if (top && Array.isArray(c.sub) && c.sub.length) out.sub = c.sub.map(x => clean(x, false));
      return out;
    };
    const tree = [].concat(a.categories || []).map(c => clean(c, true));
    const ids = tree.flatMap(c => [c.id, ...(c.sub || []).map(x => x.id)]);
    const dup = ids.find((x, i) => ids.indexOf(x) !== i); if (dup) throw new Error(`Two categories have the same name: ${dup}`);
    if (!tree.length) throw new Error("Keep at least one category");
    const keep = new Set(ids);
    const { products } = await S(); let changed = 0;
    for (const p of products) { const before = (p.category || []).length; p.category = (p.category || []).filter(id => keep.has(id)); if (p.category.length !== before) changed++; }
    await store.writeCategories(env, tree);
    if (changed) await store.writeProducts(env, products);
    return load(env, h);
  }
  // ---- brands: rename / Instagram + website (page numbers never change)
  // ---- content ideas (saved instantly; only the ideas list comes back)
  if (op === "idea.save") {
    await tables(env);
    const i = a.idea || {}, t = now();
    const v = { text: clip(i.text, 2000).trim(), account: clip(i.account, 40), status: ["idea", "planned", "shot", "posted", "dropped"].includes(i.status) ? i.status : "idea", link: clip(i.link, 500).trim(), notes: clip(i.notes, 4000), type: ["gadget", "emotion", "us"].includes(i.type) ? i.type : "" };
    if (!v.text) throw new Error("Write the idea first");
    if (i.id) await env.STATS.prepare("UPDATE ideas SET updated = ?, text = ?, account = ?, status = ?, link = ?, notes = ?, type = ? WHERE id = ?").bind(t, v.text, v.account, v.status, v.link, v.notes, v.type, +i.id).run();
    else await env.STATS.prepare("INSERT INTO ideas (created, updated, text, account, status, link, notes, type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(t, t, v.text, v.account, v.status, v.link, v.notes, v.type).run();
    return { ideas: await readIdeas(env) };
  }
  if (op === "idea.delete") { await tables(env); await env.STATS.prepare("DELETE FROM ideas WHERE id = ?").bind(+a.id).run(); return { ideas: await readIdeas(env) }; }
  if (op === "brand.save") { await store.saveBrand(env, String(a.slug || ""), a.brand || {}); return load(env, h); }
  throw new Error("Unknown action: " + op);
}

