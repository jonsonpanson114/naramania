export type Municipality = '奈良県' | '奈良市' | '橿原市' | '生駒市' | '大和高田市' | '大和郡山市' | '葛城市' | '五條市' | '天理市';

export type BiddingType = '工事' | '委託' | 'コンサル' | '建築' | 'その他';

export type BiddingStatus = '受付中' | '締切間近' | '受付終了' | '落札' | '不明';

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
  winningContractor?: string; // 落札者（ゼネコン）
  designFirm?: string; // 設計事務所
  constructionPeriod?: string; // 工期
  pdfUrl?: string; // Link to the actual PDF document
  isIntelligenceExtracted?: boolean; // True if Gemini has processed the PDF
}

export interface Scraper {
  municipality: Municipality;
  scrape(): Promise<BiddingItem[]>;
}
