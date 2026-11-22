import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A second dev server (pnpm dev:e2e:supabase) needs its own build dir: `next dev` locks its distDir.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  cacheComponents: true,
  // The dev indicator sits bottom-left, over the chat composer's scope button on a phone-sized E2E viewport.
  ...(process.env.E2E === "1" ? { devIndicators: false as const } : {}),
  serverExternalPackages: ["@electric-sql/pglite"],
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
