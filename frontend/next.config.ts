import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [".monkeycode-ai.live", "127.0.0.1", "localhost"],

  transpilePackages: ["soundtouchjs", "vexflow"],

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
