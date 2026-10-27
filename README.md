# Shubh ka Prateek — Shop page

Everything shared on @shubhkaprateek, in one place. Hosted on GitHub Pages.

## Add a product (the only thing you ever edit)

Open `products.json` and add an entry to `"products"`:

```json
{
  "id": 4,
  "name": "Fairy lights for the balcony",
  "category": "home",
  "link": "https://amzn.to/xxxx",
  "image": "https://m.media-amazon.com/images/I/xxxx.jpg",
  "price": "₹499",
  "note": "From our Diwali decor reel",
  "featured": false
}
```

| Field | Required | What it does |
|---|---|---|
| `id` | yes | Unique number. Shown on the card as `#4`, so you can say "search 4 on the link in bio". Newest (highest) shows first. |
| `name` | yes | Product name |
| `category` | yes | Must match an `id` in `"categories"` |
| `link` | yes | Where "Shop →" goes (affiliate link etc.) |
| `image` | no | Direct image URL. Empty = category emoji placeholder |
| `price` | no | Any text, e.g. `"₹499"` |
| `note` | no | One line, e.g. which reel it was in |
| `featured` | no | `true` pins it to the top with a ★ badge |

**Getting an image URL:** open the product page → right-click the main photo → "Copy image address".

**New category:** add `{ "id": "beauty", "name": "Beauty", "emoji": "💄" }` to `"categories"`. Categories with no products are hidden automatically.

**Watch the commas:** every entry except the last one in a list needs a `,` after its `}`. If the page says "Couldn't load products.json", it's almost always a missing/extra comma — paste the file into https://jsonlint.com to find it.

## Publish a change

Either edit `products.json` directly on github.com (pencil icon → Commit changes), or locally:

```bash
git add products.json && git commit -m "Add fairy lights" && git push
```

The live site updates in ~1 minute.

## Shareable links

- Category: `…/?c=home`
- A specific product: `…/?q=4`

## Preview locally

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```
(Opening `index.html` directly by double-click won't load the JSON — use the command above.)
