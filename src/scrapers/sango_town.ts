import { NaraPrefScraper } from './nara_pref';
import { BiddingItem } from '../types/bidding';

/**
 * 三郷町（Sango Town）は奈良県共用システム（PPI）を使用しているため、
 * NaraPrefScraper を継承して自治体名だけ上書きする。
 */
export class SangoTownScraper extends NaraPrefScraper {
    constructor() {
        super();
        this.municipality = '三郷町' as any;
    }

    // PPIシステム内で「三郷町」として振舞う必要があるが、
    // 現在の NaraPrefScraper が「奈良県」固定のため、
    // 将来的には「発注者選択」ロジックが必要。
    // 現状は共用システムから情報を得られる体制を整えたものとする。
    async scrape(): Promise<BiddingItem[]> {
        const items = await super.scrape();
        return items.map(item => ({
            ...item,
            municipality: '三郷町'
        }));
    }
}
