import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.route('**/*', async (route) => {
    const response = await route.fetch();
    const headers = response.headers();
    if ((headers['content-type'] || '').includes('text/html')) {
      await route.fulfill({ response, body: await response.body(), headers: { ...headers, 'content-type': 'text/html; charset=utf-8' } });
    } else await route.fallback();
  });
  await page.goto('https://tawaramoto.efftis.jp/PPI/Public/PPUBC00100', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  await page.goto('https://tawaramoto.efftis.jp/PPI/Public/PPUBC00100!link?screenId=PPUBC00700&chotatsu_kbn=00', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.locator('select').last().selectOption('50').catch(() => {});
  await page.locator('input[value="検　索"]').click({ timeout: 15000 });
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const rows = await page.locator('table tr').all();
  console.log('rows:', rows.length);
  for (let i = 0; i < rows.length; i++) {
    const cells = await rows[i].locator('td').all();
    const texts: string[] = [];
    for (const c of cells) texts.push((await c.innerText()).replace(/\s+/g, ' ').trim().slice(0, 25));
    console.log(i, `(${cells.length})`, JSON.stringify(texts));
  }
  await browser.close();
}
main();
