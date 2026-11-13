// Pulls the content out of the saved Webflow pages in source/html:
//  - source/content/<page>.md  : the page's text in reading order, with images in place
//  - source/assets/...         : every image, PDF and CSS-background image at its original size
//  - source/inventory.json     : pages, titles, and every asset with where it is used
// Usage: node tools/extract.mjs   (run from the portfolio folder)
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const htmlDir = path.join(root, 'source/html');
const contentDir = path.join(root, 'source/content');
const assetDir = path.join(root, 'source/assets');
await mkdir(contentDir, { recursive: true });
await mkdir(assetDir, { recursive: true });

const decode = (s) =>
  s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#x27;/g, "'");

// Webflow serves resized copies named "<name>-p-500.png"; the original drops the suffix.
const original = (u) => u.replace(/-p-\d+(\.\w+)$/, '$1').replace(/-p-\d+(\.\w+)(\?.*)?$/, '$1');
const assets = new Map(); // original url -> { file, pages:Set, alts:Set }
function asset(url, page, alt = '') {
  // srcset entries double-encode spaces (%2520); the files themselves live at %20.
  url = original(decode(url).trim()).replace(/%25([0-9A-F]{2})/gi, '%$1');
  if (!/^https?:/.test(url)) return null;
  let a = assets.get(url);
  if (!a) {
    const name = decodeURIComponent(url.split('/').pop().split('?')[0]).replace(/[^\w.\-]+/g, '_');
    a = { url, file: `assets/${name}`, pages: new Set(), alts: new Set() };
    assets.set(url, a);
  }
  a.pages.add(page);
  if (alt) a.alts.add(alt);
  return a;
}

const BLOCK = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'div', 'li', 'section', 'nav', 'blockquote', 'figure', 'figcaption', 'ul', 'ol']);
const pages = [];

for (const f of (await readdir(htmlDir)).filter((f) => f.endsWith('.html')).sort()) {
  const slug = f.replace(/\.html$/, '');
  const html = await readFile(path.join(htmlDir, f), 'utf8');
  const title = decode((html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '');
  const description = decode((html.match(/<meta content="([^"]*)" name="description"/) || [])[1] || '');
  let body = (html.match(/<body[^>]*>([\s\S]*)<\/body>/) || [])[1] || '';
  body = body.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');

  // Walk tags in order. Headings become #, images ![](), links [text](href), everything else text lines.
  const out = [];
  let line = '';
  let heading = 0;
  let linkHref = null, linkText = '';
  let hiddenDepth = 0; const stack = [];
  const flush = () => {
    const t = line.replace(/\s+/g, ' ').trim();
    if (t) out.push((heading ? '#'.repeat(heading) + ' ' : '') + (hiddenDepth ? '<!-- hidden on site --> ' : '') + t);
    line = '';
  };
  const re = /<(\/?)([a-z0-9]+)([^>]*?)(\/?)>|([^<]+)/gi;
  let m;
  while ((m = re.exec(body))) {
    if (m[5] !== undefined) { const t = decode(m[5]); if (linkHref !== null) linkText += t; else line += t; continue; }
    const [, close, tagRaw, attrs, selfClose] = m;
    const tag = tagRaw.toLowerCase();
    const attr = (n) => { const r = attrs.match(new RegExp(`\\s${n}="([^"]*)"`)); return r ? r[1] : null; };
    for (const s of attrs.matchAll(/url\(&quot;([^&]+)&quot;\)|url\(['"]?([^'")]+)['"]?\)/g)) asset(s[1] || s[2], slug);
    if (tag === 'br') { if (linkHref === null) line += ' '; continue; }
    if (tag === 'img') {
      const src = attr('src'); const alt = decode(attr('alt') || '');
      for (const part of (attr('srcset') || '').split(',')) { const u = part.trim().split(/\s+/)[0]; if (u) asset(u, slug, alt); }
      const a = src && asset(src, slug, alt);
      if (a) { flush(); out.push(`${hiddenDepth ? '<!-- hidden on site --> ' : ''}![${alt}](../${a.file})`); }
      continue;
    }
    if (tag === 'a') {
      if (!close) {
        const href = attr('href') || '';
        if (/\.(pdf|png|jpe?g)$/i.test(href)) asset(href, slug);
        linkHref = href; linkText = '';
      } else if (linkHref !== null) {
        const t = linkText.replace(/\s+/g, ' ').trim();
        if (t) line += ` [${t}](${linkHref}) `;
        linkHref = null;
      }
      continue;
    }
    if (tag === 'strong' || tag === 'b') { if (linkHref === null) line += '**'; continue; }
    if (tag === 'em' || tag === 'i') { if (linkHref === null) line += '_'; continue; }
    if (BLOCK.has(tag) || /^h\d$/.test(tag)) {
      flush();
      if (!close && !selfClose) {
        const cls = ' ' + (attr('class') || '') + ' ';
        const hidden = / (hide|hidden|w-condition-invisible) /.test(cls);
        stack.push(hidden); if (hidden) hiddenDepth++;
        if (/^h\d$/.test(tag)) heading = +tag[1];
        if (tag === 'li') line = '- ';
      } else if (close) {
        if (stack.pop()) hiddenDepth--;
        if (/^h\d$/.test(tag)) heading = 0;
      }
    }
  }
  flush();
  // Drop the repeated nav/footer noise lines and **  ** artefacts.
  const md = out.map((l) => l.replace(/\*\*\s*\*\*/g, '').replace(/\s+\]/g, ']')).filter((l) => l.replace(/[#*\s-]/g, ''));
  await writeFile(path.join(contentDir, `${slug}.md`),
    `---\nslug: ${slug}\ntitle: ${title}\ndescription: ${description}\nsource: https://www.marekheiland.com/${slug === 'index' ? '' : slug}\n---\n\n${md.join('\n\n')}\n`);
  pages.push({ slug, title, description, lines: md.length });
}

// Images used only as CSS backgrounds live in the site stylesheet.
const css = await (await fetch('https://cdn.prod.website-files.com/6652752015ba19bac9035384/css/mheiland.webflow.8fce1fae5.css')).text();
await writeFile(path.join(root, 'source/webflow.css'), css);
for (const s of css.matchAll(/url\(['"]?(https:[^'")]+)['"]?\)/g)) asset(s[1], 'css');

// Download originals, falling back to the largest resized copy if the original is missing.
let ok = 0, failed = [];
const list = [...assets.values()];
async function download(a) {
  const dest = path.join(root, 'source', a.file);
  if (existsSync(dest) && (await stat(dest)).size > 0) { a.bytes = (await stat(dest)).size; ok++; return; }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(a.url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      await writeFile(dest, buf); a.bytes = buf.length; ok++; return;
    } catch (e) { if (attempt === 2) failed.push(`${a.url} (${e.message})`); }
  }
}
for (let i = 0; i < list.length; i += 6) await Promise.all(list.slice(i, i + 6).map(download));

// Pixel sizes for PNG/JPEG (read from the file headers, no dependencies).
async function dims(file) {
  const b = await readFile(file);
  if (b[0] === 0x89 && b[1] === 0x50) return [b.readUInt32BE(16), b.readUInt32BE(20)];
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const mk = b[i + 1];
      if (mk >= 0xc0 && mk <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(mk)) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  return null;
}
for (const a of list) {
  const p = path.join(root, 'source', a.file);
  if (existsSync(p)) { const d = await dims(p).catch(() => null); if (d) a.size = `${d[0]}x${d[1]}`; }
}

await writeFile(path.join(root, 'source/inventory.json'), JSON.stringify({
  site: 'https://www.marekheiland.com',
  extracted: new Date().toISOString(),
  pages,
  assets: list.map((a) => ({ file: a.file, url: a.url, size: a.size || null, bytes: a.bytes || null, pages: [...a.pages], alt: [...a.alts] })),
}, null, 2));
console.log(`pages: ${pages.length}, assets: ${list.length}, downloaded: ${ok}, failed: ${failed.length}`);
failed.forEach((f) => console.log('  FAILED', f));
