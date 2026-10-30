// Builds the product data (data/*.json) into index.html, so the page shows products instantly —
// no waiting for 4 downloads (which can stall, e.g. inside Instagram's in-app browser).
// Run automatically by `make ship`; the Telegram bot does the same when it changes data.
// The page still checks the live data/ files in the background and switches to them if they're newer.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = {};
for (const f of ["site", "categories", "products", "reels"]) {
  const file = path.join(root, "data", f + ".json");
  try { data[f] = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (e) { console.error(`❌ data/${f}.json has a typo: ${e.message}`); process.exit(1); }
}
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const out = buildSnapshot(html, data);
fs.writeFileSync(path.join(root, "index.html"), out);
console.log("✓ products built into index.html");

// same function lives in bot/worker.js (buildSnapshot) — keep them in sync
export function buildSnapshot(html, data) {
  const re = /<!-- data-snapshot:start -->[\s\S]*?<!-- data-snapshot:end -->/;
  if (!re.test(html)) throw new Error("index.html is missing the <!-- data-snapshot:start/end --> markers");
  const json = JSON.stringify(data).replace(/</g, "\\u003c");          // can't close the <script> early
  return html.replace(re, () => `<!-- data-snapshot:start -->\n<script id="skp-data" type="application/json">${json}</script>\n<!-- data-snapshot:end -->`);
}
