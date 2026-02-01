import React, { useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

// Pre-configured dashboard views
const DASHBOARD_PRESETS = [
    {
        id: 'discover',
        name: 'Log Explorer',
        description: 'Search and analyze raw logs',
        icon: '🔍',
        path: '/app/discover'
    },
    {
        id: 'overview',
        name: 'Overview Dashboard',
        description: 'High-level activity summary',
        icon: '📊',
        path: '/app/dashboards'
    },
    {
        id: 'security',
        name: 'Security Events',
        description: 'Failed logins, permission changes',
        icon: '🛡️',
        path: '/app/discover',
        query: 'operation:*fail* OR operation:*password* OR operation:*role*'
    },
    {
        id: 'users',
        name: 'User Activity',
        description: 'Track user behavior patterns',
        icon: '👥',
        path: '/app/discover',
        query: ''
    }
];

const TIME_RANGES = [
    { label: 'Last 15 min', value: 'now-15m' },
    { label: 'Last 1 hour', value: 'now-1h' },
    { label: 'Last 24 hours', value: 'now-24h' },
    { label: 'Last 7 days', value: 'now-7d' },
    { label: 'Last 30 days', value: 'now-30d' },
];

const KibanaEmbed: React.FC = () => {
    const { user, isLoading } = useAuth();
    const kibanaUrl = import.meta.env.VITE_KIBANA_URL || 'http://localhost:5601';

    const [activePreset, setActivePreset] = useState(DASHBOARD_PRESETS[0]);
    const [timeRange, setTimeRange] = useState('now-24h');
    const [isLoadingIframe, setIsLoadingIframe] = useState(true);

    // Build the Kibana URL with org-specific index pattern
    const iframeSrc = useMemo(() => {
        if (!user?.organization_id) return null;

        const indexPattern = `logs-*`;
        const columns = ['creation_time', 'operation', 'user_id', 'workload', 'client_ip', 'country_code'];

        // Build URL based on preset
        let url = `${kibanaUrl}${activePreset.path}#/?`;

        // Global state (time range)
        url += `_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:${timeRange},to:now))`;

        // App state (columns, query, index)
        const query = activePreset.query || '';
        url += `&_a=(columns:!(${columns.join(',')}),filters:!(),index:'${indexPattern}',interval:auto,query:(language:kuery,query:'${encodeURIComponent(query)}'),sort:!(!(creation_time,desc)))`;

        return url;
    }, [user?.organization_id, kibanaUrl, activePreset, timeRange]);

    if (isLoading) {
        return (
            <div className="flex-1 flex items-center justify-center bg-slate-900/40 rounded-xl border border-white/5">
                <div className="flex items-center gap-3 text-slate-500">
                    <div className="animate-spin w-5 h-5 border-2 border-current border-t-transparent rounded-full"></div>
                    Loading...
                </div>
            </div>
        );
    }

    if (!user?.organization) {
        return (
            <div className="flex-1 flex items-center justify-center bg-slate-900/40 rounded-xl border border-white/5">
                <div className="text-center p-8">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-800 flex items-center justify-center">
                        <svg className="w-8 h-8 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                    </div>
                    <h3 className="text-xl font-medium text-white mb-2">No Organization Selected</h3>
                    <p className="text-slate-400 text-sm">Please select an organization to view analytics.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col min-h-0 space-y-4">
            {/* Header Controls */}
            <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                <div>
                    <h1 className="text-2xl font-bold text-white">Analytics & Reports</h1>
                    <p className="text-slate-400 text-sm mt-1">
                        Viewing data for <span className="text-white font-medium">{user.organization.name}</span>
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {/* Time Range Selector */}
                    <select
                        value={timeRange}
                        onChange={(e) => setTimeRange(e.target.value)}
                        className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                    >
                        {TIME_RANGES.map(tr => (
                            <option key={tr.value} value={tr.value}>{tr.label}</option>
                        ))}
                    </select>
                    {/* Open in Kibana */}
                    <a
                        href={kibanaUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-slate-800 text-slate-300 border border-slate-700 hover:text-white hover:bg-slate-700 transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        Full Kibana
                    </a>
                </div>
            </div>

            {/* Dashboard Presets */}
            <div className="flex gap-2 overflow-x-auto pb-2">
                {DASHBOARD_PRESETS.map(preset => (
                    <button
                        key={preset.id}
                        onClick={() => { setActivePreset(preset); setIsLoadingIframe(true); }}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                            activePreset.id === preset.id
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:text-white hover:border-slate-600'
                        }`}
                    >
                        <span>{preset.icon}</span>
                        {preset.name}
                    </button>
                ))}
            </div>

            {/* Kibana iFrame Container */}
            <div className="flex-1 bg-slate-900/40 rounded-xl overflow-hidden border border-white/5 relative min-h-[500px]">
                {/* Loading Overlay */}
                {isLoadingIframe && (
                    <div className="absolute inset-0 bg-slate-900/80 flex items-center justify-center z-10">
                        <div className="flex flex-col items-center gap-3">
                            <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                            <span className="text-slate-400 text-sm">Loading {activePreset.name}...</span>
                        </div>
                    </div>
                )}

                {iframeSrc ? (
                    <iframe
                        src={iframeSrc}
                        className="w-full h-full border-0"
                        title={`Kibana - ${activePreset.name}`}
                        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                        onLoad={() => setIsLoadingIframe(false)}
                    />
                ) : (
                    <div className="flex items-center justify-center h-full text-slate-500">
                        <div className="text-center p-8">
                            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-800 flex items-center justify-center">
                                <svg className="w-8 h-8 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                            </div>
                            <h3 className="text-xl font-medium text-white mb-2">Kibana Not Configured</h3>
                            <p className="text-slate-400 text-sm mb-4">
                                Set VITE_KIBANA_URL environment variable to enable embedded analytics.
                            </p>
                            <code className="text-xs bg-slate-900 px-3 py-2 rounded text-slate-300 font-mono">
                                VITE_KIBANA_URL=http://localhost:5601
                            </code>
                        </div>
                    </div>
                )}
            </div>

            {/* Help Text */}
            <div className="flex items-center gap-2 text-xs text-slate-500">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Use Kibana's full interface for advanced visualizations, custom dashboards, and complex queries.
            </div>
        </div>
    );
};

export default KibanaEmbed;
