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
  // 年度ラジオの value を列挙して令和8を選ぶ
  for (const r of await page.locator('input[type=radio]').all()) {
    const name = await r.getAttribute('name');
    const value = await r.getAttribute('value');
    if (name && /nendo|year/i.test(name)) console.log('radio:', name, value);
  }
  // ラベルテキストで選択
  const radios = await page.locator('input[type=radio]').all();
  for (const r of radios) {
    const id = await r.getAttribute('id');
    if (!id) continue;
    const label = await page.locator(`label[for="${id}"]`).innerText().catch(() => '');
    if (label.includes('令和８') || label.includes('令和8')) { await r.check(); console.log('checked 令和8'); break; }
  }
  await page.locator('select').last().selectOption('50').catch(() => {});
  await page.locator('input[value="検　索"]').click({ timeout: 15000 });
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  const idx = body.search(/該当|検索結果/);
  console.log('msg:', body.slice(Math.max(0, idx - 50), idx + 300));
  const rows = await page.locator('table tr').all();
  console.log('rows:', rows.length);
  for (let i = 0; i < rows.length; i++) {
    const cells = await rows[i].locator('td').all();
    if (cells.length < 5) continue;
    const texts: string[] = [];
    for (const c of cells) texts.push((await c.innerText()).replace(/\s+/g, ' ').trim().slice(0, 22));
    console.log(i, `(${cells.length})`, JSON.stringify(texts));
  }
  await browser.close();
}
main();
