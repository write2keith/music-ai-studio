import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [".monkeycode-ai.live"],

  experimental: {
    proxyClientMaxBodySize: "500mb",
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
