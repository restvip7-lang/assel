# Usmanova Homes

Personal sales site of Assel Usmanova, a real-estate sales manager in Alanya. Goal: a visitor from Instagram,
Google or Yandex opens an object page and writes to Assel in WhatsApp or Telegram. All visitor-facing text is in Russian
(English and Turkish come later). No lead magnets, no sign-up, no pop-ups, no live chat.

## How it works

- `data/objects.json`: every object. The only source of objects.
- `data/site.json`: domain, Assel's WhatsApp number (digits only, e.g. `90555...`), Telegram username, `indexable`.
  While `indexable` is false the site sends `noindex` and robots.txt blocks crawlers. Turn it on only when real objects are in.
- `src/index.html`: the page template (all CSS and JS inline, no framework).
- `public/`: images (`img/<key>.jpg`) and the favicon, copied as is.
- `build.mjs`: builds `dist/` with the home page, one page per object at `/o/<n>/` (own title, description,
  Open Graph image, JSON-LD), `sitemap.xml` and `robots.txt`. Run `npm run build`.
- Tests: `npm test`. Run tests and the build before every push. Vercel builds from `main`.

## Object fields

```json
{
  "n": 12,                      // short public number, used in links /o/12/ and in Instagram posts
  "name": "Sea Line",           // complex name (shown); never the exact address
  "d": "Махмутлар",             // district
  "owner": true,                // true = from the owner (resale), omit = from the developer
  "price": 139000, "rooms": "1+1", "area": 58, "sea": 350,
  "floor": "4 из 9", "year": "2026 | Сдан",
  "inst": { "first": "40%", "months": 18 },   // developer installment plan, or null
  "imgs": ["c1", "c3", "p1"],   // keys of public/img/*.jpg; keys starting with "p" are floor plans
  "tags": ["Рассрочка"], "hot": "Новый",
  "video": true, "youtube": "VIDEO_ID",
  "desc": "...", "near": ["Пляж 350 м"]
}
```

Never invent prices, areas or facts Assel did not give. Sold objects stay online (later: a "Продано" state with similar objects).
