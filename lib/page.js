// Reads an object page from the agency site: visible text plus candidate photo URLs.
const UA = 'Mozilla/5.0 (compatible; AsselSiteBot/1.0)';

const decode = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');

export const findUrls = text => [...new Set((text.match(/https?:\/\/[^\s<>"']+/g) || []).map(u => u.replace(/[).,!?]+$/, '')))];

export function extract(html, base) {
  const abs = u => { try { return new URL(decode(u.trim()), base).href; } catch { return null; } };
  const images = [];
  const add = (u, alt = '') => {
    const a = u && abs(u);
    if (a && /^https?:/.test(a) && !/\.(svg|gif|ico)(\?|$)/i.test(a) && !images.some(i => i.url === a)) images.push({ url: a, alt: decode(alt).slice(0, 80) });
  };
  for (const m of html.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*>/gi)) add(m[0].match(/content=["']([^"']+)/i)?.[1], 'og:image');
  for (const m of html.matchAll(/<(?:img|source)\b[^>]*>/gi)) {
    const tag = m[0];
    const alt = tag.match(/alt=["']([^"']*)/i)?.[1] || '';
    const srcset = tag.match(/(?:data-)?srcset=["']([^"']+)/i)?.[1];
    const biggest = srcset && srcset.split(',').map(s => s.trim().split(/\s+/)[0]).at(-1);
    add(tag.match(/data-(?:src|lazy|original|full)=["']([^"']+)/i)?.[1] || biggest || tag.match(/\ssrc=["']([^"']+)/i)?.[1], alt);
  }
  // Gallery links to full-size photos.
  for (const m of html.matchAll(/<a\b[^>]+href=["']([^"']+\.(?:jpe?g|png|webp)(?:\?[^"']*)?)["']/gi)) add(m[1], 'link');
  // Image URLs inside inline JSON (many galleries are rendered by scripts).
  for (const m of html.matchAll(/https?:\\?\/\\?\/[^"'\s]+?\.(?:jpe?g|png|webp)/gi)) add(m[0].replace(/\\\//g, '/'), 'json');

  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').trim();
  const text = decode(html
    .replace(/<(script|style|noscript|svg|header|footer|nav)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
  const ld = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1].trim()).join('\n');
  return { title, text: (ld ? ld + '\n' : '') + text, images: largest(images).slice(0, 60) };
}

// Sites keep one photo in several sizes (01-200x125.jpg, 01-_x580.jpg, 01-_x900.jpg): keep the biggest, in page order.
const sizeRe = /[-_](?:_?x(\d+)|(\d+)x(\d+))(?=\.(?:jpe?g|png|webp)$)/i;
export function largest(images) {
  const best = new Map();
  for (const img of images) {
    const path = img.url.split('?')[0];
    const m = path.match(sizeRe);
    const key = m ? path.replace(sizeRe, '') : path;
    const size = m ? Number(m[1] || m[3]) : 1e6;
    const cur = best.get(key);
    if (!cur) best.set(key, { ...img, size, alt: img.alt === 'json' ? '' : img.alt });
    else if (size > cur.size) best.set(key, { ...cur, url: img.url, size });
  }
  return [...best.values()].map(({ size, ...img }) => img);
}

export async function readPage(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ru,en;q=0.8' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`Сайт ответил ${r.status} на ${url}`);
  const page = extract(await r.text(), r.url);
  return { url: r.url, ...page, text: page.text.slice(0, 40000) };
}

export async function downloadImage(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
  const type = r.headers.get('content-type') || '';
  if (!r.ok || !/image\/(jpe?g|png|webp)/.test(type)) return null;
  const b = Buffer.from(await r.arrayBuffer());
  return b.length > 15000 && b.length < 8e6 ? b : null; // skip icons and huge files
}
