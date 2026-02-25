import fs from 'fs';

const data: any[] = JSON.parse(fs.readFileSync('scraper_result.json', 'utf8'));

// 自治体別集計
const byMuni: Record<string, Record<string, number>> = {};
data.forEach(item => {
    if (!byMuni[item.municipality]) byMuni[item.municipality] = { 受付中: 0, 落札: 0 };
    byMuni[item.municipality][item.status] = (byMuni[item.municipality][item.status] || 0) + 1;
});
console.log('=== 自治体別・ステータス別 ===');
Object.entries(byMuni).forEach(([m, c]) =>
    console.log(`  ${m}: 受付中=${c['受付中'] || 0}, 落札=${c['落札'] || 0}`)
);

// 今日の日付フォールバック
const today = new Date().toISOString().split('T')[0];
const fallbacks = data.filter(i => i.announcementDate === today || i.biddingDate === today);
console.log(`\n=== announcementDate or biddingDate が今日(${today})のもの ===`);
if (fallbacks.length === 0) {
    console.log('  なし（OK）');
} else {
    fallbacks.forEach(i => console.log(`  [${i.municipality}] ${i.id} | anno=${i.announcementDate} bid=${i.biddingDate} | ${i.status} | ${i.title}`));
}

// 落札かつ biddingDate == announcementDate（公告日流用疑い）
const same = data.filter(i => i.status === '落札' && i.biddingDate && i.biddingDate === i.announcementDate);
console.log('\n=== 落札 かつ biddingDate==announcementDate（公告日流用疑い） ===');
if (same.length === 0) {
    console.log('  なし（OK）');
} else {
    same.forEach(i => console.log(`  ${i.id} | ${i.announcementDate} | ${i.title}`));
}

// announcementDate 範囲
const dates = data.map(i => i.announcementDate).filter(Boolean).sort();
console.log(`\n=== announcementDate 範囲 ===`);
console.log(`  最古: ${dates[0]}`);
console.log(`  最新: ${dates[dates.length - 1]}`);

// biddingDate ありの件数
const withBid = data.filter(i => i.biddingDate);
console.log(`\n=== biddingDate あり: ${withBid.length}件 / ${data.length}件 ===`);
console.log(`  受付中で biddingDate あり: ${withBid.filter(i => i.status === '受付中').length}件`);
console.log(`  落札で biddingDate あり:   ${withBid.filter(i => i.status === '落札').length}件`);

// 落札で winningContractor あり
const withWinner = data.filter(i => i.status === '落札' && i.winningContractor);
const rakusatsuTotal = data.filter(i => i.status === '落札').length;
console.log(`\n=== 落札で winningContractor あり: ${withWinner.length}件 / ${rakusatsuTotal}件 ===`);
