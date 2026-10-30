# ShubhKaPrateek — Shop our reels

Every reel from @shubhkaprateek, playing on the page, with its products listed underneath. Hosted on GitHub Pages.

## Folder structure

```
├── index.html              Page layout (header, sections, menu, forms) — rarely changes
├── data/                   ★ Everything you edit day-to-day — one file per job
│   ├── products.json       Every product ONCE: name, categories, variations (buy link + photo)
│   ├── reels.json          Every reel: Instagram link, title, and the id numbers of its products
│   ├── categories.json     Category tabs: id, name, emoji
│   └── site.json           Site title/tagline/Instagram + "Can't find something?" form settings
├── assets/
│   ├── css/styles.css      Look & feel (colours at the top, dark mode right below)
│   ├── js/app.js           Site logic (loads data/, rendering, search, filters, lazy loading, menu, form)
│   └── covers/             Reel cover images, one per reel: <reel code>.jpg
├── tools/snapshot.mjs      Builds data/ into index.html so products show instantly (make ship runs it)
├── bot/                    Telegram bot (Cloudflare Worker) — add reels from your phone, see bot/README.md
├── CNAME                   Custom domain (shubhkaprateek.com) — don't delete
├── _config.yml             GitHub Pages: keeps bot/, Makefile and README off the public website — don't delete
└── .gitignore              Keeps local junk (.venv, .DS_Store) out of git
```

## 📱 Easiest: the Telegram bot

Send a reel link + products to the bot from your phone, check the preview, tap ✅ — done, laptop not needed.
Setup and how to use it: [`bot/README.md`](bot/README.md). (The bot commits to GitHub, so `git pull` before editing here.)

## Add a product — `data/products.json`

Each product is listed **once**, with a unique number `id` (use the highest id + 1):

```json
{
  "id": 48,
  "name": "Fairy lights",
  "category": ["mugs", "marvel"],
  "variants": [
    { "name": "Default", "link": "https://link.amazon/xxxx", "image": "https://…/lights.jpg" }
  ]
}
```

- **Categories:** use the most specific one — a sub-category id like `"mugs"` (it shows under *Home* automatically), plus a theme like `"marvel"` if it fits. An id/name that isn't in `categories.json` yet becomes a new top-level tab automatically.
- **Variations:** one variant = no option buttons. Add more (and rename "Default", e.g. "Maroon" / "Black") and option buttons appear; each switches the photo and Buy link. A variant with no `link` shows "Link coming soon". The Buy button names the shop from the link.
- A product that isn't in any reel still shows under *All products*.
- Each reel also gets its own page listing all its products: `shubhkaprateek.com/?reel=<reel code>` (handy for captions / link in bio).
- Each product gets its own page too: `shubhkaprateek.com/?product=<id>` — photo, options, Buy button, every reel it's in, and "More in …" rails: same character ("More in Hulk" — names come from `characters` in `data/site.json`), same sub-category ("More in Comforters & Blankets"), then same theme ("More in Marvel"). Empty rails are hidden; each product appears in only one rail.

## Add a reel — `data/reels.json`

```json
{
  "id": 52,
  "reel": "https://www.instagram.com/reel/XXXXXXXXXXX/",
  "title": "Diwali balcony makeover",
  "products": [48, 14]
}
```

- `id` = highest number + 1 (only used for order — higher shows first; never displayed).
- `products` = the product **id numbers** from `products.json`. Reuse them freely — a product in 3 reels is still edited in one place.
- Reels with no products are kept but not shown.
- **Cover:** save the reel's 9:16 cover as `assets/covers/<reel code>.jpg` (code = part after `/reel/`), or the tile falls back to Instagram's squeezed preview.

## Categories & settings

- `data/categories.json` — a tree. Top-level entries are the tabs (order = file order); `sub` lists the sub-categories that appear as a second row when that tab is picked:
  ```json
  { "id": "home", "name": "Home", "emoji": "🏠", "sub": [
    { "id": "bedding", "name": "Comforters & Blankets" },
    { "id": "mugs", "name": "Mugs & Drinkware" }
  ] }
  ```
  `"theme": true` (used on Marvel) marks a collection that cuts across categories — it's still a tab, but on its own it doesn't make two products "similar".
- `data/site.json` — title, tagline, Instagram and YouTube links (remove `youtube` to hide the button), and the contact form (`contact.formKey` = Web3Forms key; meant to be public — regenerate it on web3forms.com if ever abused).
  `"featured": [35]` = product ids shown in the ⭐ Featured tile on the home page (easiest from Telegram: `/feature Hulk Comforter`); `"characters"` = names that get a "More in …" row on product pages.

**Watch the commas:** every `}` in a list needs a `,` after it except the last one. If the page says "Couldn't load data/<file>.json", paste that file into https://jsonlint.com. If a reel lists a product id that isn't in `products.json`, the site skips it and logs a warning in the browser console.

## Publish a change

Edit the files in `data/` on github.com (pencil icon → Commit changes), or locally:

```bash
git add . && git commit -m "Add Diwali reel" && git push origin main
```

Live in ~1 minute.

## Shareable links

- A category: `…/?c=marvel`
- Shop by reel: `…/?view=reels`
- A search: `…/?q=mug`

## Preview locally

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```
