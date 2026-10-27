# Shubh ka Prateek — Shop our reels

Every reel from @shubhkaprateek, playing on the page, with its products listed underneath. Hosted on GitHub Pages.

## Add a reel (the only thing you ever edit)

Open `products.json` and add an entry to `"reels"` (next number = highest `id` + 1):

```json
{
  "id": 36,
  "reel": "https://www.instagram.com/reel/XXXXXXXXXXX/",
  "title": "Diwali balcony makeover",
  "products": [
    { "name": "Fairy lights", "category": "home", "link": "https://amzn.to/xxxx", "price": "₹499" }
  ]
}
```

- Each product automatically appears in **both** sections: under its reel in *Shop by reel*, and as a card in *Shop products* (with a "Seen in reel #36" link).
- Reels with an empty `products` list are kept in the file but **not shown** on the site.
- `link` empty → button shows "Link soon". `image` (optional) adds a photo to the product card.
- `category` must match an `id` in `"categories"`. `featured: true` pins a reel to the top.
- Same product in two reels? Use the exact same `name` — it shows once in *Shop products*.
- Products not from any reel go in the top-level `"products"` list (same fields).
- `todo` notes are ignored by the site — they're reminders for you.

**Watch the commas:** every `}` in a list needs a `,` after it except the last one. If the page says "Couldn't load products.json", paste the file into https://jsonlint.com.

## Publish a change

Edit `products.json` on github.com (pencil icon → Commit changes), or locally:

```bash
git add products.json && git commit -m "Add Diwali reel" && git push
```

Live in ~1 minute.

## Shareable links

- Category: `…/?c=home`
- One reel: `…/?q=26`
- Products section: `…/?view=products`

## Preview locally

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```
