# ShubhKaPrateek — Shop our reels

Every reel from @shubhkaprateek, playing on the page, with its products listed underneath. Hosted on GitHub Pages.

## Folder structure

```
├── index.html              Page layout (header, sections, menu, forms) — rarely changes
├── data/
│   ├── site.json           ✏️ Site title/tagline/Instagram + contact form settings (still edited by hand)
│   ├── portfolio.json      ✏️ The media kit's stats, packages, guidelines, best reels (still edited by hand)
│   └── products.json, reels.json, categories.json
│                           🔒 Backup copies only — written by `make ship` from the database. Don't edit.
├── assets/
│   ├── css/styles.css      Look & feel (colours at the top, dark mode right below)
│   ├── js/app.js           Site logic (loads the data, rendering, search, filters, lazy loading, menu, form)
│   ├── js/data.js          ⚙️ The site's built-in copy of the data (shown instantly / if the bot is down) — don't edit
│   └── covers/             Covers of older reels (new ones are kept in the database)
├── 404.html                "Page not found" — also opens /reel/<code>, /product/<id>, /go/<id>, /brand/<number> links
├── tools/build.mjs         `make ship` runs it: refreshes data.js + the backup copies from the database
├── admin.html              🗂 Your dashboard: shubhkaprateek.com/admin — deals, products, reels, brands, categories, money
├── brand.html              Brand pages: shubhkaprateek.com/brand/<number> — products, reels, live clicks
├── mediakit.html           Media kit for brands (data/portfolio.json): /mediakit = for pitching (no prices),
│                           /collab = same page + packages & prices (collab.html is copied from it on make ship)
│                           /ugc    = same page + UGC packages & prices (ugc.html, copied on make ship; data in portfolio.json → ugc)
├── portfolio.html          Old address — redirects to /mediakit
├── bot/                    The back end (Cloudflare Worker + database) — see bot/README.md
├── CNAME                   Custom domain (shubhkaprateek.com) — don't delete
├── _config.yml             GitHub Pages: keeps bot/, Makefile and README off the public website — don't delete
└── .gitignore              Keeps local junk (.venv, .DS_Store) out of git
```

## 🗂 Easiest: the dashboard

Everything — deals, products, reels, categories, featured, brand pages, money — is done at **shubhkaprateek.com/admin**,
from your phone or laptop. It saves straight to GitHub, so `git pull` before editing files here by hand.

## Products, reels, brands, categories

They live in the **database** now — add, edit and delete them in the dashboard (shubhkaprateek.com/admin).
Saving there is **not** a deployment: the website reads the database live and shows the change within seconds.
`make ship` is only for code/design changes (and it refreshes the site's built-in copy + the backup files).

- Each reel gets its own page: `shubhkaprateek.com/reel/<reel code>`, each product too: `shubhkaprateek.com/product/<id>`.
- Tracked buy links: `shubhkaprateek.com/go/<product id>` (counted for the brand pages).

## Categories & settings

- Categories are edited in the dashboard (Categories page). How they work: a tree. Top-level entries are the tabs (order = file order); `sub` lists the sub-categories that appear as a second row when that tab is picked:
  ```json
  { "id": "home", "name": "Home", "emoji": "🏠", "sub": [
    { "id": "bedding", "name": "Comforters & Blankets" },
    { "id": "mugs", "name": "Mugs & Drinkware" }
  ] }
  ```
  `"theme": true` (used on Marvel) marks a collection that cuts across categories — it's still a tab, but on its own it doesn't make two products "similar".
- `data/site.json` — title, tagline, Instagram and YouTube links (remove `youtube` to hide the button), and the contact form (`contact.formKey` = Web3Forms key; meant to be public — regenerate it on web3forms.com if ever abused).
  `"featured": [35]` = product ids shown in the ⭐ Featured tile on the home page (easiest from the dashboard: ⭐ on the Products page); `"characters"` = names that get a "More in …" row on product pages.

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
