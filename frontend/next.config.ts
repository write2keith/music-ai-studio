import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [".monkeycode-ai.live", "127.0.0.1", "localhost"],

  transpilePackages: ["soundtouchjs", "vexflow", "@coderline/alphatab"],

  turbopack: {
    root: ".",
  },

  experimental: {
    proxyClientMaxBodySize: "500mb",
  },

  webpack(config) {
    // alphaTab webpack plugin (webpack-only; Turbopack copies assets via postinstall)
    try {
      const { AlphaTabWebPackPlugin } = require("@coderline/alphatab-webpack");
      config.plugins.push(
        new AlphaTabWebPackPlugin({
          assetOutputDir: "public/alphatab",
        })
      );
    } catch {}
    return config;
  },

  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:8000/api/:path*",
      },
    ];
  },
};

export default nextConfig;
