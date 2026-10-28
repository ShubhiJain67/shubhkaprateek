// ShubhKaPrateek shop bot — a Telegram bot that adds reels + products to the website.
//
// You send:   a reel link + product names and links (from your phone)
// Bot does:   finds photos, names, store, categories, reel cover → sends you a preview
// You tap:    ✅ Add to site → it saves to GitHub (data/products.json, data/reels.json, assets/covers/)
//             → GitHub Pages updates shubhkaprateek.com in ~1 minute.
//
// Runs on Cloudflare Workers (free). Secrets (set by setup.sh, never in this file):
//   TELEGRAM_TOKEN, GITHUB_TOKEN, WEBHOOK_SECRET, ALLOWED_CHAT_IDS
// Settings in wrangler.toml [vars]: GITHUB_REPO, GITHUB_BRANCH, SITE_URL
// Drafts waiting for your ✅ live in the KV namespace DRAFTS (auto-deleted after 7 days).

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const MAX_PRODUCTS = 10;
const HELP = `<b>Send me a reel + its products</b>, e.g.

<code>https://www.instagram.com/reel/ABC123/
Hulk Comforter - https://amzn.to/xxxx
Thor mug https://amzn.to/yyyy
Balloons (Golden) - https://amzn.to/aaa
Balloons (Silver) - https://amzn.to/bbb</code>

• One product per line: name + link (or just the link — I'll read the name from the page).
• <code>(Golden)</code> after a name = a variation of the same product.
• A name with no link that's already on the site (e.g. <code>Dice</code>) gets this reel added to it.
• No reel link? The products are added on their own.

I'll send a preview. Fix anything by replying:
<code>title New reel title</code>
<code>name 2 Thor mug</code>
<code>cat 2 mugs marvel</code>   (list: /cats)
<code>link 2 https://…</code>
<code>img 2 https://…photo.jpg</code>
<code>remove 2</code>
Send a <b>photo</b> with caption <code>cover</code> (reel cover) or <code>2</code> (product 2's photo).
Then tap ✅ <b>Add to site</b>. /cancel drops the draft.

<b>Remove things from the site</b>
<code>/delete https://www.instagram.com/reel/ABC123/</code> — the reel, plus its products that aren't in any other reel
<code>/delete Green Saree</code> (or its id, e.g. <code>/delete 48</code>) — the product; a reel left with no products goes too
I'll show exactly what goes before anything is removed.`;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method !== "POST" || url.pathname !== "/telegram") return new Response("ShubhKaPrateek bot is running.");
    if (req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET) return new Response("nope", { status: 401 });
    let update;
    try { update = await req.json(); } catch { return new Response("ok"); }
    try { await handleUpdate(update, env); }
    catch (err) {
      console.error(err);
      const chat = update.message?.chat?.id ?? update.callback_query?.message?.chat?.id;
      if (chat && allowed(env, chat)) await tg(env, "sendMessage", { chat_id: chat, text: "⚠️ " + String(err.message || err).slice(0, 300) }).catch(() => {});
    }
    return new Response("ok"); // always 200 so Telegram doesn't re-send the same message
  }
};

// ---------------------------------------------------------------- Telegram
const allowed = (env, chatId) => String(env.ALLOWED_CHAT_IDS || "").split(/[\s,]+/).filter(Boolean).includes(String(chatId));

async function tg(env, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(`Telegram ${method}: ${j.description || r.status}`);
  return j.result;
}
const say = (env, chat, html, extra = {}) => tg(env, "sendMessage", { chat_id: chat, text: html, parse_mode: "HTML", disable_web_page_preview: true, ...extra });

export async function handleUpdate(update, env) {
  if (update.callback_query) return onButton(update.callback_query, env);
  const msg = update.message;
  if (!msg) return;
  const chat = msg.chat.id;
  if (!allowed(env, chat)) return say(env, chat, `This bot is private 🙂\nYour chat id: <code>${chat}</code>`);

  const text = (msg.text || msg.caption || "").trim();
  const cmd = text.split(/\s+/)[0].toLowerCase().replace(/@.*$/, "");

  if (msg.photo || /^image\//.test(msg.document?.mime_type || "")) return onPhoto(msg, env);
  if (cmd === "/start" || cmd === "/help") return say(env, chat, HELP);
  if (cmd === "/cancel") { await env.DRAFTS.delete(String(chat)); return say(env, chat, "🗑 Draft dropped."); }
  if (cmd === "/cats") return say(env, chat, await catsHelp(env));
  if (cmd === "/delete" || cmd === "/remove") return onDelete(text.replace(/^\/\S+\s*/, "").trim(), env, chat);
  // any other /command is never treated as a product name
  if (cmd.startsWith("/")) return say(env, chat, `I don't know <code>${esc(cmd)}</code> — see /help.`);
  if (cmd === "/preview") { const d = await loadDraft(env, chat); return d ? sendPreview(env, chat, d) : say(env, chat, "No draft right now — send me a reel link + products."); }

  const draft = await loadDraft(env, chat);
  const hasLink = /https?:\/\//i.test(text);
  if (draft && /^(title|name|cat|cats|category|link|img|image|photo|remove|delete)\b/i.test(text) && !/instagram\.com\//i.test(text)) return onEdit(draft, text, env, chat);
  if (!hasLink) return say(env, chat, draft
    ? "I didn't get that 🤔 Reply with a fix like <code>cat 2 mugs</code> or <code>title …</code>, tap ✅ on the preview, or /help."
    : HELP);
  if (draft) await say(env, chat, "🆕 Starting a new draft (the previous one is replaced).");
  return onNewPost(text, env, chat);
}

// ---------------------------------------------------------------- parsing what you send
const REEL_RE = /https?:\/\/(?:www\.)?instagram\.com\/(?:[\w.]+\/)?(?:reel|reels|p|tv)\/([A-Za-z0-9_-]{5,})/i;
const URL_RE = /https?:\/\/[^\s<>"']+/gi;

export function parseMessage(text) {
  const reel = text.match(REEL_RE);
  const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);
  const items = [];
  let pendingName = null;
  for (let line of lines) {
    line = line.replace(/https?:\/\/(?:www\.)?instagram\.com\/\S*/gi, "").trim();
    if (!line) continue;
    const links = (line.match(URL_RE) || []).map(u => u.replace(/[),.]+$/, ""));
    let name = line.replace(URL_RE, " ")
      .replace(/^\s*(?:\d+[.)]|[-•*–])\s*/, "")      // "1." "•" "-" bullets
      .replace(/\s*[-–—:|]+\s*$/, "").replace(/^\s*[-–—:|]+\s*/, "")
      .replace(/\s+/g, " ").trim();
    if (!links.length) {                              // a name on its own line (link may follow on the next line)
      if (pendingName) items.push({ name: pendingName, link: "" });
      pendingName = name || null; continue;
    }
    if (!name && pendingName) name = pendingName;
    pendingName = null;
    const v = name.match(/^(.*?)\s*\(([^()]+)\)\s*$/);   // "Balloons (Golden)" → variant
    items.push({ name: v ? v[1].trim() : name, variant: v ? v[2].trim() : "", link: links[0] });
  }
  if (pendingName) items.push({ name: pendingName, link: "" });
  // group variants of the same product
  const products = [];
  for (const it of items) {
    const key = it.name.toLowerCase();
    let p = key && products.find(x => x.name.toLowerCase() === key);
    if (!p) { p = { name: it.name, variants: [] }; products.push(p); }
    p.variants.push({ name: it.variant || "", link: it.link });
  }
  products.forEach(p => {
    if (p.variants.length === 1 && !p.variants[0].name) p.variants[0].name = "Default";
    p.variants.forEach((v, i) => { if (!v.name) v.name = "Option " + (i + 1); });
  });
  return { reel: reel ? reel[1] : null, products };
}

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

async function commitFiles(env, message, files) {
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

// ---------------------------------------------------------------- drafts
const loadDraft = async (env, chat) => { const s = await env.DRAFTS.get(String(chat)); return s ? JSON.parse(s) : null; };
const saveDraft = (env, chat, d) => env.DRAFTS.put(String(chat), JSON.stringify(d), { expirationTtl: 7 * 24 * 3600 });

async function loadSite(env) {
  const [products, reels, categories, site] = await Promise.all(["products", "reels", "categories", "site"].map(f => readJson(env, `data/${f}.json`)));
  return { products, reels, categories, cats: flattenCats(categories), site };
}

async function onNewPost(text, env, chat) {
  const parsed = parseMessage(text);
  if (!parsed.reel && !parsed.products.length) return say(env, chat, HELP);
  const nLinks = parsed.products.reduce((a, p) => a + p.variants.length, 0);
  if (nLinks > MAX_PRODUCTS) return say(env, chat, `That's ${nLinks} links — please send at most ${MAX_PRODUCTS} at a time (split it into two messages: send the second one after tapping ✅).`);
  await tg(env, "sendChatAction", { chat_id: chat, action: "typing" }).catch(() => {});
  const S = await loadSite(env);

  const existingReel = parsed.reel ? S.reels.find(r => (r.reel.match(REEL_RE) || [])[1]?.toLowerCase() === parsed.reel.toLowerCase()) : null;
  const draft = { id: Date.now().toString(36), reel: null, products: [] };
  if (parsed.reel) {
    draft.reel = { code: parsed.reel, existingId: existingReel?.id ?? null, title: existingReel?.title || "", cover: "", coverFile: "" };
    if (!existingReel) {
      const r = await enrichReel(parsed.reel);
      draft.reel.title = r.title || "";
      draft.reel.cover = r.cover || "";
    }
  }

  const byLink = new Map(), byName = new Map();
  S.products.forEach(p => { byName.set(norm(p.name), p); (p.variants || []).forEach(v => v.link && byLink.set(v.link.replace(/\/$/, ""), p)); });
  for (const p of parsed.products) {
    const known = (p.name && byName.get(norm(p.name))) || p.variants.map(v => byLink.get((v.link || "").replace(/\/$/, ""))).find(Boolean);
    if (known) { draft.products.push({ existingId: known.id, name: known.name, category: known.category, variants: known.variants }); continue; }
    if (!p.variants.some(v => v.link)) { draft.products.push({ ...p, missing: true, category: [] }); continue; }
    await enrichProduct(p);
    p.category = guessCategories(p.name + " " + (p.pageTitle || ""), S.cats);
    draft.products.push(p);
  }
  await saveDraft(env, chat, draft);
  return sendPreview(env, chat, draft, S);
}

// ---------------------------------------------------------------- preview
const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function previewText(d, cats) {
  // show the full path so it's clear where it lands on the site: "Clothing & Footwear › Ethnic wear"
  const catName = id => {
    const c = cats.find(c => c.id === id) || { name: id };
    const parent = c.parent && cats.find(x => x.id === c.parent);
    return parent ? `${parent.name} › ${c.name}` : c.name;
  };
  const lines = [];
  const problems = [];
  if (d.reel) {
    const r = d.reel;
    lines.push(`🎬 <b>Reel</b> ${r.existingId != null ? "(already on the site — products will be added to it)" : "(new)"}`);
    lines.push(`   Title: ${r.title ? `<b>${esc(r.title)}</b>` : "❓ <i>none — reply</i> <code>title …</code>"}`);
    if (r.existingId == null) {
      lines.push(`   Cover: ${r.coverFile ? "✅ your photo" : r.cover ? "✅ found" : "❌ couldn't fetch — send a screenshot with caption <code>cover</code>"}`);
      if (!r.title) problems.push("reel title");
    }
  } else lines.push("🛍 <b>No reel link</b> — products will be added on their own.");
  lines.push("");
  d.products.forEach((p, i) => {
    const n = i + 1;
    if (p.existingId != null) { lines.push(`${n}. <b>${esc(p.name)}</b> — already on the site ✓`); return; }
    if (p.missing) { lines.push(`${n}. <b>${esc(p.name)}</b> — ❌ not on the site and no link. Reply <code>link ${n} https://…</code> or <code>remove ${n}</code>`); problems.push(`product ${n} link`); return; }
    const cs = (p.category || []).map(catName);
    lines.push(`${n}. <b>${esc(p.name)}</b> 🆕${p.needsName ? ` — ❓ couldn't read the name, reply <code>name ${n} …</code>` : ""}`);
    if (p.needsName) problems.push(`product ${n} name`);
    lines.push(`   ${cs.length ? esc(cs.join(" · ")) : "❓ no category — reply <code>cat " + n + " …</code> (/cats)"}`);
    p.variants.forEach(v => {
      const photo = v.photoFile ? "📷 your photo" : v.image ? "📷 ✓" : "📷 ❌ send a photo with caption <code>" + n + "</code>";
      lines.push(`   ${p.variants.length > 1 ? esc(v.name) + ": " : ""}${esc(storeOf(v.link) || "link")} · ${photo}`);
    });
    if (!cs.length) problems.push(`product ${n} category`);
  });
  lines.push("");
  lines.push(problems.length ? `⚠️ Still missing: ${problems.join(", ")}. You can add anyway, or fix first.` : "Looks good? Tap ✅ — or reply a fix (/help).");
  return lines.join("\n");
}

async function sendPreview(env, chat, d, S) {
  S = S || { cats: flattenCats(await readJson(env, "data/categories.json")) };
  // photos first so you can eyeball them
  const media = [];
  if (d.reel && d.reel.existingId == null && (d.reel.coverFile || d.reel.cover)) media.push({ type: "photo", media: d.reel.coverFile || d.reel.cover, caption: "Cover" });
  d.products.forEach((p, i) => p.existingId == null && p.variants.forEach(v => (v.photoFile || v.image) && media.push({ type: "photo", media: v.photoFile || v.image, caption: `${i + 1}. ${p.name}${p.variants.length > 1 ? " — " + v.name : ""}` })));
  if (media.length >= 2) await tg(env, "sendMediaGroup", { chat_id: chat, media: media.slice(0, 10) }).catch(() => {});
  else if (media.length === 1) await tg(env, "sendPhoto", { chat_id: chat, photo: media[0].media, caption: media[0].caption }).catch(() => {});
  return say(env, chat, previewText(d, S.cats), {
    reply_markup: { inline_keyboard: [[{ text: "✅ Add to site", callback_data: "add:" + d.id }, { text: "❌ Cancel", callback_data: "cancel:" + d.id }]] }
  });
}

async function catsHelp(env) {
  const tree = await readJson(env, "data/categories.json");
  return "<b>Categories</b> — use the id after <code>cat N</code> (you can give two, e.g. <code>cat 2 mugs marvel</code>)\n\n" + tree.map(c =>
    `${c.emoji || ""} <b>${esc(c.name)}</b> <code>${esc(c.id)}</code>` + (c.sub || []).map(s => `\n   • ${esc(s.name)} <code>${esc(s.id)}</code>`).join("")).join("\n");
}

// ---------------------------------------------------------------- edits
async function onEdit(d, text, env, chat) {
  const m = text.match(/^(\w+)\s*(\d+)?\s*([\s\S]*)$/);
  const verb = m[1].toLowerCase(), n = m[2] ? +m[2] : null, rest = (m[3] || "").trim();
  const p = n ? d.products[n - 1] : null;
  const needP = () => { if (!p) throw new Error(`There's no product ${n ?? ""} — numbers are from the preview.`); if (p.existingId != null && verb !== "remove" && verb !== "delete") throw new Error(`Product ${n} is already on the site — edit it in products.json instead.`); };
  const cats = flattenCats(await readJson(env, "data/categories.json"));
  if (verb === "title") {
    if (!d.reel) return say(env, chat, "There's no reel in this draft.");
    d.reel.title = text.replace(/^title\s*/i, "").trim();
  } else if (verb === "name") {
    needP(); p.name = rest; p.needsName = false;
    if (!(p.category || []).length) p.category = guessCategories(p.name, cats);
  }
  else if (["cat", "cats", "category"].includes(verb)) {
    needP();
    const ids = rest.split(/[\s,]+/).filter(Boolean).map(w => {
      const c = cats.find(c => c.id === w.toLowerCase()) || cats.find(c => norm(c.name).includes(norm(w)));
      if (!c) throw new Error(`I don't know the category "${w}" — see /cats`);
      return c.id;
    });
    p.category = [...new Set(ids)];
  } else if (verb === "link") {
    if (!p) throw new Error(`There's no product ${n ?? ""}.`);
    const link = (rest.match(URL_RE) || [])[0]; if (!link) throw new Error("Send it like: link 2 https://…");
    const fresh = { name: p.name, variants: [{ name: "Default", link }] };
    await enrichProduct(fresh);
    fresh.category = (p.category && p.category.length) ? p.category : guessCategories(fresh.name + " " + (fresh.pageTitle || ""), cats);
    d.products[n - 1] = fresh;
  } else if (["img", "image", "photo"].includes(verb)) {
    needP();
    const link = (rest.match(URL_RE) || [])[0]; if (!link) throw new Error("Send it like: img 2 https://…jpg — or just send the photo with caption 2");
    p.variants.forEach(v => { v.image = link; v.photoFile = ""; });
  } else if (["remove", "delete"].includes(verb)) {
    if (!p) throw new Error(`There's no product ${n ?? ""}.`);
    d.products.splice(n - 1, 1);
  }
  await saveDraft(env, chat, d);
  return sendPreview(env, chat, d);
}

async function onPhoto(msg, env) {
  const chat = msg.chat.id;
  const d = await loadDraft(env, chat);
  if (!d) return say(env, chat, "Send the reel + products first, then the photo.");
  const fileId = msg.photo ? msg.photo[msg.photo.length - 1].file_id : msg.document.file_id;   // biggest size
  const cap = (msg.caption || "cover").trim().toLowerCase();
  if (/^\d+$/.test(cap)) {
    const p = d.products[+cap - 1];
    if (!p || p.existingId != null) return say(env, chat, `There's no new product ${cap} in the preview.`);
    p.variants.forEach(v => { v.photoFile = fileId; });
  } else {
    if (!d.reel || d.reel.existingId != null) return say(env, chat, "This draft has no new reel to put a cover on. For a product photo, add its number as the caption (e.g. 2).");
    d.reel.coverFile = fileId;
  }
  await saveDraft(env, chat, d);
  return sendPreview(env, chat, d);
}

// ---------------------------------------------------------------- ✅ / ❌
async function onButton(q, env) {
  const chat = q.message.chat.id;
  if (!allowed(env, chat)) return tg(env, "answerCallbackQuery", { callback_query_id: q.id, text: "Private bot" });
  const [action, id] = String(q.data || "").split(":");
  if (action === "delok" || action === "delno") return onDeleteButton(q, env, action, id);
  const d = await loadDraft(env, chat);
  if (!d || d.id !== id) return tg(env, "answerCallbackQuery", { callback_query_id: q.id, text: "That preview is old — use the latest one.", show_alert: true });
  const done = label => tg(env, "editMessageReplyMarkup", { chat_id: chat, message_id: q.message.message_id, reply_markup: { inline_keyboard: [[{ text: label, callback_data: "noop:0" }]] } }).catch(() => {});
  if (action === "cancel") {
    await env.DRAFTS.delete(String(chat));
    await tg(env, "answerCallbackQuery", { callback_query_id: q.id, text: "Dropped" });
    await done("❌ Cancelled");
    return;
  }
  if (action !== "add") return tg(env, "answerCallbackQuery", { callback_query_id: q.id });
  await tg(env, "answerCallbackQuery", { callback_query_id: q.id, text: "Adding…" });
  await done("⏳ Adding…");
  try {
    const res = await publish(d, env);
    await env.DRAFTS.delete(String(chat));
    await done("✅ Added");
    return say(env, chat, res);
  } catch (e) {
    await done("⚠️ Failed — tap /preview to retry");
    throw e;
  }
}

async function fetchBytes(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error("download " + r.status);
  return bytesToB64(await r.arrayBuffer());
}
async function telegramFile(env, fileId) {
  const f = await tg(env, "getFile", { file_id: fileId });
  return fetchBytes(`https://api.telegram.org/file/bot${env.TELEGRAM_TOKEN}/${f.file_path}`);
}
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "product";

export async function publish(d, env) {
  const S = await loadSite(env);                 // fresh copy, in case the files changed since the preview
  const files = [], notes = [];
  let nextId = Math.max(0, ...S.products.map(p => +p.id || 0)) + 1;
  const ids = [], added = [];
  for (const p of d.products) {
    if (p.existingId != null) { if (S.products.some(x => x.id === p.existingId)) ids.push(p.existingId); continue; }
    if (p.missing) { notes.push(`skipped “${p.name}” (no link)`); continue; }
    const id = nextId++;
    const variants = [];
    for (const v of p.variants) {
      let image = v.image || "";
      if (v.photoFile) {
        const path = `assets/products/${id}-${slug(p.name)}${p.variants.length > 1 ? "-" + slug(v.name) : ""}.jpg`;
        files.push({ path, base64: await telegramFile(env, v.photoFile) });
        image = path;
      }
      variants.push({ name: v.name || "Default", link: v.link || "", image });
    }
    S.products.push({ id, name: p.name, category: p.category && p.category.length ? p.category : [], variants });
    ids.push(id); added.push(`${p.name}`);
  }
  let reelLine = "";
  if (d.reel) {
    const code = d.reel.code;
    const existing = S.reels.find(r => (r.reel.match(REEL_RE) || [])[1]?.toLowerCase() === code.toLowerCase());
    if (existing) {
      ids.forEach(id => { if (!existing.products.includes(id)) existing.products.push(id); });
    } else {
      const reelId = Math.max(0, ...S.reels.map(r => +r.id || 0)) + 1;
      S.reels.push({ id: reelId, reel: `https://www.instagram.com/reel/${code}/`, title: d.reel.title || "New reel", products: [...new Set(ids)] });
      try {
        const b64 = d.reel.coverFile ? await telegramFile(env, d.reel.coverFile) : d.reel.cover ? await fetchBytes(d.reel.cover) : null;
        if (b64) files.push({ path: `assets/covers/${code}.jpg`, base64: b64 });
        else notes.push("no cover — the site will show the Instagram preview instead");
      } catch { notes.push("couldn't download the cover — the site will show the Instagram preview instead (send a screenshot next time)"); }
    }
    reelLine = `${env.SITE_URL || "https://shubhkaprateek.com"}/?reel=${code}`;
  }
  files.push({ path: "data/products.json", text: pretty(S.products, "category") });
  files.push({ path: "data/reels.json", text: pretty(S.reels, "products") });
  const what = [d.reel ? `${S.reels.length && d.reel.existingId != null ? "products to reel" : "reel"} ${d.reel.code}` : "", added.length ? `${added.length} product${added.length > 1 ? "s" : ""}` : ""].filter(Boolean).join(" + ");
  await commitFiles(env, `Add ${what || "products"} (via Telegram bot)`, files);
  return [
    `✅ <b>Added!</b> Live in about a minute.`,
    reelLine ? `🎬 ${esc(reelLine)}` : "",
    added.length ? `🆕 ${esc(added.join(", "))}` : "",
    notes.length ? `ℹ️ ${esc(notes.join("; "))}` : "",
    `\n💻 On your laptop, run <code>git pull</code> before editing the site files.`
  ].filter(Boolean).join("\n");
}

// ---------------------------------------------------------------- removing a reel / product
// Rules: removing a product takes it out of every reel, and a reel left with no products is removed too.
// Removing a reel also removes its products — but only the ones that aren't in any other reel.
const delKey = chat => "del:" + chat;

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
    const p = target.product;
    plan.products.push(p);
    for (const r of reels.filter(r => r.products.includes(p.id))) {
      (r.products.every(id => id === p.id) ? plan.reels : plan.trimmed).push(r);
    }
  }
  return plan;
}

export function applyDelete(plan, products, reels) {
  const goneP = new Set(plan.products.map(p => p.id)), goneR = new Set(plan.reels.map(r => r.id));
  const outReels = reels.filter(r => !goneR.has(r.id)).map(r => ({ ...r, products: r.products.filter(id => !goneP.has(id)) }));
  return { products: products.filter(p => !goneP.has(p.id)), reels: outReels.filter(r => r.products.length) };
}

function describePlan(plan) {
  const codeOf = r => ((r.reel || "").match(REEL_RE) || [])[1] || "";
  const L = ["🗑 <b>This will remove:</b>"];
  plan.reels.forEach(r => L.push(`🎬 Reel: <b>${esc(r.title)}</b> (${esc(codeOf(r))})`));
  plan.products.forEach(p => L.push(`🛍 Product: <b>${esc(p.name)}</b> (id ${p.id})`));
  if (plan.kept.length) L.push("", "Staying (they're in other reels too):", ...plan.kept.map(p => `• ${esc(p.name)}`));
  if (plan.trimmed.length) L.push("", "Also taken out of these reels (they keep their other products):", ...plan.trimmed.map(r => `• ${esc(r.title)}`));
  L.push("", "Sure?");
  return L.join("\n");
}

async function onDelete(arg, env, chat) {
  if (!arg) return say(env, chat, "Tell me what to remove:\n<code>/delete https://www.instagram.com/reel/ABC123/</code>\n<code>/delete Green Saree</code>  or  <code>/delete 48</code>");
  const S = await loadSite(env);
  const reelCode = (arg.match(REEL_RE) || [])[1];
  let target;
  if (reelCode) target = { reel: reelCode };
  else {
    const found = findProduct(arg, S.products);
    if (!found.length) return say(env, chat, `I couldn't find a product matching “${esc(arg)}”.`);
    if (found.length > 1) return say(env, chat, "Which one? Send <code>/delete</code> with the id:\n" + found.slice(0, 15).map(p => `• <code>${p.id}</code> ${esc(p.name)}`).join("\n"));
    target = { product: found[0] };
  }
  const plan = planDelete(target, S.products, S.reels);
  if (!plan) return say(env, chat, "That reel isn't on the site.");
  const id = Date.now().toString(36);
  await env.DRAFTS.put(delKey(chat), JSON.stringify({ id, target: target.reel ? { reel: target.reel } : { productId: target.product.id } }), { expirationTtl: 24 * 3600 });
  return say(env, chat, describePlan(plan), { reply_markup: { inline_keyboard: [[{ text: "🗑 Yes, remove", callback_data: "delok:" + id }, { text: "Keep it", callback_data: "delno:" + id }]] } });
}

async function onDeleteButton(q, env, action, id) {
  const chat = q.message.chat.id;
  const raw = await env.DRAFTS.get(delKey(chat));
  const pending = raw ? JSON.parse(raw) : null;
  const done = label => tg(env, "editMessageReplyMarkup", { chat_id: chat, message_id: q.message.message_id, reply_markup: { inline_keyboard: [[{ text: label, callback_data: "noop:0" }]] } }).catch(() => {});
  if (!pending || pending.id !== id) return tg(env, "answerCallbackQuery", { callback_query_id: q.id, text: "That's an old request — send /delete again.", show_alert: true });
  await env.DRAFTS.delete(delKey(chat));
  if (action === "delno") { await tg(env, "answerCallbackQuery", { callback_query_id: q.id, text: "Kept" }); return done("👍 Kept"); }
  await tg(env, "answerCallbackQuery", { callback_query_id: q.id, text: "Removing…" });
  await done("⏳ Removing…");
  // work it out again on the latest files, in case something changed since you asked
  const S = await loadSite(env);
  let target = pending.target;
  if (target.productId != null) {
    const p = S.products.find(p => p.id === target.productId);
    if (!p) { await done("Already gone"); return say(env, chat, "That product is already gone."); }
    target = { product: p };
  }
  const plan = planDelete(target, S.products, S.reels);
  if (!plan) { await done("Already gone"); return say(env, chat, "That reel is already gone."); }
  const out = applyDelete(plan, S.products, S.reels);
  const files = [
    { path: "data/products.json", text: pretty(out.products, "category") },
    { path: "data/reels.json", text: pretty(out.reels, "products") }
  ];
  // also delete the cover / photos the bot uploaded for them (only if those files exist)
  const codeOf = r => ((r.reel || "").match(REEL_RE) || [])[1] || "";
  const extra = [
    ...plan.reels.map(r => `assets/covers/${codeOf(r)}.jpg`),
    ...plan.products.flatMap(p => (p.variants || []).map(v => v.image).filter(i => /^assets\//.test(i || "")))
  ];
  for (const path of [...new Set(extra)]) {
    try { await gh(env, `/contents/${path}?ref=${env.GITHUB_BRANCH || "main"}`); files.push({ path, remove: true }); } catch {}
  }
  const what = [plan.reels.length ? `${plan.reels.length} reel${plan.reels.length > 1 ? "s" : ""}` : "", plan.products.length ? `${plan.products.length} product${plan.products.length > 1 ? "s" : ""}` : ""].filter(Boolean).join(" + ");
  await commitFiles(env, `Remove ${what} (via Telegram bot)`, files);
  await done("🗑 Removed");
  return say(env, chat, `🗑 <b>Removed</b> ${esc(what)}. Gone from the site in about a minute.\n\n💻 Run <code>git pull</code> on your laptop before editing.`);
}
