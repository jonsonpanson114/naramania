export default function RankingChart({ data, color }: { data: { name: string, count: number }[], color: string }) {
    const maxCount = Math.max(1, ...data.map(({ count }) => count));

    return (
        <ol className="divide-y divide-border text-sm">
            {data.map(({ name, count }, index) => (
                <li key={name} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-baseline gap-x-2 px-2 py-2 even:bg-background/65">
                    <span className="font-bold tabular-nums text-accent">{index + 1}</span>
                    <span className="font-semibold [overflow-wrap:anywhere]">{name}</span>
                    <span className="whitespace-nowrap font-semibold tabular-nums">{count} 件</span>
                    <span aria-hidden="true" className="col-start-2 col-end-4 mt-1.5 block h-1.5 rounded-sm bg-paper-tint">
                        <span className="block h-full rounded-sm" style={{ width: `${count / maxCount * 100}%`, backgroundColor: color }} />
                    </span>
                </li>
            ))}
        </ol>
    );
}
