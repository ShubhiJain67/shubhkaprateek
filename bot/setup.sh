#!/usr/bin/env bash
# One-time setup for the ShubhKaPrateek Telegram bot. Run on your laptop:  bash bot/setup.sh
# Your tokens are typed in here and go straight to Cloudflare as secrets — they're never saved in a file.
set -euo pipefail
cd "$(dirname "$0")"
REPO="ShubhiJain67/shubhkaprateek"

command -v node >/dev/null || { echo "❌ Node.js is needed. Install the LTS version from https://nodejs.org and run this again."; exit 1; }
W() { npx --yes wrangler@4 "$@"; }
j() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const o=JSON.parse(s);console.log(($1)??'')}catch{console.log('')}})"; }

echo; echo "1/7 ☁️  Cloudflare login (a browser tab opens — sign up free if you don't have an account)"
W whoami 2>/dev/null | grep -q "associated with the email" || W login

echo; echo "2/7 🗂  Storage for drafts"
echo "   (first run downloads Cloudflare's tool — can take a minute)"
KV=$(W kv namespace list </dev/null 2>/dev/null | sed -n '/^\[/,$p' | j "o.find(x=>/DRAFTS\$/.test(x.title))?.id")
# </dev/null: newer wrangler asks "add it to wrangler.toml?" — answer it non-interactively so the script can't hang
[ -n "$KV" ] || KV=$(W kv namespace create DRAFTS </dev/null 2>&1 | grep -oE '[0-9a-f]{32}' | head -1)
[ -n "$KV" ] || { echo "❌ Couldn't create the KV namespace — run: npx wrangler kv namespace create DRAFTS"; exit 1; }
node -e "const f='wrangler.toml',fs=require('fs');fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(/^id = \".*\"/m,'id = \"$KV\"'))"
echo "   ✓ $KV"

echo; echo "3/7 🤖 Telegram bot token (from @BotFather → /newbot)"
read -rsp "   Paste the token (hidden): " TG; echo
BOT=$(curl -s "https://api.telegram.org/bot$TG/getMe" | j "o.ok&&o.result.username")
[ -n "$BOT" ] || { echo "❌ That token didn't work. Copy it again from @BotFather."; exit 1; }
echo "   ✓ @$BOT"

echo; echo "4/7 👋 Who can use the bot"
curl -s "https://api.telegram.org/bot$TG/deleteWebhook" >/dev/null
echo "   On your phone open https://t.me/$BOT and send /start"
echo "   (Prateek can send /start too if he should be able to add products.)"
read -rp "   Press Enter once you've sent it… "
IDS=$(curl -s "https://api.telegram.org/bot$TG/getUpdates" | j "[...new Set(o.result.filter(u=>u.message&&u.message.chat.type==='private').map(u=>u.message.chat.id+' '+(u.message.from.first_name||'')))].join('\n')")
[ -n "$IDS" ] || { echo "❌ I didn't see a /start yet. Send it and run this script again."; exit 1; }
echo "$IDS" | sed 's/^/   • /'
read -rp "   Allow all of the above? [Y/n] " OK
[[ "${OK:-y}" =~ ^[Yy]$ ]] || { echo "   Stopping — run again and only send /start from the phones you want."; exit 1; }
CHATS=$(echo "$IDS" | cut -d' ' -f1 | paste -sd, -)

echo; echo "5/7 🔑 GitHub token (fine-grained, only for $REPO, Contents: Read and write)"
read -rsp "   Paste the token (hidden): " GHT; echo
CAN=$(curl -s -H "Authorization: Bearer $GHT" "https://api.github.com/repos/$REPO" | j "o.permissions&&o.permissions.push")
[ "$CAN" = "true" ] || { echo "❌ That token can't write to $REPO. Check: Repository access → $REPO, Permissions → Contents → Read and write."; exit 1; }
echo "   ✓ can write to $REPO"

echo; echo "6/7 🚀 Deploying"
OUT=$(W deploy 2>&1) || { echo "$OUT"; exit 1; }
URL=$(echo "$OUT" | grep -oE 'https://[A-Za-z0-9.-]+\.workers\.dev' | head -1)
[ -n "$URL" ] || { echo "$OUT"; echo "❌ Couldn't find the worker URL above. If Cloudflare asked you to pick a workers.dev subdomain, do that in the dashboard and run again."; exit 1; }
SECRET=$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))")
printf '%s' "$TG"     | W secret put TELEGRAM_TOKEN   >/dev/null
printf '%s' "$GHT"    | W secret put GITHUB_TOKEN     >/dev/null
printf '%s' "$SECRET" | W secret put WEBHOOK_SECRET   >/dev/null
printf '%s' "$CHATS"  | W secret put ALLOWED_CHAT_IDS >/dev/null
echo "   ✓ $URL"

echo; echo "7/7 🔗 Connecting Telegram to the bot"
R=$(curl -s "https://api.telegram.org/bot$TG/setWebhook" --data-urlencode "url=$URL/telegram" --data-urlencode "secret_token=$SECRET" --data-urlencode 'allowed_updates=["message","callback_query"]' --data "drop_pending_updates=true" | j "o.ok")
[ "$R" = "true" ] || { echo "❌ Telegram didn't accept the webhook."; exit 1; }
for c in ${CHATS//,/ }; do curl -s "https://api.telegram.org/bot$TG/sendMessage" --data-urlencode "chat_id=$c" --data-urlencode "text=✅ Your shop bot is live! Send /help to see how to add a reel." >/dev/null; done

echo; echo "✅ All done. Check Telegram — the bot just messaged you."
echo "   Remember: the bot saves to GitHub directly, so run 'git pull' on your laptop before you edit the site files."
