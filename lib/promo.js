// Ready-made pictures for Instagram, WhatsApp and Telegram for one object, in the site's style.
// SVG templates rendered to PNG with resvg (fonts from /fonts, no system fonts), so the build and the bot draw the same thing.
import fs from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const FONT_DIR = new URL('../fonts/', import.meta.url);
const FONTS = ['Prata-Regular.ttf', 'Onest-Medium.ttf', 'Onest-Bold.ttf', 'Onest-ExtraBold.ttf'].map(f => new URL(f, FONT_DIR).pathname);

const C = { ink: '#0E1B2C', ink2: '#13263A', sea: '#0A7C86', seaLight: '#35B6C0', coral: '#FF6A3D', cream: '#F5F1EA', white: '#FFFFFF', muted: '#5B6B7C' };

export const FORMATS = [
  { key: 'post-4x5', w: 1080, h: 1350, title: 'Instagram пост 4:5', use: 'Лента Instagram и Facebook' },
  { key: 'story-9x16', w: 1080, h: 1920, title: 'Stories и статус 9:16', use: 'Instagram Stories, обложка Reels, статус WhatsApp' },
  { key: 'wide-16x9', w: 1280, h: 720, title: 'Telegram 16:9', use: 'Пост в Telegram-канале, превью ссылки' },
];
export const KINDS = [{ key: 'photo', title: 'Фото и цена' }, { key: 'info', title: 'Инфографика' }];

const x = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const eur = p => '€' + Math.round(p).toLocaleString('en-US').replace(/,/g, ' ');
const dataUri = buf => `data:image/jpeg;base64,${buf.toString('base64')}`;
// Rough text width: good enough to size pills and wrap titles.
const width = (s, size, k = 0.56) => String(s).length * size * k;

function wrap(text, size, maxW, k = 0.5, maxLines = 2) {
  const words = String(text).split(/ +/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (width(t, size, k) > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + '…'; }
  return lines;
}

// Title shrinks until it fits in two lines.
function fitTitle(text, maxW, size) {
  text = glue(text);
  for (let s = size; s > size * 0.55; s -= 4) {
    const lines = wrap(text, s, maxW, 0.56, 3);
    if (lines.length <= 2 && !lines.at(-1).endsWith('…')) return { size: s, lines };
  }
  const s = Math.round(size * 0.55);
  return { size: s, lines: wrap(text, s, maxW, 0.56, 2) };
}

// Prata draws «1» like «l»: numbers inside serif text are set in Onest.
const serif = (text, size) => x(text).replace(/[0-9][0-9+\s.,]*[0-9]|[0-9]/g, m => `<tspan font-family="Onest" font-weight="600" font-size="${Math.round(size * 0.9)}">${m}</tspan>`);
// Keep a number with its unit on one line.
const glue = t => String(t).replace(/(\d) (м²|м|км)/g, '$1\u00A0$2');

const seaText = m => (m >= 1000 ? `${(m / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} км` : `${m} м`);
const isFuture = y => /^\d{4}$/.test(String(y)) && Number(y) > new Date().getFullYear();

// Facts shown on the pictures, only those the object has.
export function facts(o) {
  const f = [];
  if (o.area) f.push({ icon: 'area', v: `${o.area} м²`, l: 'Общая площадь' });
  if (o.rooms) f.push({ icon: 'bed', v: o.rooms, l: o.rooms === 'Вилла' ? 'Тип' : 'Планировка' });
  if (o.floor) f.push({ icon: 'floor', v: /из/.test(o.floor) ? o.floor : `${o.floor} этаж`, l: 'Этаж' });
  if (o.sea) f.push({ icon: 'sea', v: seaText(o.sea), l: 'До моря' });
  if (o.year) f.push({ icon: 'year', v: o.year, l: isFuture(o.year) ? 'Сдача дома' : /^\d{4}$/.test(o.year) ? 'Год постройки' : 'Дом' });
  f.push({ icon: 'key', v: o.owner ? 'Собственник' : 'Застройщик', l: o.owner ? 'Вторичный рынок' : 'Новостройка' });
  return f.slice(0, 6);
}

const chips = o => [o.area && `${o.area} м²`, o.floor && (/из/.test(o.floor) ? `${o.floor} эт.` : `${o.floor} этаж`), o.sea && `${seaText(o.sea)} до моря`].filter(Boolean);
const eyebrow = o => `${o.rooms === 'Вилла' ? 'Вилла' : `Квартира ${o.rooms}`} · ${o.d}`.toUpperCase();

const ICONS = {
  area: '<path d="M-9 3V9H-3M9 -3V-9H3M-9 9 9 -9" />',
  bed: '<path d="M-11 8V-6M-11 2H11V8M11 2V-2A3 3 0 0 0 8-5H-1V2M-7 -2A2 2 0 1 0-7-2.1" />',
  floor: '<path d="M-7 10V-10H7V10M-11 10H11M-3-6H-1M1-6H3M-3-1H-1M1-1H3M-3 4H-1M1 4H3" />',
  sea: '<path d="M-11-4C-7-8-4 0 0-4S7-8 11-4M-11 2C-7-2-4 6 0 2S7-2 11 2M-11 8C-7 4-4 12 0 8S7 4 11 8" />',
  year: '<path d="M-10-6H10V10H-10ZM-10-1H10M-5-10V-4M5-10V-4" />',
  key: '<circle cx="-5" cy="0" r="5"/><path d="M0 0H11M7 0V5M10 0V4" />',
};

const logo = (px, py, s, light = true) => `<g transform="translate(${px} ${py}) scale(${s / 40})">
  <g stroke="${C.coral}" stroke-width="2.4" stroke-linecap="round"><line x1="15.5" y1="14" x2="12" y2="14"/><line x1="16.8" y1="9.2" x2="13.7" y2="7.5"/><line x1="20.2" y1="5.8" x2="18.5" y2="2.7"/><line x1="25" y1="4.5" x2="25" y2="1"/><line x1="29.8" y1="5.8" x2="31.5" y2="2.7"/><line x1="33.2" y1="9.2" x2="36.3" y2="7.5"/><line x1="34.5" y1="14" x2="38" y2="14"/></g>
  <circle cx="25" cy="14" r="6.5" fill="${C.coral}"/>
  <path d="M4 21.5 17 10.5l13 11" fill="none" stroke="${light ? C.white : C.ink}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>
  <path d="M7.5 20.5V34h19V20.5L17 12.5z" fill="${C.seaLight}"/>
  <path d="M4 21.5 17 10.5l13 11" fill="none" stroke="${C.seaLight}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
  <rect x="14.5" y="25" width="5" height="9" rx="1" fill="${light ? C.white : C.ink}"/></g>`;

function brand(px, py, s, o) {
  return `${logo(px, py - s * 0.78, s)}
  <text x="${px + s * 1.25}" y="${py - s * 0.1}" font-family="Onest" font-weight="700" font-size="${s * 0.5}" letter-spacing="${s * 0.09}" fill="${C.white}">ASSEL USMANOVA</text>
  <text x="${px + s * 1.25}" y="${py + s * 0.42}" font-family="Onest" font-weight="500" font-size="${s * 0.34}" fill="${C.white}" fill-opacity=".72">Недвижимость в Алании</text>`;
}

function numBadge(rx, py, s, n) {
  const t = `№${n}`, w = width(t, s, 0.62) + s * 1.1;
  return `<rect x="${rx - w}" y="${py - s * 1.05}" width="${w}" height="${s * 1.6}" rx="${s * 0.8}" fill="none" stroke="${C.white}" stroke-opacity=".7" stroke-width="2"/>
  <text x="${rx - w / 2}" y="${py}" text-anchor="middle" font-family="Onest" font-weight="700" font-size="${s}" fill="${C.white}">${x(t)}</text>`;
}

function chipRow(px, py, s, list) {
  let cx = px, out = '';
  for (const c of list) {
    const w = width(c, s, 0.56) + s * 1.5;
    out += `<rect x="${cx}" y="${py - s * 1.25}" width="${w}" height="${s * 2}" rx="${s}" fill="${C.white}" fill-opacity=".12" stroke="${C.white}" stroke-opacity=".55" stroke-width="2"/>
    <text x="${cx + w / 2}" y="${py + s * 0.1}" text-anchor="middle" font-family="Onest" font-weight="700" font-size="${s}" fill="${C.white}">${x(c)}</text>`;
    cx += w + s * 0.6;
  }
  return out;
}

function pricePill(px, py, s, price) {
  const t = eur(price), w = width(t, s, 0.62) + s * 1.1;
  return `<rect x="${px}" y="${py - s * 1.1}" width="${w}" height="${s * 1.55}" rx="${s * 0.78}" fill="${C.coral}"/>
  <text x="${px + s * 0.55}" y="${py}" font-family="Prata" font-size="${s}" fill="${C.white}">${serif(t, s)}</text>`;
}

function cta(px, py, s, o, site, anchor = 'start') {
  const phone = site.whatsapp ? '+' + site.whatsapp.replace(/^(\d)(\d{3})(\d{3})(\d{4})$/, '$1 $2 $3 $4') : '';
  return `<text x="${px}" y="${py}" text-anchor="${anchor}" font-family="Onest" font-weight="700" font-size="${s}" fill="${C.white}">Напишите «${o.n}» в WhatsApp${phone ? `  <tspan font-weight="500" fill-opacity=".75">${x(phone)}</tspan>` : ''}</text>`;
}

const defs = (w, h) => `<defs>
  <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.ink}" stop-opacity=".55"/><stop offset=".22" stop-color="${C.ink}" stop-opacity="0"/><stop offset=".45" stop-color="${C.ink}" stop-opacity=".05"/><stop offset=".75" stop-color="${C.ink}" stop-opacity=".82"/><stop offset="1" stop-color="${C.ink}" stop-opacity=".96"/></linearGradient>
  <linearGradient id="side" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.ink}" stop-opacity=".97"/><stop offset=".5" stop-color="${C.ink}" stop-opacity=".85"/><stop offset=".75" stop-color="${C.ink}" stop-opacity=".2"/><stop offset="1" stop-color="${C.ink}" stop-opacity="0"/></linearGradient>
  <radialGradient id="glow" cx=".85" cy=".1" r=".9"><stop offset="0" stop-color="${C.sea}" stop-opacity=".55"/><stop offset="1" stop-color="${C.ink}" stop-opacity="0"/></radialGradient>
  <radialGradient id="glow2" cx=".05" cy="1" r=".7"><stop offset="0" stop-color="${C.coral}" stop-opacity=".22"/><stop offset="1" stop-color="${C.ink}" stop-opacity="0"/></radialGradient>
  <linearGradient id="shadeStory" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.ink}" stop-opacity=".6"/><stop offset=".22" stop-color="${C.ink}" stop-opacity="0"/><stop offset=".34" stop-color="${C.ink}" stop-opacity=".1"/><stop offset=".52" stop-color="${C.ink}" stop-opacity=".82"/><stop offset=".7" stop-color="${C.ink}" stop-opacity=".9"/><stop offset="1" stop-color="${C.ink}" stop-opacity=".55"/></linearGradient>
</defs>`;

// Instagram draws its own buttons over pictures. Text stays inside these zones.
// 9:16 (Stories, Reels, ads): top 14% is the profile bar, bottom 35% is the caption and
// «Подробнее»/«Подписаться», the right edge holds like/comment/share from the middle down.
// 4:5: the profile grid crops the post to 3:4, about 68 px off the top and the bottom.
export const SAFE = {
  'story-9x16': { top: 300, bottom: 1250, left: 72, right: 1080 - 150 },
  'post-4x5': { top: 120, bottom: 1350 - 100, left: 64, right: 1080 - 64 },
};

const photoBg = (w, h, img) => `<image href="${img}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"/>`;

// Full-bleed photo with the offer at the bottom (or on the left for 16:9).
function photoSvg(f, o, img, site) {
  const { w, h } = f;
  if (f.key === 'wide-16x9') {
    const p = 64, maxW = 640;
    const t = fitTitle(o.name, maxW, 76);
    let y = 310 - (t.lines.length - 1) * t.size * 0.55;
    return `${defs(w, h)}${photoBg(w, h, img)}<rect width="${w}" height="${h}" fill="url(#side)"/>
    ${brand(p, 96, 52, o)}${numBadge(w - p, 96, 30, o.n)}
    <text x="${p}" y="${y - t.size * 0.95}" font-family="Onest" font-weight="800" font-size="22" letter-spacing="3.5" fill="${C.coral}">${x(eyebrow(o))}</text>
    ${t.lines.map((l, i) => `<text x="${p}" y="${y + i * t.size * 1.05}" font-family="Prata" font-size="${t.size}" fill="${C.white}">${serif(l, t.size)}</text>`).join('')}
    ${chipRow(p, y + (t.lines.length - 1) * t.size * 1.05 + 82, 24, chips(o))}
    ${pricePill(p, h - 112, 60, o.price)}
    ${cta(p, h - 40, 24, o, site)}`;
  }
  const story = f.key === 'story-9x16';
  const z = SAFE[f.key], p = z.left, s = story ? 1.12 : 1;
  const bottom = z.bottom;
  const t = fitTitle(o.name, z.right - p, 100 * s);
  const ctaY = bottom, priceY = ctaY - 64 * s, chipsY = priceY - 118 * s;
  const titleLast = chipsY - 78 * s, titleTop = titleLast - (t.lines.length - 1) * t.size * 1.02;
  return `${defs(w, h)}${photoBg(w, h, img)}<rect width="${w}" height="${h}" fill="url(#${story ? 'shadeStory' : 'shade'})"/>
  ${brand(p, z.top + 40 * s, 54 * s, o)}${numBadge(w - 64, z.top + 40 * s, 32 * s, o.n)}
  <text x="${p}" y="${titleTop - t.size * 0.92}" font-family="Onest" font-weight="800" font-size="${26 * s}" letter-spacing="${4 * s}" fill="${C.coral}">${x(eyebrow(o))}</text>
  ${t.lines.map((l, i) => `<text x="${p}" y="${titleTop + i * t.size * 1.02}" font-family="Prata" font-size="${t.size}" fill="${C.white}">${serif(l, t.size)}</text>`).join('')}
  ${chipRow(p, chipsY, 28 * s, chips(o))}
  ${pricePill(p, priceY, 76 * s, o.price)}
  ${cta(p, ctaY, 28 * s, o, site)}`;
}

function factCard(cx, cy, cw, ch, item, s) {
  const r = ch * 0.3, ix = cx + ch * 0.48, iy = cy + ch / 2;
  return `<rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" rx="${ch * 0.22}" fill="${C.cream}"/>
  <circle cx="${ix}" cy="${iy}" r="${r}" fill="${C.ink}"/>
  <g transform="translate(${ix} ${iy}) scale(${r / 17})" fill="none" stroke="${C.cream}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ICONS[item.icon]}</g>
  <text x="${ix + r + 22 * s}" y="${cy + ch * 0.52}" font-family="Onest" font-weight="700" font-size="${Math.min(40 * s, (cw - ch - 40 * s) / (String(item.v).length * 0.6))}" fill="${C.ink}">${x(item.v)}</text>
  <text x="${ix + r + 22 * s}" y="${cy + ch * 0.8}" font-family="Onest" font-weight="500" font-size="${20 * s}" fill="${C.muted}">${x(item.l)}</text>`;
}

// Dark card: photo in a frame, facts in a grid, price.
function infoSvg(f, o, img, site) {
  const { w, h } = f;
  const bg = `${defs(w, h)}<rect width="${w}" height="${h}" fill="${C.ink}"/><rect width="${w}" height="${h}" fill="url(#glow)"/><rect width="${w}" height="${h}" fill="url(#glow2)"/>`;
  const list = facts(o);
  if (f.key === 'wide-16x9') {
    const p = 48, pw = 520;
    const t = fitTitle(o.name, w - pw - p * 3, 50);
    const gx = pw + p * 2, gw = w - gx - p, cw = (gw - 16) / 2, ch = 104;
    const rows = list.slice(0, 4);
    return `${bg}<clipPath id="ph"><rect x="${p}" y="${p}" width="${pw}" height="${h - p * 2}" rx="28"/></clipPath>
    <image href="${img}" x="${p}" y="${p}" width="${pw}" height="${h - p * 2}" preserveAspectRatio="xMidYMid slice" clip-path="url(#ph)"/>
    ${logo(p + 22, p + 18, 46)}
    <text x="${gx}" y="${p + 22}" font-family="Onest" font-weight="800" font-size="18" letter-spacing="3" fill="${C.coral}">${x(eyebrow(o))}</text>
    ${t.lines.map((l, i) => `<text x="${gx}" y="${p + 74 + i * t.size * 1.02}" font-family="Prata" font-size="${t.size}" fill="${C.white}">${serif(l, t.size)}</text>`).join('')}
    ${rows.map((it, i) => factCard(gx + (i % 2) * (cw + 16), 214 + Math.floor(i / 2) * (ch + 14) + (t.lines.length - 1) * 30, cw, ch, it, 0.78)).join('')}
    ${pricePill(gx, h - p - 34, 50, o.price)}
    ${numBadge(w - p, h - p - 40, 22, o.n)}
    ${cta(w - p, h - p + 4, 18, o, site, 'end')}`;
  }
  const story = f.key === 'story-9x16';
  const z = SAFE[f.key], p = z.left, s = story ? 1.08 : 1;
  const top = z.top + 40 * s;
  const t = fitTitle(o.name, z.right - p, 82 * s);
  const titleY = top + 150 * s;
  const titleEnd = titleY + (t.lines.length - 1) * t.size * 1.02;
  const cw = (z.right - p - 18) / 2, ch = story ? 120 : 112;
  if (story) {
    // Text and facts in the safe zone; the photo fills the bottom, where Instagram's buttons go.
    const rows = list.slice(0, 6);
    const gy = titleEnd + 56 * s;
    const priceY = z.bottom - 70 * s;
    const photoY = z.bottom + 30;
    return `${bg}
  <clipPath id="ph"><rect x="0" y="${photoY}" width="${w}" height="${h - photoY + 60}" rx="56"/></clipPath>
  <image href="${img}" x="0" y="${photoY}" width="${w}" height="${h - photoY}" preserveAspectRatio="xMidYMid slice" clip-path="url(#ph)"/>
  ${brand(p, top, 50 * s, o)}${numBadge(w - 64, top, 30 * s, o.n)}
  <text x="${p}" y="${titleY - t.size * 0.92}" font-family="Onest" font-weight="800" font-size="${24 * s}" letter-spacing="${4 * s}" fill="${C.coral}">${x(eyebrow(o))}</text>
  ${t.lines.map((l, i) => `<text x="${p}" y="${titleY + i * t.size * 1.02}" font-family="Prata" font-size="${t.size}" fill="${C.white}">${serif(l, t.size)}</text>`).join('')}
  ${rows.map((it, i) => factCard(p + (i % 2) * (cw + 18), gy + Math.floor(i / 2) * (ch + 14), cw, ch, it, s)).join('')}
  ${pricePill(p, priceY, 64 * s, o.price)}
  ${cta(p, z.bottom, 24 * s, o, site)}`;
  }
  const priceY = z.bottom - 66 * s;
  const rows = list.slice(0, t.lines.length === 1 ? 6 : 4);
  const gridH = Math.ceil(rows.length / 2) * (ch + 16);
  const photoY = titleEnd + 44 * s;
  const photoH = Math.max(260, Math.min(440, priceY - 120 * s - gridH - 24 * s - photoY));
  const gy = photoY + photoH + 24 * s;
  return `${bg}
  ${brand(p, top, 50 * s, o)}${numBadge(w - p, top, 30 * s, o.n)}
  <text x="${p}" y="${titleY - t.size * 0.92}" font-family="Onest" font-weight="800" font-size="${24 * s}" letter-spacing="${4 * s}" fill="${C.coral}">${x(eyebrow(o))}</text>
  ${t.lines.map((l, i) => `<text x="${p}" y="${titleY + i * t.size * 1.02}" font-family="Prata" font-size="${t.size}" fill="${C.white}">${serif(l, t.size)}</text>`).join('')}
  <clipPath id="ph"><rect x="${p}" y="${photoY}" width="${w - p * 2}" height="${photoH}" rx="${30 * s}"/></clipPath>
  <image href="${img}" x="${p}" y="${photoY}" width="${w - p * 2}" height="${photoH}" preserveAspectRatio="xMidYMid slice" clip-path="url(#ph)"/>
  ${rows.map((it, i) => factCard(p + (i % 2) * (cw + 18), gy + Math.floor(i / 2) * (ch + 16), cw, ch, it, s)).join('')}
  ${pricePill(p, priceY, 70 * s, o.price)}
  ${cta(p, z.bottom, 22 * s, o, site)}`;
}

export function promoSvg(format, kind, o, photo, site) {
  const f = FORMATS.find(v => v.key === format);
  const img = dataUri(photo);
  const body = kind === 'info' ? infoSvg(f, o, img, site) : photoSvg(f, o, img, site);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${f.w}" height="${f.h}" viewBox="0 0 ${f.w} ${f.h}">${body}</svg>`;
}

export function renderPromo(format, kind, o, photo, site) {
  const svg = promoSvg(format, kind, o, photo, site);
  return new Resvg(svg, { font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: 'Onest' } }).render().asPng();
}

// Which photos to use: the first non-plan photo for the full-bleed picture, the next one for the infographic.
export function pickPhotos(keys) {
  const ph = keys.filter(k => !/^p\d/.test(k));
  const list = ph.length ? ph : keys;
  return { photo: list[0], info: list[1] || list[0] };
}

// All pictures for one object: [{ name, format, kind, png }].
export function renderAll(o, photos, site) {
  const out = [];
  for (const f of FORMATS) for (const k of KINDS) {
    out.push({ name: `${f.key}-${k.key}.png`, format: f, kind: k, png: renderPromo(f.key, k.key, o, k.key === 'info' ? photos.info : photos.photo, site) });
  }
  return out;
}
