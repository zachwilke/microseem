import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import LogDetailsModal from './LogDetailsModal';

const API_URL = 'http://localhost:8080/api';

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
    tenant_name?: string;
}

interface Investigation {
    ID: string;
    name: string;
    description: string;
    filters: any; // Raw JSON
}

const InvestigationDetail: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const [investigation, setInvestigation] = useState<Investigation | null>(null);
    const [logs, setLogs] = useState<Log[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedLog, setSelectedLog] = useState<Log | null>(null);
    const [saving, setSaving] = useState(false);

    // Filter State
    const [searchQuery, setSearchQuery] = useState('');
    const [isFuzzy, setIsFuzzy] = useState(false);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [filters, setFilters] = useState<{ field: string; operator: string; value: string }[]>([]);

    const [newFilter, setNewFilter] = useState({ field: '', operator: '=', value: '' });
    const [columns, setColumns] = useState([
        { id: 'timestamp', label: 'Timestamp', visible: true },
        { id: 'tenant', label: 'Tenant', visible: true },
        { id: 'user', label: 'User', visible: true },
        { id: 'operation', label: 'Operation', visible: true },
        { id: 'workload', label: 'Workload', visible: true },
        { id: 'client_ip', label: 'Client IP', visible: true },
        { id: 'location', label: 'Location', visible: true }
    ]);

    // Initial Load
    useEffect(() => {
        const fetchInvestigation = async () => {
            try {
                const res = await axios.get(`${API_URL}/investigations/${id}`);
                const inv = res.data;
                setInvestigation(inv);

                // Parse and set state from investigation filters
                if (inv.Filters) {
                    // The JSON is byte array or already object? 
                    // GORM jsonb comes as raw. Axios auto parses JSON response.
                    // The backend 'filters' field is datatypes.JSON which usually results in an object or array in JSON response.
                    // But previously we saw it might need parsing if sent as string. 
                    // Let's assume axios returns it as an object if specific struct type.
                    // Actually, datatypes.JSON is []byte. JSON marshalls []byte as base64 string usually?
                    // Wait, GORM datatypes.JSON usually implements MarshallJSON to raw JSON.

                    let state = inv.filters;
                    // It might be a base64 string if frontend receives it raw from a byte slice not handled as json.RawMessage
                    // Let's try to handle it.
                    if (typeof state === 'string') {
                        try {
                            // If it looks like base64... or just json string
                            // Try parsing as JSON first
                            state = JSON.parse(state);
                        } catch (e) {
                            // Ignore
                        }
                    }

                    if (state) {
                        if (state.start) setStartDate(state.start);
                        if (state.end) setEndDate(state.end);
                        if (state.q) setSearchQuery(state.q);
                        if (state.fuzzy !== undefined) setIsFuzzy(state.fuzzy);
                        if (state.filters && Array.isArray(state.filters)) setFilters(state.filters);
                    }
                }
            } catch (e) {
                console.error("Failed to load investigation", e);
                navigate('/investigations');
            }
        };
        if (id) fetchInvestigation();
    }, [id, navigate]);

    // Load Logs whenever filters change (debounced or explicit?)
    // Let's make it explicit or effect based.
    useEffect(() => {
        if (!investigation) return;
        loadLogs();
    }, [investigation, startDate, endDate, filters, searchQuery, isFuzzy]);

    const loadLogs = async () => {
        setIsLoading(true);
        try {
            const params: any = {
                limit: 500, // Fixed limit for preview
            };

            // Dates need to be ISO
            if (startDate) params.start = new Date(startDate).toISOString();
            if (endDate) params.end = new Date(endDate).toISOString();

            if (filters.length > 0) {
                params.filters = JSON.stringify(filters);
            }
            if (searchQuery) {
                params.q = searchQuery;
                params.fuzzy = isFuzzy;
            }

            const res = await axios.get(`${API_URL}/logs`, { params });
            setLogs(res.data || []);
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const saveChanges = async () => {
        if (!investigation) return;
        setSaving(true);
        const filterState = {
            start: startDate,
            end: endDate,
            q: searchQuery,
            fuzzy: isFuzzy,
            filters: filters
        };

        try {
            // Need to JSON stringify the filters if backend expects []byte for JSONB?
            // Usually JSON libraries handle object -> jsonb.
            await axios.put(`${API_URL}/investigations/${investigation.ID}`, {
                name: investigation.name,
                description: investigation.description,
                filters: JSON.stringify(filterState) // Send as byte buffer equivalent (string) or object? 
                // Gorm datatypes.JSON UnmarshalJSON handles inputs. 
                // Let's send the object directly, but backend might expect []byte.
                // Actually, replace_file_content for backend sets inv.Filters = update.Filters.
                // If we send an object, JSON decoder might fail if strictly expecting byte array.
                // Wait, standard behavior for jsonb is receive object.
                // Let's stick to sending object. If that fails we fix backend.
                // Ah, UpdateInvestigation decode uses standard json.Decode.
                // If `update.Filters` is datatypes.JSON (`[]byte`), decode will try to unmarshal "object" into `[]byte`. 
                // This will store the JSON representation. Correct.
            });
        } catch (e) {
            console.error("Failed to save", e);
            alert("Failed to save changes");
        } finally {
            setSaving(false);
        }
    };

    const handleExport = () => {
        if (!investigation) return;
        // Trigger download
        window.open(`${API_URL}/investigations/${investigation.ID}/export`, '_blank');
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

    const getBadgeColor = (op: string) => {
        if (!op) return 'border-slate-600 text-slate-400';
        const lower = op.toLowerCase();
        if (lower.includes('fail')) return 'border-red-500 text-red-400 bg-red-500/10';
        if (lower.includes('delete')) return 'border-orange-500 text-orange-400 bg-orange-500/10';
        if (lower.includes('admin') || lower.includes('role')) return 'border-purple-500 text-purple-400 bg-purple-500/10';
        return 'border-slate-600 text-slate-300';
    };

    if (!investigation) return <div className="p-10 text-center text-slate-500">Loading investigation...</div>;

    return (
        <div className="space-y-4 h-[calc(100vh-140px)] flex flex-col">
            {/* Header / Toolbar */}
            <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center bg-slate-800/40 p-4 rounded-xl border border-white/5 backdrop-blur-sm shrink-0">
                <div>
                    <div className="flex items-center gap-2">
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <span className="text-slate-500 cursor-pointer hover:text-white transition-colors" onClick={() => navigate('/investigations')}>Investigations</span>
                            <span className="text-slate-600">/</span>
                            {investigation.name}
                        </h2>
                    </div>
                    <p className="text-slate-400 text-xs mt-1">
                        {logs.length} previews found • {filters.length} filters applied
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={saveChanges}
                        disabled={saving}
                        className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-medium rounded-lg flex items-center gap-2 transition-colors"
                    >
                        {saving ? 'Saving...' : 'Save State'}
                    </button>
                    <button
                        onClick={handleExport}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg flex items-center gap-2 transition-colors shadow-lg shadow-emerald-500/20"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        Export CSV
                    </button>
                </div>
            </div>

            {/* Filter Bar (Simplified version of LogInspector) */}
            <div className="bg-slate-900/40 border border-white/5 p-3 rounded-lg flex flex-wrap items-center gap-4 shrink-0">
                {/* Date */}
                <div className="flex items-center gap-2">
                    <input type="datetime-local" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-slate-800 border-none text-xs text-slate-300 rounded px-2 py-1 outline-none" placeholder="Start" />
                    <span className="text-slate-600">-</span>
                    <input type="datetime-local" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-slate-800 border-none text-xs text-slate-300 rounded px-2 py-1 outline-none" placeholder="End" />
                </div>

                {/* Search */}
                <div className="flex items-center gap-2 bg-slate-800 rounded px-2 py-1 border border-slate-700">
                    <svg className="w-3 h-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search..." className="bg-transparent text-xs text-white outline-none w-32" />
                    <input type="checkbox" checked={isFuzzy} onChange={e => setIsFuzzy(e.target.checked)} className="accent-purple-500" title="Fuzzy" />
                </div>

                {/* Active Filters */}
                {filters.map((f, i) => (
                    <div key={i} className="flex items-center gap-1 px-2 py-1 rounded bg-blue-500/20 border border-blue-500/30 text-xs text-blue-300">
                        <span className="font-mono">{f.field}</span>
                        <span className="opacity-75">{f.operator}</span>
                        <span>{f.value}</span>
                        <button onClick={() => removeFilter(i)} className="ml-1 hover:text-white">×</button>
                    </div>
                ))}

                {/* Add Filter */}
                <div className="flex items-center gap-1">
                    <input placeholder="Field" value={newFilter.field} onChange={e => setNewFilter({ ...newFilter, field: e.target.value })} className="w-20 bg-slate-800 text-xs text-white px-2 py-1 rounded outline-none" />
                    <select value={newFilter.operator} onChange={e => setNewFilter({ ...newFilter, operator: e.target.value })} className="bg-slate-800 text-xs text-slate-300 px-1 py-1 rounded outline-none">
                        <option value="=">=</option>
                        <option value="contains">contains</option>
                    </select>
                    <input placeholder="Value" value={newFilter.value} onChange={e => setNewFilter({ ...newFilter, value: e.target.value })} onKeyDown={e => e.key === 'Enter' && addFilter()} className="w-20 bg-slate-800 text-xs text-white px-2 py-1 rounded outline-none" />
                    <button onClick={addFilter} className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-500">+</button>
                </div>
            </div>

            {/* Results Table */}
            <div className="glass-panel overflow-hidden rounded-xl border border-white/5 bg-slate-900/40 flex-1 flex flex-col min-h-0">
                <div className="overflow-auto flex-1">
                    <table className="w-full text-left text-sm relative border-collapse">
                        <thead className="bg-slate-900/90 backdrop-blur sticky top-0 z-10 text-xs uppercase font-medium text-slate-400 border-b border-white/5">
                            <tr>
                                <th className="px-4 py-3 whitespace-nowrap bg-slate-900/90">Time</th>
                                <th className="px-4 py-3 whitespace-nowrap bg-slate-900/90">Tenant</th>
                                <th className="px-4 py-3 whitespace-nowrap bg-slate-900/90">Operation</th>
                                <th className="px-4 py-3 whitespace-nowrap bg-slate-900/90">User</th>
                                <th className="px-4 py-3 whitespace-nowrap bg-slate-900/90">IP</th>
                                <th className="px-4 py-3 whitespace-nowrap bg-slate-900/90">Details</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {isLoading ? (
                                <tr><td colSpan={6} className="text-center py-10 text-slate-500">Scanning logs...</td></tr>
                            ) : logs.length === 0 ? (
                                <tr><td colSpan={6} className="text-center py-10 text-slate-500">No logs found matching criteria.</td></tr>
                            ) : (
                                logs.map((log, i) => (
                                    <tr
                                        key={i}
                                        onClick={() => setSelectedLog(log)}
                                        className="hover:bg-white/5 cursor-pointer transition-colors"
                                    >
                                        <td className="px-4 py-2 font-mono text-xs text-slate-300 whitespace-nowrap">
                                            {new Date(log.creation_time).toLocaleString()}
                                        </td>
                                        <td className="px-4 py-2 text-xs text-slate-300 whitespace-nowrap">
                                            {log.tenant_name || '-'}
                                        </td>
                                        <td className="px-4 py-2 whitespace-nowrap">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getBadgeColor(log.operation)}`}>
                                                {log.operation}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2 text-xs text-slate-300 whitespace-nowrap truncate max-w-[150px]" title={log.user_id}>
                                            {log.user_id}
                                        </td>
                                        <td className="px-4 py-2 text-xs text-slate-500 whitespace-nowrap font-mono">{log.client_ip || '-'}</td>
                                        <td className="px-4 py-2 text-xs text-slate-500 truncate max-w-xs">{JSON.stringify(log.raw_data)}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <LogDetailsModal log={selectedLog} onClose={() => setSelectedLog(null)} />
        </div>
    );
};

export default InvestigationDetail;
