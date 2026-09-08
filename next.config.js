const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep batch verification output separate from an active local preview.
  distDir: process.env.RDV_BUILD_DIR || ".next",
  outputFileTracingRoot: path.join(__dirname),
  experimental: {
    serverActions: { allowedOrigins: [] }
  },
  async headers() {
    return [
      {
        source: "/icons/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" }
        ]
      },
      {
        source: "/menus/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }
        ]
      }
    ];
  }
};

module.exports = nextConfig;
