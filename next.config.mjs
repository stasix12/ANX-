/**
 * Set EXPORT=1 to build a fully static copy into out/ — used by `npm run preview`
 * and by any static host. The default build keeps Next's image optimisation.
 */
const isExport = process.env.EXPORT === '1';

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(isExport ? { output: 'export' } : {}),
  images: {
    // Product and hero artwork ships as local SVG placeholders until the real
    // photos are dropped in. next/image refuses SVG sources unless it is told
    // to allow them, and these flags are the documented way to do that safely:
    // the files are served sandboxed, script-free and never inlined.
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    // A static export has no image optimiser to call at runtime.
    ...(isExport ? { unoptimized: true } : {}),
  },
};

export default nextConfig;
