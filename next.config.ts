import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // スクレイパー・テストスクリプトはsrc外にあるためビルド時の型チェックをスキップ
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "ui-avatars.com",
      },
    ],
  },
};

export default nextConfig;
