
import { fetchAllNews } from '../src/services/news_service';

async function testNews() {
    console.log('--- News Fetch Test Start ---');
    const news = await fetchAllNews();
    console.log(`Total news items: ${news.length}`);
    
    const summary: Record<string, number> = {};
    news.forEach(n => {
        summary[n.sourceLabel] = (summary[n.sourceLabel] || 0) + 1;
    });
    
    console.log('Summary by source:');
    console.log(JSON.stringify(summary, null, 2));
    
    if (news.length > 0) {
        console.log('\nLatest 3 news items:');
        news.slice(0, 3).forEach(n => {
            console.log(`[${n.sourceLabel}] ${n.date} - ${n.title}`);
        });
    }
}

testNews().catch(console.error);
