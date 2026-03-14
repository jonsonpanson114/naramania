import { chromium } from 'playwright';

async function checkDetailPage() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    // トップページ
    await page.goto('http://www.ppi06.t-elbs.jp/DENCHO/PpiJGyomuStart.do?kinouid=GP5000_Top', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);

    const gp10f = page.frames().find(f => f.url().includes('GP5000_10F'));
    const menuFrame = gp10f?.childFrames().find(f => f.url().includes('GP5000_Menu'));
    const fra1 = page.frame('fra_main1');

    if (!menuFrame || !fra1) {
      console.error('フレーム取得失敗');
      await browser.close();
      return;
    }

    // 入札結果ページに遷移
    await Promise.all([
      fra1.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      menuFrame.evaluate(() => (window as any).pf_VidDsp_btnReferenceClick('/DENCHO/GP5515_1010?gyoshuKbnCd=00')),
    ]);
    await page.waitForTimeout(2000);

    await fra1.selectOption('select[name="keisaiNen"]', '2025').catch(() => {});
    await page.waitForTimeout(300);

    await fra1.evaluate(() => {
      const topW = window.top as any;
      if (topW?.fra_hidden) topW.fra_hidden.submit_flag = 0;
      (window as any).fnc_btnSearch_Clicked();
    });
    await fra1.waitForNavigation({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    console.log('入札結果ページ:', fra1.url());

    // 最初の案件のリンクを確認
    const firstLink = await fra1.evaluate(() => {
      const table = Array.from(document.querySelectorAll('table')).find(t => t.className === 'border');
      if (!table) return null;
      const rows = Array.from(table.querySelectorAll('tr')).slice(2);
      const first = rows[0];
      if (!first) return null;
      const cells = Array.from(first.querySelectorAll('th, td'));
      const cell7 = cells[7];
      if (!cell7) return null;
      const link = (cell7 as HTMLElement).querySelector('a');
      return {
        text: cell7.textContent?.trim(),
        href: link?.getAttribute('href'),
        onclick: link?.getAttribute('onclick')
      };
    });

    console.log('最初のリンク:', JSON.stringify(firstLink, null, 2));

    // onclickの内容からankenIdを抽出
    if (firstLink?.onclick) {
      const m = firstLink.onclick.match(/'(\w+)'\)/);
      if (m) {
        const ankenId = m[1];
        console.log('ankenId:', ankenId);

        // onclickを直接実行してみる
        await fra1.evaluate((code: string) => {
          try {
            const match = code.match(/'(\w+)'\)/);
            if (match) {
              const id = match[1];
              // 関数を探す
              const funcs = [];
              for (const key in window) {
                if (typeof (window as any)[key] === 'function' && key.toLowerCase().includes('detail')) {
                  funcs.push(key);
                }
              }
              console.log('detail関連関数:', funcs);
            }
          } catch (e: any) {
            console.error(e.message);
          }
        }, firstLink.onclick);
        await page.waitForTimeout(1000);
      }
    }

  } catch (e: any) {
    console.error('エラー:', e.message);
    console.error(e.stack?.split('\n')?.slice(0, 5));
  } finally {
    await browser.close();
  }
}

checkDetailPage().catch(console.error);
