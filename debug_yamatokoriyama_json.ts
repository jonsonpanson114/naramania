import axios from 'axios';
import fs from 'fs';

const ANNOUNCE_JSON = 'https://www.city.yamatokoriyama.lg.jp/shigoto_sangyo/nyusatsu_keiyaku/nyusatsu/index.tree.json';
const RESULT_JSON = 'https://www.city.yamatokoriyama.lg.jp/shigoto_sangyo/nyusatsu_keiyaku/nyusatsunooshirase/index.tree.json';

async function debug() {
    console.log('=== 大和郡山市 JSON API デバッグ ===');

    // 入札公告
    console.log('\n1. 入札公告 JSON');
    try {
        const res = await axios.get(ANNOUNCE_JSON, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 30000,
        });
        fs.writeFileSync('debug_yamatokoriyama_announce.json', JSON.stringify(res.data, null, 2), 'utf-8');
        console.log('→ JSONを保存しました');
        const data = Array.isArray(res.data) ? res.data : [];
        console.log(`→ 配列長: ${data.length}`);
        console.log('→ 最初3件:');
        data.slice(0, 3).forEach((item: any, i) => {
            console.log(`  ${i}: ${JSON.stringify(item).substring(0, 200)}`);
        });
    } catch (e: any) {
        console.log('→ 入札公告エラー:', e.message?.split('\n')[0]);
    }

    // 入札結果
    console.log('\n2. 入札結果 JSON');
    try {
        const res = await axios.get(RESULT_JSON, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 30000,
        });
        fs.writeFileSync('debug_yamatokoriyama_result.json', JSON.stringify(res.data, null, 2), 'utf-8');
        console.log('→ JSONを保存しました');
        const data = Array.isArray(res.data) ? res.data : [];
        console.log(`→ 配列長: ${data.length}`);
        console.log('→ 最初3件:');
        data.slice(0, 3).forEach((item: any, i) => {
            console.log(`  ${i}: ${JSON.stringify(item).substring(0, 200)}`);
        });
    } catch (e: any) {
        console.log('→ 入札結果エラー:', e.message?.split('\n')[0]);
    }
}

debug().catch(console.error);
