import React, { useEffect, useMemo, useState } from 'react';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

interface CountItem {
    key: string;
    count: number;
}

interface VolumeItem {
    time: string;
    count: number;
}

interface StatsResponse {
    total_24h: number;
    total_alerts_24h: number;
    top_users: CountItem[];
    top_operations: CountItem[];
    volume_history: VolumeItem[];
}

interface LogEntry {
    id: string;
    creation_time: string;
    operation: string;
    workload: string;
    user_id: string;
    client_ip: string;
    country_code: string;
    raw_data?: Record<string, unknown>;
}

const TIME_WINDOWS = [
    { label: '15m', value: '15m', minutes: 15 },
    { label: '1h', value: '1h', minutes: 60 },
    { label: '24h', value: '24h', minutes: 1440 },
    { label: '7d', value: '7d', minutes: 10080 },
];

const STORE_BADGES = [
    { label: 'NATS JetStream', detail: 'durable replay bus', tone: 'emerald' },
    { label: 'ClickHouse', detail: 'columnar hot analytics', tone: 'sky' },
    { label: 'Native UI', detail: 'no Kibana dependency', tone: 'violet' },
];

const emptyStats: StatsResponse = {
    total_24h: 0,
    total_alerts_24h: 0,
    top_users: [],
    top_operations: [],
    volume_history: [],
};

const toneClasses: Record<string, string> = {
    emerald: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300 shadow-emerald-500/10',
    sky: 'border-sky-400/20 bg-sky-400/10 text-sky-300 shadow-sky-500/10',
    violet: 'border-violet-400/20 bg-violet-400/10 text-violet-300 shadow-violet-500/10',
};

const formatCompact = (value: number) => Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0);

const formatTime = (value?: string) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const getRiskTone = (operation?: string) => {
    const lower = (operation || '').toLowerCase();
    if (lower.includes('fail') || lower.includes('malware')) return 'bg-red-500/10 text-red-300 border-red-400/20';
    if (lower.includes('delete') || lower.includes('disable')) return 'bg-orange-500/10 text-orange-300 border-orange-400/20';
    if (lower.includes('admin') || lower.includes('role') || lower.includes('permission')) return 'bg-violet-500/10 text-violet-300 border-violet-400/20';
    return 'bg-slate-500/10 text-slate-300 border-slate-400/10';
};

const KibanaEmbed: React.FC = () => {
    const { user } = useAuth();
    const [stats, setStats] = useState<StatsResponse>(emptyStats);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [timeWindow, setTimeWindow] = useState(TIME_WINDOWS[2]);
    const [query, setQuery] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

    const loadAnalytics = async () => {
        setIsLoading(true);
        try {
            const start = new Date(Date.now() - timeWindow.minutes * 60 * 1000).toISOString();
            const [statsRes, logsRes] = await Promise.all([
                api.get<StatsResponse>('/stats'),
                api.get<LogEntry[]>('/logs', {
                    params: {
                        start,
                        q: query || undefined,
                    },
                }),
            ]);
            setStats(statsRes.data || emptyStats);
            setLogs(Array.isArray(logsRes.data) ? logsRes.data.slice(0, 100) : []);
            setLastRefresh(new Date());
        } catch (error) {
            console.error('Analytics load error', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadAnalytics();
        const interval = setInterval(loadAnalytics, 45000);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [timeWindow.value]);

    const maxVolume = useMemo(() => Math.max(...(stats.volume_history || []).map(v => v.count), 1), [stats.volume_history]);
    const alertRatio = stats.total_24h > 0 ? Math.min(100, (stats.total_alerts_24h / stats.total_24h) * 100) : 0;
    const topOperationTotal = useMemo(() => (stats.top_operations || []).reduce((sum, item) => sum + item.count, 0), [stats.top_operations]);

    return (
        <div className="h-full min-h-0 space-y-5 overflow-y-auto pr-1">
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-950/80 p-6 shadow-2xl shadow-cyan-950/20">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.22),transparent_35%),radial-gradient(circle_at_80%_20%,rgba(168,85,247,0.18),transparent_30%)]" />
                <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-emerald-300">
                            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.9)]" />
                            Lightweight hot path
                        </div>
                        <h2 className="max-w-4xl text-4xl font-black tracking-tight text-white md:text-5xl">
                            Native security analytics built for ClickHouse speed.
                        </h2>
                        <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
                            MicroSeem now runs a NATS JetStream ingestion lane with ClickHouse-backed hunts, dashboards, and timelines — no Kibana iframe required.
                        </p>
                    </div>
                    <div className="grid grid-cols-3 gap-3 lg:min-w-[420px]">
                        {STORE_BADGES.map(badge => (
                            <div key={badge.label} className={`rounded-2xl border p-4 shadow-xl ${toneClasses[badge.tone]}`}>
                                <div className="text-sm font-bold text-white">{badge.label}</div>
                                <div className="mt-1 text-[11px] uppercase tracking-wider opacity-75">{badge.detail}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-900/70 p-3 backdrop-blur-xl md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                    {TIME_WINDOWS.map(item => (
                        <button
                            key={item.value}
                            onClick={() => setTimeWindow(item)}
                            className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all ${timeWindow.value === item.value
                                ? 'bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-500/20'
                                : 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
                                }`}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
                <div className="flex flex-1 flex-col gap-2 md:max-w-xl md:flex-row">
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && loadAnalytics()}
                        placeholder="Hunt operations, users, IPs, workloads..."
                        className="min-w-0 flex-1 rounded-xl border border-slate-700/70 bg-slate-950/70 px-4 py-2 text-sm text-white outline-none transition focus:border-cyan-400/70 focus:ring-2 focus:ring-cyan-400/20"
                    />
                    <button onClick={loadAnalytics} className="rounded-xl bg-white px-5 py-2 text-sm font-bold text-slate-950 transition hover:bg-cyan-100 disabled:opacity-60" disabled={isLoading}>
                        {isLoading ? 'Refreshing…' : 'Refresh'}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="Events indexed" value={formatCompact(stats.total_24h)} detail="24 hour hot store window" tone="cyan" />
                <MetricCard label="Alerts raised" value={formatCompact(stats.total_alerts_24h)} detail={`${alertRatio.toFixed(2)}% alert-to-event ratio`} tone="rose" />
                <MetricCard label="Recent matches" value={formatCompact(logs.length)} detail={`Showing latest ${Math.min(logs.length, 100)} events`} tone="violet" />
                <MetricCard label="Last refresh" value={lastRefresh ? lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'} detail="Auto-refreshes every 45s" tone="emerald" />
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
                <section className="glass-panel rounded-2xl border border-white/10 bg-slate-950/60 p-5 xl:col-span-2">
                    <div className="mb-5 flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-bold text-white">Event volume</h3>
                            <p className="text-xs text-slate-400">Materialized for fast dashboard reads.</p>
                        </div>
                        <span className="rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-300">p95 target &lt; 300ms</span>
                    </div>
                    <div className="flex h-64 items-end gap-2 rounded-2xl border border-white/5 bg-slate-950/50 p-4">
                        {(stats.volume_history || []).length === 0 ? (
                            <div className="flex w-full items-center justify-center text-sm text-slate-500">No volume data yet.</div>
                        ) : stats.volume_history.map((item, index) => (
                            <div key={`${item.time}-${index}`} className="group flex h-full flex-1 flex-col justify-end gap-2">
                                <div
                                    className="min-h-[6px] rounded-t-lg bg-gradient-to-t from-cyan-500/60 to-emerald-300 shadow-lg shadow-cyan-500/10 transition-all group-hover:from-cyan-300 group-hover:to-white"
                                    style={{ height: `${Math.max(4, (item.count / maxVolume) * 100)}%` }}
                                    title={`${item.time}: ${item.count} events`}
                                />
                                <span className="hidden truncate text-center text-[10px] text-slate-500 md:block">{item.time}</span>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="glass-panel rounded-2xl border border-white/10 bg-slate-950/60 p-5">
                    <div className="mb-5">
                        <h3 className="text-lg font-bold text-white">Top operations</h3>
                        <p className="text-xs text-slate-400">Columnar aggregations over the hot window.</p>
                    </div>
                    <div className="space-y-3">
                        {(stats.top_operations || []).length === 0 ? <EmptyState label="No operations yet" /> : stats.top_operations.map(item => {
                            const pct = topOperationTotal ? (item.count / topOperationTotal) * 100 : 0;
                            return (
                                <div key={item.key}>
                                    <div className="mb-1 flex justify-between gap-3 text-sm">
                                        <span className="truncate text-slate-200" title={item.key}>{item.key || 'Unknown'}</span>
                                        <span className="font-mono text-cyan-300">{item.count}</span>
                                    </div>
                                    <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                                        <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500" style={{ width: `${Math.max(6, pct)}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
                <section className="glass-panel rounded-2xl border border-white/10 bg-slate-950/60 p-5">
                    <div className="mb-5">
                        <h3 className="text-lg font-bold text-white">Active entities</h3>
                        <p className="text-xs text-slate-400">Users with the most recent event density.</p>
                    </div>
                    <div className="space-y-3">
                        {(stats.top_users || []).length === 0 ? <EmptyState label="No users yet" /> : stats.top_users.map((item, index) => (
                            <div key={`${item.key}-${index}`} className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400/20 to-violet-500/20 text-sm font-black text-white">
                                    {(item.key || '?').charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-semibold text-white" title={item.key}>{item.key || 'Unknown user'}</div>
                                    <div className="text-xs text-slate-500">{item.count.toLocaleString()} events</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="glass-panel rounded-2xl border border-white/10 bg-slate-950/60 p-5 xl:col-span-2">
                    <div className="mb-5 flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-bold text-white">Hot event timeline</h3>
                            <p className="text-xs text-slate-400">Latest ClickHouse-backed matches for {user?.organization?.name || 'your organization'}.</p>
                        </div>
                        <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">Live-ready</span>
                    </div>
                    <div className="max-h-[520px] overflow-y-auto pr-1">
                        {logs.length === 0 ? <EmptyState label="No matching events" /> : logs.map(log => (
                            <div key={log.id || `${log.creation_time}-${log.operation}`} className="mb-3 rounded-2xl border border-white/5 bg-slate-900/60 p-4 transition hover:border-cyan-400/20 hover:bg-slate-900">
                                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                    <div className="min-w-0">
                                        <div className="mb-2 flex flex-wrap items-center gap-2">
                                            <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${getRiskTone(log.operation)}`}>{log.operation || 'Unknown operation'}</span>
                                            <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-slate-300">{log.workload || 'General'}</span>
                                        </div>
                                        <div className="truncate text-sm font-semibold text-white">{log.user_id || 'Unknown user'}</div>
                                        <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                                            <span>{log.client_ip || 'No IP'}</span>
                                            <span>{log.country_code || 'No geo'}</span>
                                            <span>{formatTime(log.creation_time)}</span>
                                        </div>
                                    </div>
                                    <button className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-cyan-400/30 hover:text-white">
                                        Inspect
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
};

const MetricCard: React.FC<{ label: string; value: string; detail: string; tone: 'cyan' | 'rose' | 'violet' | 'emerald' }> = ({ label, value, detail, tone }) => {
    const gradients = {
        cyan: 'from-cyan-400/20 to-blue-500/10 text-cyan-200',
        rose: 'from-rose-400/20 to-red-500/10 text-rose-200',
        violet: 'from-violet-400/20 to-fuchsia-500/10 text-violet-200',
        emerald: 'from-emerald-400/20 to-green-500/10 text-emerald-200',
    };
    return (
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/70 p-5 shadow-xl shadow-black/20">
            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${gradients[tone]}`} />
            <div className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">{label}</div>
            <div className={`mt-3 text-4xl font-black tracking-tight ${gradients[tone].split(' ').at(-1)}`}>{value}</div>
            <div className="mt-2 text-xs text-slate-400">{detail}</div>
        </div>
    );
};

const EmptyState: React.FC<{ label: string }> = ({ label }) => (
    <div className="flex min-h-32 items-center justify-center rounded-2xl border border-dashed border-slate-700/80 bg-slate-900/40 text-sm text-slate-500">
        {label}
    </div>
);

export default KibanaEmbed;
