// ShubhKaPrateek bot — the Cloudflare Worker behind the dashboard (shubhkaprateek.com/admin).
//
// It does the work the dashboard asks for: reads product pages (photo, name, store, categories), reads reel
// covers + titles, and saves changes to GitHub (data/*.json, assets/covers/, assets/products/) → GitHub Pages
// updates shubhkaprateek.com in ~1 minute. It also runs the brand pages (/brand/api), the click counter (/hit)
// and the media kit's enquiry form (/enquiry).
//
// It also sends you Telegram notifications (nothing else is done in Telegram): "🚀 Live on shubhkaprateek.com" after
// every deploy, and "📩 New enquiry" when a brand sends the media kit form.
//
// Runs on Cloudflare Workers (free). Secrets (never in this file): GITHUB_TOKEN, ADMIN_PASSCODE,
//   TELEGRAM_TOKEN + ALLOWED_CHAT_IDS (where notifications go), NOTIFY_KEY (lets GitHub ask for the "live" message)
// Settings in wrangler.toml [vars]: GITHUB_REPO, GITHUB_BRANCH, SITE_URL
// KV namespace DRAFTS = a short cache for the brand pages; D1 database STATS = clicks, enquiries, deals.

import { reportHttp, hitHttp } from "./report.js";
import { adminHttp } from "./admin.js";   // 🗂 the dashboard (shubhkaprateek.com/admin) + the media kit's enquiry form
import { DATA_FILES, dataJs } from "../tools/data.mjs"; // builds assets/js/data.js — same code `make ship` uses

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const hits = await hitHttp(req, env, url);                     // the website's click counter → brand pages
    if (hits) return hits;
    const report = await reportHttp(req, env, url, { readJson });
    if (report) return report;
    const admin = await adminHttp(req, env, url, { readJson, commitFiles, pretty, gh, enrichProduct, enrichReel, guessCategories, flattenCats,
      guessBrand, REEL_RE, fetchBytes, planDelete, applyDelete, esc, slug, notify });
    if (admin) return admin;
    if (url.pathname === "/deployed") return onDeployed(req, env);    // GitHub → "the site is live" message
    return new Response("ShubhKaPrateek bot is running.");
  }
};


// ---------------------------------------------------------------- 🔔 Telegram notifications (send only)
// A message to everyone in ALLOWED_CHAT_IDS. The bot doesn't read anything you send it any more.
async function notify(env, html) {
  if (!env.TELEGRAM_TOKEN) return;
  for (const chat of String(env.ALLOWED_CHAT_IDS || "").split(/[\s,]+/).filter(Boolean))
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text: html, parse_mode: "HTML", disable_web_page_preview: true }) }).catch(e => console.error(e));
}

// 🚀 "changes are live": .github/workflows/notify-live.yml calls this when GitHub Pages finishes publishing the site.
// The call carries the NOTIFY_KEY password (a GitHub secret and a Cloudflare secret), so nobody else can trigger it.
async function onDeployed(req, env) {
  if (req.method !== "POST" || !env.NOTIFY_KEY || req.headers.get("X-Notify-Key") !== env.NOTIFY_KEY) return new Response("nope", { status: 401 });
  let sha = "";
  try { sha = String((await req.json()).sha || "").replace(/[^0-9a-f]/gi, "").slice(0, 40); } catch {}
  let what = "";
  // the commit's message — skipping make ship's automatic "Build latest data…" / merge commits to find your own
  for (let i = 0; sha && i < 4; i++) try {
    const c = await gh(env, `/commits/${sha}`);
    what = (c.commit.message || "").split("\n")[0];
    if (!/^(Build latest data|Merge branch)/.test(what)) break;
    sha = (c.parents && c.parents[0] && c.parents[0].sha) || "";
  } catch { break; }
  await notify(env, `🚀 <b>Live on shubhkaprateek.com</b>${what ? "\n" + esc(what) : ""}`);
  return new Response("sent");
}

// ---------------------------------------------------------------- links
const REEL_RE = /https?:\/\/(?:www\.)?instagram\.com\/(?:[\w.]+\/)?(?:reel|reels|p|tv)\/([A-Za-z0-9_-]{5,})/i;
const URL_RE = /https?:\/\/[^\s<>"']+/gi;

// ---------------------------------------------------------------- reading product pages
const decode = s => String(s || "")
  .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&#x27;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/\\u0026/g, "&").replace(/\\\//g, "/");

function meta(html, ...names) {
  const end = html.indexOf("</head>");
  html = html.slice(0, end > 0 ? end : 300_000);         // meta tags live in <head>; keeps CPU low
  for (const n of names) {
    const a = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${n}["'][^>]*content=["']([^"']+)["']`, "i"))
      || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${n}["']`, "i"));
    if (a) return decode(a[1]).trim();
  }
  return "";
}

async function readPage(url, maxBytes = 900_000) {
  const r = await fetch(url, { redirect: "follow", headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml", "Accept-Language": "en-IN,en;q=0.9" } });
  let html = "";
  if (r.body) {
    const reader = r.body.getReader(), dec = new TextDecoder();
    let got = 0;
    while (got < maxBytes) {
      const { done, value } = await reader.read(); if (done) break;
      got += value.length; html += dec.decode(value, { stream: true });
    }
    try { reader.cancel(); } catch {}
  }
  return { finalUrl: r.url || url, status: r.status, html };
}

export function storeOf(link) {
  try {
    const h = new URL(link).hostname.replace(/^www\./, "").toLowerCase();
    if (/amazon|amzn|link\.amazon/.test(h)) return "Amazon";
    const known = { "myntra.com": "Myntra", "flipkart.com": "Flipkart", "ajio.com": "Ajio", "meesho.com": "Meesho", "nykaa.com": "Nykaa", "nykaafashion.com": "Nykaa", "hamleys.in": "Hamleys", "thesouledstore.com": "The Souled Store" };
    for (const k in known) if (h.endsWith(k)) return known[k];
    const base = h.split(".").slice(-2, -1)[0] || h;
    return base.charAt(0).toUpperCase() + base.slice(1);
  } catch { return ""; }
}

// A product's brand = the shop it's sold on, when that's the brand's own website (blix.in → Blix).
// Marketplaces (Amazon, Flipkart…) sell many brands, so those are left empty — set them with "brand 2 Deciwood".
export const guessBrand = link => /amazon|amzn|flipkart|myntra|ajio|meesho|nykaa|hamleys/i.test(link || "") ? "" : storeOf(link);

export function extractProduct(html, finalUrl) {
  const isAmazon = /amazon\./i.test(finalUrl);
  let image = "", title = "";
  if (isAmazon) {
    const near = (marker, re, span = 1500) => { const i = html.indexOf(marker); return i < 0 ? null : html.slice(Math.max(0, i - 300), i + span).match(re); };
    const m = near("data-old-hires", /data-old-hires=["'](https:[^"']+)["']/i) || near('"hiRes"', /"hiRes"\s*:\s*"(https:[^"]+)"/i)
      || near('id="landingImage"', /src=["'](https:[^"']+)["']/i) || near('"large"', /"large"\s*:\s*"(https:[^"]+)"/i);
    if (m) image = decode(m[1]).replace(/\._[^/]*_\.(jpg|jpeg|png|webp)$/i, "._SL600_.$1");
    const t = near('id="productTitle"', /id=["']productTitle["'][^>]*>([\s\S]{1,600}?)<\/span>/i, 900);
    if (t) title = decode(t[1]).replace(/\s+/g, " ").trim();
  }
  if (!image) image = meta(html, "og:image:secure_url", "og:image", "twitter:image", "twitter:image:src");
  if (!title) title = meta(html, "og:title", "twitter:title");
  if (!title) { const t = html.slice(0, 300_000).match(/<title[^>]*>([\s\S]{1,300}?)<\/title>/i); if (t) title = decode(t[1]).replace(/\s+/g, " ").trim(); }
  if (image && image.startsWith("//")) image = "https:" + image;
  return { image, title: cleanTitle(title) };
}

export function cleanTitle(t) {
  if (/^\s*(amazon(\.in)?|robot check|sign in|log ?in|access denied|just a moment.*|page not found|404.*)\s*$/i.test(String(t || ""))) return "";
  t = String(t || "").replace(/^Amazon\.in\s*:\s*/i, "").replace(/\s*:\s*Amazon\.in.*$/i, "")
    .replace(/^Buy\s+/i, "").replace(/\s+(?:Online|at Best Price).*$/i, "");
  t = t.split(/\s+[|]\s+|\s+[–—-]\s+(?=[A-Z])|,\s/)[0].trim();      // first chunk of long marketplace titles
  const words = t.split(/\s+/);
  if (words.length > 8) t = words.slice(0, 8).join(" ");
  return t.replace(/(?:\s+(?:for|with|and|of|the|in|by|to|-|&))+$/i, "").trim();
}

export const asinOf = url => (String(url).match(/\/(?:dp|gp\/product|gp\/aw\/d|d)\/([A-Z0-9]{10})(?=[/?#]|$)/i) || [])[1] || "";

// Amazon often shows bots a captcha instead of the page. Its affiliate image widget still gives
// the product photo from the product code (ASIN), so try that before asking you for a photo.
async function amazonImageByAsin(asin) {
  if (!asin) return "";
  try {
    const r = await fetch(`https://ws-in.amazon-adsystem.com/widgets/q?_encoding=UTF8&ASIN=${asin}&Format=_SL600_&ID=AsinImage&MarketPlace=IN&ServiceVersion=20070822&WS=1`, { redirect: "follow", headers: { "User-Agent": UA } });
    const type = r.headers.get("content-type") || "";
    try { r.body && r.body.cancel(); } catch {}
    // the widget answers a tiny 1x1 gif when it doesn't know the product
    if (r.ok && /image\/(jpe?g|png|webp)/.test(type) && /media-amazon|images-amazon/.test(r.url)) return r.url;
  } catch {}
  return "";
}

async function enrichProduct(p) {
  for (const v of p.variants) {
    if (!v.link || v.image) continue;
    try {
      const page = await readPage(v.link);
      const info = extractProduct(page.html, page.finalUrl);
      v.image = info.image || "";
      if (!v.image && /amazon\.|amzn|link\.amazon/i.test(page.finalUrl + v.link)) {
        v.image = await amazonImageByAsin(asinOf(page.finalUrl) || asinOf(v.link));
      }
      if (!p.name && info.title) p.name = info.title;
      if (!p.pageTitle && info.title) p.pageTitle = info.title;
    } catch { v.image = ""; }
  }
  if (!p.name) { p.name = "Untitled product"; p.needsName = true; }
}

// ---------------------------------------------------------------- reel cover + title
export function extractReel(html) {
  const img = html.match(/class=["'][^"']*EmbeddedMediaImage[^"']*["'][^>]*src=["']([^"']+)["']/i)
    || html.match(/<img[^>]+src=["']([^"']+)["'][^>]*class=["'][^"']*EmbeddedMediaImage/i)
    || html.match(/"display_url"\s*:\s*"([^"]+)"/i) || html.match(/"thumbnail_src"\s*:\s*"([^"]+)"/i);
  let cover = img ? decode(img[1]) : meta(html, "og:image");
  let caption = "";
  const c = html.match(/class=["']Caption["'][^>]*>([\s\S]*?)<div class=["']CaptionComments/i) || html.match(/class=["']Caption["'][^>]*>([\s\S]{0,3000}?)<\/div>/i);
  if (c) caption = decode(c[1].replace(/<a[^>]*class=["']CaptionUsername["'][^>]*>[\s\S]*?<\/a>/i, "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, ""));
  if (!caption) caption = meta(html, "og:description", "description").replace(/^.*?on Instagram:\s*"?/i, "").replace(/"\s*$/, "");
  return { cover, title: titleFromCaption(caption) };
}

export function titleFromCaption(caption) {
  const line = String(caption || "").split("\n").map(s => s.trim())
    .find(s => s.replace(/[#@][\w.]+/g, "").replace(/[^\p{L}\p{N}]+/gu, "").length > 3) || "";
  let t = line.replace(/#[\w]+/g, "").replace(/@[\w.]+/g, "").replace(/\s+/g, " ").trim();
  const words = t.split(" ");
  if (words.length > 9) t = words.slice(0, 9).join(" ") + "…";
  return t;
}

async function enrichReel(code) {
  for (const u of [`https://www.instagram.com/p/${code}/embed/captioned/`, `https://www.instagram.com/reel/${code}/`]) {
    try {
      const page = await readPage(u, 600_000);
      const r = extractReel(page.html);
      if (r.cover || r.title) return r;
    } catch {}
  }
  return { cover: "", title: "" };
}

// ---------------------------------------------------------------- categories (keyword rules, no AI)
const norm = v => " " + String(v || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() + " ";

export function flattenCats(tree) {
  return (tree || []).flatMap(c => [{ ...c, sub: undefined, parent: null }, ...(c.sub || []).map(s => ({ emoji: c.emoji, ...s, parent: c.id }))]);
}

// The keyword that appears LAST in the name wins ("Coloring blanket" → blanket; "Iron Man mug" → mug),
// because the thing a product *is* usually comes last. Themes (Marvel) are added on top.
export function guessCategories(text, cats) {
  const n = norm(text);
  let best = null;
  for (const c of cats) {
    if (c.theme || (cats.some(x => x.parent === c.id))) continue;   // only leaf categories
    for (const k of c.keywords || []) {
      const key = norm(k); const at = n.lastIndexOf(key);
      if (at < 0) continue;
      const end = at + key.length;
      if (!best || end > best.end || (end === best.end && key.length > best.len)) best = { id: c.id, end, len: key.length };
    }
  }
  const out = best ? [best.id] : [];
  for (const c of cats) if (c.theme && (c.keywords || []).some(k => n.includes(norm(k)))) out.push(c.id);
  return out;
}
// ---------------------------------------------------------------- GitHub
async function gh(env, path, opts = {}) {
  const r = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}${path}`, {
    ...opts,
    headers: { "Authorization": `Bearer ${env.GITHUB_TOKEN}`, "Accept": "application/vnd.github+json", "User-Agent": "shubhkaprateek-bot", "X-GitHub-Api-Version": "2022-11-28", ...(opts.body ? { "Content-Type": "application/json" } : {}) }
  });
  if (!r.ok) throw new Error(`GitHub ${opts.method || "GET"} ${path.split("?")[0]}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
const b64ToUtf8 = b64 => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\n/g, "")), c => c.charCodeAt(0)));
async function readJson(env, file) {
  const j = await gh(env, `/contents/${file}?ref=${env.GITHUB_BRANCH || "main"}`);
  return JSON.parse(b64ToUtf8(j.content));
}
function bytesToB64(buf) {
  const bytes = new Uint8Array(buf); let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
// Same layout as the hand-edited files: short arrays on one line
export const pretty = (data, key) => JSON.stringify(data, null, 2)
  .replace(new RegExp(`"${key}": \\[([^\\]\\[{]*?)\\]`, "g"), (_, inner) => `"${key}": [${inner.split(",").map(s => s.trim()).filter(Boolean).join(", ")}]`) + "\n";

// Whenever data/ changes, rebuild assets/js/data.js too (exactly like `make ship` does)
async function withDataJs(env, files) {
  const changed = files.filter(f => /^data\/\w+\.json$/.test(f.path) && f.text != null);
  if (!changed.length) return files;
  const data = {};
  for (const n of DATA_FILES) {
    const f = changed.find(x => x.path === `data/${n}.json`);
    data[n] = f ? JSON.parse(f.text) : await readJson(env, `data/${n}.json`);
  }
  return [...files, { path: "assets/js/data.js", text: dataJs(data) }];
}

async function commitFiles(env, message, files) {
  files = await withDataJs(env, files);              // keep assets/js/data.js up to date
  const branch = env.GITHUB_BRANCH || "main";
  const ref = await gh(env, `/git/ref/heads/${branch}`);
  const head = await gh(env, `/git/commits/${ref.object.sha}`);
  const tree = [];
  for (const f of files) {
    if (f.remove) { tree.push({ path: f.path, mode: "100644", type: "blob", sha: null }); continue; }
    if (f.base64) {
      const blob = await gh(env, `/git/blobs`, { method: "POST", body: JSON.stringify({ content: f.base64, encoding: "base64" }) });
      tree.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
    } else tree.push({ path: f.path, mode: "100644", type: "blob", content: f.text });
  }
  const t = await gh(env, `/git/trees`, { method: "POST", body: JSON.stringify({ base_tree: head.tree.sha, tree }) });
  const c = await gh(env, `/git/commits`, { method: "POST", body: JSON.stringify({ message, tree: t.sha, parents: [ref.object.sha] }) });
  await gh(env, `/git/refs/heads/${branch}`, { method: "PATCH", body: JSON.stringify({ sha: c.sha }) });
  return c.sha;
}

const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function fetchBytes(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error("download " + r.status);
  return bytesToB64(await r.arrayBuffer());
}
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "product";

// ---------------------------------------------------------------- removing a reel / product
// Rules: removing a product takes it out of every reel, and a reel left with no products is removed too.
// Removing a reel also removes its products — but only the ones that aren't in any other reel.

export function findProduct(q, products) {
  const s = String(q).trim();
  if (/^\d+$/.test(s)) { const p = products.find(p => String(p.id) === s); return p ? [p] : []; }
  const link = (s.match(URL_RE) || [])[0];
  if (link) return products.filter(p => (p.variants || []).some(v => (v.link || "").replace(/\/$/, "") === link.replace(/\/$/, "")));
  const exact = products.filter(p => norm(p.name) === norm(s));
  return exact.length ? exact : products.filter(p => norm(p.name).includes(norm(s).trim()));
}

// works out what a delete would remove, without changing anything
export function planDelete(target, products, reels) {
  const codeOf = r => ((r.reel || "").match(REEL_RE) || [])[1] || "";
  const plan = { reels: [], products: [], kept: [], trimmed: [] };   // trimmed = reels that lose a product but stay
  if (target.reel) {
    const r = reels.find(r => codeOf(r).toLowerCase() === target.reel.toLowerCase());
    if (!r) return null;
    plan.reels.push(r);
    for (const id of r.products) {
      const p = products.find(p => p.id === id); if (!p) continue;
      const elsewhere = reels.some(o => o !== r && o.products.includes(id));
      (elsewhere ? plan.kept : plan.products).push(p);
    }
  } else {
    const ps = target.products || [target.product];          // one product or several at once
    const gone = new Set(ps.map(p => p.id));
    plan.products.push(...ps);
    for (const r of reels.filter(r => r.products.some(id => gone.has(id)))) {
      (r.products.every(id => gone.has(id)) ? plan.reels : plan.trimmed).push(r);
    }
  }
  return plan;
}

export function applyDelete(plan, products, reels) {
  const goneP = new Set(plan.products.map(p => p.id)), goneR = new Set(plan.reels.map(r => r.id));
  const outReels = reels.filter(r => !goneR.has(r.id)).map(r => ({ ...r, products: r.products.filter(id => !goneP.has(id)) }));
  return { products: products.filter(p => !goneP.has(p.id)), reels: outReels.filter(r => r.products.length) };
}
