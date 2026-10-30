// Run by `make ship`:
//   • builds assets/js/data.js from data/*.json (so products show instantly)
//   • bumps the ?v= numbers in index.html + 404.html so browsers fetch the new CSS/JS right away
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { DATA_FILES, dataJs } from "./data.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = {};
for (const f of DATA_FILES) {
  try { data[f] = JSON.parse(fs.readFileSync(path.join(root, "data", f + ".json"), "utf8")); }
  catch (e) { console.error(`❌ data/${f}.json has a typo: ${e.message}`); process.exit(1); }
}
fs.writeFileSync(path.join(root, "assets/js/data.js"), dataJs(data));
const version = Math.floor(Date.now() / 1000);
for (const f of ["index.html", "404.html"]) {
  const p = path.join(root, f);
  fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace(/(styles\.css|app\.js)\?v=\d+/g, `$1?v=${version}`));
}
console.log("✓ site built");
