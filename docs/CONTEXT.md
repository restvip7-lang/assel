# Project context

What a new session needs besides the code: who the people are, what was decided and why, what is live, what is open.
`CLAUDE.md` explains how the code works; this file explains the project. Keep it current: when a decision is made or a
backlog item is closed, edit the line here in the same commit. No secrets, tokens or Telegram ids in this file.

Last updated: 2026-11-14.

## People and how to work with them

- **Anuar**: owner of the project and the only person who gives tasks. Writes in Russian (often by voice, expect typos);
  reply in Russian, short and plain. He is the IT person at a real-estate agency in Alanya and builds this site himself with Claude.
- **Assel Usmanova** (spelling: Assel / Асель, never Aisel): sales manager in Alanya, the face of the site. She uses only
  the Telegram bot; she does not touch the code. Lives in Alanya about 9 years, 20+ deals, speaks Russian, Kazakh and Turkish
  (not English). Her agency is Point Property (pointproperty.com); she picks her own objects from owners and developers.
- Working style: big ideas are discussed and planned first, then built. Small reversible changes: just do them and say what changed.
- Ask before anything that costs money or touches accounts: buying a domain, billing, infrastructure. Anuar puts secrets
  into Vercel himself; never print or open tokens.
- Instagram publishing only after an explicit «да» for each post.

## What the site must be

- Selling and convenient first: a clear offer, filters, WhatsApp and Telegram on every card, trust blocks. Character only in details.
  (Earlier «art concept» prototypes were rejected as weak for sales.)
- Sales only, no rentals. No lead magnets, no sign-up, no pop-ups, no live chat, no online deposits, no installment plans.
- Copy speaks as Assel in the first person («я проверю», «напишите мне»). Her name appears only in the header, the signature
  and the visitor's prefilled message.
- Complex name is shown, the exact address never (district and an approximate map spot).
- Never invent facts: prices, areas, reviews, numbers. Placeholders are marked as drafts on the page.
- Design: ink #0E1B2C, sea #0A7C86 / #35B6C0, coral #FF6A3D, cream #F5F1EA; fonts Prata (display) and Onest (body).
  Logo: a teal house with a coral sun and rays behind it. Modern motion is welcome (GSAP, Lenis, View Transitions) with fallbacks.
- Mobile first: most visitors come from Instagram on a phone.

## What is live

- Repo `restvip7-lang/assel`, branch `main` deploys to Vercel project `assel` (Anuar's Hobby account; his choice, move to Pro or
  Cloudflare Pages if Vercel objects to commercial use). Site: https://assel-chi.vercel.app
- Three languages: `/`, `/en/`, `/tr/`. Turkish and English were translated by Claude and not yet proofread.
- Telegram bot @asselweb_bot: Assel forwards photos, text, PDFs or a link to an agency page; the bot builds the object,
  she corrects it in plain words and publishes. She can edit, mark sold or delete published objects, and gets leads from the site form.
  Both Assel and Anuar are admins; Assel is first in `ADMIN_IDS`, so leads go to her.
- The bot reports what each publication cost and keeps its own balance ledger (`/balance 20` after each top-up of the
  Anthropic account, because there is no balance API); admins get a warning below $1.
- Pictures for Instagram, WhatsApp and Telegram for every object (4:5, 9:16, 16:9) at `/o/<n>/promo/`, also sent by the bot.
- Real objects: №1 (Gazipasa, 1+1) and №2 (Cleopatra, 1+1). Their photos carry the Point Property watermark.
- Indexing is off (`indexable: false`) until the site has its own domain.

## Open items

1. **Domain**: proposed `usmanovahomes.com` (domains starting with «assel…» were rejected: reads badly in English).
   Waiting for Anuar's «да»; nothing bought. After that: set `domain` in `data/site.json`, turn on `indexable`,
   register in Google Search Console and Yandex Webmaster. A custom domain should also fix the `ERR_SSL_PROTOCOL_ERROR`
   Anuar sees on `*.vercel.app` (his network blocks it; the site itself is fine).
2. **Turkish proofreading** by Assel.
3. **Watermark**: best fix is clean originals from the agency (bot: «1» → «Изменить» → new photos → «Заменить все»).
   Offered: a bot warning when a photo seems to carry another agency's watermark. Not built.
4. **Promo pictures redesign**: Anuar finds too much empty space; wants it filled with neat infographics. Show two or three
   variants before building. Rule that stays: no text under Instagram's own buttons (see `SAFE` in `lib/promo.js`).
5. **Real content**: client reviews, FAQ answers and the citizenship guide are drafts for Assel to confirm
   (claims to check: «отвечаю в течение часа», «20+ семей», «без доплат за подбор»).
6. **Reels and posts agent**: decided to reuse Anuar's HyperFrames studio (`C:\Users\Manager\Documents\web\Insta` on his laptop,
   already used for another client), rendered and published locally, no cloud server and no budget for one.
   Needs a brand file and style for Assel and her own Instagram Business account and token. Only planned so far.
7. **Object videos**: hosted on YouTube (Assel's channel); the object field `youtube` exists, upload flow not built.
8. Small: reopen `/api/setup/` so `/balance` shows in the bot's command menu; consider removing `api/peek.js`;
   lead-source statistics and a weekly summary to Assel were proposed, not built.

## Lessons from this project

- GitHub pushes sometimes return 503: retry a few times.
- An env var change in Vercel needs a new production deployment.
- The bot commits to `main` through the GitHub API: always pull (rebase) before pushing.
- Anuar judges by phone screenshots: check every visual change at phone width before reporting.
