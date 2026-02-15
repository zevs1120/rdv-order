const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  experimental: {
    serverActions: { allowedOrigins: [] }
  }
};

module.exports = nextConfig;
