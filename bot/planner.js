// Content planner for @shubhkaprateek — private, not part of the public website.
//
// Ideas live in the bot's private Cloudflare storage (KV key "planner"), NOT in the GitHub repo
// (the repo is public, so anything there could be read by anyone).
//
// Telegram:  /idea …  /ideas  /plan  /shot  /edited  /uploaded  /drop  /week  /planner
// Page:      https://<worker>/planner?key=<secret>   (the bot sends you the link with /planner)

const KEY = "planner";
const STATUSES = ["idea", "planned", "shot", "edited", "uploaded"];
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

// Starting categories + weekly mix (%). Change them on the planner page (⚙️) — these are only the first-run defaults.
export const DEFAULT_CATEGORIES = [
  { id: "games", name: "Game Night", emoji: "🎲", target: 30, keywords: ["game", "games", "challenge", "wars", "vs", "versus", "quiz", "score", "compete", "competition", "dice", "cards", "ludo", "uno", "carrom", "battle", "jenga", "puzzle"] },
  { id: "gifting", name: "Gifting & Surprises", emoji: "🎁", target: 20, keywords: ["gift", "gifts", "surprise", "birthday", "countdown", "unboxing", "present", "anniversary"] },
  { id: "fun", name: "Couple Fun & Relatable", emoji: "😂", target: 25, keywords: ["prank", "relatable", "pov", "husband", "wife", "fight", "trend", "trending", "funny", "comedy", "meme", "dance"] },
  { id: "festive", name: "Festive & Fashion", emoji: "🪔", target: 15, keywords: ["diwali", "holi", "christmas", "festival", "festive", "outfit", "saree", "kurta", "lehenga", "transition", "makeover", "ootd", "fashion", "karwa", "rakhi", "eid"] },
  { id: "dates", name: "Dates & Vlogs", emoji: "📍", target: 10, keywords: ["date", "vlog", "trip", "travel", "dinner", "cafe", "day in", "weekend", "movie", "outing", "restaurant"] }
];

// ---------------------------------------------------------------- storage
export const emptyPlanner = () => ({ nextId: 1, categories: DEFAULT_CATEGORIES.map(c => ({ ...c })), ideas: [] });
export async function load(env) {
  const s = await env.DRAFTS.get(KEY);
  return s ? JSON.parse(s) : emptyPlanner();
}
const save = (env, P) => env.DRAFTS.put(KEY, JSON.stringify(P));

// ---------------------------------------------------------------- dates (India time)
const IST = 330 * 60 * 1000;
const istDate = (d = new Date()) => new Date(d.getTime() + IST);          // use the UTC getters on this
export function weekOf(d = new Date()) {                                   // Monday of that week, "YYYY-MM-DD"
  const t = istDate(d); const dow = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - dow);
  return t.toISOString().slice(0, 10);
}
export const addWeeks = (week, n) => { const t = new Date(week + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + 7 * n); return t.toISOString().slice(0, 10); };
const nowIso = () => new Date().toISOString();
const weekLabel = w => { const t = new Date(w + "T00:00:00Z"), e = new Date(t); e.setUTCDate(t.getUTCDate() + 6);
  const f = x => x.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }); return `${f(t)} – ${f(e)}`; };

// ---------------------------------------------------------------- pure logic (also used by the page API)
const norm = v => " " + String(v || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() + " ";
// Category guess = keywords (⚙️ on the page) + learning from your own ideas:
// every idea you've put in a category teaches it its words, so "maggi date" → Dates after you've filed a few like it.
const STOP = new Set(("a an the and or of to in on for with at by from is are be it this that our we us me my you your " +
  "ka ki ke ko se me mein hai hain aur ya bhi na nahi kya ek wala wali vs").split(" "));
// crude stemming so "gifts / gifting / gifted" all match "gift"
const stem = w => w.length > 4 ? w.replace(/(ing|ings|ed|es|er|ers|s)$/, "") : w;
const words = text => [...new Set(norm(text).trim().split(" ").filter(w => w.length > 1 && !STOP.has(w)).map(stem))];
export function guessCategory(text, P, excludeId = null) {
  const cats = P.categories || [], mine = words(text);
  if (!mine.length) return null;
  const score = Object.fromEntries(cats.map(c => [c.id, 0]));
  // 1) keywords: strong signal
  for (const c of cats) for (const k of c.keywords || []) {
    const kw = words(k); if (kw.length && kw.every(w => mine.includes(w))) score[c.id] += 3;
  }
  // 2) learned: how often each word appeared in ideas you filed under each category
  const seen = {};                                  // word → { catId: count }
  for (const i of P.ideas || []) {
    if (!i.cat || i.id === excludeId || !(i.cat in score)) continue;
    for (const w of words(i.text + " " + (i.tags || []).join(" "))) (seen[w] ||= {})[i.cat] = (seen[w][i.cat] || 0) + 1;
  }
  for (const w of mine) {
    const by = seen[w]; if (!by) continue;
    const total = Object.values(by).reduce((a, b) => a + b, 0);
    for (const id in by) score[id] += 2 * by[id] / total;   // a word used only in one category counts fully
  }
  const [bestId, best] = Object.entries(score).sort((a, b) => b[1] - a[1])[0] || [];
  return best >= 1 ? bestId : null;                 // not enough signal → leave it for you to pick
}
export function parseIdea(text) {
  const tags = [...new Set((text.match(/#[\p{L}\p{N}_-]+/gu) || []).map(t => t.slice(1).toLowerCase()))];
  const clean = text.replace(/#[\p{L}\p{N}_-]+/gu, "").replace(/\s+/g, " ").trim();
  return { text: clean, tags };
}
export function addIdea(P, text, opts = {}) {
  const { text: t, tags } = parseIdea(text);
  if (!t) throw new Error("Write the idea after /idea, e.g. /idea Couple quiz with buzzer #trending");
  const idea = { id: P.nextId++, text: t, cat: opts.cat || guessCategory(t + " " + tags.join(" "), P), tags,
    status: "idea", week: null, day: null, created: nowIso(), updated: nowIso(), log: {} };
  P.ideas.push(idea); return idea;
}
const find = (P, id) => { const i = P.ideas.find(x => x.id === +id); if (!i) throw new Error(`There's no idea #${id}.`); return i; };
export function setStatus(P, id, status) {
  if (!STATUSES.includes(status)) throw new Error("Unknown status " + status);
  const i = find(P, id);
  i.status = status; i.updated = nowIso(); i.log[status] = nowIso();
  if (status !== "idea" && !i.week) i.week = weekOf();               // shooting/uploading something puts it in this week
  if (status === "idea") { i.week = null; i.day = null; }
  return i;
}
export function plan(P, id, week, day = null) {
  const i = find(P, id);
  i.week = week; i.day = day && DAYS.includes(day) ? day : i.day;
  if (i.status === "idea") i.status = "planned";
  i.updated = nowIso(); i.log.planned = i.log.planned || nowIso();
  return i;
}
export function unplan(P, id) { const i = find(P, id); i.week = null; i.day = null; if (i.status === "planned") i.status = "idea"; i.updated = nowIso(); return i; }
export function edit(P, id, patch) {
  const i = find(P, id);
  if (patch.text != null) { const t = String(patch.text).trim(); if (t) i.text = t; }
  if (patch.cat !== undefined) i.cat = patch.cat && P.categories.some(c => c.id === patch.cat) ? patch.cat : null;
  if (patch.tags) i.tags = [...new Set([].concat(patch.tags).map(t => String(t).replace(/^#/, "").trim().toLowerCase()).filter(Boolean))];
  if (patch.day !== undefined) i.day = DAYS.includes(patch.day) ? patch.day : null;
  i.updated = nowIso(); return i;
}
export function drop(P, id) { const i = find(P, id); P.ideas = P.ideas.filter(x => x !== i); return i; }
export function setCategories(P, cats) {
  const clean = cats.map(c => ({
    id: String(c.id || c.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "cat",
    name: String(c.name || c.id).trim(), emoji: String(c.emoji || "").trim(), target: Math.max(0, Math.round(+c.target || 0)),
    keywords: [].concat(c.keywords || []).map(k => String(k).trim().toLowerCase()).filter(Boolean)
  })).filter(c => c.name);
  if (!clean.length) throw new Error("Keep at least one category.");
  if (new Set(clean.map(c => c.id)).size !== clean.length) throw new Error("Two categories have the same name.");
  const ids = new Set(clean.map(c => c.id));
  P.ideas.forEach(i => { if (i.cat && !ids.has(i.cat)) i.cat = null; });
  P.categories = clean;
}
// the week's category mix vs the targets → what to add next
export function mix(P, week) {
  const items = P.ideas.filter(i => i.week === week);
  const total = items.length;
  const targetSum = P.categories.reduce((a, c) => a + c.target, 0) || 1;
  const rows = P.categories.map(c => {
    const n = items.filter(i => i.cat === c.id).length;
    const want = c.target / targetSum;
    return { id: c.id, name: c.name, emoji: c.emoji, n, pct: total ? Math.round(100 * n / total) : 0, target: Math.round(100 * want),
      gap: Math.round((want * Math.max(total, 7) - n) * 10) / 10 };            // vs a 7-post week (one a day)
  });
  const uncategorised = items.filter(i => !i.cat || !P.categories.some(c => c.id === i.cat)).length;
  const next = [...rows].sort((a, b) => b.gap - a.gap).filter(r => r.gap >= 0.5).slice(0, 2);
  return { week, total, rows, uncategorised, next,
    byStatus: Object.fromEntries(STATUSES.slice(1).map(s => [s, items.filter(i => i.status === s).length])) };
}

// ---------------------------------------------------------------- Telegram
const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
async function tg(env, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({})); if (!j.ok) throw new Error(`Telegram ${method}: ${j.description || r.status}`); return j.result;
}
const say = (env, chat, html, extra = {}) => tg(env, "sendMessage", { chat_id: chat, text: html, parse_mode: "HTML", disable_web_page_preview: true, ...extra });
const STATUS_ICON = { idea: "💡", planned: "📅", shot: "🎥", edited: "✂️", uploaded: "✅" };
const catLabel = (P, id) => { const c = P.categories.find(c => c.id === id); return c ? `${c.emoji} ${c.name}` : "❓ no category"; };
const line = (P, i) => `${STATUS_ICON[i.status]} <b>#${i.id}</b> ${esc(i.text)}${i.day ? ` · ${i.day}` : ""}${i.tags.length ? " " + i.tags.map(t => "#" + esc(t)).join(" ") : ""}`;

export const PLANNER_HELP = `<b>📒 Content planner</b> (private)
<code>/idea Couple quiz with buzzer #trending</code> — save an idea (category is guessed, tap to change)
<code>/ideas</code> — your idea list · <code>/ideas games</code> — one category
<code>/plan 12 14 15</code> — shoot these this week · <code>/plan 12 sat</code> — on a day · <code>/plan 12 next</code> — next week
<code>/shot 12</code> · <code>/edited 12</code> · <code>/uploaded 12</code> — move it along (several ids ok)
<code>/unplan 12</code> — back to ideas · <code>/drop 12</code> — delete it
<code>/week</code> — this week + category mix vs your targets
<code>/planner</code> — link to your private planner page`;

async function plannerKey(env) {   // secret for the page link, derived from the webhook secret (no extra setup)
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("planner:" + env.WEBHOOK_SECRET));
  return [...new Uint8Array(d)].slice(0, 16).map(b => b.toString(16).padStart(2, "0")).join("");
}

function catButtons(P, idea) {
  const rows = []; let row = [];
  P.categories.forEach(c => { row.push({ text: (idea.cat === c.id ? "✓ " : "") + c.emoji + " " + c.name, callback_data: `pc:${idea.id}:${c.id}` }); if (row.length === 2) { rows.push(row); row = []; } });
  if (row.length) rows.push(row);
  rows.push([{ text: "📅 Shoot this week", callback_data: `pw:${idea.id}` }]);
  return { inline_keyboard: rows };
}

function weekText(P, week) {
  const m = mix(P, week), items = P.ideas.filter(i => i.week === week);
  const order = i => (i.day ? DAYS.indexOf(i.day) : 9) * 10 + STATUSES.indexOf(i.status);
  const L = [`📅 <b>Week of ${weekLabel(week)}</b> — ${m.total} reel${m.total === 1 ? "" : "s"}`,
    `📅 ${m.byStatus.planned} to shoot · 🎥 ${m.byStatus.shot} shot · ✂️ ${m.byStatus.edited} edited · ✅ ${m.byStatus.uploaded} uploaded`, ""];
  items.sort((a, b) => order(a) - order(b)).forEach(i => L.push(line(P, i)));
  if (!items.length) L.push("<i>Nothing planned yet — /ideas then /plan 12 14 …</i>");
  L.push("", "<b>Mix vs target</b>");
  m.rows.forEach(r => L.push(`${r.emoji} ${esc(r.name)}: ${r.n} (${r.pct}% · target ${r.target}%)`));
  if (m.uncategorised) L.push(`❓ No category: ${m.uncategorised}`);
  if (m.next.length) L.push("", "👉 Add next: " + m.next.map(r => `${r.emoji} ${esc(r.name)}`).join(", "));
  return L.join("\n");
}

const ids = s => (String(s).match(/\d+/g) || []).map(Number);

// returns true when the command was a planner command
export async function plannerCommand(cmd, text, env, chat) {
  const arg = text.replace(/^\/\S+\s*/, "").trim();
  const known = ["/idea", "/ideas", "/plan", "/unplan", "/shot", "/edited", "/uploaded", "/posted", "/drop", "/week", "/planner"];
  if (!known.includes(cmd)) return false;
  const P = await load(env);
  try {
    if (cmd === "/planner") {
      const url = `${env.WORKER_URL || ""}/planner?key=${await plannerKey(env)}`;
      await say(env, chat, `📒 Your private planner:\n${esc(url)}\n\nDon't share this link — anyone with it can see and edit your ideas.\n\n${PLANNER_HELP}`);
      return true;
    }
    if (cmd === "/idea") {
      if (!arg) { await say(env, chat, PLANNER_HELP); return true; }
      const i = addIdea(P, arg); await save(env, P);
      await say(env, chat, `💡 Saved <b>#${i.id}</b> ${esc(i.text)}\nCategory: ${catLabel(P, i.cat)}${i.tags.length ? "\nTags: " + i.tags.map(t => "#" + esc(t)).join(" ") : ""}`, { reply_markup: catButtons(P, i) });
      return true;
    }
    if (cmd === "/ideas") {
      const want = arg.toLowerCase();
      const cat = want && P.categories.find(c => c.id === want || c.name.toLowerCase().includes(want));
      const backlog = P.ideas.filter(i => i.status === "idea" && (!cat || i.cat === cat.id));
      const groups = [...P.categories.map(c => [c.id, catLabel(P, c.id)]), [null, "❓ No category"]];
      const L = [`💡 <b>Ideas</b>${cat ? " — " + esc(cat.name) : ""} (${backlog.length})`];
      for (const [id, label] of groups) {
        const g = backlog.filter(i => (i.cat || null) === id || (id === null && i.cat && !P.categories.some(c => c.id === i.cat)));
        if (g.length) L.push("", `<b>${esc(label)}</b>`, ...g.map(i => line(P, i)));
      }
      if (!backlog.length) L.push("<i>None yet — /idea …</i>");
      L.push("", "Pick for this week: <code>/plan 12 14</code>");
      await say(env, chat, L.join("\n")); return true;
    }
    if (cmd === "/week") { await say(env, chat, weekText(P, /next/i.test(arg) ? addWeeks(weekOf(), 1) : weekOf())); return true; }
    const list = ids(arg);
    if (!list.length) { await say(env, chat, `Add the idea number(s), e.g. <code>${cmd} 12</code>`); return true; }
    const nextWeek = /\bnext\b/i.test(arg), day = (arg.toLowerCase().match(/\b(mon|tue|wed|thu|fri|sat|sun)/) || [])[1] || null;
    const done = list.map(id => {
      if (cmd === "/plan") return plan(P, id, nextWeek ? addWeeks(weekOf(), 1) : weekOf(), day);
      if (cmd === "/unplan") return unplan(P, id);
      if (cmd === "/drop") return drop(P, id);
      return setStatus(P, id, cmd === "/posted" ? "uploaded" : cmd.slice(1));
    });
    await save(env, P);
    const verb = { "/plan": nextWeek ? "📅 Planned for next week" : "📅 Planned for this week", "/unplan": "💡 Back to ideas", "/drop": "🗑 Deleted",
      "/shot": "🎥 Shot", "/edited": "✂️ Edited", "/uploaded": "✅ Uploaded", "/posted": "✅ Uploaded" }[cmd];
    await say(env, chat, `${verb}:\n${done.map(i => `<b>#${i.id}</b> ${esc(i.text)}`).join("\n")}` + (cmd === "/drop" ? "" : "\n\n" + weekText(P, done[0].week || weekOf())));
  } catch (e) { await say(env, chat, "⚠️ " + esc(e.message)); }
  return true;
}

export async function plannerButton(q, env) {
  const [kind, id, cat] = String(q.data || "").split(":");
  if (kind !== "pc" && kind !== "pw") return false;
  const P = await load(env);
  try {
    const i = kind === "pc" ? edit(P, id, { cat }) : plan(P, id, weekOf());
    await save(env, P);
    await tg(env, "answerCallbackQuery", { callback_query_id: q.id, text: kind === "pc" ? "Category: " + catLabel(P, i.cat) : "Added to this week" });
    await tg(env, "editMessageText", { chat_id: q.message.chat.id, message_id: q.message.message_id, parse_mode: "HTML",
      text: `💡 <b>#${i.id}</b> ${esc(i.text)}\nCategory: ${catLabel(P, i.cat)}${i.week ? "\n📅 This week" : ""}`, reply_markup: catButtons(P, i) }).catch(() => {});
  } catch (e) { await tg(env, "answerCallbackQuery", { callback_query_id: q.id, text: e.message, show_alert: true }); }
  return true;
}

// ---------------------------------------------------------------- the private page + its API
export async function plannerHttp(req, env, url, page) {
  if (!url.pathname.startsWith("/planner")) return null;
  const key = url.searchParams.get("key") || "";
  if (key !== await plannerKey(env)) return new Response("Not found", { status: 404 });   // looks like nothing's here
  const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "Referrer-Policy": "no-referrer" };
  if (url.pathname === "/planner") return new Response(page, { headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
  if (url.pathname !== "/planner/api") return new Response("Not found", { status: 404 });
  const P = await load(env);
  const reply = () => new Response(JSON.stringify({ ...P, thisWeek: weekOf(), statuses: STATUSES, days: DAYS }), { headers: { ...headers, "Content-Type": "application/json" } });
  if (req.method === "GET") return reply();
  try {
    const a = await req.json();
    if (a.op === "add") addIdea(P, a.text || "", { cat: a.cat || undefined });
    else if (a.op === "status") setStatus(P, a.id, a.status);
    else if (a.op === "plan") plan(P, a.id, a.week || weekOf(), a.day);
    else if (a.op === "unplan") unplan(P, a.id);
    else if (a.op === "edit") edit(P, a.id, a);
    else if (a.op === "drop") drop(P, a.id);
    else if (a.op === "categories") setCategories(P, a.categories || []);
    else throw new Error("Unknown action");
    await save(env, P);
    return reply();
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 400, headers: { ...headers, "Content-Type": "application/json" } });
  }
}
