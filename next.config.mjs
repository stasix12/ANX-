/**
 * Set EXPORT=1 to build a fully static copy into out/ — used by `npm run preview`
 * and by any static host. The default build keeps Next's image optimisation.
 */
const isExport = process.env.EXPORT === '1';

/**
 * GitHub Pages serves a project site from a sub-path (/ANX-), so every link and
 * asset has to be prefixed. Empty everywhere else, including the single-file
 * preview and a future custom domain, where the site sits at the root.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // trailingSlash makes the export emit products/<slug>/index.html rather than
  // products/<slug>.html, so every page resolves as a plain directory index on
  // any static host, without relying on extensionless-URL rewriting.
  ...(isExport ? { output: 'export', trailingSlash: true } : {}),
  ...(basePath ? { basePath } : {}),
  images: {
    // Product and hero artwork ships as local SVG placeholders until the real
    // photos are dropped in. next/image refuses SVG sources unless it is told
    // to allow them, and these flags are the documented way to do that safely:
    // the files are served sandboxed, script-free and never inlined.
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    // Uploaded product photos are served from Supabase Storage, not this
    // site's own origin — the optimiser refuses an unlisted remote host.
    remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co', pathname: '/storage/**' }],
    // A static export has no image optimiser to call at runtime.
    ...(isExport ? { unoptimized: true } : {}),
  },
};

export default nextConfig;
