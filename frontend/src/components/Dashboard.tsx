import React, { useEffect, useState } from 'react';
import axios from 'axios';
import DashboardStats from './DashboardStats';
import WorldMap from './WorldMap';

const API_URL = 'http://localhost:8080/api';

interface Alert {
    rule_name: string;
    severity: string;
    description: string;
    created_at: string;
    raw_data?: { ClientIP?: string };
}

const Dashboard: React.FC = () => {
    const [recentAlerts, setRecentAlerts] = useState<Alert[]>([]);

    const loadRecentAlerts = async () => {
        try {
            const res = await axios.get(`${API_URL}/alerts`);
            if (res.data) {
                setRecentAlerts(res.data.slice(0, 5));
            }
        } catch (e) {
            console.error("Recent alerts error", e);
        }
    };

    useEffect(() => {
        loadRecentAlerts();
        const interval = setInterval(loadRecentAlerts, 30000); // 30s refresh
        return () => clearInterval(interval);
    }, []);

    const getSeverityColor = (sev: string) => {
        switch (sev) {
            case 'critical': return 'text-purple-500 bg-purple-500/10 border-purple-500/20';
            case 'high': return 'text-red-500 bg-red-500/10 border-red-500/20';
            case 'medium': return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
            default: return 'text-slate-500 bg-slate-500/10 border-slate-500/20';
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">Security Command Center</h1>
                    <p className="text-slate-400 mt-2 font-light">Overview of system status, active threats, and global activity.</p>
                </div>

            </div>

            {/* Stats Row */}
            <DashboardStats />

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Live Map Column (2/3) */}
                <div className="lg:col-span-2 flex flex-col gap-4">
                    <div className="flex justify-between items-center">
                        <h3 className="text-white font-bold text-lg">Live Activity Map</h3>
                        <span className="text-xs text-slate-500 uppercase tracking-widest">Real-Time</span>
                    </div>
                    {/* Wrap WorldMap in a fixed height container for the dashboard card feel */}
                    <div className="h-[500px] w-full">
                        <WorldMap />
                    </div>
                </div>

                {/* Recent Alerts Column (1/3) */}
                <div className="flex flex-col gap-4">
                    <div className="flex justify-between items-center">
                        <h3 className="text-white font-bold text-lg">Recent Threats</h3>
                        <span className="text-xs text-slate-500 uppercase tracking-widest">Latest 5</span>
                    </div>

                    <div className="glass-panel p-4 rounded-xl border border-white/5 bg-slate-900/40 flex-1 overflow-hidden flex flex-col">
                        {recentAlerts.length === 0 ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 italic">
                                <svg className="w-12 h-12 mb-2 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                No active threats.
                            </div>
                        ) : (
                            <div className="space-y-3 overflow-y-auto pr-2 custom-scrollbar">
                                {recentAlerts.map((alert, i) => (
                                    <div key={i} className="p-3 bg-slate-800/50 rounded-lg border border-white/5 hover:border-white/10 transition-colors">
                                        <div className="flex justify-between items-start mb-1">
                                            <span className="text-xs font-bold text-white truncate w-2/3" title={alert.rule_name}>{alert.rule_name}</span>
                                            <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider border ${getSeverityColor(alert.severity)}`}>
                                                {alert.severity}
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-slate-400 leading-tight mb-2 line-clamp-2">{alert.description}</p>
                                        <div className="flex justify-between items-center text-[10px] font-mono text-slate-500">
                                            <span>{new Date(alert.created_at).toLocaleTimeString()}</span>
                                            <span>{alert.raw_data?.ClientIP || 'N/A'}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <button className="w-full mt-4 py-2 text-xs text-center text-slate-400 hover:text-white border-t border-white/5 transition-colors">
                            View All Alerts →
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
