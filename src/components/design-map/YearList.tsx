'use client';

import { useMemo, useState } from 'react';
import { TOP_FIRMS, YEAR_ITEMS, YEAR_LEAD } from '@/data/design_map';
import { useSavedItems } from '@/lib/saved_items';
import { MapLink } from './MapLink';
import styles from './design-map.module.css';

const FILTERS = ['すべて', '保存済み', '新築・増改築', '改修', '解体', '監理', '計画・診断', 'トイレ', '中止'] as const;
type Filter = (typeof FILTERS)[number];

function formatMd(date: string): string {
    if (!date) return '―';
    const [, month, day] = date.split('-');
    return `${month}/${day}`;
}

/** 今年出た設計案件。奈良マニアで保存した案件には「保存」の印を付ける */
export function YearList() {
    const [filter, setFilter] = useState<Filter>('すべて');
    const [query, setQuery] = useState('');
    const { ids } = useSavedItems();

    const rows = useMemo(() => {
        const word = query.trim().toLowerCase();
        return YEAR_ITEMS.filter(item => {
            const hit = filter === 'すべて'
                || (filter === '保存済み' && item.id !== undefined && ids.has(item.id))
                || item.k === filter
                || (filter === 'トイレ' && /トイレ|便所/.test(item.t))
                || (filter === '中止' && (item.r === '中止' || item.r === '不調'));
            return hit && (!word || `${item.m}${item.t}${item.w}`.toLowerCase().includes(word));
        });
    }, [filter, query, ids]);

    return (
        <section className={styles.section}>
            <h2>今年出た設計案件</h2>
            <p className={styles.lead}>{YEAR_LEAD}</p>
            <div className={styles.two}>
                <div className={styles.panel}>
                    <div className={styles.tools}>
                        <input
                            type="search"
                            value={query}
                            onChange={event => setQuery(event.target.value)}
                            placeholder="自治体、案件名、事務所名で探す"
                            aria-label="一覧を検索"
                        />
                        {FILTERS.map(name => (
                            <button key={name} type="button" aria-pressed={filter === name} onClick={() => setFilter(name)}>
                                {name}
                            </button>
                        ))}
                    </div>
                    <div className={styles.count}>{`${rows.length}件を表示（全${YEAR_ITEMS.length}件）`}</div>
                    <div className={`${styles.rows} ${styles.scroll}`}>
                        <table className={styles.table}>
                            <thead>
                                <tr><th>日付</th><th>発注者</th><th>業務</th><th>種別</th><th>結果</th></tr>
                            </thead>
                            <tbody>
                                {rows.length === 0 ? (
                                    <tr>
                                        <td colSpan={5}>
                                            {filter === '保存済み'
                                                ? 'この一覧に当てはまる保存済みの案件はありません。案件の詳細で「保存」を押すと、ここに出ます。'
                                                : '当てはまる案件がありません。言葉を短くすると見つかりやすくなります。'}
                                        </td>
                                    </tr>
                                ) : rows.map((item, index) => {
                                    const resultClass = item.r.startsWith('落札')
                                        ? styles.chipWin
                                        : item.r === '中止' || item.r === '不調' ? styles.chipStop : '';
                                    const href = item.id ? `/project/${encodeURIComponent(item.id)}` : item.u;
                                    const saved = item.id !== undefined && ids.has(item.id);
                                    return (
                                        <tr key={`${item.id ?? item.t}-${index}`}>
                                            <td className={`${styles.nw} ${styles.mono}`}>{formatMd(item.d)}</td>
                                            <td className={styles.nw}>{item.m}</td>
                                            <td className={styles.t}>
                                                {href ? <MapLink href={href}>{item.t}</MapLink> : item.t}
                                                {saved ? <>{' '}<span className={`${styles.chip} ${styles.chipSaved}`}>保存</span></> : null}
                                                {item.w ? <><br /><span className={styles.sub}>{item.w}</span></> : null}
                                            </td>
                                            <td className={styles.nw}>{item.k}</td>
                                            <td className={styles.nw}><span className={`${styles.chip} ${resultClass}`}>{item.r}</span></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
                <aside className={styles.panel}>
                    <div style={{ padding: '12px 14px 0' }}>
                        <h3>今年よく取っている事務所</h3>
                        <p className={styles.sub}>この一覧の落札件数</p>
                    </div>
                    <div className={styles.firms}>
                        {TOP_FIRMS.map(firm => (
                            <div key={firm.n}>
                                <span>{firm.n}</span>
                                <span className={styles.mono}>{firm.c}件</span>
                                <small>{Object.entries(firm.k).map(([kind, count]) => `${kind} ${count}`).join('、')}</small>
                            </div>
                        ))}
                    </div>
                </aside>
            </div>
        </section>
    );
}
