import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { site } from '@/config/site';
import { seo } from '@/content/copy';

export const dynamic = 'force-static';
export const alt = seo.ogAlt;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * Generated at build time. Replace by dropping a designed
 * src/app/opengraph-image.png (1200×630) and deleting this file.
 */
export default async function OpenGraphImage() {
  const heebo = await readFile(join(process.cwd(), 'src/assets/fonts/Heebo-Bold.ttf'));

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 72,
        background: 'linear-gradient(180deg, #0f1a2b 0%, #0b1220 100%)',
        color: '#f5f7fb',
        fontFamily: 'Heebo',
        direction: 'rtl',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 30, fontWeight: 700 }}>
        <div style={{ width: 18, height: 18, borderRadius: 4, background: '#3b82f6' }} />
        <span>{site.name}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ fontSize: 74, fontWeight: 700, lineHeight: 1.15, maxWidth: 1000 }}>{seo.ogTitle}</div>
        <div style={{ fontSize: 32, color: '#a9b4c9', maxWidth: 960, lineHeight: 1.4 }}>{seo.ogDescription}</div>
      </div>
      <div style={{ display: 'flex', gap: 36, fontSize: 24, color: '#5b9cff', fontWeight: 700 }}>
        {['מותאם למובייל', 'מותאם לגוגל', 'WhatsApp מובנה', 'בנוי ליצירת לידים'].map((t) => (
          <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 10, height: 10, borderRadius: 99, background: '#3b82f6' }} />
            <span>{t}</span>
          </div>
        ))}
      </div>
    </div>,
    { ...size, fonts: [{ name: 'Heebo', data: heebo, weight: 700, style: 'normal' }] },
  );
}
