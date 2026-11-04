// Builds assets/js/data.js — the copy of the data every visit loads first (from the database, by make ship), so products show
// instantly. Used by `make ship` (tools/build.mjs) AND the bot behind the dashboard (bot/worker.js): one source of truth.
export const DATA_FILES = ["site", "categories", "products", "reels"];
export const dataJs = data =>
  `// Built from data/*.json by tools/build.mjs / the dashboard — don't edit by hand.\nwindow.SKP_SNAPSHOT = ${JSON.stringify(data)};\n`;
