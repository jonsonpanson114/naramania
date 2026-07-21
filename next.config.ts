import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // スクレイパー・テストスクリプトはsrc外にあるためビルド時の型チェックをスキップ
    ignoreBuildErrors: true,
  },
  // 動的ルート(/api/chat, /project/[id] など)は実行時に
  // scraper_result.json を fs で読む。Vercel のサーバーレス関数は
  // 明示しないとこのファイルを同梱しないため、チャットや詳細APIが
  // データ0件になる。トレース対象に含めて必ずバンドルさせる。
  outputFileTracingIncludes: {
    '/api/chat': ['./scraper_result.json'],
    '/api/scrape': ['./scraper_result.json'],
    '/api/analyze': ['./scraper_result.json'],
    '/project/[id]': ['./scraper_result.json'],
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
