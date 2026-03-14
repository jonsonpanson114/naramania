import { chromium } from 'playwright';

async function checkDetailPage(ankenId: string) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    // トップページ
    await page.goto('http://www.ppi06.t-elbs.jp/DENCHO/PpiJGyomuStart.do?kinouid=GP5000_Top', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);

    // フレーム取得
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

    // 年度フィルタ設定
    await fra1.selectOption('select[name="keisaiNen"]', '2025').catch(() => {});
    await page.waitForTimeout(300);

    // 検索実行
    await fra1.evaluate(() => {
      const topW = window.top as any;
      if (topW?.fra_hidden) topW.fra_hidden.submit_flag = 0;
      (window as any).fnc_btnSearch_Clicked();
    });
    await fra1.waitForNavigation({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    console.log('入札結果ページに遷移しました');

    // 詳細ページに遷移
    await fra1.evaluate((id: string) => {
      (window as any).pf_VidDsp_btnDetailClick(id);
    }, ankenId);
    await fra1.waitForNavigation({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    console.log('詳細ページ:', fra1.url());

    // 詳細ページの構造を確認
    const detail = await fra1.evaluate(() => {
      const result: any = {
        url: document.location.href,
        tables: [] as any[],
        winnerSections: [] as any[]
      };

      // 全テーブルを取得
      document.querySelectorAll('table').forEach((t, i) => {
        const rows = Array.from(t.querySelectorAll('tr')).slice(0, 5);
        const cells = rows.flatMap(r =>
          Array.from(r.querySelectorAll('td, th')).map(td => td.innerText?.trim())
        );
        result.tables.push({
          index: i,
          className: t.className,
          cells: cells.filter(Boolean)
        });
      });

      // 落札者キーワードで検索
      const keywords = ['落札者', '落札', '業者名', '落札価格', '落札額'];
      document.querySelectorAll('table').forEach((t, ti) => {
        const text = t.innerText || '';
        for (const kw of keywords) {
          if (text.includes(kw)) {
            result.winnerSections.push({ keyword: kw, tableIndex: ti });
          }
        }
      });

      // body全体のテキスト
      result.bodyText = document.body?.innerText?.substring(0, 3000) || '';

      return result;
    });

    console.log('\n=== テーブル情報 ===');
    for (const t of detail.tables.slice(0, 5)) {
      console.log(`テーブル${t.index} (${t.className || 'no class'}):`);
      console.log('  セル:', t.cells.slice(0, 8));
    }

    console.log('\n=== 落札者関連セクション ===');
    for (const ws of detail.winnerSections) {
      const t = detail.tables[ws.tableIndex];
      console.log(`${ws.keyword} - テーブル${ws.tableIndex}:`);
      console.log('  ', t.cells);
    }

    console.log('\n=== bodyテキスト ===');
    console.log(detail.bodyText);

  } catch (e: any) {
    console.error('エラー:', e.message);
  } finally {
    await browser.close();
  }
}

// 落札者情報がない案件のankenIdを使用
const ankenId = '29001013052520250190'; // 萩原地区 斜面対策工詳細設計業務委託
checkDetailPage(ankenId).catch(console.error);
