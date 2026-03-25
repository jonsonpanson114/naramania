import { chromium } from 'playwright';

interface WindowWithFrame extends Window {
  fra_hidden?: { submit_flag: number };
  fnc_btnSearch_Clicked?: () => void;
  pf_VidDsp_btnReferenceClick?: (url: string) => void;
  pf_VidDsp_btnDetailClick?: (id: string) => void;
}

interface TopWindow extends Window {
  fra_hidden?: { submit_flag: number };
}

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
      menuFrame.evaluate(() => (window as WindowWithFrame).pf_VidDsp_btnReferenceClick?.('/DENCHO/GP5515_1010?gyoshuKbnCd=00')),
    ]);
    await page.waitForTimeout(2000);

    await fra1.selectOption('select[name="keisaiNen"]', '2025').catch(() => {});
    await page.waitForTimeout(300);

    await fra1.evaluate(() => {
      const topW = window.top as TopWindow | null;
      if (topW?.fra_hidden) topW.fra_hidden.submit_flag = 0;
      (window as WindowWithFrame).fnc_btnSearch_Clicked?.();
    });
    await fra1.waitForNavigation({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    console.log('入札結果ページ:', fra1.url());

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
      const href = link?.getAttribute('href') || '';
      const m = href.match(/'5515','(\w+)'\)/);
      return m ? m[1] : null;
    });

    if (!firstLink) {
      console.error('リンクが見つかりません');
      await browser.close();
      return;
    }

    console.log('ankenId:', firstLink);

    // 新しいページまたはフレームを開く
    await fra1.evaluate((id: string) => (window as WindowWithFrame).pf_VidDsp_btnDetailClick?.(id), firstLink);

    // 少し待ってから、新しいフレームまたはページを確認
    await page.waitForTimeout(5000);

    // 新しいフレームを探す
    console.log('フレーム一覧:');
    page.frames().forEach((f, i) => {
      console.log(`  ${i}: ${f.url().substring(0, 80)}`);
    });

    // 詳細フレームを探す
    const detailFrame = page.frames().find(f => f.url().includes('GP5515_1020')) || fra1;
    console.log('詳細フレーム:', detailFrame.url());

    await page.waitForTimeout(2000);

    const detail = await detailFrame.evaluate(() => {
      const result: { tables: Array<{ index: number; rows: unknown[][] }>; bodyText: string } = { tables: [], bodyText: '' };

      document.querySelectorAll('table').forEach((t, i) => {
        const rows = Array.from(t.querySelectorAll('tr'));
        const tableData: unknown[][] = [];
        rows.forEach((_r, _ri) => {
          const cells = Array.from(r.querySelectorAll('td, th')).map(td => ({
            text: td.textContent?.trim(),
            html: td.innerHTML?.substring(0, 100)
          }));
          if (cells.some(c => c && typeof c === 'object' && 'text' in c && c.text)) {
            tableData.push(cells);
          }
        });
        if (tableData.length > 0) {
          result.tables.push({ index: i, rows: tableData });
        }
      });

      result.bodyText = document.body?.innerText?.substring(0, 5000) || '';
      return result;
    });

    console.log('\n=== 詳細ページのテーブル ===');
    for (const t of detail.tables.slice(0, 5)) {
      console.log(`\nテーブル${t.index}:`);
      for (const r of t.rows.slice(0, 5)) {
        const texts = r.map(c => typeof c === 'object' && c !== null && 'text' in c ? (c as { text: string }).text : String(c));
        console.log('  ', texts.join(' | '));
      }
    }

    console.log('\n=== bodyテキスト（落札者関連）===');
    const keywords = ['落札', '業者', '価格', '円'];
    const lines = detail.bodyText.split('\n').filter(l =>
      keywords.some(k => l.includes(k))
    );
    lines.forEach(l => console.log('  ', l));

  } catch (e: unknown) {
    console.error('エラー:', e instanceof Error ? e.message : String(e));
  } finally {
    await browser.close();
  }
}

checkDetailPage().catch(console.error);
