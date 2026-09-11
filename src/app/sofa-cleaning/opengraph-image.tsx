import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { business, priceList, serviceAreas } from '@/lib/hamavrik/config';

/**
 * Open Graph card for every page of the cleaning site, rendered at build
 * time with the brand's Hebrew face (Heebo 800, bundled in _fonts/) so the
 * WhatsApp / Facebook preview reads as the site does. Replace with a real
 * photo card by dropping opengraph-image.jpg next to this file.
 */
export const dynamic = 'force-static';

/**
 * Satori (the renderer behind ImageResponse) lays text out left-to-right
 * with no bidi reordering, so Hebrew comes out mirrored. This hands it the
 * VISUAL order instead: the string is reversed token by token, keeping
 * Latin/digit runs (phone numbers, prices) intact. Lines must be broken by
 * hand — a reversed string that wraps would put the end of the sentence on
 * the first line.
 */
function visual(text: string): string {
  return (text.match(/[0-9A-Za-z]+|./gu) ?? []).reverse().join('');
}
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = `${business.name} — ניקוי ספות מקצועי בבית הלקוח`;

export default async function OpengraphImage() {
  const heebo = await readFile(join(process.cwd(), 'src/app/sofa-cleaning/_fonts/heebo-800.ttf'));
  const price = priceList[0]?.from;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 84px',
          background: 'linear-gradient(150deg, #071a3a 0%, #0a2757 55%, #0d3470 100%)',
          color: '#ffffff',
          fontFamily: 'Heebo',
          alignItems: 'flex-end',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'row-reverse', alignItems: 'center', gap: 20 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              background: '#1a56db',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg viewBox="0 0 24 24" width="40" height="40" fill="#ffffff">
              <path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z" />
            </svg>
          </div>
          <div style={{ display: 'flex', flexDirection: 'row-reverse', fontSize: 44, gap: 14 }}>
            <span>{visual(business.wordmark[0])}</span>
            <span style={{ color: '#7dd3fc' }}>{visual(business.wordmark[1])}</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 18 }}>
          <div style={{ fontSize: 84, lineHeight: 1.05 }}>{visual('הספה שלכם יכולה')}</div>
          <div style={{ fontSize: 84, lineHeight: 1.05 }}>{visual('להיראות אחרת לגמרי.')}</div>
          <div style={{ fontSize: 36, color: 'rgba(255,255,255,0.8)', marginTop: 12 }}>
            {visual(`ניקוי ספות מקצועי בבית הלקוח · ${serviceAreas.primary.join(', ')} ו${serviceAreas.regionLabel}`)}
          </div>
        </div>

        <div style={{ display: 'flex', width: '100%', flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              background: '#16a34a',
              borderRadius: 999,
              padding: '18px 36px',
              fontSize: 34,
            }}
          >
            {`WhatsApp ${business.phoneDisplay}`}
          </div>
          {price ? (
            <div style={{ display: 'flex', fontSize: 34, color: '#7dd3fc' }}>{visual(`החל מ-${price} ₪`)}</div>
          ) : null}
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: 'Heebo', data: heebo, weight: 800, style: 'normal' }] },
  );
}
