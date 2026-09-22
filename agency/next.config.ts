import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // This app lives inside a larger repo with its own lockfile; pin the root so
  // Turbopack does not pick the parent one.
  turbopack: { root: __dirname },
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  experimental: {
    // Tailwind's CSS is small; inlining it removes a render-blocking request
    // for first-time visitors (the only visitors a lead-gen page has).
    inlineCss: true,
  },
};

export default nextConfig;
