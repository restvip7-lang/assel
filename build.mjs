// Builds dist/: home page, one page per object at /o/<n>/, topic pages, sitemap.xml, robots.txt.
// Every page exists in three languages: Russian at /, English at /en/, Turkish at /tr/ (texts in data/i18n.json).
// Objects live in data/objects.json, contacts and the domain in data/site.json.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { validate } from './lib/objects.js';
import { renderAll, pickPhotos, FORMATS, KINDS } from './lib/promo.js';
import { LANGS, prefix, T, fmt, localize } from './lib/i18n.js';

const root = path.dirname(new URL(import.meta.url).pathname);
const read = f => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
const site = read('data/site.json');
const all = read('data/objects.json');
const objects = all.filter(o => !o.deleted);
const removed = all.filter(o => o.deleted);
// Topic pages per language, in the same order: guides[lang][i] is the same topic.
const guides = Object.fromEntries(LANGS.map(l => [l, read(l === 'ru' ? 'data/guides.json' : `data/guides.${l}.json`)]));
const tpl = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
const dist = path.join(root, 'dist');

const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const eur = p => '€' + Math.round(p).toLocaleString('en-US').replace(/,/g, ' ');
// Keep </script> out of inline JSON.
const js = v => JSON.stringify(v).replace(/</g, '\\u003c');
// Search snippets show about 160 characters: cut at a word.
const cut = (s, n = 160) => (s.length <= n ? s : s.slice(0, n - 1).replace(/[\s,.:;]+\S*$/, '') + '…');
// The same page in every language: { ru: '/o/1/', en: '/en/o/1/', tr: '/tr/o/1/' }.
const alts = rest => Object.fromEntries(LANGS.map(l => [l, prefix(l) + (typeof rest === 'function' ? rest(l) : rest)]));

// Runs the page's own scripts in Node, so the HTML already holds the text and links
// (search engines and link previews see the page without running JavaScript).
function prerender(html, pathname) {
  const [, tail] = html.split('<main id="app"></main>');
  const scripts = [...tail.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const els = {};
  const document = {
    getElementById: id => (els[id] ??= { innerHTML: '', textContent: '', hidden: false, dataset: {} }),
    querySelectorAll: () => [], querySelector: () => null, addEventListener() {}, referrer: '',
  };
  const ctx = { document, URLSearchParams, URL, console, setTimeout() {},
    location: { pathname, search: '', hash: '', host: new URL(site.domain).host, origin: site.domain, href: site.domain + pathname } };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const code of scripts) vm.runInContext(code, ctx);
  if (!els.app?.innerHTML) throw new Error('Пустая страница: ' + pathname);
  return html.replace('<main id="app"></main>', () => `<main id="app">${els.app.innerHTML}</main>`)
    .replace('<div class="bar" id="bar"></div>', () => `<div class="bar" id="bar">${els.bar.innerHTML}</div>`);
}

function page({ lang, title, desc, alt, ogImg, jsonld }) {
  const L = T(lang), P = prefix(lang), url = site.domain + alt[lang];
  const { meta, ...ui } = L;
  const hreflang = LANGS.map(l => `<link rel="alternate" hreflang="${l}" href="${esc(site.domain + alt[l])}">`).join('')
    + `<link rel="alternate" hreflang="x-default" href="${esc(site.domain + alt.ru)}">`
    + LANGS.filter(l => l !== lang).map(l => `<meta property="og:locale:alternate" content="${T(l).ogLocale}">`).join('');
  const langsw = `<details class="lang"><summary aria-label="${esc(L.langAria)}">${lang.toUpperCase()}</summary><div>`
    + LANGS.filter(l => l !== lang).map(l => `<a href="${esc(alt[l])}" hreflang="${l}" lang="${l}">${esc(T(l).langName)}</a>`).join('') + '</div></details>';
  const html = tpl
    .replace(/\{\{(\w+)\}\}/g, (m, k) => (k === 'P' ? P : esc(L[k])))
    .replaceAll('/*LANG*/', lang)
    .replaceAll('/*P*/', P)
    .replaceAll('/*OGLOCALE*/', L.ogLocale)
    .replaceAll('/*TITLE*/', () => esc(title))
    .replaceAll('/*DESC*/', () => esc(desc))
    .replaceAll('/*URL*/', () => esc(url))
    .replaceAll('/*OGIMG*/', () => esc(ogImg))
    .replaceAll('/*ROBOTS*/', site.indexable ? 'index, follow' : 'noindex, nofollow')
    .replace('/*HREFLANG*/', () => hreflang)
    .replace('/*LANGSW*/', () => langsw)
    .replace('/*JSONLD*/', () => js(jsonld))
    .replace('/*L*/{}', () => js(ui))
    .replace('/*OBJECTS*/[]', () => js(objects.map(o => localize(o, lang))))
    .replace('/*GUIDES*/[]', () => js(guides[lang]))
    .replace('/*NAV*/', () => guides[lang].map(g => `<a href="${P}/${g.slug}/">${esc(g.nav)}</a>`).join(''))
    .replace('/*SITE*/{}', () => js({ whatsapp: site.whatsapp, telegram: site.telegram }));
  return prerender(html, alt[lang]);
}

const write = (rel, html) => { const dir = path.join(dist, rel); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'index.html'), html); };

function promoPage(o) {
  const card = (f, k) => `<figure><a href="${f.key}-${k.key}.png" target="_blank"><img src="${f.key}-${k.key}.png" width="${f.w}" height="${f.h}" alt="${esc(k.title)}" loading="lazy"></a>
    <figcaption><b>${esc(k.title)}</b><a class="dl" href="${f.key}-${k.key}.png" download="assel-${o.n}-${f.key}-${k.key}.png">Скачать</a></figcaption></figure>`;
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>Картинки для рекламы №${o.n}</title><link rel="icon" href="/favicon.svg">
<style>:root{--ink:#0E1B2C;--muted:#5B6B7C;--line:#DDE4EA;--coral:#FF6A3D;--bg:#F6F8F9}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1100px;margin:0 auto;padding:32px 16px 64px}h1{font-size:clamp(26px,4vw,40px);margin:0 0 6px}p{color:var(--muted);margin:0 0 8px}a{color:inherit}
section{margin-top:36px}h2{margin:0;font-size:22px}.use{font-size:14px}.row{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:16px;margin-top:12px}
figure{margin:0;background:#fff;border:1px solid var(--line);border-radius:18px;padding:10px;display:flex;flex-direction:column;gap:10px}figure img{width:100%;height:auto;border-radius:12px;display:block}
figcaption{display:flex;justify-content:space-between;align-items:center;gap:10px}.dl{background:var(--coral);color:#fff;text-decoration:none;font-weight:700;padding:9px 18px;border-radius:999px}
.tips{margin-top:40px;background:var(--ink);color:#fff;border-radius:18px;padding:20px 24px}.tips p{color:#cfd8e0}</style></head><body><main>
<p><a href="/o/${o.n}/">← Объект №${o.n}</a></p><h1>Картинки для рекламы №${o.n}</h1><p>${esc(o.name)}, ${esc(o.d)}. Нажмите «Скачать» и выложите в Instagram, WhatsApp или Telegram. В подписи к посту можно дать ссылку на объект: ${esc(site.domain)}/o/${o.n}/</p>
${FORMATS.map(f => `<section><h2>${esc(f.title)}</h2><p class="use">${esc(f.use)} · ${f.w}×${f.h}</p><div class="row">${KINDS.map(k => card(f, k)).join('')}</div></section>`).join('')}
<div class="tips"><b>Подсказка</b><p>4:5 в ленту, 9:16 в сторис и статус WhatsApp, 16:9 в Telegram-канал. Картинки обновляются сами, если поменять цену или данные объекта в боте.</p></div>
</main></body></html>`;
}

function build() {
  const errors = validate(all);
  if (errors.length) { console.error('Ошибки в data/objects.json:\n' + errors.join('\n')); process.exit(1); }

  fs.rmSync(dist, { recursive: true, force: true });
  fs.cpSync(path.join(root, 'public'), dist, { recursive: true });

  const agent = { '@type': 'RealEstateAgent', name: site.name, areaServed: 'Alanya, Antalya, Türkiye', url: site.domain + '/',
    image: site.domain + '/img/assel.jpg', knowsLanguage: ['ru', 'kk', 'tr'], ...(site.whatsapp ? { telephone: '+' + site.whatsapp } : {}) };
  const pages = []; // [{ ru, en, tr }] paths, for the sitemap

  for (const lang of LANGS) {
    const L = T(lang), P = prefix(lang);
    const home = alts('/');
    write(P, page({ lang, title: L.meta.homeTitle, desc: L.meta.homeDesc, alt: home, ogImg: site.domain + '/img/hero.jpg',
      jsonld: { '@context': 'https://schema.org', ...agent, description: L.meta.homeDesc } }));
    if (lang === 'ru') pages.push(home);

    for (const src of objects) {
      const o = localize(src, lang), alt = alts(`/o/${o.n}/`), url = site.domain + alt[lang];
      const photos = o.imgs.filter(k => !k.startsWith('p'));
      const firstPhoto = photos[0] || o.imgs[0];
      const v = { rooms: o.rooms, area: o.area, name: o.name, d: o.dn, price: eur(o.price), n: o.n };
      write(`${P}/o/${o.n}`, page({
        lang, alt,
        title: fmt(o.auto ? L.meta.objTitleAuto : L.meta.objTitle, v),
        desc: cut(fmt(L.meta.objDesc, { ...v, sea: o.sea ? ', ' + fmt(L.seaTxt, { n: o.sea }) : '', desc: o.desc || '' }).trim()),
        ogImg: `${site.domain}/img/${firstPhoto}.jpg`,
        jsonld: {
          '@context': 'https://schema.org', '@type': 'Offer', url, price: o.price, priceCurrency: 'EUR', availability: o.sold ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock',
          seller: agent,
          itemOffered: { '@type': 'Apartment', name: o.auto ? o.name : fmt(L.meta.objName, v), description: o.desc || undefined,
            image: photos.slice(0, 3).map(k => `${site.domain}/img/${k}.jpg`),
            floorSize: { '@type': 'QuantitativeValue', value: o.area, unitCode: 'MTK' },
            address: { '@type': 'PostalAddress', addressLocality: (T('en').districts[src.d] || src.d) + ', Alanya', addressCountry: 'TR' } },
        },
      }));
      if (lang === 'ru') pages.push(alt);
    }

    // Deleted objects: old links from Instagram lead to the home page.
    for (const o of removed) {
      write(`${P}/o/${o.n}`, `<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0;url=${P}/"><link rel="canonical" href="${site.domain}${P}/"><title>Объект снят с продажи</title><a href="${P}/">Объект снят с продажи. Смотрите другие квартиры</a><script>location.replace('${P}/')</script>`);
    }

    guides[lang].forEach((g, i) => {
      const alt = alts(l => `/${guides[l][i].slug}/`), url = site.domain + alt[lang];
      write(`${P}/${g.slug}`, page({
        lang, alt, title: g.title, desc: g.desc, ogImg: site.domain + '/img/hero.jpg',
        jsonld: { '@context': 'https://schema.org', '@type': 'Article', headline: g.h1, description: g.desc, url, inLanguage: lang, author: agent },
      }));
      if (lang === 'ru') pages.push(alt);
    });
  }

  // Pictures for Instagram, WhatsApp and Telegram: /o/<n>/promo/ (not indexed).
  for (const o of objects) {
    const dir = path.join(dist, 'o', String(o.n), 'promo');
    fs.mkdirSync(dir, { recursive: true });
    const keys = pickPhotos(o.imgs);
    const photo = k => fs.readFileSync(path.join(root, 'public/img', k + '.jpg'));
    for (const a of renderAll(o, { photo: photo(keys.photo), info: photo(keys.info) }, site)) fs.writeFileSync(path.join(dir, a.name), a.png);
    fs.writeFileSync(path.join(dir, 'index.html'), promoPage(o));
  }

  // Every language version is listed with links to its translations (hreflang).
  fs.writeFileSync(path.join(dist, 'sitemap.xml'),
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
    pages.flatMap(alt => LANGS.map(l => `  <url><loc>${site.domain}${alt[l]}</loc>` +
      LANGS.map(x => `<xhtml:link rel="alternate" hreflang="${x}" href="${site.domain}${alt[x]}"/>`).join('') +
      `<xhtml:link rel="alternate" hreflang="x-default" href="${site.domain}${alt.ru}"/></url>`)).join('\n') + '\n</urlset>\n');
  fs.writeFileSync(path.join(dist, 'robots.txt'), site.indexable
    ? `User-agent: *\nAllow: /\nSitemap: ${site.domain}/sitemap.xml\n`
    : 'User-agent: *\nDisallow: /\n');

  console.log(`Готово: dist/ — ${pages.length} страниц на ${LANGS.length} языках, объектов: ${objects.length}. Индексация: ${site.indexable ? 'включена' : 'выключена'}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.join(root, 'build.mjs')) build();
