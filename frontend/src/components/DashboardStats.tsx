import React, { useEffect, useState } from 'react';
import api from '../lib/api';

interface Stats {
    total_24h: number;
    total_alerts_24h: number;
    top_users: Array<{ key: string; count: number }>;
    volume_history: Array<{ count: number }>;
}

const DashboardStats: React.FC = () => {
    const [stats, setStats] = useState<Stats>({
        total_24h: 0,
        total_alerts_24h: 0,
        top_users: [],
        volume_history: []
    });

    const loadStats = async () => {
        try {
            const res = await api.get('/stats');
            if (res.data) setStats(res.data);
        } catch (e) {
            console.error("Load stats error", e);
        }
    };

    useEffect(() => {
        loadStats();
        const interval = setInterval(loadStats, 60000);
        return () => clearInterval(interval);
    }, []);

    const maxVolume = Math.max(...(stats.volume_history?.map(v => v.count) || [0]), 1);

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {/* Stat Card: Total Events */}
            <div className="glass-panel p-6 rounded-xl border border-white/5 bg-gradient-to-br from-slate-900 to-slate-900/50">
                <div className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-2">Events (24h)</div>
                <div className="text-3xl font-bold text-white flex items-end gap-2">
                    {stats.total_24h.toLocaleString()}
                    <span className="text-xs text-emerald-400 font-normal mb-1">events processed</span>
                </div>
            </div>

            {/* Stat Card: Alerts */}
            <div className="glass-panel p-6 rounded-xl border border-white/5 bg-gradient-to-br from-slate-900 to-slate-900/50 relative overflow-hidden">
                <div className="absolute right-0 top-0 p-4 opacity-10">
                    <svg className="w-20 h-20 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                </div>
                <div className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-2">Threats (24h)</div>
                <div className="text-3xl font-bold text-white flex items-end gap-2">
                    {stats.total_alerts_24h.toLocaleString()}
                    <span className="text-xs text-red-400 font-normal mb-1">alerts triggered</span>
                </div>
            </div>

            {/* Top Users */}
            <div className="glass-panel p-6 rounded-xl border border-white/5 bg-slate-900/50 lg:col-span-1">
                <div className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-4">Top Users</div>
                <div className="space-y-3">
                    {(stats.top_users || []).map((user, i) => (
                        <div key={i} className="flex justify-between items-center text-sm">
                            <span className="text-slate-300 truncate w-2/3" title={user.key}>{user.key}</span>
                            <span className="font-mono text-blue-400">{user.count}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Volume Chart (Simple CSS) */}
            <div className="glass-panel p-6 rounded-xl border border-white/5 bg-slate-900/50">
                <div className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-4">Volume (Last 24h)</div>
                <div className="flex items-end justify-between h-32 space-x-1">
                    {(stats.volume_history || []).map((vol, i) => (
                        <div key={i} className="flex flex-col items-center group flex-1">
                            <div
                                className="w-full bg-blue-500/30 hover:bg-blue-500/60 transition-all rounded-t-sm min-w-[4px]"
                                style={{ height: `${(vol.count / maxVolume) * 100}%` }}
                            ></div>
                        </div>
                    ))}
                    {(!stats.volume_history || stats.volume_history.length === 0) && (
                        <div className="w-full text-center text-slate-600 text-xs italic self-center">No volume data</div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DashboardStats;
