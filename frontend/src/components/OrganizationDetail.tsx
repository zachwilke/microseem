import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios'; // We'll assume axios is available or use fetch
import { ArrowLeftIcon, ClockIcon, ShieldCheckIcon, EnvelopeIcon } from '@heroicons/react/24/outline';
import WorldMap from './WorldMap';
import LiveLogs from './LiveLogs'; // We might need to adapt LiveLogs to accept props, or create a scoped version
// But for now, let's assume we can pass filters to LiveLogs if we update it, or just embed components that fetch their own data.
// Since LiveLogs doesn't accept props yet, we might need a modified version or update LiveLogs first. 
// Actually, let's check LiveLogs again. It relies on global WebSocket. 
// For this MVP, let's use the Stats + Map + Logs pattern but filtered.

// We will need to update LiveLogs to accept a `tenantId` prop to filter the WS stream client-side 
// (or server-side if we subscribe to topics, but client-side filtering is easier for now).

// Wait, I haven't updated LiveLogs to accept props yet. 
// I should probably do that first or handle it here. 
// Let's create a generic "ScopedLogs" or just update LiveLogs to accept `tenantId`.

// For this step, I will create the layout and fetch the details.

interface Tenant {
    ID: string;
    name: string;
    contact_email: string;
    tenant_id: string;
    last_poll: string;
}

const OrganizationDetail: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const [org, setOrg] = useState<Tenant | null>(null);
    const [stats, setStats] = useState<any>(null);
    const [activeTab, setActiveTab] = useState<'overview' | 'logs'>('overview');

    useEffect(() => {
        if (id) {
            fetchOrgDetails();
            fetchOrgStats();
        }
    }, [id]);

    const fetchOrgDetails = async () => {
        // Since we don't have a direct "Get Tenant By ID" API in the list above (only List and Update), 
        // we might need to filter from the list or add a Get endpoint.
        // Actually, looking at `RegisterTenantRoutes`, there is no `Get /tenants/{id}`. 
        // I should probably add one, or just fetch all and find (inefficient but works for small N).
        // Let's fetch all for now.
        try {
            const res = await axios.get('http://localhost:8080/api/tenants');
            const found = res.data.find((t: any) => t.ID === id);
            setOrg(found || null);
        } catch (e) {
            console.error(e);
        }
    };

    const fetchOrgStats = async () => {
        try {
            const res = await axios.get(`http://localhost:8080/api/stats?tenant_id=${id}`);
            setStats(res.data);
        } catch (e) {
            console.error(e);
        }
    };

    if (!org) return <div className="p-8 text-slate-500">Loading organization...</div>;

    return (
        <div className="flex flex-col h-screen overflow-hidden">
            {/* Header */}
            <div className="p-6 border-b border-white/5 bg-slate-900/50 backdrop-blur shrink-0 z-20 flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <Link to="/organizations" className="p-2 hover:bg-white/5 rounded-full text-slate-400 hover:text-white transition-colors">
                        <ArrowLeftIcon className="w-5 h-5" />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-light text-white">{org.name}</h1>
                        <div className="flex items-center gap-4 mt-1 text-xs text-slate-500 font-mono">
                            <span>ID: {org.tenant_id}</span>
                            <span className="flex items-center gap-1">
                                <EnvelopeIcon className="w-3 h-3" /> {org.contact_email || 'No Contact'}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="flex bg-slate-800/50 p-1 rounded-lg border border-white/5">
                    <button
                        onClick={() => setActiveTab('overview')}
                        className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'overview' ? 'bg-indigo-500 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                    >
                        Overview
                    </button>
                    <button
                        onClick={() => setActiveTab('logs')}
                        className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'logs' ? 'bg-indigo-500 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                    >
                        Live Logs
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
                {activeTab === 'overview' ? (
                    <div className="space-y-6 max-w-7xl mx-auto">
                        {/* KPI Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="glass-panel p-6 rounded-xl border border-white/5 relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                    <ShieldCheckIcon className="w-16 h-16 text-emerald-500" />
                                </div>
                                <div className="text-slate-400 text-sm font-medium mb-1">Total Events (24h)</div>
                                <div className="text-3xl text-white font-light tracking-tight">
                                    {stats?.total_24h?.toLocaleString() || 0}
                                </div>
                            </div>
                            <div className="glass-panel p-6 rounded-xl border border-white/5 relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                    <ClockIcon className="w-16 h-16 text-blue-500" />
                                </div>
                                <div className="text-slate-400 text-sm font-medium mb-1">Last Poll</div>
                                <div className="text-xl text-white font-light tracking-tight mt-1">
                                    {new Date(org.last_poll).toLocaleString()}
                                </div>
                            </div>
                            <div className="glass-panel p-6 rounded-xl border border-white/5 flex flex-col justify-center">
                                <div className="text-slate-400 text-sm font-medium mb-2">Top Users</div>
                                <div className="space-y-2">
                                    {stats?.top_users?.slice(0, 3).map((u: any, i: number) => (
                                        <div key={i} className="flex justify-between text-xs">
                                            <span className="text-slate-300 truncate w-32" title={u.key}>{u.key}</span>
                                            <span className="text-slate-500 font-mono">{u.count}</span>
                                        </div>
                                    ))}
                                    {(!stats?.top_users || stats.top_users.length === 0) && <span className="text-slate-600 text-xs italic">No activity</span>}
                                </div>
                            </div>
                        </div>

                        {/* Map Section */}
                        <div className="h-[400px] w-full rounded-2xl overflow-hidden border border-white/5 shadow-2xl">
                            {/* Map Component - Needs to be updated to accept filters or we just show global map for now? 
                               Ideally we update WorldMap to accept a filter prop. 
                               For now, I'll instantiate it, but it will show ALL data. 
                               TODO: Update WorldMap to accept tenantId prop.
                             */}
                            <WorldMap />
                        </div>
                    </div>
                ) : (
                    <div className="h-full">
                        {/* TODO: Update LiveLogs to accept tenantId filter */}
                        <LiveLogs />
                    </div>
                )}
            </div>
        </div>
    );
};

export default OrganizationDetail;
