import { toJstDateKey } from '@/lib/jst_date';
import type { BiddingItem } from '@/types/bidding';

export function getMonthlyAnnouncements(items: BiddingItem[], today = toJstDateKey()) {
    const year = Number(today.slice(0, 4));
    const monthIndex = Number(today.slice(5, 7)) - 1;
    const months = Array.from({ length: 6 }, (_, index) => {
        const date = new Date(Date.UTC(year, monthIndex - 5 + index, 1));
        return { month: date.toISOString().slice(0, 7), count: 0 };
    });
    const byMonth = new Map(months.map(entry => [entry.month, entry]));
    const countsByMunicipality = new Map<string, number>();

    for (const item of items) {
        const announcementDate = item.announcementDate?.slice(0, 10);
        if (item.isForecast || !announcementDate || !/^\d{4}-\d{2}-\d{2}$/.test(announcementDate) || announcementDate > today) continue;
        const entry = byMonth.get(announcementDate.slice(0, 7));
        if (!entry) continue;

        entry.count += 1;
        const key = `${item.municipality}:${entry.month}`;
        countsByMunicipality.set(key, (countsByMunicipality.get(key) ?? 0) + 1);
    }

    return { months, countsByMunicipality };
}
