import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { MapLink } from '@/components/design-map/MapLink';
import { SavedPanel } from '@/components/design-map/SavedPanel';
import { YearList } from '@/components/design-map/YearList';
import styles from '@/components/design-map/design-map.module.css';
import {
    BIG_PROJECTS,
    FIRST_MOVES,
    FORECAST_NOTE,
    FORECAST_ROWS,
    MAP_TITLE,
    NOTES,
    OPEN_BIDS,
    PROPO_LEAD,
    PROPO_ROWS,
    SOURCES,
} from '@/data/design_map';

export const metadata: Metadata = {
    title: '奈良の設計案件マップ | 奈良県入札情報アグリゲーター',
    description: '奈良県内の公共建築について、今後の設計案件、今年出た設計案件、プロポーザルの動きをまとめた調査台帳。',
};

export default function DesignMapPage() {
    return (
        <AppShell>
            <div className={styles.map}>
                <header className={styles.title}>
                    <div className={styles.titleMain}>
                        <h1>{MAP_TITLE.h1}</h1>
                        <p className={styles.sub}>{MAP_TITLE.sub}</p>
                    </div>
                    <dl className={styles.titleMeta}>
                        {MAP_TITLE.meta.map(entry => (
                            <div key={entry.k} style={{ display: 'contents' }}>
                                <dt>{entry.k}</dt>
                                <dd>{entry.v}</dd>
                            </div>
                        ))}
                    </dl>
                </header>

                <SavedPanel />

                <section className={styles.section}>
                    <h2>先に動くなら、この5件</h2>
                    <div className={styles.panel}>
                        <ul className={styles.first}>
                            {FIRST_MOVES.map(move => (
                                <li key={move.title}>
                                    <span className={`${styles.when} ${move.hot ? styles.hot : ''}`}>{move.when}</span>
                                    <div>
                                        <b>{move.title}</b>
                                        <p>{move.body}</p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                </section>

                <section className={styles.section}>
                    <h2>今後の設計案件</h2>
                    <h3>公告中で、日付が決まっているもの</h3>
                    <div className={`${styles.panel} ${styles.scroll}`}>
                        <table className={styles.table}>
                            <thead>
                                <tr><th>開札</th><th>発注者</th><th>業務</th><th>内容</th></tr>
                            </thead>
                            <tbody>
                                {OPEN_BIDS.map(bid => (
                                    <tr key={`${bid.issuer}-${bid.title}`}>
                                        <td className={`${styles.nw} ${styles.mono} ${bid.hot ? styles.hot : ''}`}>{bid.when}</td>
                                        <td className={styles.nw}>{bid.issuer}</td>
                                        <td className={styles.t}>{bid.href ? <MapLink href={bid.href}>{bid.title}</MapLink> : bid.title}</td>
                                        <td>{bid.note}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <h3>発注見通しに載っていて、まだ公告を確認していないもの</h3>
                    <p className={styles.sub}>{FORECAST_NOTE}</p>
                    <div className={`${styles.panel} ${styles.scroll}`}>
                        <table className={styles.table}>
                            <thead>
                                <tr><th>時期</th><th>発注者</th><th>業務</th><th>履行</th></tr>
                            </thead>
                            <tbody>
                                {FORECAST_ROWS.map(row => (
                                    <tr key={`${row.issuer}-${row.title}`}>
                                        <td className={styles.nw}>{row.when}</td>
                                        <td className={styles.nw}>{row.issuer}</td>
                                        <td className={styles.t}>
                                            {row.title}
                                            {row.isNew ? <>{' '}<span className={styles.chip}>新規</span></> : null}
                                        </td>
                                        <td className={styles.nw}>{row.term}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <h3>設計者が決まる前後の大型案件</h3>
                    <div className={styles.legend}>
                        <span>済んだ段階</span>
                        <span className={styles.legendNow}>いまの段階</span>
                        <span>左から 構想、基本計画、基本設計、実施設計、工事</span>
                    </div>
                    <div className={styles.bigs}>
                        {BIG_PROJECTS.map(project => (
                            <article key={project.n} className={styles.big}>
                                <span className={styles.m}>{project.m}</span>
                                <h3><MapLink href={project.u}>{project.n}</MapLink></h3>
                                <div className={styles.stage} role="img" aria-label={`工程 ${project.s + 1}段階目`}>
                                    {[0, 1, 2, 3, 4].map(step => (
                                        <i key={step} className={step < project.s ? styles.on : step === project.s ? styles.now : ''} />
                                    ))}
                                </div>
                                <dl>
                                    <dt>今</dt><dd>{project.now}</dd>
                                    <dt>次</dt><dd>{project.next}</dd>
                                    <dt>規模</dt><dd>{project.size}</dd>
                                </dl>
                            </article>
                        ))}
                    </div>
                </section>

                <section className={styles.section}>
                    <h2>プロポの動き</h2>
                    <p className={styles.lead}>{PROPO_LEAD}</p>
                    <div className={`${styles.panel} ${styles.scroll}`}>
                        <table className={styles.table}>
                            <thead>
                                <tr><th>状況</th><th>発注者</th><th>案件</th><th>相手・要点</th></tr>
                            </thead>
                            <tbody>
                                {PROPO_ROWS.map(row => (
                                    <tr key={`${row.issuer}-${row.title}`}>
                                        <td className={styles.nw}>
                                            <span className={`${styles.chip} ${row.status === '募集中' ? styles.chipStop : row.status === '決定' ? styles.chipWin : ''}`}>
                                                {row.status}
                                            </span>
                                        </td>
                                        <td className={styles.nw}>{row.issuer}</td>
                                        <td className={styles.t}><MapLink href={row.href}>{row.title}</MapLink></td>
                                        <td>{row.note}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                <YearList />

                <section className={styles.section}>
                    <h2>読むときの注意</h2>
                    <div className={`${styles.panel} ${styles.note}`}>
                        {NOTES.map(note => (
                            <p key={note.lead}><b>{note.lead}：</b>{note.text}</p>
                        ))}
                    </div>
                    <h3>出典</h3>
                    <ol className={`${styles.panel} ${styles.src}`}>
                        {SOURCES.map(source => (
                            <li key={source.href}><MapLink href={source.href}>{source.label}</MapLink></li>
                        ))}
                    </ol>
                </section>
            </div>
        </AppShell>
    );
}
