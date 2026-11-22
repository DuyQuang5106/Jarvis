import type { NextConfig } from "next";

// Images load only from the app itself: markdown from the model could otherwise point an <img> at any
// host and carry data out in the URL. Other directives stay open (Supabase login, dev tooling).
const CSP = ["img-src 'self' data: blob:", "object-src 'none'", "base-uri 'self'"].join("; ");

const nextConfig: NextConfig = {
  // A second dev server (pnpm dev:e2e:supabase) needs its own build dir: `next dev` locks its distDir.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  cacheComponents: true,
  // The dev indicator sits bottom-left, over the chat composer's scope button on a phone-sized E2E viewport.
  ...(process.env.E2E === "1" ? { devIndicators: false as const } : {}),
  serverExternalPackages: ["@electric-sql/pglite"],
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "Content-Security-Policy", value: CSP }] }];
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
