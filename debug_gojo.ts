import axios from 'axios';
import fs from 'fs';

const RESULT_JSON = 'https://www.city.gojo.lg.jp/soshiki/keiyakukensa/1_1/7/index.tree.json';

async function debug() {
    console.log('=== 五條市 デバッグ ===');

    const res = await axios.get(RESULT_JSON, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 30000,
    });

    fs.writeFileSync('debug_gojo.json', JSON.stringify(res.data, null, 2), 'utf-8');

    const pages = Array.isArray(res.data) ? res.data : [];
    console.log(`総件数: ${pages.length}`);

    // カテゴリインデックスを探す
    const categoryIndex = pages.find(p => p.is_category_index);
    if (categoryIndex) {
        console.log(`カテゴリインデックス: ${categoryIndex.page_name}`);
        console.log(`子ページ数: ${categoryIndex.child_pages?.length || 0}`);

        if (categoryIndex.child_pages) {
            console.log('\n子ページ一覧:');
            categoryIndex.child_pages.forEach((p: any, i) => {
                console.log(`${i}: ${p.page_name}`);
            });
        }
    }

    // すべてのページ（カテゴリインデックス含む）
    console.log('\nすべてのページ:');
    pages.forEach((p: any, i) => {
        const isCat = p.is_category_index ? '[INDEX]' : '';
        console.log(`${i}: ${isCat} ${p.page_name}`);
    });
}

debug().catch(console.error);
