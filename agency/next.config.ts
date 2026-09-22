import type { NextConfig } from 'next';

/**
 * EXPORT=1 produces a fully static copy in out/ (used by scripts/build-preview.mjs
 * to hand someone a preview). Response headers cannot be set on a static export.
 */
const isExport = process.env.EXPORT === '1';

const nextConfig: NextConfig = {
  ...(isExport ? { output: 'export', trailingSlash: false, assetPrefix: './site' } : {}),
  poweredByHeader: false,
  // This app lives inside a larger repo with its own lockfile; pin the root so
  // Turbopack does not pick the parent one.
  turbopack: { root: __dirname },
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  async headers() {
    if (isExport) return [];
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
  experimental: {
    // Tailwind's CSS is small; inlining it removes a render-blocking request
    // for first-time visitors (the only visitors a lead-gen page has).
    inlineCss: true,
  },
};

export default nextConfig;
