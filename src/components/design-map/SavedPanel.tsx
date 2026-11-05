'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { displayStatus } from '@/lib/status_label';
import { SALES_STATUS_LABEL, useSavedItems } from '@/lib/saved_items';
import styles from './design-map.module.css';

function formatMd(date?: string): string {
    if (!date) return '―';
    const [, month, day] = date.split('-');
    return month && day ? `${Number(month)}/${Number(day)}` : date;
}

/** 奈良マニアで「保存」した案件を、この地図の上に並べる */
export function SavedPanel() {
    const { ready, items } = useSavedItems();

    const sorted = useMemo(
        () => [...items].sort((a, b) =>
            (b.biddingDate || b.announcementDate || '').localeCompare(a.biddingDate || a.announcementDate || ''),
        ),
        [items],
    );

    return (
        <section className={`${styles.section}`}>
            <h2>保存した案件</h2>
            <div className={`${styles.panel} ${styles.saved}`}>
                <div className={styles.savedHead}>
                    <p className={styles.sub}>
                        案件の詳細で「保存」を押した案件です。営業の進み具合は営業管理で変えられます。
                    </p>
                </div>
                {!ready ? (
                    <p className={styles.savedEmpty}>読み込んでいます。</p>
                ) : sorted.length === 0 ? (
                    <div className={styles.savedEmpty}>
                        <p>まだ保存した案件はありません。</p>
                        <p>
                            <Link href="/search">案件検索</Link>
                            で案件を開き、「保存」を押すと、ここに並びます。
                        </p>
                    </div>
                ) : (
                    <ul className={styles.savedList}>
                        {sorted.map(item => {
                            const status = displayStatus(item);
                            return (
                                <li key={item.id}>
                                    <span className={styles.mono}>
                                        {formatMd(item.biddingDate || item.announcementDate)}
                                    </span>
                                    <span>
                                        <Link href={`/project/${encodeURIComponent(item.id)}`}>{item.title}</Link>
                                        <span className={styles.sm}>
                                            {item.municipality}
                                            {item.winningContractor ? `　${item.winningContractor}` : ''}
                                        </span>
                                    </span>
                                    <span>
                                        <span className={`${styles.chip} ${status === '落札' ? styles.chipWin : status === '中止' || status === '不調' ? styles.chipStop : ''}`}>
                                            {status}
                                        </span>{' '}
                                        <span className={styles.chip}>
                                            {SALES_STATUS_LABEL[item.salesStatus ?? 'pending']}
                                        </span>
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                )}
                <p className={styles.savedFoot}>
                    保存はこのブラウザの中にだけ入っています。別の端末や別のブラウザには出ません。
                    {ready && sorted.length > 0 ? <>　<Link href="/saved">営業管理で進み具合を変える</Link></> : null}
                </p>
            </div>
        </section>
    );
}
