# 🤖 Shop bot — add reels from your phone

Send the bot a reel link + products on Telegram → it finds the photos, names, store and categories →
shows you a preview → you tap **✅ Add to site** → it saves to GitHub and the site updates in ~1 minute.
Runs on Cloudflare's free plan, so it works even when your laptop is off. No AI, no cost.

## One-time setup (~15 minutes, on your laptop)

**1. Make the Telegram bot** — in Telegram open **@BotFather** → `/newbot` → pick a name (e.g. *ShubhKaPrateek Shop*)
and a username ending in `bot` → copy the **token** it gives you.

**2. Make a GitHub token** — github.com → your photo → **Settings → Developer settings → Personal access tokens →
Fine-grained tokens → Generate new token**
- Token name: `shop bot` · Expiration: 1 year (set a reminder to renew)
- Repository access: **Only select repositories → shubhkaprateek**
- Permissions → Repository permissions → **Contents → Read and write** (nothing else)
- Generate → copy the token

**3. Run the setup** (needs Node.js — install the LTS from nodejs.org if `node -v` doesn't work):
```bash
cd ~/Desktop/shubhkaprateek
bash bot/setup.sh
```
It logs you in to Cloudflare (free account), asks for the two tokens (typed hidden, never saved to a file),
asks you to send `/start` to your bot so it knows it's you, deploys, and the bot messages you when it's live.
Then commit the updated `bot/wrangler.toml` (it now has your storage id — that's not a secret).

## Using it

```
https://www.instagram.com/reel/ABC123/
Hulk Comforter - https://amzn.to/xxxx
Thor mug https://amzn.to/yyyy
Balloons (Golden) - https://amzn.to/aaa
Balloons (Silver) - https://amzn.to/bbb
Dice
```
- One product per line. A line with only a link works too (the name is read from the page).
- `(Golden)` = a variation of the same product.
- A name with no link that's already on the site (`Dice`) just gets this reel added to it.
- Same product link as an existing product → reused, not duplicated.

The bot sends the photos it found + a preview. Fix things by replying:

| Reply | Does |
|---|---|
| `title Marvel movie night` | reel title |
| `name 2 Thor mug` | product name |
| `cat 2 mugs marvel` | categories (`/cats` lists the ids) |
| `link 2 https://…` | replace a link (re-reads photo/name) |
| `img 2 https://….jpg` | use this photo |
| photo with caption `2` | upload your own photo for product 2 |
| photo with caption `cover` | upload the reel cover (screenshot) |
| `remove 2` | drop product 2 |
| `/preview` · `/cancel` · `/help` | show again · drop draft · help |

Then tap **✅ Add to site**.

### Removing things

| Send | Removes |
|---|---|
| `/delete https://www.instagram.com/reel/ABC123/` | the reel + its products that **aren't in any other reel** (shared ones stay) |
| `/delete Green Saree` or `/delete 48` | the product, from every reel; a reel left with **no products** is removed too |

The bot first shows exactly what will go (and what stays) → tap **🗑 Yes, remove** or **Keep it**.
Bot-uploaded covers/photos of removed items are deleted too. A name that matches several products → it lists them with ids.

**Good to know**
- **Amazon & Instagram sometimes block bots.** The bot tries a backup for Amazon photos; if a photo or the cover
  shows ❌ in the preview, send a screenshot with the caption as above. No cover → the site shows the Instagram preview.
- **Categories** come from the `keywords` in `data/categories.json` (the word that comes *last* in the name wins —
  "Coloring blanket" → blanket). Add words there to teach it.
- **Run `git pull` on your laptop before editing site files** — the bot commits to GitHub directly.
- Only the Telegram accounts that sent `/start` during setup can use it. To add someone later, run `bash bot/setup.sh` again.
- If you ever leak a token: revoke it (BotFather `/revoke`, or delete it on GitHub) and run `bash bot/setup.sh` again.
