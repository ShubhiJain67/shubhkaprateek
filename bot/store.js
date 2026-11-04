// The database behind the website: products, brands, reels, categories, featured — plus uploaded photos + reel covers.
// The dashboard writes here (no GitHub commit, no deployment). The website reads it live through GET /data
// (a cached copy in KV, rebuilt after every change), and falls back to the copy baked in by `make ship` if the bot is down.
//
// Everything comes back in the SAME shape the old data/*.json files had, so the website, brand pages and dashboard
// didn't have to change how they read it:
//   products   [{ id, name, brand, category: [...], variants: [{ name, link, image }] }]
//   reels      [{ id, reel, title, products: [ids], cover? }]
//   categories [{ id, name, emoji, theme?, keywords, sub: [{ id, name, keywords }] }]
//   brands     { slug: { name, id: "<5-digit page number>", link, instagram?, website? } }
// The first time it runs it imports the current data/*.json + bot/brands.json from GitHub (once).

const slugOf = s => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
const now = () => new Date().toISOString();
const J = (v, d) => { try { const x = JSON.parse(v ?? ""); return x ?? d; } catch { return d; } };
const SNAP = "snap:v1";
// a value written straight into SQL (only used by the one-time import, so it can insert everything in 1 query per table)
const lit = v => v == null ? "NULL" : typeof v === "number" ? String(v) : "'" + String(v).replace(/'/g, "''") + "'";
const many = (head, rows) => rows.length ? head + " VALUES " + rows.map(r => "(" + r.map(lit).join(", ") + ")").join(", ") : "SELECT 1";                // KV key of the website's cached copy
export const BOT_URL = env => (env.BOT_URL || "https://shubhkaprateek-bot.shubhkaprateek.workers.dev").replace(/\/$/, "");

let ready = false;
export async function ensure(env, h) {
  if (ready) return;
  const db = env.STATS;
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS brands (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE, name TEXT, number TEXT UNIQUE, instagram TEXT, website TEXT, created TEXT)"),
    db.prepare("CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY, name TEXT, brand_id INTEGER, category TEXT, variants TEXT, extra TEXT, created TEXT, updated TEXT)"),
    db.prepare("CREATE TABLE IF NOT EXISTS reels (id INTEGER PRIMARY KEY, code TEXT UNIQUE, reel TEXT, title TEXT, products TEXT, cover TEXT, extra TEXT, created TEXT, updated TEXT)"),
    db.prepare("CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, parent TEXT, pos INTEGER, name TEXT, emoji TEXT, theme INTEGER, keywords TEXT)"),
    db.prepare("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)"),
    db.prepare("CREATE TABLE IF NOT EXISTS images (key TEXT PRIMARY KEY, type TEXT, data TEXT, created TEXT)"),
  ]);
  const done = await db.prepare("SELECT value FROM settings WHERE key = 'imported'").first();
  if (!done) await importFromFiles(env, h);
  // one-time tidy-ups of brand names (runs once, the first time after this is deployed)
  if (!(await db.prepare("SELECT 1 FROM settings WHERE key = 'fix:brands:1'").first())) {
    if (await db.prepare("SELECT 1 FROM brands WHERE slug = 'samvardhan'").first()) await mergeBrand(env, "samvardhan", "", "Samvardhan Mart");   // the products said "Samvardhan", the deals "Samvardhan Mart"
    await db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('fix:brands:1', ?)").bind(JSON.stringify(now())).run();
  }
  ready = true;
}

// ---- one-time import of the old files (data/*.json + bot/brands.json on GitHub)
async function importFromFiles(env, h) {
  const db = env.STATS;
  const read = async f => { try { return await h.readJson(env, f); } catch { return null; } };
  const [products, reels, categories, site, brandsFile] = await Promise.all(["data/products.json", "data/reels.json", "data/categories.json", "data/site.json", "bot/brands.json"].map(read));
  if (!products || !reels || !categories) throw new Error("Couldn't read data/*.json from GitHub to move it into the database — try again in a minute");
  const t = now(), B = (brandsFile && brandsFile.brands) || {};
  // brands: the fixed page numbers from bot/brands.json, plus any product brand that didn't have one yet
  const brands = new Map(Object.entries(B).map(([slug, b]) => [slug, { name: b.name, number: String(b.id) }]));
  const used = new Set([...brands.values()].map(b => b.number));
  for (const p of products) { const sl = slugOf(p.brand); if (!sl || brands.has(sl)) continue;
    let num; do { num = String(10000 + Math.floor(Math.random() * 90000)); } while (used.has(num)); used.add(num); brands.set(sl, { name: String(p.brand).trim(), number: num }); }
  await db.prepare(many("INSERT OR IGNORE INTO brands (slug, name, number, created)", [...brands].map(([sl, b]) => [sl, b.name, b.number, t]))).run();
  const ids = new Map(((await db.prepare("SELECT id, slug FROM brands").all()).results || []).map(r => [r.slug, r.id]));
  await db.prepare(many("INSERT OR IGNORE INTO products (id, name, brand_id, category, variants, extra, created, updated)", products.map(p => {
    const { id, name, brand, category, variants, ...extra } = p;
    return [+id, String(name || "").trim(), ids.get(slugOf(brand)) ?? null, JSON.stringify(category || []), JSON.stringify(variants || []), JSON.stringify(extra), t, t]; }))).run();
  await db.prepare(many("INSERT OR IGNORE INTO reels (id, code, reel, title, products, cover, extra, created, updated)", reels.map(r => {
    const { id, reel, title, products: ps, cover, ...extra } = r;
    return [+id, codeOf(r) || null, reel, String(title || ""), JSON.stringify((ps || []).map(Number)), cover || "", JSON.stringify(extra), t, t]; }))).run();
  let pos = 0; const cats = [];
  for (const c of categories) { cats.push([c.id, null, pos++, c.name, c.emoji || "", c.theme ? 1 : 0, JSON.stringify(c.keywords || [])]);
    for (const x of c.sub || []) cats.push([x.id, c.id, pos++, x.name, "", 0, JSON.stringify(x.keywords || [])]); }
  await db.prepare(many("INSERT OR IGNORE INTO categories (id, parent, pos, name, emoji, theme, keywords)", cats)).run();
  await db.batch([
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('featured', ?)").bind(JSON.stringify((((site && site.site) || {}).featured || []).map(Number).slice(0, 2))),
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('imported', ?)").bind(JSON.stringify(t)),
  ]);
  await invalidate(env);
}

// ---- brands
export async function readBrands(env) {
  const rows = (await env.STATS.prepare("SELECT * FROM brands ORDER BY slug").all()).results || [];
  const site = env.SITE_URL || "https://shubhkaprateek.com";
  return Object.fromEntries(rows.map(b => [b.slug, { name: b.name, id: b.number, link: `${site}/brand/${b.number}`, instagram: b.instagram || "", website: b.website || "", dbId: b.id }]));
}
// the brand's row for a name, created (with its fixed 5-digit page number) if it's new
export async function brandId(env, name) {
  const n = String(name || "").trim(), slug = slugOf(n); if (!slug) return null;
  const db = env.STATS;
  const got = await db.prepare("SELECT id FROM brands WHERE slug = ?").bind(slug).first();
  if (got) return got.id;
  const used = new Set(((await db.prepare("SELECT number FROM brands").all()).results || []).map(r => r.number));
  let num; do { num = String(10000 + Math.floor(Math.random() * 90000)); } while (used.has(num));
  const r = await db.prepare("INSERT INTO brands (slug, name, number, created) VALUES (?, ?, ?, ?)").bind(slug, n, num, now()).run();
  return r.meta.last_row_id;
}
// rename a brand / its Instagram + website (the page number never changes)
export async function saveBrand(env, slug, { name, instagram, website }) {
  const db = env.STATS; let b = await db.prepare("SELECT * FROM brands WHERE slug = ?").bind(slug).first();
  if (!b && name) { await brandId(env, name); b = await db.prepare("SELECT * FROM brands WHERE slug = ?").bind(slugOf(name)).first(); }
  if (!b) throw new Error("That brand is gone");
  const nn = String(name ?? b.name).trim() || b.name, ns = slugOf(nn);
  if (ns !== b.slug && await db.prepare("SELECT 1 FROM brands WHERE slug = ?").bind(ns).first()) return mergeBrand(env, b.slug, ns);   // renamed to a brand you already have → they become one
  await db.batch([
    db.prepare("UPDATE brands SET name = ?, slug = ?, instagram = ?, website = ? WHERE id = ?").bind(nn, ns, String(instagram ?? b.instagram ?? "").trim(), String(website ?? b.website ?? "").trim(), b.id),
    db.prepare("UPDATE enquiries SET brand = ? WHERE lower(trim(brand)) = lower(?)").bind(nn, b.name),
  ]);
  await invalidate(env);
}
// merge brand `from` into `into`: its products + deals move over, `from` (and its page number) is removed
export async function mergeBrand(env, from, into, intoName) {
  const db = env.STATS;
  if (!into && intoName) {
    into = slugOf(intoName);
    // the other name only had deals so far → just rename this brand to it, so its page number (and any link you've shared) stays
    if (!(await db.prepare("SELECT 1 FROM brands WHERE slug = ?").bind(into).first())) return saveBrand(env, from, { name: String(intoName).trim() });
  }
  const a = await db.prepare("SELECT * FROM brands WHERE slug = ?").bind(from).first(), b = await db.prepare("SELECT * FROM brands WHERE slug = ?").bind(into).first();
  if (!a || !b) throw new Error("Pick two brands that exist");
  if (a.id === b.id) throw new Error("That's the same brand");
  await db.batch([
    db.prepare("UPDATE products SET brand_id = ? WHERE brand_id = ?").bind(b.id, a.id),
    db.prepare("UPDATE enquiries SET brand = ? WHERE lower(trim(brand)) = lower(?)").bind(b.name, a.name),
    db.prepare("UPDATE brands SET instagram = COALESCE(NULLIF(instagram, ''), ?), website = COALESCE(NULLIF(website, ''), ?) WHERE id = ?").bind(a.instagram || "", a.website || "", b.id),
    db.prepare("DELETE FROM brands WHERE id = ?").bind(a.id),
  ]);
  await invalidate(env);
}

// ---- products
export async function readProducts(env) {
  const rows = (await env.STATS.prepare("SELECT p.*, b.name AS brand_name FROM products p LEFT JOIN brands b ON b.id = p.brand_id ORDER BY p.id").all()).results || [];
  return rows.map(r => ({ id: r.id, name: r.name, brand: r.brand_name || "", category: J(r.category, []), variants: J(r.variants, []), ...J(r.extra, {}) }));
}
// makes the products table match `list` (adds, changes, removes) — the same list the old products.json held
export async function writeProducts(env, list, { quiet } = {}) {
  const db = env.STATS, have = new Map(((await db.prepare("SELECT * FROM products").all()).results || []).map(r => [r.id, r]));
  const bids = new Map(((await db.prepare("SELECT id, slug FROM brands").all()).results || []).map(r => [r.slug, r.id]));
  const st = [], keep = new Set();
  for (const p of list) {
    const { id, name, brand, category, variants, ...extra } = p; keep.add(+id);
    const sl = slugOf(brand); let bid = sl ? bids.get(sl) : null;
    if (sl && bid == null) { bid = await brandId(env, brand); bids.set(sl, bid); }          // a new brand gets its page number here
    const row = [String(name || "").trim(), bid, JSON.stringify(category || []), JSON.stringify(variants || []), JSON.stringify(extra)];
    const old = have.get(+id);
    if (!old) st.push(db.prepare("INSERT INTO products (id, name, brand_id, category, variants, extra, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(+id, ...row, now(), now()));
    else if (JSON.stringify([old.name, old.brand_id, old.category, old.variants, old.extra]) !== JSON.stringify(row))
      st.push(db.prepare("UPDATE products SET name = ?, brand_id = ?, category = ?, variants = ?, extra = ?, updated = ? WHERE id = ?").bind(...row, now(), +id));
  }
  for (const id of have.keys()) if (!keep.has(id)) st.push(db.prepare("DELETE FROM products WHERE id = ?").bind(id));
  if (st.length) await db.batch(st);
  if (!quiet) await invalidate(env);
}

// ---- reels
const codeOf = r => ((String(r.reel || "")).match(/\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/) || [])[1] || "";
export async function readReels(env) {
  const rows = (await env.STATS.prepare("SELECT * FROM reels ORDER BY id").all()).results || [];
  return rows.map(r => ({ id: r.id, reel: r.reel, title: r.title, products: J(r.products, []), ...(r.cover ? { cover: r.cover } : {}), ...J(r.extra, {}) }));
}
export async function writeReels(env, list, { quiet } = {}) {
  const db = env.STATS, have = new Map(((await db.prepare("SELECT * FROM reels").all()).results || []).map(r => [r.id, r]));
  const st = [], keep = new Set();
  for (const r of list) {
    const { id, reel, title, products, cover, ...extra } = r; keep.add(+id);
    const row = [codeOf(r) || null, reel, String(title || ""), JSON.stringify((products || []).map(Number)), cover || "", JSON.stringify(extra)];
    const old = have.get(+id);
    if (!old) st.push(db.prepare("INSERT INTO reels (id, code, reel, title, products, cover, extra, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(+id, ...row, now(), now()));
    else if (JSON.stringify([old.code, old.reel, old.title, old.products, old.cover || "", old.extra]) !== JSON.stringify(row))
      st.push(db.prepare("UPDATE reels SET code = ?, reel = ?, title = ?, products = ?, cover = ?, extra = ?, updated = ? WHERE id = ?").bind(...row, now(), +id));
  }
  for (const id of have.keys()) if (!keep.has(id)) st.push(db.prepare("DELETE FROM reels WHERE id = ?").bind(id));
  if (st.length) await db.batch(st);
  if (!quiet) await invalidate(env);
}

// ---- categories (a tree: tabs → sub-categories)
export async function readCategories(env) {
  const rows = (await env.STATS.prepare("SELECT * FROM categories ORDER BY pos").all()).results || [];
  const top = rows.filter(r => !r.parent).map(r => {
    const c = { id: r.id, name: r.name };
    if (r.emoji) c.emoji = r.emoji;
    if (r.theme) c.theme = true;
    const kw = J(r.keywords, []); if (kw.length) c.keywords = kw;
    const sub = rows.filter(s => s.parent === r.id).map(s => ({ id: s.id, name: s.name, keywords: J(s.keywords, []) }));
    if (sub.length) c.sub = sub; else c.keywords = kw;
    return c;
  });
  return top;
}
export async function writeCategories(env, tree, { quiet } = {}) {
  const db = env.STATS, st = [db.prepare("DELETE FROM categories")]; let pos = 0;
  for (const c of tree) {
    st.push(db.prepare("INSERT INTO categories (id, parent, pos, name, emoji, theme, keywords) VALUES (?, NULL, ?, ?, ?, ?, ?)").bind(c.id, pos++, c.name, c.emoji || "", c.theme ? 1 : 0, JSON.stringify(c.keywords || [])));
    for (const s of c.sub || []) st.push(db.prepare("INSERT INTO categories (id, parent, pos, name, emoji, theme, keywords) VALUES (?, ?, ?, ?, '', 0, ?)").bind(s.id, c.id, pos++, s.name, JSON.stringify(s.keywords || [])));
  }
  await db.batch(st);
  if (!quiet) await invalidate(env);
}

// ---- settings: featured products (max 2) and the media kit's brand lists
export async function getSetting(env, key, d) { const r = await env.STATS.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first(); return r ? J(r.value, d) : d; }
export async function setSetting(env, key, value) { await env.STATS.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").bind(key, JSON.stringify(value)).run(); }
export const getFeatured = env => getSetting(env, "featured", []);
export async function setFeatured(env, ids, { quiet } = {}) { await setSetting(env, "featured", [].concat(ids || []).map(Number).filter(Boolean).slice(0, 2)); if (!quiet) await invalidate(env); }

// ---- photos + reel covers (stored in the database, served at <bot>/img/<key>)
export async function putImage(env, key, base64, type = "image/jpeg") {
  key = String(key).replace(/[^\w.-]+/g, "-").slice(0, 120);
  await env.STATS.prepare("INSERT OR REPLACE INTO images (key, type, data, created) VALUES (?, ?, ?, ?)").bind(key, type, String(base64).replace(/^data:[^,]+,/, ""), now()).run();
  return `${BOT_URL(env)}/img/${key}`;
}
export async function deleteImageUrls(env, urls) {
  const pre = BOT_URL(env) + "/img/", keys = [...new Set(urls.filter(u => String(u || "").startsWith(pre)).map(u => u.slice(pre.length)))];
  if (keys.length) await env.STATS.batch(keys.map(k => env.STATS.prepare("DELETE FROM images WHERE key = ?").bind(k)));
}
export async function imageHttp(env, key) {
  const r = await env.STATS.prepare("SELECT type, data FROM images WHERE key = ?").bind(key).first();
  if (!r) return new Response("not found", { status: 404, headers: { "Access-Control-Allow-Origin": "*" } });
  const bin = Uint8Array.from(atob(r.data), c => c.charCodeAt(0));
  return new Response(bin, { headers: { "Content-Type": r.type || "image/jpeg", "Cache-Control": "public, max-age=31536000, immutable", "Access-Control-Allow-Origin": "*" } });
}

// ---- what the website reads: GET /data → { site, categories, products, reels } (same as the old data/*.json)
export async function invalidate(env) { try { if (env.DRAFTS) await env.DRAFTS.delete(SNAP); } catch {} }
export async function snapshot(env, h) {
  await ensure(env, h);
  if (env.DRAFTS) { const c = await env.DRAFTS.get(SNAP); if (c) return c; }
  let site = await getSetting(env, "site:file", null);
  const fresh = await getSetting(env, "site:at", 0);
  if (!site || Date.now() - fresh > 10 * 60e3) {          // data/site.json (title, links, form…) is still a file — re-read it every 10 minutes
    try { site = await h.readJson(env, "data/site.json"); await setSetting(env, "site:file", site); await setSetting(env, "site:at", Date.now()); } catch { site = site || {}; }
  }
  const [categories, products, reels, featured] = await Promise.all([readCategories(env), readProducts(env), readReels(env), getFeatured(env)]);
  const body = JSON.stringify({ site: { ...site, site: { ...(site.site || {}), featured } }, categories, products, reels });
  if (env.DRAFTS) try { await env.DRAFTS.put(SNAP, body, { expirationTtl: 600 }); } catch {}
  return body;
}
