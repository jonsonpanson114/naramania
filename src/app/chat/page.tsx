'use client';

import { useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Header } from '@/components/Header';
import { AlertCircle, ArrowUpRight, Bot, CalendarDays, ExternalLink, Loader2, MessageSquareText, Search, Sparkles, Trophy } from 'lucide-react';
import type { ChatContext } from '@/services/chat_service';

type ChatSource = {
    type: 'local' | 'web';
    title: string;
    url: string;
    snippet?: string;
    municipality?: string;
    date?: string;
};

type ChatMatch = {
    id: string;
    municipality: string;
    title: string;
    type: string;
    announcementDate: string;
    biddingDate?: string;
    link: string;
    status: string;
    winningContractor?: string;
    designFirm?: string;
};

type ChatMessage = {
    role: 'user' | 'assistant';
    content: string;
    sources?: ChatSource[];
    localMatches?: ChatMatch[];
    followups?: string[];
    usedWebSearch?: boolean;
    webSearchStatus?: 'not-requested' | 'used' | 'unavailable' | 'failed';
    model?: string;
};

const STARTER_PROMPTS = [
    '今週の開札物件は？',
    '奈良県の新着案件を教えて',
    '緑ヶ丘中学校外３校屋上防水改修設計業務を調べて',
    'このサイトにない奈良の学校改修案件も探して',
];

export default function ChatPage() {
    const [question, setQuestion] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [context, setContext] = useState<ChatContext | undefined>(undefined);
    const [messages, setMessages] = useState<ChatMessage[]>([
        {
            role: 'assistant',
            content: '案件名、自治体名、時期をそのまま聞いてください。サイト内データを優先して見て、足りなければ Web も補足します。',
            followups: STARTER_PROMPTS.slice(0, 3),
        },
    ]);

    const canSubmit = question.trim().length > 0 && !loading;

    const lastAssistant = useMemo(
        () => [...messages].reverse().find(message => message.role === 'assistant'),
        [messages],
    );

    async function submitQuestion(nextQuestion?: string) {
        const text = (nextQuestion ?? question).trim();
        if (!text) return;

        setError(null);
        setLoading(true);
        setMessages(prev => [...prev, { role: 'user', content: text }]);
        setQuestion('');

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    question: text,
                    history: messages.slice(-6).map(message => ({
                        role: message.role,
                        content: message.content,
                    })),
                    context,
                }),
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.details || data.error || 'チャット応答に失敗しました');
            }

            setMessages(prev => [
                ...prev,
                {
                    role: 'assistant',
                    content: data.answer,
                    sources: data.sources,
                    localMatches: data.localMatches,
                    followups: data.followups,
                    usedWebSearch: data.usedWebSearch,
                    webSearchStatus: data.webSearchStatus,
                    model: data.model,
                },
            ]);
            setContext(data.context);
        } catch (submitError) {
            const message = submitError instanceof Error ? submitError.message : 'チャット応答に失敗しました';
            setError(message);
            setMessages(prev => [
                ...prev,
                {
                    role: 'assistant',
                    content: '回答の生成に失敗しました。少し時間を置いて再度お試しください。',
                },
            ]);
        } finally {
            setLoading(false);
        }
    }

    return (
        <AppShell>
            <Header />

            <div className="mx-auto max-w-7xl">
                <div className="mb-10 flex flex-col gap-5 rounded-[2rem] border border-border/60 bg-white/80 p-8 shadow-soft">
                    <div className="flex flex-wrap items-center gap-3">
                        <span className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/5 px-3 py-1 text-[11px] tracking-[0.2em] text-accent uppercase">
                            <Sparkles size={14} />
                            AI Assistant
                        </span>
                        <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-[11px] tracking-[0.2em] text-secondary uppercase">
                            <Search size={14} />
                            サイト内優先 + Web補足
                        </span>
                    </div>
                    <div className="grid gap-8 xl:grid-cols-[1.7fr_0.7fr]">
                        <div>
                            <h1 className="text-3xl tracking-[0.12em] text-primary">入札チャット</h1>
                            <p className="mt-4 max-w-3xl text-sm leading-7 tracking-[0.06em] text-secondary/75">
                                「今週の開札物件は？」「橿原市の設計案件だけ見たい」「この案件を調べて」のようにそのまま聞けます。
                                サイト内データで答えきれない場合は、Gemini の検索グラウンディングで補足します。
                            </p>
                        </div>
                        <div className="rounded-[1.5rem] border border-border/60 bg-sidebar/60 p-5">
                            <p className="text-[11px] tracking-[0.2em] text-secondary/50 uppercase">使いどころ</p>
                            <div className="mt-4 space-y-3 text-sm text-primary/85">
                                <div className="rounded-2xl bg-white/80 p-3">今週・今月の開札予定をまとめて確認</div>
                                <div className="rounded-2xl bg-white/80 p-3">案件名から関連情報を深掘り</div>
                                <div className="rounded-2xl bg-white/80 p-3">サイト外の補足情報も追う</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mb-6 flex flex-wrap gap-3">
                    {STARTER_PROMPTS.map(prompt => (
                        <button
                            key={prompt}
                            type="button"
                            onClick={() => void submitQuestion(prompt)}
                            className="rounded-full border border-border bg-white px-4 py-2 text-sm tracking-[0.04em] text-secondary transition hover:border-accent/40 hover:text-accent"
                        >
                            {prompt}
                        </button>
                    ))}
                </div>

                <div className="mb-6 grid gap-4 xl:grid-cols-3">
                    <section className="rounded-[1.8rem] border border-border/60 bg-white/85 p-5 shadow-soft">
                        <p className="text-[11px] tracking-[0.2em] text-secondary/50 uppercase">直近の回答状態</p>
                        <div className="mt-4 rounded-[1.4rem] bg-sidebar/60 p-4">
                            <p className="text-sm leading-7 text-primary">
                                {lastAssistant?.usedWebSearch
                                    ? 'この会話では Web 補足も使いました。案件がサイト内に薄いときは外部ソースも見に行きます。'
                                    : lastAssistant?.webSearchStatus === 'unavailable'
                                        ? 'Web補足を求めた質問でしたが、この実行では外部AI/APIキーが使えず、サイト内データだけで回答しています。'
                                        : lastAssistant?.webSearchStatus === 'failed'
                                            ? 'Web補足を試しましたが外部応答が不安定だったため、今回はサイト内データ中心で回答しています。'
                                    : 'この会話ではサイト内データ中心で回答しています。まず現行の収集データを優先して見ます。'}
                            </p>
                        </div>
                    </section>

                    <section className="rounded-[1.8rem] border border-border/60 bg-white/85 p-5 shadow-soft">
                        <p className="text-[11px] tracking-[0.2em] text-secondary/50 uppercase">おすすめの聞き方</p>
                        <div className="mt-4 space-y-3 text-sm leading-7 text-secondary/80">
                            <p>自治体名を入れると絞りやすくなります。</p>
                            <p>「今週」「今月」「落札」「設計」などを入れると意図を読みやすいです。</p>
                            <p>案件名をそのまま貼ると個別調査に向いています。</p>
                        </div>
                    </section>

                    <section className="rounded-[1.8rem] border border-border/60 bg-white/85 p-5 shadow-soft">
                        <p className="text-[11px] tracking-[0.2em] text-secondary/50 uppercase">使い方のコツ</p>
                        <div className="mt-4 space-y-3 text-sm leading-7 text-secondary/80">
                            <p>「このサイトにない案件も調べて」と入れると Web 補足を積極的に使います。</p>
                            <p>「開札」「公告」「受付中」のような状態語を入れると精度が上がります。</p>
                            <p>気になる回答が出たら、そのまま続けて深掘りできます。</p>
                        </div>
                    </section>
                </div>

                <section className="rounded-[2rem] border border-border/60 bg-white/90 p-5 shadow-soft">
                        <div className="mb-4 flex items-center gap-3 px-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                                <MessageSquareText size={20} />
                            </div>
                            <div>
                                <h2 className="text-lg tracking-[0.08em] text-primary">会話</h2>
                                <p className="text-xs tracking-[0.16em] text-secondary/55 uppercase">Question & Answer</p>
                            </div>
                        </div>

                        <div className="max-h-[68vh] space-y-5 overflow-y-auto px-2 py-2 lg:px-4">
                            {messages.map((message, index) => (
                                <div
                                    key={`${message.role}-${index}`}
                                    className={`rounded-[1.6rem] px-5 py-4 ${
                                        message.role === 'user'
                                            ? 'ml-auto max-w-[88%] bg-accent text-white lg:max-w-[78%]'
                                            : 'mr-auto max-w-[92%] border border-border/60 bg-sidebar/55 text-primary lg:max-w-[82%]'
                                    }`}
                                >
                                    <div className="mb-2 flex items-center gap-2 text-xs tracking-[0.16em] uppercase">
                                        {message.role === 'assistant' ? <Bot size={14} /> : null}
                                        <span>{message.role === 'assistant' ? 'Assistant' : 'You'}</span>
                                    </div>
                                    <p className="whitespace-pre-wrap text-sm leading-7 tracking-[0.04em]">{message.content}</p>

                                    {message.role === 'assistant' && message.localMatches && message.localMatches.length > 0 ? (
                                        <div className="mt-5 overflow-hidden rounded-2xl border border-border/60 bg-white/85">
                                            <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
                                                <p className="text-[11px] font-bold tracking-[0.18em] text-secondary/50 uppercase">Matched Projects</p>
                                                <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-bold tracking-[0.12em] text-accent">
                                                    {message.localMatches.length}件
                                                </span>
                                            </div>
                                            <div className="divide-y divide-border/40">
                                                {message.localMatches.slice(0, 8).map(match => (
                                                    <div key={match.id} className="grid gap-3 px-4 py-3 lg:grid-cols-[1fr_170px] lg:items-center">
                                                        <div>
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <span className="rounded-full border border-border bg-sidebar/70 px-2 py-0.5 text-[10px] font-bold tracking-[0.12em] text-secondary">
                                                                    {match.municipality}
                                                                </span>
                                                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-[0.12em] ${
                                                                    match.status === '落札'
                                                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                                                        : match.status === '受付中'
                                                                            ? 'bg-blue-50 text-blue-700 border border-blue-100'
                                                                            : 'bg-slate-50 text-slate-600 border border-slate-100'
                                                                }`}>
                                                                    {match.status}
                                                                </span>
                                                                <span className="text-[10px] tracking-[0.12em] text-secondary/45">{match.type}</span>
                                                            </div>
                                                            <a
                                                                href={`/project/${match.id}`}
                                                                className="mt-2 block text-sm font-semibold leading-6 text-primary transition hover:text-accent"
                                                            >
                                                                {match.title}
                                                            </a>
                                                            {(match.winningContractor || match.designFirm) ? (
                                                                <div className="mt-2 flex flex-wrap gap-2 text-[11px] leading-5">
                                                                    {match.winningContractor ? (
                                                                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">
                                                                            <Trophy size={11} />
                                                                            {match.winningContractor}
                                                                        </span>
                                                                    ) : null}
                                                                    {match.designFirm ? (
                                                                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">
                                                                            設計 {match.designFirm}
                                                                        </span>
                                                                    ) : null}
                                                                </div>
                                                            ) : null}
                                                        </div>
                                                        <div className="rounded-xl bg-sidebar/60 p-3 text-xs leading-6 text-secondary/70">
                                                            <div className="flex items-center justify-between gap-2">
                                                                <span className="inline-flex items-center gap-1 text-secondary/45">
                                                                    <CalendarDays size={12} />
                                                                    公告
                                                                </span>
                                                                <span className="font-mono text-primary">{match.announcementDate || '-'}</span>
                                                            </div>
                                                            <div className="flex items-center justify-between gap-2">
                                                                <span className="text-secondary/45">開札</span>
                                                                <span className="font-mono text-primary">{match.biddingDate || '-'}</span>
                                                            </div>
                                                            <a
                                                                href={match.link}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold tracking-[0.12em] text-accent"
                                                            >
                                                                元ページ
                                                                <ExternalLink size={11} />
                                                            </a>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ) : null}

                                    {message.role === 'assistant' && message.sources && message.sources.length > 0 ? (
                                        <div className="mt-5 space-y-2">
                                            <p className="text-[11px] tracking-[0.18em] text-secondary/50 uppercase">Sources</p>
                                            {message.sources.slice(0, 6).map(source => (
                                                <a
                                                    key={`${source.type}-${source.url}-${source.title}`}
                                                    href={source.url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="block rounded-2xl border border-border/60 bg-white/70 px-4 py-3 transition hover:border-accent/40"
                                                >
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div>
                                                            <p className="text-sm text-primary">{source.title}</p>
                                                            <p className="mt-1 text-xs text-secondary/65">
                                                                {[source.type === 'local' ? 'サイト内' : 'Web', source.municipality, source.date]
                                                                    .filter(Boolean)
                                                                    .join(' / ')}
                                                            </p>
                                                            {source.snippet ? (
                                                                <p className="mt-2 text-xs leading-6 text-secondary/70">{source.snippet}</p>
                                                            ) : null}
                                                        </div>
                                                        <ArrowUpRight size={16} className="mt-1 shrink-0 text-accent" />
                                                    </div>
                                                </a>
                                            ))}
                                        </div>
                                    ) : null}

                                    {message.role === 'assistant' && message.followups && message.followups.length > 0 ? (
                                        <div className="mt-5 flex flex-wrap gap-2">
                                            {message.followups.map(followup => (
                                                <button
                                                    key={followup}
                                                    type="button"
                                                    onClick={() => void submitQuestion(followup)}
                                                    className="rounded-full border border-border bg-white/80 px-3 py-1.5 text-xs tracking-[0.08em] text-secondary transition hover:border-accent/40 hover:text-accent"
                                                >
                                                    {followup}
                                                </button>
                                            ))}
                                        </div>
                                    ) : null}

                                    {message.role === 'assistant' && message.model ? (
                                        <p className="mt-4 text-[10px] tracking-[0.16em] text-secondary/45 uppercase">
                                            model: {message.model}
                                            {message.usedWebSearch ? ' / google search grounding used' : ''}
                                            {message.webSearchStatus === 'unavailable' ? ' / web supplement unavailable' : ''}
                                            {message.webSearchStatus === 'failed' ? ' / web supplement fallback' : ''}
                                        </p>
                                    ) : null}
                                </div>
                            ))}

                            {loading ? (
                                <div className="mr-auto max-w-[92%] rounded-[1.6rem] border border-border/60 bg-sidebar/55 px-5 py-4 text-primary lg:max-w-[82%]">
                                    <div className="flex items-center gap-3 text-sm tracking-[0.08em]">
                                        <Loader2 size={16} className="animate-spin text-accent" />
                                        回答を準備しています...
                                    </div>
                                </div>
                            ) : null}
                        </div>

                        <div className="mt-5 border-t border-border/70 px-2 pt-5">
                            <div className="rounded-[1.8rem] border border-border/70 bg-background px-4 py-4 lg:px-5 lg:py-5">
                                <textarea
                                    value={question}
                                    onChange={(event) => setQuestion(event.target.value)}
                                    placeholder="例: 今週の開札物件は？ / 奈良県の新着案件を教えて / この案件を詳しく調べて"
                                    rows={4}
                                    className="w-full resize-none bg-transparent text-sm leading-7 tracking-[0.04em] text-primary outline-none placeholder:text-secondary/45"
                                />
                                <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                    <p className="text-xs tracking-[0.08em] text-secondary/55">
                                        サイト内データを優先し、必要時のみ Web 補足を使います。
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => void submitQuestion()}
                                        disabled={!canSubmit}
                                        className="self-end rounded-full bg-accent px-6 py-3 text-sm tracking-[0.12em] text-white transition disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        送信
                                    </button>
                                </div>
                            </div>
                        </div>
                </section>

                {error ? (
                    <section className="mt-6 rounded-[2rem] border border-rose-200 bg-rose-50/80 p-6 shadow-soft">
                        <div className="flex items-start gap-3">
                            <AlertCircle size={18} className="mt-0.5 text-rose-500" />
                            <div>
                                <p className="text-sm text-rose-700">エラー</p>
                                <p className="mt-2 text-xs leading-6 text-rose-600">{error}</p>
                            </div>
                        </div>
                    </section>
                ) : null}
            </div>
        </AppShell>
    );
}
