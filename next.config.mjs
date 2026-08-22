/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Product and hero artwork ships as local SVG placeholders until the real
    // photos are dropped in. next/image refuses SVG sources unless it is told
    // to allow them, and these flags are the documented way to do that safely:
    // the files are served sandboxed, script-free and never inlined.
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
};

export default nextConfig;
