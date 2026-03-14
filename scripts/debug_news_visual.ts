
import { chromium } from 'playwright';

async function debugNews() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    console.log('--- Debugging 建設ニュース ---');
    await page.goto('https://www.constnews.com/?s=%E5%A5%88%E8%89%AF', { waitUntil: 'networkidle' });
    await page.screenshot({ path: 'debug_constnews.png', fullPage: true });
    console.log('Screenshot saved: debug_constnews.png');
    
    console.log('--- Debugging 建通新聞 ---');
    await page.goto('https://www.kentsu.co.jp/search/search.asp?area=29', { waitUntil: 'networkidle' });
    await page.screenshot({ path: 'debug_kentsu.png', fullPage: true });
    console.log('Screenshot saved: debug_kentsu.png');
    
    await browser.close();
}

debugNews().catch(console.error);
