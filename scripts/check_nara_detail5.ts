import { chromium } from 'playwright';

async function checkDetailPage() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
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

    // 【中止】ではない案件を探す
    const nonCancelled = await fra1.evaluate(() => {
      const table = Array.from(document.querySelectorAll('table')).find(t => t.className === 'border');
      if (!table) return null;
      const rows = Array.from(table.querySelectorAll('tr')).slice(2);
      for (const row of rows) {
        const cells = Array.from(row.querySelectorAll('th, td'));
        const cell7 = cells[7];
        if (!cell7) continue;
        const text = cell7.textContent?.trim() || '';
        if (!text.includes('【中止】')) {
          const link = (cell7 as HTMLElement).querySelector('a');
          const href = link?.getAttribute('href') || '';
          const m = href.match(/'5515','(\w+)'\)/);
          if (m) return { ankenId: m[1], title: text };
        }
      }
      return null;
    });

    if (!nonCancelled) {
      console.error('【中止】ではない案件が見つかりません');
      await browser.close();
      return;
    }

    console.log('ankenId:', nonCancelled.ankenId, 'title:', nonCancelled.title);

    // 新しいページイベントを監視
    const newPagePromise = page.waitForEvent('popup', { timeout: 10000 }).catch(() => null);

    // リンクを直接クリック
    await fra1.evaluate((id: string) => {
      const links = Array.from(document.querySelectorAll('a'));
      for (const link of links) {
        const href = link.getAttribute('href') || '';
        if (href.includes(`'5515','${id}'`)) {
          (link as HTMLElement).click();
          return true;
        }
      }
      return false;
    }, nonCancelled.ankenId);

    // 新しいページを待つ
    const newPage = await newPagePromise;
    if (newPage) {
      console.log('新しいページが開きました:', newPage.url());
      await newPage.waitForLoadState('domcontentloaded');
      await newPage.waitForTimeout(2000);

      const detail = await newPage.evaluate(() => {
        const result: any = { tables: [], bodyText: '' };

        document.querySelectorAll('table').forEach((t, i) => {
          const rows = Array.from(t.querySelectorAll('tr'));
          const tableData: any[] = [];
          rows.forEach((r, ri) => {
            const cells = Array.from(r.querySelectorAll('td, th')).map((td, ci) => ({
              text: td.textContent?.trim()
            }));
            if (cells.some(c => c.text)) {
              tableData.push(cells);
            }
          });
          if (tableData.length > 0) {
            result.tables.push({ index: i, className: t.className, rows: tableData });
          }
        });

        result.bodyText = document.body?.innerText?.substring(0, 5000) || '';
        return result;
      });

      console.log('\n=== 詳細ページのテーブル ===');
      for (const t of detail.tables.slice(0, 8)) {
        console.log(`\nテーブル${t.index}:`);
        for (const r of t.rows) {
          console.log('  ', r.map(c => c.text).join(' | '));
        }
      }

      await newPage.close();
    } else {
      console.log('新しいページは開きませんでした');
      // 現在のフレームを確認
      await page.waitForTimeout(2000);
      page.frames().forEach((f, i) => {
        console.log(`  ${i}: ${f.url().substring(0, 80)}`);
      });
    }

  } catch (e: any) {
    console.error('エラー:', e.message);
  } finally {
    await browser.close();
  }
}

checkDetailPage().catch(console.error);
