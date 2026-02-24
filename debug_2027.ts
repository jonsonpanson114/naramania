import { chromium } from 'playwright';

const BASE = 'https://nara.efftis.jp/PPI/Public';
const TOP = `${BASE}/PPUBC00100?kikanno=0201`;

async function checkPage(page: any, screenId: string, chotatsu_kbn: string, label: string) {
    console.log(`\n=== ${label} ===`);
    const searchUrl = `${BASE}/PPUBC00100!link?screenId=${screenId}&chotatsu_kbn=${chotatsu_kbn}`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);
    await page.locator('select').last().selectOption('50').catch(() => {});
    await page.waitForTimeout(500);
    await page.locator('input[value="検\u3000索"]').click({ timeout: 15000 });
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const rows = await page.locator('table tr').all();
    for (let i = 0; i < rows.length - 1; i++) {
        const cells = await rows[i].locator('td').all();
        if (cells.length !== 7) continue;
        const contractNo = (await cells[0].innerText()).trim();
        if (contractNo === '0000002027') {
            const title = (await cells[2].innerText()).trim();
            const cell5 = (await cells[5].innerText()).trim();
            console.log(`  row${i}: ${contractNo} / ${title} / cell5="${cell5}"`);
            // 次の行
            const next1 = await rows[i + 1].locator('td').all();
            const t1: string[] = [];
            for (const c of next1) t1.push((await c.innerText()).trim());
            console.log(`  row${i+1} (${next1.length}cells): ${t1.join(' / ')}`);
            // さらに次の行
            if (i + 2 < rows.length) {
                const next2 = await rows[i + 2].locator('td').all();
                const t2: string[] = [];
                for (const c of next2) t2.push((await c.innerText()).trim());
                console.log(`  row${i+2} (${next2.length}cells): ${t2.join(' / ')}`);
            }
        }
    }
}

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(TOP, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1000);

    await checkPage(page, 'PPUBC00400', '00', '建設工事/入札公告');
    await checkPage(page, 'PPUBC00700', '00', '建設工事/入札結果');
    await checkPage(page, 'PPUBC00400', '01', '業務委託/入札公告');
    await checkPage(page, 'PPUBC00700', '01', '業務委託/入札結果');

    await browser.close();
})();
