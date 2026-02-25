import { BiddingItem } from '@/types/bidding';
import fs from 'fs';
import path from 'path';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { StatsCard } from '@/components/StatsCard';
import { BiddingTable } from '@/components/BiddingTable';
import { NewsSection } from '@/components/NewsSection';
import { Trophy, Radar, ArrowRight } from 'lucide-react';
import Link from 'next/link';

// Async Server Component
export default async function Home() {
  // Read pre-scraped data from JSON
  const jsonPath = path.join(process.cwd(), 'scraper_result.json');
  let allItems: BiddingItem[] = [];

  try {
    if (fs.existsSync(jsonPath)) {
      const fileContent = fs.readFileSync(jsonPath, 'utf-8');
      allItems = JSON.parse(fileContent);
    }
  } catch (error) {
    console.error('Error loading scraper results:', error);
  }

  // Sort by announcement date descending
  allItems.sort((a, b) => new Date(b.announcementDate).getTime() - new Date(a.announcementDate).getTime());

  // Calculate Metrics from real data
  const today = new Date().toISOString().split('T')[0];
  const newArrivals = allItems.filter(item => item.announcementDate === today).length;

  // Urgent: Deadline within 7 days
  const oneWeekLater = new Date();
  oneWeekLater.setDate(oneWeekLater.getDate() + 7);
  const urgentCount = allItems.filter(item => {
    if (!item.biddingDate) return false;
    const deadline = new Date(item.biddingDate);
    const now = new Date();
    return deadline > now && deadline <= oneWeekLater;
  }).length;

  // Intelligence stats
  const awardedCount = allItems.filter(item => item.status === '落札').length;

  return (
    <div className="flex min-h-screen bg-background text-primary font-serif">
      <Sidebar />
      <main className="flex-1 ml-64 p-16">
        <Header />

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
          <StatsCard label="本日更新" value={newArrivals} unit="件" subtext="新着案件" delay={0.1} />
          <StatsCard label="期限間近" value={urgentCount} unit="件" subtext="今週締切" delay={0.2} />
          <StatsCard label="収集済み" value={allItems.length} unit="件" subtext="全自治体合計" delay={0.3} />
          <StatsCard label="落札案件" value={awardedCount} unit="件" subtext="AI解析済み" delay={0.4} />
        </div>

        {/* Quick Insights Navigation */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-20">
          <Link href="/rankings" className="group bg-white p-8 rounded-3xl border border-amber-900/10 shadow-sm hover:shadow-md transition-all">
            <div className="flex justify-between items-start mb-4">
              <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600">
                <Trophy size={24} />
              </div>
              <ArrowRight className="text-gray-300 group-hover:text-amber-600 group-hover:translate-x-1 transition-all" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">落札実績ランキング</h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              どの業者が最も多く受注しているか、設計事務所はどこか。AIが解析したデータを集計し、上位10社をランキング形式で表示します。
            </p>
          </Link>

          <Link href="/radar" className="group bg-white p-8 rounded-3xl border border-indigo-900/10 shadow-sm hover:shadow-md transition-all">
            <div className="flex justify-between items-start mb-4">
              <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
                <Radar size={24} />
              </div>
              <ArrowRight className="text-gray-300 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">価格相場レーダー</h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              案件ごとの設計金額・落札価格の分布を可視化。自治体ごとの相場感や、工事規模による傾向を視覚的に把握できます。
            </p>
          </Link>
        </div>

        {/* Main Table */}
        <BiddingTable items={allItems} />

        {/* News Section */}
        <NewsSection />

      </main>
    </div>
  );
}
