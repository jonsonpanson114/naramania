import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';

const RESULT_PAGE = 'https://www.city.yamatotakada.nara.jp/soshikikarasagasu/keiyakukanrishitsu/nyusatsu_keiyaku/1/9099.html';

async function debug() {
    console.log('=== 大和高田市 入札結果ページ デバッグ ===');
    const res = await axios.get(RESULT_PAGE, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 30000,
    });
    const $ = cheerio.load(res.data);

    // HTMLを保存
    fs.writeFileSync('debug_yamato_takada_result.html', res.data, 'utf-8');
    console.log('HTMLを debug_yamato_takada_result.html に保存しました');

    // 構造調査
    console.log('\n=== h2 要素 ===');
    $('h2').each((i, el) => {
        console.log(`${i}: ${$(el).text().trim()}`);
    });

    console.log('\n=== p 要素（最初20個）===');
    $('p').slice(0, 20).each((i, el) => {
        const text = $(el).text().trim().replace(/\n/g, ' ');
        const hasStrong = $(el).find('strong').length > 0;
        console.log(`${i}: ${hasStrong ? '[STRONG]' : ''} ${text.substring(0, 80)}`);
    });

    console.log('\n=== table 要素 ===');
    const tables = $('table').length;
    console.log(`テーブル数: ${tables}`);

    if (tables > 0) {
        console.log('\n=== 最初のテーブル ===');
        const firstTable = $('table').first();
        const rows = firstTable.find('tr').length;
        console.log(`行数: ${rows}`);
        firstTable.find('tr').slice(0, 5).each((i, tr) => {
            console.log(`行${i}: ${$(tr).text().trim().substring(0, 100)}`);
        });
    }

    console.log('\n=== strong 要素（最初10個）===');
    $('strong').slice(0, 10).each((i, el) => {
        console.log(`${i}: ${$(el).text().trim()}`);
    });

    // 落札業者パターン検索
    const bodyText = $('body').text();
    const contractorPatterns = [
        '落札業者：', '落札業者:', '落札者：', '落札者:', '落札業者 ', '落札者 '
    ];
    console.log('\n=== 落札業者パターン ===');
    contractorPatterns.forEach(pattern => {
        if (bodyText.includes(pattern)) {
            console.log(`発見: ${pattern}`);
            const idx = bodyText.indexOf(pattern);
            const context = bodyText.substring(Math.max(0, idx - 30), idx + pattern.length + 30);
            console.log(`  文脈: ${context.replace(/\n/g, ' ')}`);
        }
    });
}

debug().catch(console.error);
