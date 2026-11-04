# 🗂 The bot — the back end of your dashboard

Everything is done from the dashboard: **shubhkaprateek.com/admin** (log in with your passcode).
This folder is the Cloudflare Worker behind it (free plan — works even when your laptop is off). It:

- keeps **everything** in the Cloudflare database (`skp-stats`): products, brands (with their page numbers), reels,
  categories, featured, uploaded photos + reel covers, deals, enquiries and click counts (`store.js`),
- serves it to the website live at `/data` (cached copy, rebuilt after every save — no deployment), photos at `/img/…`,
- reads product pages (photo, name, store, categories) and reel covers + titles when you add them in the dashboard,
- runs the brand pages (`/brand/<number>`), the click counter and the media kit's enquiry form,
- keeps the media kit's **brand collabs** + **brands we've worked with** in sync with your Live/Delivered deals,
- sends you two **Telegram notifications** (that's all Telegram does now): 🚀 *Live on shubhkaprateek.com* after every
  deploy, and 📩 *New enquiry* when a brand sends the media kit form.

| File | What it is |
|---|---|
| `worker.js` | the entry point (routes) + reading product/reel pages |
| `store.js` | the database: products, brands, reels, categories, featured, photos — and the website's `/data` |
| `admin.js` | the dashboard's API (`/admin/api`) and the enquiry form (`/enquiry`) |
| `report.js` | brand pages (`/brand/api`) and the click counter (`/hit`) |
| `brands.json` | old list of brand page numbers — only used once, to move them into the database |
| `import-*.sql` | one-time imports of past deals (`npx wrangler d1 execute skp-stats --remote --file=…`) |

## Secrets (set once, never in a file)

```bash
cd ~/Desktop/shubhkaprateek/bot
npx wrangler secret put GITHUB_TOKEN     # fine-grained token: only this repo, Contents → Read and write
npx wrangler secret put ADMIN_PASSCODE   # the dashboard's passcode
# notifications (already set if you had the Telegram bot):
npx wrangler secret put TELEGRAM_TOKEN   # from @BotFather
npx wrangler secret put ALLOWED_CHAT_IDS # your Telegram chat id(s), comma separated
npx wrangler secret put NOTIFY_KEY       # any password — also save it on GitHub: Settings → Secrets → Actions → NOTIFY_KEY
```

`make ship` deploys the bot every time. The very first time the new bot runs, it copies data/*.json + brands.json into the database (once).
If a token ever leaks: delete it on GitHub, make a new one, and run the `secret put` line again.
