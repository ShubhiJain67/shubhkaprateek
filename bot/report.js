// 📊 Brand reports: shubhkaprateek.com/report/<brand>?k=<key>
//
// A page you can send a brand. It shows only THEIR products: buy-button clicks, tracked /go/ link clicks (and where
// those came from: ?from=autodm …), product + reel page views, and the reels they were in. Numbers come live from
// Umami through this worker, so the Umami API key stays secret (it's never in the website's code).
//
// Telegram:  /report blix            → products whose buy link is on the brand's store (blix.in) — automatic
//            /report Deciwood 49 50  → you pick the product ids (needed for Amazon products)
//            /reports                → every report link you've made
// Each brand's link has its own key, so one brand can't open another brand's report by changing the name.
//
// Setup (once): Umami → Settings → API keys → Create key, then in bot/:  npx wrangler secret put UMAMI_API_KEY

const UMAMI = "https://api.umami.is/v1";
const slugOf = s => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
const flat = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const REEL_CODE = /instagram\.com\/(?:[\w.]+\/)?(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/;

export async function reportKey(env, slug) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("report:" + slug + ":" + env.WEBHOOK_SECRET));
  return [...new Uint8Array(d)].slice(0, 8).map(b => b.toString(16).padStart(2, "0")).join("");
}

// products whose buy link is on the brand's own website, e.g. "blix" → blix.in, "eazy-arts" → eazyarts.in
export function productsForBrand(slug, products) {
  const want = flat(slug);
  return products.filter(p => (p.variants || []).some(v => {
    try { return want.length >= 3 && flat(new URL(v.link).hostname.replace(/^www\./, "").split(".")[0]) === want; } catch { return false; }
  }));
}

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
  const raw = await env.DRAFTS.get("report:" + slug);
  const saved = raw ? JSON.parse(raw) : null;
  const [products, reels, site] = await Promise.all(["products", "reels", "site"].map(f => readJson(env, `data/${f}.json`)));
  const mine = saved && saved.ids && saved.ids.length
    ? products.filter(p => saved.ids.includes(p.id)) : productsForBrand(slug, products);
  const ids = new Set(mine.map(p => p.id));
  const myReels = reels.filter(r => (r.products || []).some(id => ids.has(id)))
    .map(r => ({ code: (String(r.reel).match(REEL_CODE) || [])[1] || "", title: r.title || "" })).filter(r => r.code);
  const out = {
    brand: (saved && saved.name) || slug, days,
    products: mine.map(p => ({ id: p.id, name: p.name, image: (p.variants || []).map(v => v.image).find(Boolean) || "", buy: 0, go: 0, views: 0, from: {} })),
    reels: myReels.map(r => ({ ...r, views: 0 })), note: ""
  };
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

// GET <worker>/report/api?brand=blix&k=…&days=30  (called by shubhkaprateek.com/report/blix)
export async function reportHttp(req, env, url, helpers) {
  if (url.pathname !== "/report/api") return null;
  const cors = { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store", "Content-Type": "application/json", "X-Robots-Tag": "noindex" };
  if (req.method === "OPTIONS") return new Response(null, { headers: { ...cors, "Access-Control-Allow-Methods": "GET" } });
  const slug = slugOf(url.searchParams.get("brand"));
  const days = [7, 30, 90, 365].includes(+url.searchParams.get("days")) ? +url.searchParams.get("days") : 30;
  if (!slug || url.searchParams.get("k") !== await reportKey(env, slug)) return new Response('{"error":"not found"}', { status: 404, headers: cors });
  const cacheKey = `reportcache:${slug}:${days}`;
  const hit = await env.DRAFTS.get(cacheKey);
  if (hit) return new Response(hit, { headers: cors });
  try {
    const body = JSON.stringify({ ...(await buildReport(env, helpers, slug, days)), updated: new Date().toISOString() });
    await env.DRAFTS.put(cacheKey, body, { expirationTtl: 600 });           // numbers refresh every 10 minutes
    return new Response(body, { headers: cors });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: "Couldn't build the report right now" }), { status: 500, headers: cors });
  }
}

// /report <brand> [product ids…]   ·   /reports
export async function reportCommand(cmd, text, env, chat, { say, esc, readJson, ensureReportApi }) {
  if (cmd === "/reports") {
    const list = await env.DRAFTS.list({ prefix: "report:" });
    if (!list.keys.length) return say(env, chat, "No brand reports yet. Make one: <code>/report blix</code>"), true;
    const lines = [];
    for (const k of list.keys) { const slug = k.name.slice(7); lines.push(`• ${esc(slug)}: ${esc(await reportLink(env, slug))}`); }
    return say(env, chat, "📊 <b>Brand reports</b>\n" + lines.join("\n")), true;
  }
  if (cmd !== "/report") return false;
  const parts = text.replace(/^\/\S+\s*/, "").trim().split(/\s+/).filter(Boolean);
  const ids = parts.filter(x => /^\d+$/.test(x)).map(Number), name = parts.filter(x => !/^\d+$/.test(x)).join(" ");
  if (!name) return say(env, chat, "Send it like: <code>/report blix</code> (products on blix.in) or <code>/report Deciwood 49 50</code> (you pick the product ids)."), true;
  const slug = slugOf(name), products = await readJson(env, "data/products.json");
  const mine = ids.length ? products.filter(p => ids.includes(p.id)) : productsForBrand(slug, products);
  if (!mine.length) return say(env, chat, ids.length
    ? `None of those ids are on the site: ${esc(ids.join(", "))}`
    : `I couldn't find products on a “${esc(name)}” website. Add the product ids yourself, e.g. <code>/report ${esc(name)} 49 50</code>`), true;
  await env.DRAFTS.put("report:" + slug, JSON.stringify({ name, ids: ids.length ? mine.map(p => p.id) : [] }));
  await ensureReportApi(env);                                 // tells the website where to fetch the numbers (first time only)
  const notes = env.UMAMI_API_KEY ? "" : "\n\n⚠️ Live numbers aren't connected yet: Umami → Settings → API keys → Create key, then in bot/ run <code>npx wrangler secret put UMAMI_API_KEY</code>";
  return say(env, chat, `📊 <b>Report for ${esc(name)}</b> — ${mine.length} product${mine.length > 1 ? "s" : ""}:\n` +
    mine.map(p => `• <code>${p.id}</code> ${esc(p.name)}`).join("\n") +
    `\n\nSend them this link (it only works with the key at the end):\n${esc(await reportLink(env, slug))}${notes}`), true;
}

async function reportLink(env, slug) {
  return `${env.SITE_URL || "https://shubhkaprateek.com"}/report/${slug}?k=${await reportKey(env, slug)}`;
}
