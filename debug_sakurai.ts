import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';

const ANNOUNCE_URL = 'https://www.city.sakurai.lg.jp/sosiki/soumu/kanzaikeiyaku/nyuusatukeiyakukensa/6596.html';

async function debug() {
    console.log('=== 桜井市 入札公告ページ デバッグ ===');
    const res = await axios.get(ANNOUNCE_URL, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 30000,
    });
    const $ = cheerio.load(res.data);

    // HTMLを保存
    fs.writeFileSync('debug_sakurai.html', res.data, 'utf-8');
    console.log('HTMLを debug_sakurai.html に保存しました');

    // 構造調査
    console.log('\n=== h3 要素 ===');
    $('h3').each((i, el) => {
        console.log(`${i}: ${$(el).text().trim()}`);
    });

    console.log('\n=== table 要素 ===');
    const tables = $('table').length;
    console.log(`テーブル数: ${tables}`);

    if (tables > 0) {
        console.log('\n=== 最初のテーブル ===');
        const firstTable = $('table').first();
        const rows = firstTable.find('tr').length;
        console.log(`行数: ${rows}`);
        firstTable.find('tr').slice(0, 10).each((i, tr) => {
            const tds = $(tr).find('td, th');
            const cells = tds.map((_, td) => $(td).text().trim()).toArray();
            console.log(`行${i}: ${cells.join(' | ')}`);
        });
    }

    // 建築関連キーワード検索
    const bodyText = $('body').text();
    const keywords = ['建築', '設計', '改修', '修繕', '新築', '工事'];
    console.log('\n=== 建築関連キーワード ===');
    keywords.forEach(kw => {
        if (bodyText.includes(kw)) {
            const idx = bodyText.indexOf(kw);
            const context = bodyText.substring(Math.max(0, idx - 30), idx + kw.length + 30);
            console.log(`${kw}: ...${context.replace(/\n/g, ' ')}...`);
        }
    });
}

debug().catch(console.error);
