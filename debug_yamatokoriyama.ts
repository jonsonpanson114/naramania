import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';

// ユーザーが言っている正しいURL
const ANNOUNCE_URL = 'https://www.city.yamatokoriyama.lg.jp/shigoto_sangyo/nyusatsu_keiyaku/nyusatsu/R7/index.html';
const RESULT_URL = 'https://www.city.yamatokoriyama.lg.jp/shigoto_sangyo/nyusatsu_keiyaku/nyusatsunooshirase/r7/index.html';

async function debug() {
    console.log('=== 大和郡山市 URL デバッグ ===');

    // 入札公告
    console.log('\n1. 入札公告');
    try {
        const res = await axios.get(ANNOUNCE_URL, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 30000,
        });
        fs.writeFileSync('debug_yamatokoriyama_announce.html', res.data, 'utf-8');
        console.log('→ 入札公告HTMLを保存しました');
        const $ = cheerio.load(res.data);
        console.log(`→ ページタイトル: ${$('title').text()}`);
        console.log(`→ table数: ${$('table').length}`);
        console.log(`→ aタグ数: ${$('a').length}`);
        if ($('table').length > 0) {
            const firstTable = $('table').first();
            console.log(`→ 最初のテーブル行数: ${firstTable.find('tr').length}`);
            console.log(`→ 最初の3行:`);
            firstTable.find('tr').slice(0, 3).each((i, tr) => {
                console.log(`  行${i}: ${$(tr).text().trim().substring(0, 80)}`);
            });
        }
    } catch (e: any) {
        console.log('→ 入札公告エラー:', e.message?.split('\n')[0]);
    }

    // 入札結果
    console.log('\n2. 入札結果');
    try {
        const res = await axios.get(RESULT_URL, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 30000,
        });
        fs.writeFileSync('debug_yamatokoriyama_result.html', res.data, 'utf-8');
        console.log('→ 入札結果HTMLを保存しました');
        const $ = cheerio.load(res.data);
        console.log(`→ ページタイトル: ${$('title').text()}`);
        console.log(`→ table数: ${$('table').length}`);
        console.log(`→ aタグ数: ${$('a').length}`);
        if ($('table').length > 0) {
            const firstTable = $('table').first();
            console.log(`→ 最初のテーブル行数: ${firstTable.find('tr').length}`);
            console.log(`→ 最初の3行:`);
            firstTable.find('tr').slice(0, 3).each((i, tr) => {
                console.log(`  行${i}: ${$(tr).text().trim().substring(0, 80)}`);
            });
        }
    } catch (e: any) {
        console.log('→ 入札結果エラー:', e.message?.split('\n')[0]);
    }

    console.log('\n=== コード上のURL ===');
    console.log('入札: https://www.city.yamatokoriyama.lg.jp/shigoto_sangyo/nyusatsu_keiyaku/nyusatsu/index.tree.json');
    console.log('結果: https://www.city.yamatokoriyama.lg.jp/shigoto_sangyo/nyusatsu_keiyaku/nyusatsunooshirase/index.tree.json');
}

debug().catch(console.error);
