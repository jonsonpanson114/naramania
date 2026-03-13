
import { chromium } from 'playwright';

async function testIkomaDeep() {
    console.log('--- 生駒市 (epi-cloud) 精密解析開始 ---');
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        const url = 'https://www.epi-cloud.fwd.ne.jp/koukai/do/KF001ShowAction?name1=0620064007200680';
        
        await page.goto(url, { waitUntil: 'networkidle' });
        await page.waitForTimeout(2000);

        console.log('1. トップページ到達');
        
        // 「工事」ボタンをクリック
        const k工事Btn = page.locator('input[value*="工事"], button:has-text("工事"), a:has-text("工事")').first();
        if (await k工事Btn.count() > 0) {
            console.log('2. 「工事」ボタンをクリック');
            await k工事Btn.click();
            await page.waitForLoadState('networkidle');
            await page.waitForTimeout(2000);
        }

        console.log('3. 現在のURL:', page.url());

        // epi-cloudの罠: フレーム構造の確認
        const frames = page.frames();
        console.log(`4. フレーム数: ${frames.length}`);

        for (const frame of frames) {
            const frameUrl = frame.url();
            console.log(`   - Frame URL: ${frameUrl}`);
            
            // 検索ボタンがあるか確認
            const searchBtn = frame.locator('input[value*="検索"], button:has-text("検索"), img[alt*="検索"]').first();
            if (await searchBtn.count() > 0) {
                console.log(`   🎯 発見: フレーム内に検索ボタンあり [${frameUrl}]`);
                
                // ボタンのタグ名や属性を詳細に
                const tagName = await searchBtn.evaluate(el => el.tagName);
                const outerHTML = await searchBtn.evaluate(el => el.outerHTML);
                console.log(`     Tag: ${tagName}, HTML: ${outerHTML}`);

                // 検索実行
                console.log('5. 検索実行...');
                await searchBtn.click();
                await page.waitForTimeout(3000);

                // 結果テーブルがあるか
                const tableCount = await frame.locator('table').count();
                console.log(`6. 検索後のテーブル数: ${tableCount}`);
                
                if (tableCount > 0) {
                    const rows = await frame.locator('table tr').count();
                    console.log(`   ✅ 案件データ行数(見込): ${rows}`);
                }
            }
        }

    } catch (e: any) {
        console.error('❌ 解析失敗:', e.message);
    } finally {
        await browser.close();
    }
}

testIkomaDeep();
