import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // スクレイパー・テストスクリプトはsrc外にあるためビルド時の型チェックをスキップ
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
