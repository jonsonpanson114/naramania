export type Municipality = '奈良県' | '奈良市' | '橿原市' | '生駒市' | '大和高田市' | '大和郡山市' | '葛城市' | '五條市' | '御所市' | '天理市' | '桜井市' | '宇陀市' | '田原本町' | '広陵町' | '香芝市' | '川西町' | '三宅町' | '山添村' | '平群町' | '安堵町' | '高取町' | '斑鳩町' | '三郷町' | '王寺町' | '大淀町';

export type BiddingType = '工事' | '委託' | 'コンサル' | '建築' | 'その他';

export type BiddingStatus = '受付中' | '締切' | '締切間近' | '締切切迫' | '受付終了' | '落札' | '不調' | '不明';

export interface BiddingItem {
  id: string; // Unique ID (hash of URL or composite key)
  municipality: Municipality;
  title: string;
  type: BiddingType;
  announcementDate: string; // ISO 8601 YYYY-MM-DD
  biddingDate?: string; // ISO 8601 YYYY-MM-DD (Deadline or Bidding date)
  link: string;
  status: BiddingStatus;
  rawHtml?: string; // Optional: for debugging or analyzing
  description?: string; // Extracted summary from PDF etc.
  estimatedPrice?: string; // 予定価格
  winningContractor?: string; // 落札業者
  designFirm?: string; // 設計事務所
  constructionPeriod?: string; // 工期
  winnerType?: 'ゼネコン' | '設計事務所' | 'その他'; // 落札種別
  pdfUrl?: string; // Link to the actual PDF document
  isForecast?: boolean; // 発注見通し由来の公告前案件（入札結果の追跡対象外）
  isIntelligenceExtracted?: boolean; // True if Gemini has processed the PDF
  extractionSource?: 'scraper' | 'gemini' | 'gemini_3.1'; // Where the data came from
  tags?: string[]; // AI generated tags for filtering
}

/**
 * 市場全体の一覧用アイテム。フィルタで本線(scraper_result.json)に採用されなかった
 * 案件も含めて保持する。対象外の土木・設備案件にも落札者・設計事務所が入っているため、
 * 「この設計事務所が自社に関係ない仕事をどれだけ取っているか」を追える。
 */
export type MarketItem = BiddingItem & {
  /** 本線の掲載対象(建築・設計監理)としてフィルタを通過したか */
  isRelevant: boolean;
};

export interface Scraper {
  municipality: Municipality;
  scrape(): Promise<BiddingItem[]>;
  getDiagnostics?(): {
    warnings?: string[];
    errors?: string[];
  };
}

