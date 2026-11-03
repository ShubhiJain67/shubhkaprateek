#!/usr/bin/env bash
# One-time setup for the bot behind the dashboard. Run on your laptop:  bash bot/setup.sh
# Your token + passcode are typed in here and go straight to Cloudflare as secrets — they're never saved in a file.
set -euo pipefail
cd "$(dirname "$0")"
REPO="ShubhiJain67/shubhkaprateek"

command -v node >/dev/null || { echo "❌ Node.js is needed. Install the LTS version from https://nodejs.org and run this again."; exit 1; }
W() { npx --yes wrangler@4 "$@"; }
j() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const o=JSON.parse(s);console.log(($1)??'')}catch{console.log('')}})"; }

echo; echo "1/4 ☁️  Cloudflare login (a browser tab opens)"
W whoami 2>/dev/null | grep -q "associated with the email" || W login

echo; echo "2/4 🗂  Cache for the brand pages"
KV=$(W kv namespace list </dev/null 2>/dev/null | sed -n '/^\[/,$p' | j "o.find(x=>/DRAFTS\$/.test(x.title))?.id")
[ -n "$KV" ] || KV=$(W kv namespace create DRAFTS </dev/null 2>&1 | grep -oE '[0-9a-f]{32}' | head -1)
[ -n "$KV" ] || { echo "❌ Couldn't create the KV namespace — run: npx wrangler kv namespace create DRAFTS"; exit 1; }
node -e "const f='wrangler.toml',fs=require('fs');fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(/^id = \".*\"/m,'id = \"$KV\"'))"
echo "   ✓ $KV"

echo; echo "3/4 🔑 GitHub token (fine-grained, only for $REPO, Contents: Read and write)"
read -rsp "   Paste the token (hidden): " GHT; echo
CAN=$(curl -s -H "Authorization: Bearer $GHT" "https://api.github.com/repos/$REPO" | j "o.permissions&&o.permissions.push")
[ "$CAN" = "true" ] || { echo "❌ That token can't write to $REPO. Check: Repository access → $REPO, Permissions → Contents → Read and write."; exit 1; }
read -rsp "   Pick a passcode for the dashboard (hidden): " PASS; echo

echo; echo "4/4 🚀 Deploying"
W deploy >/dev/null
printf '%s' "$GHT"  | W secret put GITHUB_TOKEN   >/dev/null
printf '%s' "$PASS" | W secret put ADMIN_PASSCODE >/dev/null
echo; echo "✅ All done. Open https://shubhkaprateek.com/admin and log in with your passcode."
