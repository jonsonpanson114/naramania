# naramania

奈良県建築・入札情報収集・分析アプリ

## 概要

naramaniaは、奈良県内22自治体の入札公告・落札結果を自動収集・分析するWebアプリケーションです。

- **入札情報収集**: 22自治体の入札公告・落札結果を自動スクレイピング
- **AIインテリジェンス抽出**: Google AIで案件内容を解析・分類
- **ダッシュボード**: 全案件数、新着更新、AI抽出/除外状況の可視化
- **落札実績ランキング**: 業者別受注ランキング
- **レーダーチャート**: 業者別得意分野分析

## 技術スタック

- **Frontend**: Next.js 16 + TypeScript + React 19
- **Styling**: Tailwind CSS + Framer Motion
- **Scraping**: Playwright + axios + cheerio
- **AI**: Google Generative AI (Gemini)
- **Visualization**: Recharts
- **Fonts**: Shippori Mincho (Google Fonts)

## プロジェクト構造

```
naramania/
├── src/
│   ├── app/              # Next.jsページとAPIルート
│   ├── components/        # Reactコンポーネント
│   ├── scrapers/         # 入札情報スクレイパー（22自治体対応）
│   ├── services/         # 外部サービス連携（ニュース、AI）
│   └── types/           # TypeScript型定義
├── scripts/             # 一時スクリプト・デバッグファイル
├── public/             # 静的リソース
└── scraper_result.json  # スクレイピング結果データ
```

## 対応自治体

| 自治体 | スクレイパー | 実績（2026-02-25時点） |
|--------|------------|------------------------|
| 奈良県 | `nara_pref.ts` | 244件 |
| 奈良市 | `nara_city.ts` | 85件 |
| 橿原市 | `kashihara_city.ts` | 98件 |
| 大和高田市 | `yamato_takada_city.ts` | 21件 |
| 大和郡山市 | `yamatokoriyama_city.ts` | 23件 |
| 葛城市 | `katsuragi_city.ts` | 70件 |
| 天理市 | `tenri_city.ts` | 2件 |
| 桜井市 | `sakurai_city.ts` | 1件 |
| 五條市 | `gojo_city.ts` | 0件（非建築のみ） |
| 御所市 | `gose_city.ts` | - |
| 宇陀市 | `uda_city.ts` | - |
| 斑鳩町 | `kashiba_city.ts` | - |
| 三郷町 | `miyake_city.ts` | - |
| 田原本町 | `tawaramoto_town.ts` | - |
| 広陵町 | `koryo_town.ts` | - |
| 香芝市 | `kawanishi_city.ts` | - |
| 川西村 | `kawanishi_city.ts` | - |
| 安堵町 | `ando_city.ts` | - |
| 山添村 | `yamazohiragawa_city.ts` | - |
| 平群町 | `kawanishi_city.ts` | - |
| 高取町 | `takatori_ikaruga.ts` | - |

## セットアップ

### 環境変数の設定

`.env.local`ファイルを作成し、以下の環境変数を設定します：

```bash
GOOGLE_GENERATIVE_AI_API_KEY=your_api_key_here
NODE_OPTIONS=--no-deprecation
```

### 依存パッケージのインストール

```bash
npm install
```

### 開発サーバーの起動

```bash
npm run dev
```

ブラウザで [http://localhost:3000](http://localhost:3000) にアクセスします。

## スクレイパーの実行

すべての自治体の入札情報を収集する場合：

```bash
# PowerShellの場合
powershell -ExecutionPolicy Bypass -Command "cd naramania; npx tsx src/scrapers/index.ts"

# Bash/Command Promptの場合
npx tsx src/scrapers/index.ts
```

実行時間: 約7〜8分

## データ管理

### スクレイピング結果

- **ファイル**: `scraper_result.json`
- **形式**: JSON配列
- **件数**: 約540件（2026-02-25時点）

### 重複除外

スクレイパーは以下のロジックで重複を除外します：

1. **落札ステータス優先**: Mapベースで管理
2. **マージ処理**: 新しい情報で既存データを更新
3. **日付降順**: 公告日でソート

### 落札者情報

- **奈良市**: テーブルから抽出
- **橿原市**: PDF解析（pdfjs-dist）
- **奈良県**: 個別詳細ページアクセスが必要（未実装）

## APIエンドポイント

### GET /api/scrape
スクレイピング結果を取得します。

### POST /api/scrape
スクレイピングを実行します（現在は既存データを返すのみ）。

### GET /api/news
建設関連ニュースを取得します（15分キャッシュ）。

### POST /api/analyze
AIによる案件解析を実行します。

## ビルド

```bash
npm run build
```

## デプロイ

### Vercelへのデプロイ

```bash
npm run build
npm start
```

または [Vercel Platform](https://vercel.com/new) から直接デプロイします。

## 開発ガイド

### コンポーネントの追加

新しいコンポーネントは `src/components/` に追加します。

### スクレイパーの追加

新しい自治体のスクレイパーは以下の手順で追加します：

1. `src/scrapers/[municipality]_city.ts` を作成
2. `Scraper` インターフェースを実装
3. `src/scrapers/index.ts` にインポートして登録

### スタイリング

Tailwind CSSを使用しています。クラス命名規則に従ってください。

## ライセンス

MIT

## 貢献

プルリクエストを歓迎します。

## コンタクト

問題やご要望は [GitHub Issues](https://github.com/yourusername/naramania/issues) までご連絡ください。
