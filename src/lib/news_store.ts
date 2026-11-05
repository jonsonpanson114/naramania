import fs from 'fs';
import path from 'path';
import type { NewsItem, NewsSourceReport } from '@/services/news_service';

/**
 * 定期巡回(scripts/collect_news.ts)が貯めたニュース。
 *
 * 以前は画面を開くたびに各媒体へ取りに行っていたため、過去の記事が残らず、
 * ブラウザ自動操作が要る媒体は本番で0件になっていた。画面はこのファイルを読むだけにする。
 */
export interface NewsStore {
    generatedAt: string | null;
    sources: NewsSourceReport[];
    items: NewsItem[];
}

export const NEWS_STORE_FILE = 'news_items.json';

export function loadNewsStore(): NewsStore {
    try {
        const raw = fs.readFileSync(path.join(process.cwd(), NEWS_STORE_FILE), 'utf-8');
        const parsed = JSON.parse(raw) as Partial<NewsStore>;
        return {
            generatedAt: parsed.generatedAt ?? null,
            sources: parsed.sources ?? [],
            items: parsed.items ?? [],
        };
    } catch {
        return { generatedAt: null, sources: [], items: [] };
    }
}
