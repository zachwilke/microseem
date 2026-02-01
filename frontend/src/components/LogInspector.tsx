import React, { useEffect, useState, useCallback } from 'react';
import api from '../lib/api';
import LogDetailsModal from './LogDetailsModal';

interface Log {
    ID?: string;
    id?: string;
    creation_time: string;
    user_id: string;
    operation: string;
    workload: string;
    client_ip?: string;
    city?: string;
    country_code?: string;
    raw_data?: any;
    tenant_desc?: string;
    tenant_name?: string;
}

interface Filter {
    field: string;
    operator: string;
    value: string;
}

// Quick filter presets for common security searches
const QUICK_FILTERS = [
    { label: 'Failed Logins', filters: [{ field: 'operation', operator: 'contains', value: 'fail' }] },
    { label: 'Admin Actions', filters: [{ field: 'operation', operator: 'contains', value: 'admin' }] },
    { label: 'Deletions', filters: [{ field: 'operation', operator: 'contains', value: 'delete' }] },
    { label: 'Password Changes', filters: [{ field: 'operation', operator: 'contains', value: 'password' }] },
    { label: 'External IPs', filters: [{ field: 'country_code', operator: '!=', value: 'US' }] },
];

// Common field suggestions
const FIELD_SUGGESTIONS = [
    'operation', 'user_id', 'workload', 'client_ip', 'city', 'country_code'
];

const LogInspector: React.FC = () => {
    const [logs, setLogs] = useState<Log[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedLog, setSelectedLog] = useState<Log | null>(null);
    const [showCreateAlert, setShowCreateAlert] = useState(false);

    // Pagination State
    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [isFetchingMore, setIsFetchingMore] = useState(false);
    const [totalCount, setTotalCount] = useState(0);
    const BATCH_SIZE = 500;

    const toLocalISO = (d: Date) => {
        const pad = (n: number) => n < 10 ? '0' + n : n;
        return d.getFullYear() + '-' +
            pad(d.getMonth() + 1) + '-' +
            pad(d.getDate()) + 'T' +
            pad(d.getHours()) + ':' +
            pad(d.getMinutes());
    };

    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [startDate, setStartDate] = useState(toLocalISO(yesterday));
    const [endDate, setEndDate] = useState(toLocalISO(now));

    const [columns, setColumns] = useState([
        { id: 'timestamp', label: 'Timestamp', visible: true },
        { id: 'tenant', label: 'Tenant', visible: false },
        { id: 'user', label: 'User', visible: true },
        { id: 'operation', label: 'Operation', visible: true },
        { id: 'workload', label: 'Workload', visible: true },
        { id: 'client_ip', label: 'Client IP', visible: true },
        { id: 'location', label: 'Location', visible: true }
    ]);

    const [filters, setFilters] = useState<Filter[]>([]);
    const [newFilter, setNewFilter] = useState({ field: '', operator: '=', value: '' });
    const [isFuzzy, setIsFuzzy] = useState(false);
    const [showFieldSuggestions, setShowFieldSuggestions] = useState(false);

    const loadLogs = useCallback(async (currentOffset = 0, isReset = false) => {
        if (currentOffset === 0) setIsLoading(true);
        else setIsFetchingMore(true);

        try {
            const startISO = new Date(startDate).toISOString().split('.')[0] + "Z";
            const endISO = new Date(endDate).toISOString().split('.')[0] + "Z";

            const params: any = {
                start: startISO,
                end: endISO,
                limit: BATCH_SIZE,
                offset: currentOffset
            };

            if (filters.length > 0) {
                params.filters = JSON.stringify(filters);
            }
            if (searchQuery) {
                params.q = searchQuery;
                params.fuzzy = isFuzzy;
            }

            const res = await api.get('/logs', { params });
            const newLogs = res.data?.logs || res.data || [];
            const total = res.data?.total || newLogs.length;

            if (isReset) {
                setLogs(newLogs);
                setTotalCount(total);
            } else {
                setLogs(prev => [...prev, ...newLogs]);
            }

            setHasMore(newLogs.length === BATCH_SIZE);
            setOffset(currentOffset + newLogs.length);

        } catch (err) {
            console.error("Failed to load logs", err);
        } finally {
            setIsLoading(false);
            setIsFetchingMore(false);
        }
    }, [startDate, endDate, filters, searchQuery, isFuzzy]);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop, clientHeight, scrollHeight } = e.currentTarget;
        if (scrollHeight - scrollTop <= clientHeight + 100 && hasMore && !isFetchingMore && !isLoading) {
            loadLogs(offset);
        }
    };

    const addFilter = () => {
        if (newFilter.field && newFilter.value) {
            setFilters([...filters, newFilter]);
            setNewFilter({ field: '', operator: '=', value: '' });
        }
    };

    const removeFilter = (index: number) => {
        setFilters(filters.filter((_, i) => i !== index));
    };

    const applyQuickFilter = (quickFilter: typeof QUICK_FILTERS[0]) => {
        setFilters(quickFilter.filters);
    };

    const clearAllFilters = () => {
        setFilters([]);
        setSearchQuery('');
    };

    // Export logs to CSV
    const exportToCSV = () => {
        if (logs.length === 0) return;

        const headers = ['Timestamp', 'User', 'Operation', 'Workload', 'Client IP', 'City', 'Country'];
        const rows = logs.map(log => [
            new Date(log.creation_time).toISOString(),
            log.user_id,
            log.operation,
            log.workload,
            log.client_ip || '',
            log.city || '',
            log.country_code || ''
        ]);

        const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `logs-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Effect to reload when filters change
    useEffect(() => {
        setOffset(0);
        setHasMore(true);
        loadLogs(0, true);
    }, [filters, startDate, endDate, searchQuery, isFuzzy]);

    const toggleColumn = (id: string) => {
        setColumns(prev => prev.map(c => c.id === id ? { ...c, visible: !c.visible } : c));
    };

    const getBadgeColor = (op: string) => {
        if (!op) return 'border-slate-600 text-slate-400';
        const lower = op.toLowerCase();
        if (lower.includes('fail')) return 'border-red-500 text-red-400 bg-red-500/10';
        if (lower.includes('delete')) return 'border-orange-500 text-orange-400 bg-orange-500/10';
        if (lower.includes('admin') || lower.includes('role')) return 'border-purple-500 text-purple-400 bg-purple-500/10';
        if (lower.includes('login') || lower.includes('sign')) return 'border-blue-500 text-blue-400 bg-blue-500/10';
        if (lower.includes('password') || lower.includes('reset')) return 'border-amber-500 text-amber-400 bg-amber-500/10';
        return 'border-slate-600 text-slate-300';
    };

    return (
        <div className="space-y-4">
            {/* Quick Filters Bar */}
            <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-slate-500 font-medium">Quick Filters:</span>
                {QUICK_FILTERS.map((qf, i) => (
                    <button
                        key={i}
                        onClick={() => applyQuickFilter(qf)}
                        className="px-3 py-1 text-xs rounded-full bg-slate-800/60 border border-slate-700/50 text-slate-400 hover:text-white hover:border-blue-500/50 hover:bg-blue-500/10 transition-all"
                    >
                        {qf.label}
                    </button>
                ))}
                {filters.length > 0 && (
                    <button
                        onClick={clearAllFilters}
                        className="px-3 py-1 text-xs rounded-full bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-all"
                    >
                        Clear All
                    </button>
                )}
            </div>

            {/* Controls Bar */}
            <div className="flex flex-col gap-4 bg-slate-800/40 p-4 rounded-xl border border-white/5 backdrop-blur-sm">

                <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
                    {/* Filters & Range */}
                    <div className="flex items-center gap-4 flex-wrap">
                        {/* Date Range */}
                        <div className="flex items-center gap-2 bg-slate-900/50 px-3 py-1.5 rounded-lg border border-slate-700/50">
                            <span className="text-xs text-slate-400 font-medium uppercase">Range</span>
                            <input
                                type="datetime-local"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="bg-transparent text-xs text-slate-300 outline-none px-2 py-1 font-mono hover:text-white transition-colors [&::-webkit-calendar-picker-indicator]:invert"
                            />
                            <span className="text-slate-500 text-xs">to</span>
                            <input
                                type="datetime-local"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="bg-transparent text-xs text-slate-300 outline-none px-2 py-1 font-mono hover:text-white transition-colors [&::-webkit-calendar-picker-indicator]:invert"
                            />
                        </div>

                        {/* Column Toggle */}
                        <div className="relative group">
                            <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/50 border border-slate-700/50 text-xs text-slate-300 hover:text-white transition-colors">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" /></svg>
                                Columns
                            </button>
                            <div className="absolute top-full left-0 mt-2 w-48 bg-slate-900 border border-slate-700 rounded-lg shadow-xl p-2 hidden group-hover:block z-20">
                                {columns.map(col => (
                                    <label key={col.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-white/5 rounded cursor-pointer">
                                        <input type="checkbox" checked={col.visible} onChange={() => toggleColumn(col.id)} className="rounded bg-slate-800 border-slate-600 text-blue-500 focus:ring-offset-slate-900" />
                                        <span className="text-xs text-slate-300">{col.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Export */}
                        <button
                            onClick={exportToCSV}
                            disabled={logs.length === 0}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/50 border border-slate-700/50 text-xs text-slate-300 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                            Export CSV
                        </button>
                    </div>

                    {/* Search (Broad) */}
                    <div className="flex items-center gap-2 bg-slate-900/50 p-1 rounded-lg border border-slate-700">
                        <div className="relative">
                            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search all fields..."
                                className="pl-10 pr-4 py-1.5 bg-transparent text-sm text-white focus:outline-none w-64"
                            />
                        </div>
                        <div className="h-full w-px bg-white/10 mx-1"></div>
                        <label className="flex items-center gap-2 px-2 cursor-pointer select-none" title="Enable typo-tolerant fuzzy search">
                            <input
                                type="checkbox"
                                checked={isFuzzy}
                                onChange={(e) => setIsFuzzy(e.target.checked)}
                                className="rounded bg-slate-800 border-slate-600 text-purple-500 focus:ring-offset-slate-900"
                            />
                            <span className={`text-xs font-medium ${isFuzzy ? 'text-purple-400' : 'text-slate-500'}`}>Fuzzy</span>
                        </label>
                    </div>
                </div>

                {/* Advanced Filter Builder */}
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/5">
                    <span className="text-xs text-slate-400 font-medium uppercase mr-2">Filters:</span>

                    {filters.map((f, i) => (
                        <div key={i} className="flex items-center gap-1 px-2 py-1 rounded bg-blue-500/20 border border-blue-500/30 text-xs text-blue-300">
                            <span className="font-mono font-semibold">{f.field}</span>
                            <span className="opacity-75">{f.operator}</span>
                            <span className="font-mono bg-black/20 px-1 rounded">{f.value}</span>
                            <button onClick={() => removeFilter(i)} className="ml-1 hover:text-white">×</button>
                        </div>
                    ))}

                    <div className="flex items-center gap-2 ml-2 bg-slate-900/30 p-1 rounded border border-white/5">
                        <div className="relative">
                            <input
                                className="bg-transparent text-xs text-white outline-none w-24 pl-1"
                                placeholder="Field"
                                value={newFilter.field}
                                onChange={e => setNewFilter({ ...newFilter, field: e.target.value })}
                                onFocus={() => setShowFieldSuggestions(true)}
                                onBlur={() => setTimeout(() => setShowFieldSuggestions(false), 200)}
                            />
                            {showFieldSuggestions && (
                                <div className="absolute top-full left-0 mt-1 w-32 bg-slate-900 border border-slate-700 rounded shadow-xl z-30">
                                    {FIELD_SUGGESTIONS.filter(f => f.includes(newFilter.field.toLowerCase())).map(f => (
                                        <button
                                            key={f}
                                            className="w-full px-2 py-1 text-left text-xs text-slate-300 hover:bg-slate-800"
                                            onMouseDown={() => setNewFilter({ ...newFilter, field: f })}
                                        >
                                            {f}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <select
                            className="bg-slate-800 text-xs text-slate-300 border-none outline-none rounded px-1 py-0.5"
                            value={newFilter.operator}
                            onChange={e => setNewFilter({ ...newFilter, operator: e.target.value })}
                        >
                            <option value="=">=</option>
                            <option value="!=">!=</option>
                            <option value="contains">contains</option>
                        </select>
                        <input
                            className="bg-transparent text-xs text-white outline-none w-24 pl-1"
                            placeholder="Value"
                            value={newFilter.value}
                            onChange={e => setNewFilter({ ...newFilter, value: e.target.value })}
                            onKeyDown={e => e.key === 'Enter' && addFilter()}
                        />
                        <button onClick={addFilter} className="px-2 py-0.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded transition-colors">+</button>
                    </div>
                </div>
            </div>

            {/* Results Summary */}
            <div className="flex items-center justify-between text-xs text-slate-500">
                <span>
                    {isLoading ? 'Loading...' : `${logs.length.toLocaleString()} logs loaded${totalCount > logs.length ? ` of ${totalCount.toLocaleString()}` : ''}`}
                </span>
                <span className="font-mono">
                    {new Date(startDate).toLocaleDateString()} — {new Date(endDate).toLocaleDateString()}
                </span>
            </div>

            {/* Table Container with Scroll */}
            <div className="glass-panel overflow-hidden rounded-xl border border-white/5 bg-slate-900/40 flex flex-col h-[600px]">
                <div
                    className="overflow-y-auto flex-1 custom-scrollbar"
                    onScroll={handleScroll}
                >
                    <table className="w-full text-left text-sm relative">
                        <thead className="bg-slate-900/90 backdrop-blur sticky top-0 z-10 text-xs uppercase font-medium text-slate-400 border-b border-white/5 shadow-sm">
                            <tr>
                                {columns.map(col => col.visible && (
                                    <th key={col.id} className="px-6 py-4 font-semibold tracking-wider whitespace-nowrap bg-slate-900/90">{col.label}</th>
                                ))}
                                <th className="px-4 py-4 w-10 bg-slate-900/90"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {isLoading && offset === 0 ? (
                                <tr><td colSpan={100} className="px-6 py-12 text-center text-slate-500"><div className="animate-spin inline-block w-6 h-6 border-2 border-current border-t-transparent text-blue-500 rounded-full"></div> Loading...</td></tr>
                            ) : logs.length === 0 ? (
                                <tr><td colSpan={100} className="px-6 py-12 text-center text-slate-500 italic">No logs found for this period.</td></tr>
                            ) : (
                                <>
                                    {logs.map((log, i) => (
                                        <tr
                                            key={`${log.ID || log.id}-${i}`}
                                            onClick={() => setSelectedLog(log)}
                                            className="group hover:bg-white/[0.02] transition-colors cursor-pointer"
                                        >
                                            {columns.find(c => c.id === 'timestamp')?.visible && (
                                                <td className="px-6 py-4 whitespace-nowrap font-mono text-xs text-slate-300">
                                                    {new Date(log.creation_time).toLocaleString()}
                                                </td>
                                            )}
                                            {columns.find(c => c.id === 'tenant')?.visible && (
                                                <td className="px-6 py-4 whitespace-nowrap font-medium text-white/90">
                                                    {log.tenant_desc || log.tenant_name || '-'}
                                                </td>
                                            )}
                                            {columns.find(c => c.id === 'user')?.visible && (
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-[10px] text-white font-medium">
                                                            {log.user_id ? log.user_id.charAt(0).toUpperCase() : '?'}
                                                        </div>
                                                        <span className="text-slate-300 truncate max-w-[150px]" title={log.user_id}>{log.user_id}</span>
                                                    </div>
                                                </td>
                                            )}
                                            {columns.find(c => c.id === 'operation')?.visible && (
                                                <td className="px-6 py-4">
                                                    <span className={`px-2 py-0.5 rounded text-[11px] font-medium border ${getBadgeColor(log.operation)}`}>
                                                        {log.operation}
                                                    </span>
                                                </td>
                                            )}
                                            {columns.find(c => c.id === 'workload')?.visible && (
                                                <td className="px-6 py-4 text-slate-400">{log.workload}</td>
                                            )}
                                            {columns.find(c => c.id === 'client_ip')?.visible && (
                                                <td className="px-6 py-4 text-slate-400 font-mono text-xs">{log.client_ip || '-'}</td>
                                            )}
                                            {columns.find(c => c.id === 'location')?.visible && (
                                                <td className="px-6 py-4 text-slate-400 text-xs">
                                                    {log.city ? `${log.city}, ${log.country_code}` : (log.country_code || '-')}
                                                </td>
                                            )}
                                            <td className="px-4 py-4">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedLog(log);
                                                        setShowCreateAlert(true);
                                                    }}
                                                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-amber-500/20 rounded text-amber-500 transition-all"
                                                    title="Create alert from this log"
                                                >
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {isFetchingMore && (
                                        <tr><td colSpan={100} className="px-6 py-4 text-center text-slate-500"><div className="animate-spin inline-block w-4 h-4 border-2 border-current border-t-transparent text-blue-500 rounded-full"></div> Loading more...</td></tr>
                                    )}
                                </>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <LogDetailsModal
                log={selectedLog}
                onClose={() => {
                    setSelectedLog(null);
                    setShowCreateAlert(false);
                }}
                showCreateAlert={showCreateAlert}
            />
        </div>
    );
};

export default LogInspector;
