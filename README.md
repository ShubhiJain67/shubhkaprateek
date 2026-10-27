# Shubh ka Prateek — Shop our reels

Every reel from @shubhkaprateek, playing on the page, with its products listed underneath. Hosted on GitHub Pages.

## Add a reel (the only thing you ever edit)

Open `products.json` and add an entry to `"reels"`:

```json
{
  "id": 2,
  "reel": "https://www.instagram.com/reel/C9abcXYZ123/",
  "category": "home",
  "title": "Diwali balcony makeover",
  "products": [
    { "name": "Fairy lights", "link": "https://amzn.to/xxxx", "price": "₹499" },
    { "name": "Brass diyas (set of 6)", "link": "https://amzn.to/yyyy", "price": "₹349" }
  ]
}
```

| Field | Required | What it does |
|---|---|---|
| `id` | yes | Unique number, shown as `#2`. Say "search 2 at the link in bio" in your caption. Highest number shows first. |
| `reel` | yes | The reel's link — on Instagram tap ⋯ → Copy link, paste as-is. Reel must be public. |
| `category` | yes | Must match an `id` in `"categories"` |
| `title` | no | Short heading above the reel |
| `products` | yes | List of items in that reel: `name`, `link` required; `price`, `image` optional |
| `featured` | no | `true` pins the reel to the top |

**New category:** add `{ "id": "beauty", "name": "Beauty", "emoji": "💄" }` to `"categories"`. Empty categories are hidden automatically.

**Watch the commas:** every `}` in a list needs a `,` after it — except the last one. If the page says "Couldn't load products.json", paste the file into https://jsonlint.com to find the typo.

## Publish a change

Edit `products.json` on github.com (pencil icon → Commit changes), or locally:

```bash
git add products.json && git commit -m "Add Diwali reel" && git push
```

Live in ~1 minute.

## Shareable links

- Category: `…/?c=home`
- One reel: `…/?q=2`

## Preview locally

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```
