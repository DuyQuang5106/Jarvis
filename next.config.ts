import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A second dev server (pnpm dev:e2e:supabase) needs its own build dir: `next dev` locks its distDir.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  cacheComponents: true,
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
