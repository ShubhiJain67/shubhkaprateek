// Turns data/*.json into assets/js/data.js — the copy of the data every visit loads first, so products show
// instantly. Used by `make ship` (tools/build.mjs) AND the Telegram bot (bot/worker.js): one source of truth.
export const DATA_FILES = ["site", "categories", "products", "reels"];
export const dataJs = data =>
  `// Built from data/*.json by tools/build.mjs / the Telegram bot — don't edit by hand.\nwindow.SKP_SNAPSHOT = ${JSON.stringify(data)};\n`;
