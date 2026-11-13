// Builds dist/: home page, one page per object at /o/<n>/, sitemap.xml, robots.txt.
// Objects live in data/objects.json, contacts and the domain in data/site.json.
import fs from 'node:fs';
import path from 'node:path';
import { validate } from './lib/objects.js';
import { renderAll, pickPhotos, FORMATS, KINDS } from './lib/promo.js';

const root = path.dirname(new URL(import.meta.url).pathname);
const read = f => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
const site = read('data/site.json');
const all = read('data/objects.json');
const objects = all.filter(o => !o.deleted);
const removed = all.filter(o => o.deleted);
const guides = read('data/guides.json');
const tpl = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
const dist = path.join(root, 'dist');

const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const eur = p => '€' + Math.round(p).toLocaleString('en-US').replace(/,/g, ' ');
// Keep </script> out of inline JSON.
const js = v => JSON.stringify(v).replace(/</g, '\\u003c');

function page({ title, desc, url, ogImg, jsonld }) {
  return tpl
    .replaceAll('/*TITLE*/', esc(title))
    .replaceAll('/*DESC*/', esc(desc))
    .replaceAll('/*URL*/', esc(url))
    .replaceAll('/*OGIMG*/', esc(ogImg))
    .replaceAll('/*ROBOTS*/', site.indexable ? 'index, follow' : 'noindex, nofollow')
    .replace('/*JSONLD*/', js(jsonld))
    .replace('/*OBJECTS*/[]', js(objects))
    .replace('/*GUIDES*/[]', js(guides))
    .replace('/*NAV*/', guides.map(g => `<a href="/${g.slug}/">${esc(g.nav)}</a>`).join(''))
    .replace('/*SITE*/{}', js({ whatsapp: site.whatsapp, telegram: site.telegram }));
}

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

  const agent = { '@type': 'RealEstateAgent', name: site.name, areaServed: 'Alanya, Antalya, Türkiye', url: site.domain + '/' };
  fs.writeFileSync(path.join(dist, 'index.html'), page({
    title: 'Квартиры в Алании от собственников и застройщиков | Assel Usmanova',
    desc: 'Подберу квартиру в Алании под ваш бюджет: новостройки и вторичка у моря, помощь с ВНЖ и гражданством. Пишите в WhatsApp или Telegram.',
    url: site.domain + '/',
    ogImg: site.domain + '/img/hero.jpg',
    jsonld: { '@context': 'https://schema.org', ...agent },
  }));

  for (const o of objects) {
    const dir = path.join(dist, 'o', String(o.n));
    fs.mkdirSync(dir, { recursive: true });
    const url = `${site.domain}/o/${o.n}/`;
    const firstPhoto = o.imgs.find(k => !k.startsWith('p')) || o.imgs[0];
    fs.writeFileSync(path.join(dir, 'index.html'), page({
      title: `${o.rooms}, ${o.area} м² в ${o.name}, ${o.d}: ${eur(o.price)} | №${o.n}`,
      desc: [`${o.rooms}, ${o.area} м²`, o.sea && `${o.sea} м до моря`, `${o.d}, Алания. ${o.desc || ''}`].filter(Boolean).join(', ').slice(0, 300),
      url,
      ogImg: `${site.domain}/img/${firstPhoto}.jpg`,
      jsonld: {
        '@context': 'https://schema.org', '@type': 'Offer', url, price: o.price, priceCurrency: 'EUR', availability: o.sold ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock',
        seller: agent,
        itemOffered: { '@type': 'Apartment', name: `${o.rooms} в ${o.name}`, floorSize: { '@type': 'QuantitativeValue', value: o.area, unitCode: 'MTK' },
          address: { '@type': 'PostalAddress', addressLocality: o.d + ', Alanya', addressCountry: 'TR' } },
      },
    }));
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

  // Deleted objects: old links from Instagram lead to the home page.
  for (const o of removed) {
    const dir = path.join(dist, 'o', String(o.n));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0;url=/"><link rel="canonical" href="${site.domain}/"><title>Объект снят с продажи</title><a href="/">Объект снят с продажи. Смотрите другие квартиры</a><script>location.replace('/')</script>`);
  }

  for (const g of guides) {
    const dir = path.join(dist, g.slug);
    fs.mkdirSync(dir, { recursive: true });
    const url = `${site.domain}/${g.slug}/`;
    fs.writeFileSync(path.join(dir, 'index.html'), page({
      title: g.title, desc: g.desc, url, ogImg: site.domain + '/img/hero.jpg',
      jsonld: { '@context': 'https://schema.org', '@type': 'Article', headline: g.h1, description: g.desc, url, author: agent },
    }));
  }

  const urls = ['/', ...guides.map(g => `/${g.slug}/`), ...objects.map(o => `/o/${o.n}/`)];
  fs.writeFileSync(path.join(dist, 'sitemap.xml'),
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map(u => `  <url><loc>${site.domain}${u}</loc></url>`).join('\n') + '\n</urlset>\n');
  fs.writeFileSync(path.join(dist, 'robots.txt'), site.indexable
    ? `User-agent: *\nAllow: /\nSitemap: ${site.domain}/sitemap.xml\n`
    : 'User-agent: *\nDisallow: /\n');

  console.log(`Готово: dist/ — главная и ${objects.length} страниц объектов. Индексация: ${site.indexable ? 'включена' : 'выключена'}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.join(root, 'build.mjs')) build();
