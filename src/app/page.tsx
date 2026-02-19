import { BiddingItem } from '@/types/bidding';
import fs from 'fs';
import path from 'path';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { StatsCard } from '@/components/StatsCard';
import { BiddingTable } from '@/components/BiddingTable';

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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-20">
          <StatsCard label="本日更新" value={newArrivals} unit="件" subtext="新着案件" delay={0.1} />
          <StatsCard label="期限間近" value={urgentCount} unit="件" subtext="今週締切" delay={0.2} />
          <StatsCard label="収集済み" value={allItems.length} unit="件" subtext="全自治体合計" delay={0.3} />
          <StatsCard label="落札案件" value={awardedCount} unit="件" subtext="AI解析済み" delay={0.4} />
        </div>

        {/* Main Table */}
        <BiddingTable items={allItems} />

      </main>
    </div>
  );
}
