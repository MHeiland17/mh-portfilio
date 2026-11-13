// Copies every image and file that site/index.html references (img/NAME or files/NAME) out of
// source/assets, so the site folder stands on its own. Webflow prefixes each upload with a
// 24-character id; when two uploads share a name, the newest (highest id) wins.
// Usage: node tools/build-site.mjs
import { readFile, readdir, copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const site = path.join(root, 'site');
const html = await readFile(path.join(site, 'index.html'), 'utf8');
const assets = (await readdir(path.join(root, 'source/assets'))).sort();

const refs = new Set([...html.matchAll(/\b(img|files)\/([\w.\-]+\.(?:jpe?g|png|svg|pdf|webp))/g)].map((m) => `${m[1]}/${m[2]}`));
let copied = 0; const missing = [];
for (const ref of refs) {
  const name = ref.split('/')[1];
  const match = assets.filter((f) => f.replace(/^[0-9a-f]{24}_/, '') === name).pop();
  if (!match) { missing.push(ref); continue; }
  await mkdir(path.join(site, path.dirname(ref)), { recursive: true });
  await copyFile(path.join(root, 'source/assets', match), path.join(site, ref));
  copied++;
}
console.log(`copied ${copied} files into site/`);
if (missing.length) { console.log('MISSING:'); missing.forEach((m) => console.log('  ' + m)); process.exitCode = 1; }
