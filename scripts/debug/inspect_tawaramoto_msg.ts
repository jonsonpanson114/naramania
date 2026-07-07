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
  await page.locator('input[value="検　索"]').click({ timeout: 15000 });
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const body = await page.locator('body').innerText();
  console.log('URL:', page.url());
  const t = body.replace(/\s+/g, ' ');
  const idx = t.search(/該当|件数|データ|エラー/);
  console.log('msg:', idx >= 0 ? t.slice(Math.max(0, idx - 80), idx + 200) : '(見つからず)');
  console.log('--- 年度radio checked?');
  for (const r of await page.locator('input[type=radio]').all()) {
    const checked = await r.isChecked().catch(() => false);
    if (checked) console.log('checked value:', await r.getAttribute('value'), 'name:', await r.getAttribute('name'));
  }
  await browser.close();
}
main();
