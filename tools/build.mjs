// Run by `make ship`:
//   • refreshes the website's built-in copy of the data (assets/js/data.js) from the database (through the bot's
//     GET /data) — the page shows this copy instantly and if the bot is ever down. Products, reels, brands and
//     categories live in the database now: add/edit them in the dashboard (shubhkaprateek.com/admin), not in files.
//   • also saves that copy into data/categories.json, products.json, reels.json — a backup you can read, never edited by hand
//   • saves the media kit's content (edited in the dashboard) into data/portfolio.json as a backup
//   • copies mediakit.html → collab.html, and bumps the ?v= numbers in index.html + 404.html so browsers fetch new CSS/JS
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { DATA_FILES, dataJs } from "./data.mjs";

const BOT = process.env.SKP_BOT || "https://shubhkaprateek-bot.shubhkaprateek.workers.dev";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = f => path.join(root, "data", f + ".json");
let data = null;
try {
  const r = await fetch(BOT + "/data", { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error("the bot answered " + r.status);
  data = await r.json();
  if (!Array.isArray(data.products) || !Array.isArray(data.reels)) throw new Error("unexpected answer");
  for (const f of ["categories", "products", "reels"]) fs.writeFileSync(file(f), JSON.stringify(data[f], null, 2) + "\n");
  // data/site.json (title, links, form…) is still edited by hand: use your local copy, with Featured from the database
  const local = JSON.parse(fs.readFileSync(file("site"), "utf8"));
  data.site = { ...local, site: { ...(local.site || {}), featured: ((data.site || {}).site || {}).featured || [] } };
  console.log(`✓ data from the database: ${data.products.length} products, ${data.reels.length} reels`);
} catch (e) {
  console.warn(`⚠ Couldn't reach the bot (${e.message}) — building from the last saved copy in data/ instead.`);
  data = {};
  for (const f of DATA_FILES) {
    try { data[f] = JSON.parse(fs.readFileSync(file(f), "utf8")); }
    catch (err) { console.error(`❌ data/${f}.json has a typo: ${err.message}`); process.exit(1); }
  }
}
fs.writeFileSync(path.join(root, "assets/js/data.js"), dataJs(data));
// the media kit's content lives in the database (dashboard → Media kit): keep a backup copy in data/portfolio.json,
// which /mediakit, /collab and /ugc use only if the bot is down
try {
  const r = await fetch(BOT + "/kit", { signal: AbortSignal.timeout(15000) });
  const k = r.ok ? await r.json() : null;
  if (k && k.tagline !== undefined) { const { covers, ...rest } = k; fs.writeFileSync(file("portfolio"), JSON.stringify({ _help: "Backup copy — edit the media kit in the dashboard (shubhkaprateek.com/admin → Media kit), not here. Written by make ship.", ...rest }, null, 2) + "\n"); console.log("✓ media kit backup saved"); }
} catch (e) { console.warn(`⚠ Couldn't back up the media kit (${e.message}) — keeping the old data/portfolio.json`); }
// shubhkaprateek.com/collab is the media kit with packages + prices: the same page, so it's copied from mediakit.html
fs.copyFileSync(path.join(root, "mediakit.html"), path.join(root, "collab.html"));
fs.copyFileSync(path.join(root, "mediakit.html"), path.join(root, "ugc.html"));   // shubhkaprateek.com/ugc — the UGC rate card, same page
const version = Math.floor(Date.now() / 1000);
for (const f of ["index.html", "404.html"]) {
  const p = path.join(root, f);
  fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace(/(styles\.css|app\.js)\?v=\d+/g, `$1?v=${version}`));
}
console.log("✓ site built");
