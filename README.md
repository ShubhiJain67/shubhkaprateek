# Shubh ka Prateek — Shop our reels

Every reel from @shubhkaprateek, playing on the page, with its products listed underneath. Hosted on GitHub Pages.

## Add a reel (the only thing you ever edit)

Open `products.json` and add an entry to `"reels"` (`id` = highest id + 1; it's only used for ordering, never shown):

```json
{
  "id": 36,
  "reel": "https://www.instagram.com/reel/XXXXXXXXXXX/",
  "title": "Diwali balcony makeover",
  "products": [
    { "name": "Fairy lights", "category": ["home", "marvel"], "link": "https://amzn.to/xxxx", "image": "" }
  ]
}
```

- Each product appears in **both** sections: under its reel in *Shop by reel*, and as a card in *All products* (with a "Watch reel" button that opens the reel on Instagram).
- **Categories:** one (`"home"`) or several (`["home", "marvel"]`). Use a category's id *or* its name. A category that isn't in `"categories"` yet becomes a new tab automatically — add it to `"categories"` only if you want to pick its title/emoji.
- `link` empty → "Link coming soon". The button says "Buy on Amazon / Myntra / …" based on the link. `image` (optional) = product photo URL.
- Reels with an empty `products` list stay in the file but aren't shown. `featured: true` pins a reel to the top.
- Same product in two reels? Use the exact same `name` — it shows once in *All products*.
- Products not from any reel go in the top-level `"products"` list.
- `todo` notes are ignored by the site — reminders for you.
- **Reel cover (optional):** save as `covers/<reel code>.jpg` (code = part after `/reel/` in the link). Otherwise the Instagram video preview is used.

**"Can't find something?" form:** messages go to the email linked to `contact.formKey` (web3forms.com). The key is meant to be public — if it's ever abused, make a new one there and replace it.

**Watch the commas:** every `}` in a list needs a `,` after it except the last one. If the page says "Couldn't load products.json", paste the file into https://jsonlint.com.

## Publish a change

Edit `products.json` on github.com (pencil icon → Commit changes), or locally:

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
