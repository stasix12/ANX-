#!/usr/bin/env node
// Site factory: turns a client config (clients/<name>.json) into a ready-to-deploy
// static site in dist/<slug>/. No dependencies — Node 18+.
//
//   node generate.js clients/demo.json        — build one client
//   node generate.js --all                    — rebuild every client
//
// Deploy the resulting folder anywhere static (Netlify Drop, Vercel, Cloudflare Pages).

import { readFileSync, writeFileSync, mkdirSync, readdirSync, cpSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));

function esc(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function waLink(c) {
  const text = encodeURIComponent(c.whatsappMessage || 'Здравствуйте!');
  return `https://wa.me/${c.whatsapp}?text=${text}`;
}

function render(c) {
  const services = (c.services || [])
    .map(
      (s) => `
      <div class="card">
        <h3>${esc(s.title)}</h3>
        <p>${esc(s.desc)}</p>
        ${s.price ? `<div class="price">${esc(s.price)}</div>` : ''}
      </div>`
    )
    .join('');

  const testimonials = (c.testimonials || [])
    .map(
      (t) => `
      <blockquote class="review">
        <p>«${esc(t.text)}»</p>
        <footer>— ${esc(t.name)}</footer>
      </blockquote>`
    )
    .join('');

  const gallery = (c.gallery || [])
    .map((img) => `<img src="${esc(img)}" alt="${esc(c.businessName)}" loading="lazy">`)
    .join('');

  const socials = Object.entries(c.socials || {})
    .filter(([, url]) => url)
    .map(([name, url]) => `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(cap(name))}</a>`)
    .join(' · ');

  const mapQuery = encodeURIComponent(c.address || '');

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(c.businessName)} — ${esc(c.tagline)}</title>
<meta name="description" content="${esc(c.description).slice(0, 160)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  :root {
    --primary: ${c.colors?.primary || '#1f4e5f'};
    --accent: ${c.colors?.accent || '#e0a836'};
    --bg: ${c.colors?.bg || '#f8f8f6'};
    --ink: #23211e;
  }
  * { box-sizing: border-box; margin: 0; }
  body { font-family: Rubik, system-ui, sans-serif; background: var(--bg); color: var(--ink); line-height: 1.6; }
  .wrap { max-width: 900px; margin: 0 auto; padding: 0 20px; }
  header.hero { background: linear-gradient(160deg, var(--primary), color-mix(in srgb, var(--primary) 70%, black)); color: #fff; padding: 72px 0 56px; text-align: center; }
  ${c.heroImage ? `header.hero { background-image: linear-gradient(rgba(0,0,0,.55), rgba(0,0,0,.55)), url('${esc(c.heroImage)}'); background-size: cover; background-position: center; }` : ''}
  .hero h1 { font-size: clamp(1.8rem, 5vw, 2.8rem); font-weight: 700; }
  .hero .tagline { font-size: 1.15rem; opacity: .92; margin-top: 10px; }
  .cta { display: inline-block; margin-top: 28px; background: #25d366; color: #fff; text-decoration: none; font-weight: 600; padding: 14px 32px; border-radius: 999px; font-size: 1.05rem; }
  .cta.alt { background: var(--accent); }
  section { padding: 48px 0; }
  section h2 { font-size: 1.6rem; color: var(--primary); margin-bottom: 24px; text-align: center; }
  .about p { max-width: 640px; margin: 0 auto; text-align: center; font-size: 1.06rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
  .card { background: #fff; border-radius: 14px; padding: 22px; box-shadow: 0 2px 10px rgba(0,0,0,.06); }
  .card h3 { color: var(--primary); margin-bottom: 6px; }
  .card .price { margin-top: 12px; font-weight: 700; color: var(--accent); font-size: 1.1rem; }
  .reviews { background: #fff; }
  .review { max-width: 620px; margin: 0 auto 20px; padding: 4px 16px; border-inline-start: 4px solid var(--accent); }
  .review footer { margin-top: 6px; font-weight: 500; color: var(--primary); }
  .gallery-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }
  .gallery-grid img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 10px; }
  .contact .grid { grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); align-items: start; }
  .contact a { color: var(--primary); font-weight: 500; text-decoration: none; }
  .contact iframe { width: 100%; height: 260px; border: 0; border-radius: 14px; }
  .wa-float { position: fixed; bottom: 20px; inset-inline-end: 20px; background: #25d366; width: 58px; height: 58px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 14px rgba(0,0,0,.25); z-index: 10; }
  .wa-float svg { width: 30px; height: 30px; fill: #fff; }
  footer.site { background: var(--primary); color: #fff; text-align: center; padding: 28px 20px; font-size: .95rem; }
  footer.site .he { direction: rtl; margin-top: 6px; opacity: .85; }
  footer.site a { color: #fff; }
</style>
</head>
<body>

<header class="hero">
  <div class="wrap">
    <h1>${esc(c.businessName)}</h1>
    <p class="tagline">${esc(c.tagline)}</p>
    <a class="cta" href="${waLink(c)}">Записаться в WhatsApp</a>
  </div>
</header>

<section class="about">
  <div class="wrap"><p>${esc(c.description)}</p></div>
</section>

${services ? `
<section class="services">
  <div class="wrap">
    <h2>Услуги и цены</h2>
    <div class="grid">${services}</div>
  </div>
</section>` : ''}

${testimonials ? `
<section class="reviews">
  <div class="wrap">
    <h2>Отзывы</h2>
    ${testimonials}
  </div>
</section>` : ''}

${gallery ? `
<section class="gallery">
  <div class="wrap">
    <h2>Галерея</h2>
    <div class="gallery-grid">${gallery}</div>
  </div>
</section>` : ''}

<section class="contact">
  <div class="wrap">
    <h2>Контакты и запись</h2>
    <div class="grid">
      <div class="card">
        <p>📞 <a href="tel:${esc(c.phone)}">${esc(c.phone)}</a></p>
        <p>💬 <a href="${waLink(c)}">Написать в WhatsApp</a></p>
        ${c.address ? `<p>📍 ${esc(c.address)}</p>` : ''}
        ${c.hours ? `<p>🕒 ${esc(c.hours)}</p>` : ''}
        ${socials ? `<p>${socials}</p>` : ''}
      </div>
      ${c.address ? `<iframe src="https://maps.google.com/maps?q=${mapQuery}&output=embed" loading="lazy" title="Карта"></iframe>` : ''}
    </div>
  </div>
</section>

<a class="wa-float" href="${waLink(c)}" aria-label="WhatsApp">
  <svg viewBox="0 0 32 32"><path d="M16 3C9.4 3 4 8.4 4 15c0 2.1.6 4.2 1.6 6L4 29l8.2-1.5c1.2.5 2.5.8 3.8.8 6.6 0 12-5.4 12-12S22.6 3 16 3zm0 21.8c-1.2 0-2.4-.3-3.5-.8l-.5-.2-4.9.9 1-4.7-.3-.5c-1-1.6-1.5-3.4-1.5-5.3 0-5.4 4.4-9.8 9.8-9.8s9.8 4.4 9.8 9.8-4.5 9.8-9.9 9.8zm5.4-7.3c-.3-.1-1.7-.9-2-1s-.5-.1-.7.1-.8 1-.9 1.2-.3.2-.6.1c-.3-.1-1.2-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1s0-.5.1-.6l.4-.5c.1-.2.2-.3.3-.5s0-.4 0-.5c0-.1-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4S9.9 11 9.9 12.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.6-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3z"/></svg>
</a>

<footer class="site">
  <div>${esc(c.businessName)} · ${esc(c.address || '')}</div>
  ${c.hebrewLine ? `<div class="he">${esc(c.hebrewLine)}</div>` : ''}
</footer>

</body>
</html>`;
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function buildClient(configPath) {
  const c = JSON.parse(readFileSync(configPath, 'utf8'));
  if (!c.slug) throw new Error(`${configPath}: missing "slug"`);
  const outDir = join(ROOT, 'dist', c.slug);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'index.html'), render(c));

  // Copy the client's asset folder (photos etc.) if one exists next to the config.
  const assets = join(ROOT, 'clients', c.slug);
  if (existsSync(assets)) cpSync(assets, join(outDir, c.slug), { recursive: true });

  console.log(`✔ ${c.businessName} → dist/${c.slug}/`);
}

const args = process.argv.slice(2);
if (args.includes('--all')) {
  for (const f of readdirSync(join(ROOT, 'clients')).filter((f) => f.endsWith('.json'))) {
    buildClient(join(ROOT, 'clients', f));
  }
} else if (args[0]) {
  buildClient(args[0]);
} else {
  console.log('Usage: node generate.js clients/<name>.json | --all');
}
