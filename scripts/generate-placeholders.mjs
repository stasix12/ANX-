/**
 * Generates the numbered SVG placeholders that ship with the site.
 *
 * Run with:  npm run placeholders
 *
 * Every product gets public/products/<slug>/1.svg .. 3.svg, each stamped with
 * the product name and its position in the gallery, so it is obvious which real
 * photo replaces which file. Regenerating never touches files you have already
 * swapped for real photos with a different extension.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(root, 'public');

// White-and-sky-blue palette, matching the site's design tokens
// (globals.css): pale panels, blue linework, dark-navy / slate text.
const panel = '#ffffff';
const wash = '#e9f0fa';
const line = '#c9dcf1';
const blue = '#0b57c7';
const blueDeep = '#0341a0';
const blueSoft = '#3d82d8';
const ink = '#0a1c3d';
const slate = '#5c789e';

const escapeXml = (value) =>
  value.replace(
    /[<>&'"]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c],
  );

/** Shared defs: white-to-pale-blue gradient, blueprint grid and a soft glow. */
const defs = (w, h) => `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${panel}"/>
      <stop offset="100%" stop-color="${wash}"/>
    </linearGradient>
    <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
      <path d="M48 0H0V48" fill="none" stroke="${line}" stroke-width="1"/>
    </pattern>
    <radialGradient id="glow" cx="50%" cy="42%" r="55%">
      <stop offset="0%" stop-color="${blue}" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="${blue}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <rect width="${w}" height="${h}" fill="url(#grid)"/>
  <rect width="${w}" height="${h}" fill="url(#glow)"/>`;

/** Corner brackets — reads as a technical framing marker. */
const brackets = (w, h, m = 56, len = 72) => {
  const stroke = `fill="none" stroke="${blue}" stroke-width="4" stroke-linecap="square"`;
  return `
  <path d="M${m} ${m + len}V${m}h${len}" ${stroke}/>
  <path d="M${w - m - len} ${m}h${len}v${len}" ${stroke}/>
  <path d="M${w - m} ${h - m - len}v${len}h-${len}" ${stroke}/>
  <path d="M${m + len} ${h - m}H${m}v-${len}" ${stroke}/>`;
};

function productPlaceholder({ name, index, total }) {
  // 3:4, matching the product frames — the shop's photographs come off a phone
  // in portrait, and a square placeholder beside them would be the odd one out.
  const w = 1000;
  const h = 1333;
  // The block was laid out against a 1000-tall canvas; keep it centred.
  const dy = (h - 1000) / 2;
  const label = escapeXml(name);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${label} — תמונה ${index} מתוך ${total} (מציין מיקום)">
${defs(w, h)}
${brackets(w, h)}
  <circle cx="${w / 2}" cy="${430 + dy}" r="150" fill="none" stroke="${line}" stroke-width="2"/>
  <circle cx="${w / 2}" cy="${430 + dy}" r="118" fill="${wash}" stroke="${blue}" stroke-width="3"/>
  <text x="${w / 2}" y="${430 + dy}" text-anchor="middle" dominant-baseline="central"
        font-family="Heebo, Arial, sans-serif" font-size="140" font-weight="700" fill="${blueDeep}">${index}</text>
  <text x="${w / 2}" y="${640 + dy}" text-anchor="middle" direction="rtl"
        font-family="Heebo, Arial, sans-serif" font-size="46" font-weight="700" fill="${ink}">${label}</text>
  <text x="${w / 2}" y="${706 + dy}" text-anchor="middle" direction="rtl"
        font-family="Heebo, Arial, sans-serif" font-size="30" fill="${slate}">תמונה ${index} מתוך ${total} · מציין מיקום</text>
  <rect x="${w / 2 - 190}" y="${770 + dy}" width="380" height="62" rx="31" fill="none" stroke="${line}" stroke-width="2"/>
  <text x="${w / 2}" y="${801 + dy}" text-anchor="middle" dominant-baseline="central"
        font-family="Heebo, Arial, sans-serif" font-size="26" letter-spacing="4" fill="${blueDeep}">ANX3D</text>
</svg>
`;
}

/** Abstract, technical rendering of a professional extraction machine. */
function heroPlaceholder() {
  const w = 1920;
  const h = 1080;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="מכונת ניקוי מקצועית — מציין מיקום">
${defs(w, h)}
  <g transform="translate(700 230)">
    <!-- body: a pale panel with blue linework, like a technical schematic -->
    <rect x="0" y="120" width="420" height="420" rx="38" fill="${panel}" stroke="${blue}" stroke-width="6"/>
    <rect x="42" y="176" width="336" height="150" rx="18" fill="${wash}" stroke="${line}" stroke-width="3"/>
    <rect x="70" y="206" width="180" height="16" rx="8" fill="${blue}"/>
    <rect x="70" y="240" width="120" height="12" rx="6" fill="${blueSoft}"/>
    <rect x="70" y="272" width="240" height="12" rx="6" fill="${blueSoft}"/>
    <!-- control dials -->
    <circle cx="130" cy="410" r="42" fill="none" stroke="${blue}" stroke-width="6"/>
    <circle cx="130" cy="410" r="11" fill="${blue}"/>
    <circle cx="250" cy="410" r="42" fill="none" stroke="${blueSoft}" stroke-width="6"/>
    <circle cx="250" cy="410" r="11" fill="${blueSoft}"/>
    <rect x="308" y="382" width="70" height="56" rx="12" fill="${blue}" fill-opacity="0.16" stroke="${blue}" stroke-width="3"/>
    <!-- handle -->
    <path d="M60 120V56a44 44 0 0144-44h212a44 44 0 0144 44v64" fill="none" stroke="${blue}" stroke-width="16" stroke-linecap="round"/>
    <!-- wheels -->
    <circle cx="80" cy="566" r="40" fill="${panel}" stroke="${blueSoft}" stroke-width="7"/>
    <circle cx="340" cy="566" r="40" fill="${panel}" stroke="${blueSoft}" stroke-width="7"/>
    <!-- hose leaving the machine -->
    <path d="M420 300c150 0 190 90 300 90s150-70 260-40"
          fill="none" stroke="${blue}" stroke-width="18" stroke-linecap="round" stroke-opacity="0.55"
          stroke-dasharray="34 22"/>
  </g>
${brackets(w, h, 72, 96)}
  <text x="380" y="900" text-anchor="middle" direction="rtl"
        font-family="Heebo, Arial, sans-serif" font-size="42" font-weight="700" fill="${ink}">מכונת ניקוי מקצועית</text>
  <text x="380" y="956" text-anchor="middle" direction="rtl"
        font-family="Heebo, Arial, sans-serif" font-size="26" fill="${slate}">מציין מיקום — להחלפה בתמונה אמיתית</text>
</svg>
`;
}

const products = [
  ['anx-pro-handle', 'ידית שאיבה ANX PRO'],
  ['anx-mini-handle', 'ידית שאיבה MINI'],
  ['anx-crystal-handle', 'ידית שאיבה CRYSTAL VIEW'],
  ['anx-hose-3m', 'צינור שאיבה מחוזק 3 מ׳'],
  ['anx-hose-5m', 'צינור שאיבה מחוזק 5 מ׳'],
  ['anx-hose-combo', 'צינור משולב שאיבה + לחץ'],
  ['anx-adapter-sabrina', 'מתאם Sabrina ↔ ידית'],
  ['anx-adapter-quick', 'מתאם ניתוק מהיר QUICK-LOCK'],
  ['anx-adapter-90', 'מתאם זווית 90°'],
];

const IMAGES_PER_PRODUCT = 3;

async function main() {
  let count = 0;

  for (const [slug, name] of products) {
    const dir = join(publicDir, 'products', slug);
    await mkdir(dir, { recursive: true });
    for (let i = 1; i <= IMAGES_PER_PRODUCT; i++) {
      await writeFile(
        join(dir, `${i}.svg`),
        productPlaceholder({ name, index: i, total: IMAGES_PER_PRODUCT }),
        'utf8',
      );
      count++;
    }
  }

  await mkdir(join(publicDir, 'hero'), { recursive: true });
  await writeFile(join(publicDir, 'hero', 'machine.svg'), heroPlaceholder(), 'utf8');
  count++;

  console.log(`נוצרו ${count} קבצי placeholder תחת public/`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
