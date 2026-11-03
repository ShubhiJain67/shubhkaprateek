// Run by `make ship`:
//   • builds assets/js/data.js from data/*.json (so products show instantly)
//   • bumps the ?v= numbers in index.html + 404.html so browsers fetch the new CSS/JS right away
//   • gives every new brand (data/products.json → "brand") its fixed 5-digit page number in bot/brands.json
//     → shubhkaprateek.com/brand/<number>. Existing numbers never change.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { DATA_FILES, dataJs } from "./data.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = {};
for (const f of DATA_FILES) {
  try { data[f] = JSON.parse(fs.readFileSync(path.join(root, "data", f + ".json"), "utf8")); }
  catch (e) { console.error(`❌ data/${f}.json has a typo: ${e.message}`); process.exit(1); }
}
fs.writeFileSync(path.join(root, "assets/js/data.js"), dataJs(data));
// shubhkaprateek.com/collab is the media kit with packages + prices: the same page, so it's copied from mediakit.html
fs.copyFileSync(path.join(root, "mediakit.html"), path.join(root, "collab.html"));
const version = Math.floor(Date.now() / 1000);
for (const f of ["index.html", "404.html"]) {
  const p = path.join(root, f);
  fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace(/(styles\.css|app\.js)\?v=\d+/g, `$1?v=${version}`));
}
// brand page numbers
const slugOf = s => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
const bf = path.join(root, "bot/brands.json");
const B = JSON.parse(fs.readFileSync(bf, "utf8"));
const used = new Set(Object.values(B.brands).map(b => b.id)), fresh = [];
for (const p of data.products) {
  const slug = slugOf(p.brand);
  if (!slug || B.brands[slug]) continue;
  let id; do { id = String(crypto.randomInt(10000, 100000)); } while (used.has(id));
  used.add(id); B.brands[slug] = { name: p.brand.trim(), id, link: `https://shubhkaprateek.com/brand/${id}` }; fresh.push(B.brands[slug]);
}
if (fresh.length) {
  B.brands = Object.fromEntries(Object.entries(B.brands).sort());
  fs.writeFileSync(bf, JSON.stringify(B, null, 2) + "\n");
  for (const b of fresh) console.log(`🏷 New brand page: ${b.name} → https://shubhkaprateek.com/brand/${b.id}`);
}
console.log("✓ site built");
