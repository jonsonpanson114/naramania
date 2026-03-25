import { NaraPrefScraper } from './nara_pref';
import { BiddingItem, Scraper } from '../types/bidding';

/**
 * 三郷町（Sango Town）は奈良県共用システム（PPI）を使用しているため、
 * NaraPrefScraper を内部的に使用して自治体名だけ上書きする。
 */
export class SangoTownScraper implements Scraper {
    municipality: '三郷町' = '三郷町' as const;

    async scrape(): Promise<BiddingItem[]> {
        const scraper = new NaraPrefScraper();
        const items = await scraper.scrape();
        return items.map(item => ({
            ...item,
            municipality: '三郷町' as const,
            id: item.id.replace('nara-pref-', 'sango-'),
        }));
    }
}
