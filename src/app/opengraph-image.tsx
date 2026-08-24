import { ImageResponse } from 'next/og';

/**
 * Placeholder OG image, generated as a real PNG at build time so link previews
 * work everywhere. Latin-only copy: ImageResponse ships without a Hebrew face.
 * Swap this file for a static public/og.jpg once brand artwork is ready.
 */
/** The artwork never changes at runtime, so bake it at build time. */
export const dynamic = 'force-static';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'ANX3D — Professional Cleaning Equipment';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '90px',
          background: 'linear-gradient(135deg, #ffffff 0%, #eef2f5 100%)',
          color: '#16232e',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <div
            style={{
              width: 92,
              height: 92,
              borderRadius: 26,
              background: 'linear-gradient(135deg, #56a3cf 0%, #123554 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 52,
              fontWeight: 800,
              color: '#fff',
            }}
          >
            A
          </div>
          <div style={{ fontSize: 76, fontWeight: 800, letterSpacing: 10 }}>ANX3D</div>
        </div>

        <div style={{ marginTop: 44, fontSize: 42, color: '#3d5872', maxWidth: 900 }}>
          Professional Cleaning Equipment
        </div>

        <div style={{ marginTop: 18, fontSize: 34, color: '#23568b' }}>
          Handles · Hoses · Adapters — built for Sabrina machines
        </div>

        <div
          style={{
            marginTop: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            fontSize: 28,
            color: '#55708a',
          }}
        >
          <div style={{ width: 60, height: 4, background: '#23568b' }} />
          <div>WhatsApp 053-5257250</div>
        </div>
      </div>
    ),
    size,
  );
}
