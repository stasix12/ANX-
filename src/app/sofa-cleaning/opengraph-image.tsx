import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { business, priceList, serviceAreas } from '@/lib/hamavrik/config';

/**
 * The card WhatsApp, Facebook and Google show when a link to this site is
 * shared. It is the real thing: the corner sofa from Beer Sheva, before on
 * the left and after on the right (the same layout as the sliders on the
 * site), the real logo, the starting price and the WhatsApp number.
 * Rendered once at build time with Heebo 800 (bundled in _fonts/).
 */
export const dynamic = 'force-static';

/**
 * Satori lays text out left-to-right with no bidi reordering, so Hebrew
 * comes out mirrored. This hands it the VISUAL order: the string reversed
 * token by token, with Latin/digit runs (phone numbers, prices) kept intact.
 */
function visual(text: string): string {
  return (text.match(/[0-9A-Za-z]+|./gu) ?? []).reverse().join('');
}

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = `${business.name} – ניקוי ספות עד הבית, לפני ואחרי`;

const PHOTO_H = 500;

const dataUrl = (buf: Buffer, mime: string) => `data:${mime};base64,${buf.toString('base64')}`;

export default async function OpengraphImage() {
  const root = process.cwd();
  const [heebo, before, after, logo] = await Promise.all([
    readFile(join(root, 'src/app/sofa-cleaning/_fonts/heebo-800.ttf')),
    readFile(join(root, 'public/hamavrik/jobs/sofa-corner-wide-before.jpg')),
    readFile(join(root, 'public/hamavrik/jobs/sofa-corner-wide-after.jpg')),
    readFile(join(root, 'public/hamavrik/brand/logo.png')),
  ]);
  const price = priceList[0]?.from;

  const label = (text: string, bg: string, side: 'left' | 'right') => (
    <div
      style={{
        position: 'absolute',
        top: 24,
        [side]: 24,
        display: 'flex',
        background: bg,
        color: '#ffffff',
        borderRadius: 999,
        padding: '10px 26px',
        fontSize: 30,
        lineHeight: 1,
      }}
    >
      {text}
    </div>
  );

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#ffffff', fontFamily: 'Heebo' }}>
        {/* Two real photos, edge to edge. */}
        <div style={{ display: 'flex', width: 1200, height: PHOTO_H, position: 'relative' }}>
          <div style={{ display: 'flex', width: 598, height: PHOTO_H, position: 'relative', overflow: 'hidden' }}>
            <img src={dataUrl(before, 'image/jpeg')} width={598} height={PHOTO_H} style={{ objectFit: 'cover', objectPosition: 'center' }} />
            {label(visual('לפני'), 'rgba(15,23,42,0.75)', 'left')}
          </div>
          <div style={{ display: 'flex', width: 4, height: PHOTO_H, background: '#ffffff' }} />
          <div style={{ display: 'flex', width: 598, height: PHOTO_H, position: 'relative', overflow: 'hidden' }}>
            <img src={dataUrl(after, 'image/jpeg')} width={598} height={PHOTO_H} style={{ objectFit: 'cover', objectPosition: 'center' }} />
            {label(visual('אחרי'), '#16a34a', 'right')}
          </div>
        </div>

        {/* White bar: logo on the right (RTL start), price and WhatsApp on the left. */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'row-reverse',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: 1200,
            height: 630 - PHOTO_H,
            padding: '0 40px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
            <img src={dataUrl(logo, 'image/png')} width={278} height={70} style={{ objectFit: 'contain' }} />
            <div style={{ display: 'flex', fontSize: 22, color: '#475569', lineHeight: 1 }}>
              {visual(`ניקוי ספות עד הבית · ${serviceAreas.primary.join(' ו')}`)}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                background: '#16a34a',
                color: '#ffffff',
                borderRadius: 999,
                padding: '16px 30px',
                fontSize: 30,
                lineHeight: 1,
              }}
            >
              {`WhatsApp ${business.phoneDisplay}`}
            </div>
            {price ? (
              <div style={{ display: 'flex', fontSize: 34, color: '#1a56db', lineHeight: 1 }}>{visual(`החל מ-${price} ₪`)}</div>
            ) : null}
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: 'Heebo', data: heebo, weight: 800, style: 'normal' }] },
  );
}
