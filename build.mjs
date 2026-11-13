// Builds dist/: home page, one page per object at /o/<n>/, sitemap.xml, robots.txt.
// Objects live in data/objects.json, contacts and the domain in data/site.json.
import fs from 'node:fs';
import path from 'node:path';
import { validate } from './lib/objects.js';

const root = path.dirname(new URL(import.meta.url).pathname);
const read = f => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
const site = read('data/site.json');
const objects = read('data/objects.json');
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

function build() {
  const errors = validate(objects);
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
