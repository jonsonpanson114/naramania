# プロジェクト引き継ぎドキュメント: Naramania

## 1. プロジェクト概要
### 目的
奈良県および県内各自治体の入札情報を自動収集し、PDF（公告・結果）からAIで「予定価格」「落札者」「業務概要」などを抽出・可視化するポータルサイト。

### 収集方針（2026-07 更新）
- **今年度（2026年4月1日以降）の建築・建物系案件が対象**。過年度分の網羅・補完は行わない。
- 外壁・防水・空調・設備単体の工事は対象外（`config/data_filters.json` で除外）。

### 主な機能
- **マルチ自治体スクレイピング**: 奈良県含む25自治体の入札情報を個別ロジックで取得。
- **AIインテリジェンス抽出**: Gemini API でPDFから非構造化データを抽出しJSON化。
- **自動運用**: GitHub Actions（平日2回の daily scrape ＋ 平日3回の live source audit）。
- **分析ダッシュボード**: 受付中・直近開札・結果追跡待ちを優先表示。

---

## 2. 技術スタックと構成
- **Frontend/Backend**: Next.js (App Router), TypeScript, Tailwind CSS
- **Scraping**: Playwright, Axios, Cheerio
- **AI**: Google Gemini API（PDF: gemini-2.5-flash 系、環境変数で差し替え可）
- **Workflow**: GitHub Actions（奈良県のみ self-hosted Windows runner で手動実行）

### ディレクトリ構成
- `src/scrapers/`: 各自治体のスクレイピングロジック。`index.ts` が司令塔。
- `src/scrapers/common/fiscal_year.ts`: 年度（令和年度）ヘルパー。年度依存URL・日付はここで解決。
- `src/lib/`: 品質集計・結果追跡・実務フィルタ。
- `scripts/`: 検証・運用スクリプト（`validate_*.ts`, `update_selected_municipalities.ts` 等）。
- `scripts/debug/`: 一時デバッグスクリプト置き場。
- `scraper_result.json`: 全自治体の集計済みマスターデータ。

---

## 3. 2026-07-08 メンテナンスで実施した内容
1. **ゼロ件3自治体の復旧**
   - 王寺町: ハードコード除外とページ全文フィルタ誤爆を解消 → 今年度2件（やわらぎ会館改修工事ほか）取得。
   - 大和高田市: 入札結果ページを令和N年度リンクから動的解決（旧: R7固定URL）。
   - 安堵町: 「令和8年度以降スキップ」の逆向きハードコードを現在年度基準に修正。
2. **鮮度切れ5自治体の年度ロジック修正**
   - 広陵町: 開札日の年ハードコード（2025固定）を年度ページの令和N年度から算出 → 今年度2件が正しい日付で取得。誤日付の旧データ2件は除去済み。
   - 三宅町: 年度替わりでURLが変わる公告・結果ページを総務課ページから動的解決（NFKC正規化で全角括弧対応）→ 今年度2件（受付中）取得。
   - 山添村: 固定URL方式をnewsリスト自動発見に変更。
   - 平群町: 404になった補助URLを整理。大淀町: ソースに今年度対象案件なし（正常）。
3. **CI恒常失敗の根本修正（重要）**
   - 原因: AI要約・タグに「空調設備」「調査」等が入ると `shouldKeepBiddingItem` が建築案件を対象外に反転 → Validate Quality が失敗 → データ・AI抽出が一切コミットされないループ。
   - 修正: 除外判定はタイトル（＋スクレイパー由来テキスト）のみ。AI由来テキストは救済にのみ使用。
4. **結果追跡を今年度スコープに変更**
   - 追跡対象は今年度案件のみ（26件→13件）。川西町の発注見通し由来4件は `isForecast` フラグで公告前案件として追跡対象外に。
   - 田原本町PPIは結果未公開を確認済み（追跡待ちは正当な状態）。
5. **重複整理**: 同一入札の二重掲載（不調→再入札）8件をマージ。残る同名レコードは別契約・別入札ラウンドで正当。

---

## 4. 運用メモ
- **奈良県スクレイプ**: self-hosted Windows runner を起動してから `Nara Prefecture Scrape` workflow を手動実行。
- **選択自治体だけ更新**: `npx tsx scripts/update_selected_municipalities.ts oji miyake ...`
- **品質チェック一式**: `npm run validate:quality && npm run validate:filters && npm run validate:snapshots`
- **AI抽出**: daily scrape 内で `augment:intelligence` が実行される。CI修正後は抽出結果がコミットされるようになる（PDF付き案件の未抽出分は数回のdaily runで順次消化される）。

## 5. Next Action 候補
1. daily scrape 数回分のAI抽出消化を見守り、`quality_watch_report.json` の追跡待ち13件が結果公開とともに解消されるか確認。
2. 奈良県 runner の定期起動運用（現状手動）。
3. 大淀町の落札者文字列の軽微なゴミ（「1１．」等）のクリーニング。
