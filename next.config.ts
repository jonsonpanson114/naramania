import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // typescript.ignoreBuildErrors は設定しない。
  // 「スクレイパー・テストスクリプトはsrc外にあるから」という理由で無視していたが、
  // tsconfig.json は元から scripts/** を exclude しているので、
  // ビルド時の型検査がそれらを見ることはなく、無視する理由になっていなかった。
  // 結果として src の型エラーまで素通りする状態だった。
  // scripts 側は tsconfig.scripts.json で別途 npm run typecheck が検査する。
  // 動的ルート(/api/chat, /project/[id] など)は実行時に
  // scraper_result.json を fs で読む。Vercel のサーバーレス関数は
  // 明示しないとこのファイルを同梱しないため、チャットや詳細APIが
  // データ0件になる。トレース対象に含めて必ずバンドルさせる。
  outputFileTracingIncludes: {
    '/api/chat': ['./scraper_result.json'],
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
