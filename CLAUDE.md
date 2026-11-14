# Usmanova Homes

Personal sales site of Assel Usmanova, a real-estate sales manager in Alanya. Goal: a visitor from Instagram,
Google or Yandex opens an object page and writes to Assel in WhatsApp or Telegram. The site is in three languages:
Russian at `/`, English at `/en/`, Turkish at `/tr/`. No lead magnets, no sign-up, no pop-ups, no live chat.

## How it works

- `data/objects.json`: every object. The only source of objects.
- `data/site.json`: domain, Assel's WhatsApp number (digits only, e.g. `90555...`), Telegram username, `indexable`.
  While `indexable` is false the site sends `noindex` and robots.txt blocks crawlers. Turn it on only when real objects are in.
- `data/guides.json`: topic pages (Где жить, Инвестиции, Гражданство) at `/<slug>/`, also in the menu and on the home page.
  `data/guides.en.json` and `data/guides.tr.json` hold the same topics in the same order with their own slugs.
- `data/i18n.json`: every interface text in `ru`, `en`, `tr` (same keys in each; a test checks it), plus district, tag and badge
  translations. `lib/i18n.js` `localize(o, lang)` turns an object into what a visitor of that language sees: auto titles
  («Квартира 1+1, 35 м²» → «1+1 apartment, 35 m²»), district (`dn`; `d` stays Russian as the filter key), `desc_en`/`desc_tr`,
  `near_en`/`near_tr`. A tag, badge or «nearby» item without a translation is left out, never guessed.
  When you add or change a text in the template, use `L.key` (or `{{key}}` in the static HTML) and add the key to all three languages.
- `src/index.html`: the page template (all CSS and JS inline, no framework).
- `public/`: images (`img/<key>.jpg`) and the favicon, copied as is.
- `build.mjs`: builds `dist/` with the home page, one page per object at `/o/<n>/` (own title, description,
  Open Graph image, JSON-LD) and the topic pages, each in three languages, plus `sitemap.xml` and `robots.txt`. Run `npm run build`.
  SEO: every page has a canonical URL, `hreflang` links to its translations (also in the sitemap), and its text is prerendered
  into the HTML (the build runs the template's own scripts in `node:vm`), so crawlers do not need JavaScript.
  Short links for Instagram stay `/o/<n>/` (Russian); the language menu in the header leads to the same page in another language.
- Telegram bot (`api/telegram.js`): Assel forwards photos, texts and PDFs; on «Готово» Claude (`lib/parse.js`) extracts
  the fields, the bot shows a preview, corrections are plain messages, «Опубликовать» commits photos to `public/img/o<n>-<i>.jpg`
  and the object to `data/objects.json` through the GitHub API (`lib/gh.js`), and Vercel redeploys. Links in a message (agency object pages) are opened by `lib/page.js`: text and photo URLs go to Claude, which picks the photos; the price is never taken from the page. Commands: /list, /price, /sold, /unsold, /cancel. The complex name is optional: without it the object is titled «Квартира 1+1, 35 м²» (`autoName`). The preview ends with «Опубликовать» / «Удалить».
  Published objects: Assel sends «1», «№1» or a site link /o/1/ and gets a card with «Изменить» (free-text change → Claude → diff → «Сохранить»; new photos → add or replace), «Продано»/«В продажу», «Удалить» (asks first). Edit sessions live in `drafts/<chat>/edit/` and expire after 30 min. A deleted object stays in objects.json as a stub `{ n, deleted: true }`: its number is never reused and /o/<n>/ redirects to the home page.
  Claude spending (`lib/cost.js`): every call's cost comes from `usage` at claude-opus-5-5 prices; the publish/save reply says what it cost. Anthropic has no balance API, so `/balance 20` records the balance after a top-up, each call subtracts from it (Blob `billing/state.json`), and all admins get one warning below $1; a "credit balance too low" API error also alerts admins.
  Pictures for ads (`lib/promo.js`, SVG templates rendered with resvg, fonts in `fonts/`): 4:5, 9:16 and 16:9, each as «photo and price» and «infographic». The build writes them to `/o/<n>/promo/` (a page with download buttons); the bot sends them as files right after publishing and on the card button «Картинки для Instagram». Text stays inside Instagram safe zones (`SAFE` in promo.js): on 9:16 the top 300 px, the bottom 670 px and the right 150 px are covered by Instagram buttons, so only the photo goes there; on 4:5 keep ~100 px top and bottom for the 3:4 profile grid crop.
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
  "desc": "...", "near": ["Пляж 350 м"],
  "desc_en": "...", "desc_tr": "...", "near_en": ["Beach 350 m"], "near_tr": ["Plaj 350 m"]   // written by the bot
}
```

Never invent prices, areas or facts Assel did not give. Sold objects stay online (later: a "Продано" state with similar objects).
