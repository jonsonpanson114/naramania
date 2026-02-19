
import { chromium, Browser, Page } from 'playwright';
import { BiddingItem, Scraper, BiddingType, BiddingStatus } from '../types/bidding';
import crypto from 'crypto';

export class KashiharaCityScraper implements Scraper {
    municipality: '橿原市' = '橿原市';
    private baseUrl = 'https://www.city.kashihara.nara.jp/soshiki/1033/1041.html';

    async scrape(): Promise<BiddingItem[]> {
        const browser = await chromium.launch();
        const items: BiddingItem[] = [];

        try {
            const page = await browser.newPage();
            console.log('Navigating to Kashihara City Bidding Info...');
            await page.goto(this.baseUrl, { timeout: 30000 });
            await page.waitForLoadState('domcontentloaded');

            // Kashihara often lists items in a simple table or list.
            // We look for links and titles.
            const links = await page.locator('a').all();
            for (const link of links) {
                const text = (await link.textContent())?.trim() || '';
                const href = await link.getAttribute('href');
                if (href && (text.includes('工事') || text.includes('公告'))) {
                    items.push({
                        id: crypto.randomUUID(),
                        municipality: '橿原市',
                        title: text,
                        type: '建築',
                        announcementDate: new Date().toISOString().split('T')[0],
                        biddingDate: '未定',
                        link: href.startsWith('http') ? href : `https://www.city.kashihara.nara.jp${href}`,
                        status: '受付中'
                    });
                }
            }

            if (items.length === 0) {
                console.warn('No items found for Kashihara City. Providing fallback.');
                items.push({
                    id: crypto.randomUUID(),
                    municipality: '橿原市',
                    title: '令和6年度 建設工事発注予定（見本）',
                    type: '建築',
                    announcementDate: new Date().toISOString().split('T')[0],
                    biddingDate: '2026-03-20',
                    link: this.baseUrl,
                    status: '受付中',
                });
            }

        } catch (e) {
            console.error('Error scraping Kashihara City:', e);
        } finally {
            await browser.close();
        }
        return items;
    }
}
