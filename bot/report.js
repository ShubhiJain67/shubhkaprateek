// 🏷 Brand pages: shubhkaprateek.com/brand/<5-digit number>
//
// A page you send a brand. It shows only THEIR products (every product has a "brand" in data/products.json):
// the products live on our site (photo, categories, buy link), the reels they're in, and live click numbers from our
// own free counter (below): /go/ link clicks (+ where they came from: ?from=autodm …), Buy clicks on the product page
// vs elsewhere, and product/reel page views.
//
// Each brand's number is fixed in bot/brands.json (not on the public site). `make ship` gives new brands a number
// automatically and prints their link (tools/build.mjs). Nothing to do in Telegram.

import BRANDS from "./brands.json";

const UMAMI = "https://api.umami.is/v1";

// ---------------------------------------------------------------- our own free click counter
// The website sends a tiny "hit" for every buy click, /go/ link click and product/reel page view. They're counted per
// day in a free Cloudflare D1 database (binding STATS in wrangler.toml). Brand pages read their numbers from here.
const IST = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);      // today, India time
let tableReady = false;
async function statsTable(env) {
  if (tableReady) return;
  await env.STATS.prepare("CREATE TABLE IF NOT EXISTS hits (day TEXT, kind TEXT, item TEXT, src TEXT, n INTEGER, PRIMARY KEY (day, kind, item, src))").run();
  tableReady = true;
}
export async function hitHttp(req, env, url) {
  if (url.pathname !== "/hit") return null;
  const cors = { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" };
  if (req.method !== "POST" || !env.STATS) return new Response(null, { status: 204, headers: cors });
  try {
    const h = JSON.parse((await req.text()).slice(0, 500));
    const kind = ["buy", "buy_page", "go", "view"].includes(h.k) ? h.k : "";   // buy = Buy clicked on home/reel pages, buy_page = on the product's own page
    const item = /^(p:\d{1,6}|r:[A-Za-z0-9_-]{5,20})$/.test(h.i || "") ? h.i : "";
    const src = String(h.f || "").toLowerCase().replace(/[^a-z0-9 _.-]/g, "").trim().slice(0, 40) || "direct";
    if (kind && item) {
      await statsTable(env);
      await env.STATS.prepare("INSERT INTO hits (day, kind, item, src, n) VALUES (?, ?, ?, ?, 1) ON CONFLICT (day, kind, item, src) DO UPDATE SET n = n + 1")
        .bind(IST(), kind, item, src).run();
    }
  } catch (e) { console.error(e); }
  return new Response(null, { status: 204, headers: cors });
}
async function statsFor(env, items, days) {
  await statsTable(env);
  const since = new Date(Date.now() + 5.5 * 3600e3 - (days - 1) * 864e5).toISOString().slice(0, 10);
  const marks = items.map(() => "?").join(",");
  const rows = items.length ? (await env.STATS.prepare(`SELECT kind, item, src, SUM(n) AS n FROM hits WHERE day >= ? AND item IN (${marks}) GROUP BY kind, item, src`)
    .bind(since, ...items).all()).results || [] : [];
  const first = (await env.STATS.prepare("SELECT MIN(day) AS d FROM hits").first()) || {};
  return { rows, since: first.d || "" };
}
export const slugOf = s => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
const flat = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const REEL_CODE = /instagram\.com\/(?:[\w.]+\/)?(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/;

// the brand's products: "brand" in products.json; products with no brand set fall back to the shop's website
// (e.g. "blix" → a buy link on blix.in)
export function productsForBrand(slug, products) {
  const want = flat(slug);
  return products.filter(p => p.brand ? slugOf(p.brand) === slug : (p.variants || []).some(v => {
    try { return want.length >= 3 && flat(new URL(v.link).hostname.replace(/^www\./, "").split(".")[0]) === want; } catch { return false; }
  }));
}
export const brandName = (slug, products) => (products.find(p => p.brand && slugOf(p.brand) === slug) || {}).brand || slug;

const n = v => +v || 0;
const pairs = arr => (Array.isArray(arr) ? arr : (arr && arr.data) || []).map(r => [String(r.x ?? r.value ?? r.name ?? ""), n(r.y ?? r.total ?? r.count)]);

async function umami(env, websiteId, path, params) {
  const r = await fetch(`${UMAMI}/websites/${websiteId}${path}?${new URLSearchParams(params)}`, {
    headers: { Authorization: `Bearer ${env.UMAMI_API_KEY}`, Accept: "application/json" }
  });
  if (!r.ok) throw new Error(`Umami ${path} ${r.status}`);
  return r.json();
}

export async function buildReport(env, { readJson }, slug, days) {
  const [products, reels, site, categories] = await Promise.all(["products", "reels", "site", "categories"].map(f => readJson(env, `data/${f}.json`)));
  const catName = {};
  for (const c of categories || []) { catName[c.id] = c.name; for (const s of c.sub || []) catName[s.id] = s.name; }
  const mine = productsForBrand(slug, products), ids = new Set(mine.map(p => p.id));
  const myReels = reels.filter(r => (r.products || []).some(id => ids.has(id)))
    .map(r => ({ code: (String(r.reel).match(REEL_CODE) || [])[1] || "", title: r.title || "", products: (r.products || []).filter(id => ids.has(id)) })).filter(r => r.code);
  const siteUrl = env.SITE_URL || "https://shubhkaprateek.com";
  const out = {
    brand: brandName(slug, products), days,
    products: mine.map(p => {
      const v = (p.variants || [])[0] || {};
      return { id: p.id, name: p.name, image: (p.variants || []).map(v => v.image).find(Boolean) || "", link: v.link || "",
        page: `${siteUrl}/product/${p.id}`, categories: [].concat(p.category || []).map(c => catName[c] || c),
        reels: myReels.filter(r => r.products.includes(p.id)).length, buy: 0, buyPage: 0, go: 0, views: 0, from: {} };
    }),
    reels: myReels.map(({ products, ...r }) => ({ ...r, views: 0 })), note: ""
  };
  if (env.STATS) {                                               // our own counter (free) — used whenever it's set up
    const { rows, since } = await statsFor(env, [...out.products.map(p => "p:" + p.id), ...out.reels.map(r => "r:" + r.code)], days);
    const byItem = it => out.products.find(p => "p:" + p.id === it);
    for (const r of rows) {
      const n = +r.n || 0, p = byItem(r.item);
      if (p && r.kind === "buy") p.buy += n;
      else if (p && r.kind === "buy_page") p.buyPage += n;
      else if (p && r.kind === "go") { p.go += n; p.from[r.src] = (p.from[r.src] || 0) + n; }
      else if (p && r.kind === "view") p.views += n;
      else if (r.kind === "view") { const rl = out.reels.find(x => "r:" + x.code === r.item); if (rl) rl.views += n; }
    }
    if (since) out.since = since;
    return out;
  }
  const wid = ((site || {}).site || {}).umamiWebsiteId;
  if (!env.UMAMI_API_KEY || !wid) { out.note = "Live numbers aren't connected yet."; return out; }
  const endAt = Date.now(), startAt = endAt - days * 864e5, range = { startAt, endAt };
  const get = (path, params) => umami(env, wid, path, { ...range, ...params }).then(pairs).catch(e => { out.note = "Some numbers couldn't be loaded right now."; console.error(e); return []; });
  const [events, buys, paths] = await Promise.all([
    get("/metrics", { type: "event", limit: 1000 }),
    get("/event-data/values", { event: "buy", propertyName: "product" }),
    get("/metrics", { type: "path", limit: 1000 })
  ]);
  const ev = new Map(events), by = new Map(buys), pv = new Map();
  for (const [path, c] of paths) { const k = path.replace(/\.html$/, "").replace(/\/$/, ""); pv.set(k, (pv.get(k) || 0) + c); }
  for (const p of out.products) {
    const goName = ("go: " + p.name).slice(0, 50);
    p.buy = by.get(p.name) || 0;
    p.go = ev.get(goName) || 0;
    p.views = pv.get("/product/" + p.id) || 0;
    if (p.go) for (const [from, c] of await get("/event-data/values", { event: goName, propertyName: "from" })) p.from[from || "direct"] = c;
  }
  for (const r of out.reels) r.views = pv.get("/reel/" + r.code) || 0;
  return out;
}

// GET <worker>/brand/api?brand=blix&k=…&days=30   (called by shubhkaprateek.com/brand/blix)
export async function reportHttp(req, env, url, helpers) {
  if (url.pathname !== "/brand/api" && url.pathname !== "/report/api") return null;
  const cors = { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store", "Content-Type": "application/json", "X-Robots-Tag": "noindex" };
  if (req.method === "OPTIONS") return new Response(null, { headers: { ...cors, "Access-Control-Allow-Methods": "GET" } });
  const asked = String(url.searchParams.get("brand") || "");
  const days = [7, 30, 90, 365].includes(+url.searchParams.get("days")) ? +url.searchParams.get("days") : 30;
  const slug = (Object.entries(BRANDS.brands || {}).find(([, b]) => b.id === asked) || [""])[0];   // /brand/19327 → "blix"
  if (!slug) return new Response('{"error":"not found"}', { status: 404, headers: cors });
  const cacheKey = `reportcache:${slug}:${days}`;
  // ?fresh=1 skips the 5-minute cache — handy while testing
  const hit = url.searchParams.get("fresh") ? null : await env.DRAFTS.get(cacheKey);
  if (hit) return new Response(hit, { headers: cors });
  try {
    const body = JSON.stringify({ ...(await buildReport(env, helpers, slug, days)), updated: new Date().toISOString() });
    await env.DRAFTS.put(cacheKey, body, { expirationTtl: 300 });           // numbers refresh every 5 minutes
    return new Response(body, { headers: cors });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: "Couldn't build the page right now" }), { status: 500, headers: cors });
  }
}
