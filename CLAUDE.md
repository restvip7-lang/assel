# Usmanova Homes

Personal sales site of Assel Usmanova, a real-estate sales manager in Alanya. Goal: a visitor from Instagram,
Google or Yandex opens an object page and writes to Assel in WhatsApp or Telegram. All visitor-facing text is in Russian
(English and Turkish come later). No lead magnets, no sign-up, no pop-ups, no live chat.

## How it works

- `data/objects.json`: every object. The only source of objects.
- `data/site.json`: domain, Assel's WhatsApp number (digits only, e.g. `90555...`), Telegram username, `indexable`.
  While `indexable` is false the site sends `noindex` and robots.txt blocks crawlers. Turn it on only when real objects are in.
- `data/guides.json`: topic pages (Где жить, Инвестиции, Гражданство) at `/<slug>/`, also in the menu and on the home page.
- `src/index.html`: the page template (all CSS and JS inline, no framework).
- `public/`: images (`img/<key>.jpg`) and the favicon, copied as is.
- `build.mjs`: builds `dist/` with the home page, one page per object at `/o/<n>/` (own title, description,
  Open Graph image, JSON-LD), `sitemap.xml` and `robots.txt`. Run `npm run build`.
- Telegram bot (`api/telegram.js`): Assel forwards photos, texts and PDFs; on «Готово» Claude (`lib/parse.js`) extracts
  the fields, the bot shows a preview, corrections are plain messages, «Опубликовать» commits photos to `public/img/o<n>-<i>.jpg`
  and the object to `data/objects.json` through the GitHub API (`lib/gh.js`), and Vercel redeploys. Links in a message (agency object pages) are opened by `lib/page.js`: text and photo URLs go to Claude, which picks the photos; the price is never taken from the page. Commands: /list, /price, /sold, /unsold, /cancel.
  Drafts live in a private Vercel Blob store (`lib/drafts.js`). The first real object removes the `demo: true` examples.
- Leads: the site form posts to `api/lead.js`, which sends the lead (object, UTM source) to Assel in Telegram.
- `api/setup.js`: open `/api/setup/` once after the token changes to register the webhook and the command menu.
- Env vars (Vercel): `TELEGRAM_BOT_TOKEN`, `ADMIN_IDS` (Telegram user ids, comma separated; the first one gets leads
  unless `LEADS_CHAT_ID` is set), `ANTHROPIC_API_KEY`, `GITHUB_TOKEN` (fine-grained, Contents read/write on this repo only),
  `BLOB_READ_WRITE_TOKEN` (added by the Blob store), optional `SITE_URL`.
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
  "imgs": ["c1", "c3", "p1"],   // keys of public/img/*.jpg; keys starting with "p" are floor plans
  "tags": ["Гражданство"], "hot": "Новый",   // «Гражданство» only if the price qualifies (from $400 000); no installment plans on this site
  "video": true, "youtube": "VIDEO_ID",
  "desc": "...", "near": ["Пляж 350 м"]
}
```

Never invent prices, areas or facts Assel did not give. Sold objects stay online (later: a "Продано" state with similar objects).
