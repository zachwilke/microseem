import React, { useEffect, useState, useRef, useMemo } from 'react';
import LogDetailsModal from './LogDetailsModal';
import { TableVirtuoso } from 'react-virtuoso';
import api, { getWebSocketUrl } from '../lib/api';

const MAX_LOGS = 5000;

interface Log {
    ID?: string;
    id?: string;
    creation_time: string;
    operation: string;
    user_id: string;
    client_ip?: string;
    country_code?: string;
    workload?: string;
    raw_data?: any;
}

interface LiveLogsProps {
    tenantId?: string;
}

const LiveLogs: React.FC<LiveLogsProps> = ({ tenantId }) => {
    const [logs, setLogs] = useState<Log[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedLog, setSelectedLog] = useState<Log | null>(null);
    const [stats, setStats] = useState({ ingestRate: 0, errorRate: 0, lagSeconds: 0 });
    const wsRef = useRef<WebSocket | null>(null);
    const logBuffer = useRef<Log[]>([]);

    const connectWS = () => {
        if (wsRef.current) wsRef.current.close();

        const wsUrl = getWebSocketUrl();
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            setIsConnected(true);
            console.log('Live Stream Connected');
        };

        ws.onclose = () => {
            setIsConnected(false);
            console.log('Live Stream Disconnected');
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            setIsConnected(false);
        };

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);

                if (msg.type === 'health') {
                    setStats({
                        ingestRate: msg.payload.ingest_rate || 0,
                        errorRate: msg.payload.error_rate || 0,
                        lagSeconds: msg.payload.lag_seconds || 0
                    });
                    return;
                }

                if (isPausedRef.current) return;

                const isRelevant = (l: any) => !tenantId || l.tenant_id === tenantId;

                if (msg.type === 'log' && msg.payload) {
                    if (isRelevant(msg.payload)) logBuffer.current.push(msg.payload);
                } else if (msg.type === 'logs' && Array.isArray(msg.payload)) {
                    const relevant = msg.payload.filter(isRelevant);
                    if (relevant.length > 0) logBuffer.current.push(...relevant);
                }
            } catch (e) {
                console.error(e);
            }
        };
    };

    const fetchRecentLogs = async () => {
        try {
            let url = '/logs?limit=' + MAX_LOGS;
            if (tenantId) url += `&tenant_id=${tenantId}`;

            const response = await api.get(url);
            if (Array.isArray(response.data)) {
                setLogs(response.data);
            }
        } catch (e) {
            console.error("Failed to fetch recent logs", e);
        }
    };

    useEffect(() => {
        fetchRecentLogs();
        connectWS();

        // Flush buffer every 500ms
        const flushInterval = setInterval(() => {
            if (logBuffer.current.length > 0) {
                setLogs(prevLogs => {
                    const newLogs = [...logBuffer.current, ...prevLogs];
                    logBuffer.current = [];
                    return newLogs.length > MAX_LOGS ? newLogs.slice(0, MAX_LOGS) : newLogs;
                });
            }
        }, 500);

        return () => {
            if (wsRef.current) wsRef.current.close();
            clearInterval(flushInterval);
        };
    }, [tenantId]); // eslint-disable-line react-hooks/exhaustive-deps

    const isPausedRef = useRef(isPaused);
    useEffect(() => {
        isPausedRef.current = isPaused;
    }, [isPaused]);

    // Helper for Lag Display
    const formatLag = (seconds: number) => {
        if (seconds < 60) return 'Events: Live';
        const mins = Math.floor(seconds / 60);
        return `Lag: ${mins}m`;
    };

    const getBadgeColor = (op: string) => {
        if (!op) return 'border-slate-600 text-slate-400';
        const lower = op.toLowerCase();
        if (lower.includes('fail')) return 'border-red-500 text-red-400 bg-red-500/10';
        if (lower.includes('delete')) return 'border-orange-500 text-orange-400 bg-orange-500/10';
        if (lower.includes('admin') || lower.includes('role')) return 'border-purple-500 text-purple-400 bg-purple-500/10';
        return 'border-slate-600 text-slate-300';
    };

    const filteredLogs = useMemo(() => {
        return logs.filter(log =>
            !searchQuery || JSON.stringify(log).toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [logs, searchQuery]);

    return (
        <div className="space-y-4 h-[calc(100vh-140px)] flex flex-col">
            {/* Status Bar */}
            <div className="flex justify-between items-center bg-slate-800/40 p-3 rounded-xl border border-white/5 backdrop-blur-sm shrink-0">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/50 border border-slate-700/50">
                        <span className="relative flex h-2 w-2">
                            {isConnected ? (
                                <>
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                </>
                            ) : (
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                            )}
                        </span>
                        <span className={`text-xs font-monoSync ${isConnected ? 'text-emerald-400' : 'text-slate-500'}`}>
                            {isConnected ? 'LIVE STREAM' : 'DISCONNECTED'}
                        </span>
                    </div>

                    {/* Ingest Rate Metric */}
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/50 border border-slate-700/50">
                        <span className="text-slate-400 text-xs font-medium">INGEST:</span>
                        <span className="text-blue-400 font-mono text-xs">{stats.ingestRate.toLocaleString()} /min</span>
                    </div>

                    {/* Error Rate Metric (Only show if > 0) */}
                    {stats.errorRate > 0 && (
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-900/20 border border-red-500/30 animate-pulse">
                            <span className="text-red-400 text-xs font-medium">ERRORS:</span>
                            <span className="text-red-300 font-mono text-xs">{stats.errorRate.toLocaleString()} /min</span>
                        </div>
                    )}

                    {/* Lag Metric */}
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${stats.lagSeconds > 300 ? 'bg-amber-900/20 border-amber-500/30' : 'bg-slate-900/50 border-slate-700/50'}`}>
                        <span className={`font-mono text-xs ${stats.lagSeconds > 300 ? 'text-amber-400' : 'text-emerald-400'}`}>
                            {formatLag(stats.lagSeconds)}
                        </span>
                    </div>

                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/50 border border-slate-700/50">
                        <span className="text-slate-400 text-xs font-medium">BUFFER:</span>
                        <span className="text-slate-300 font-mono text-xs">{filteredLogs.length} events</span>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Filter stream..."
                        className="bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:ring-1 focus:ring-emerald-500 outline-none w-48 font-mono"
                    />
                    <button
                        onClick={() => setIsPaused(!isPaused)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${isPaused ? 'bg-amber-500/10 text-amber-500 border-amber-500/20 hover:bg-amber-500/20' : 'bg-slate-700/50 text-slate-300 border-slate-600 hover:text-white'}`}
                    >
                        {isPaused ? 'RESUME' : 'PAUSE'}
                    </button>
                    <button
                        onClick={() => setLogs([])}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-700/50 text-slate-300 border border-slate-600 hover:text-white hover:bg-slate-700 transition-colors"
                    >
                        CLEAR
                    </button>
                </div>
            </div>

            {/* Stream View with Virtualization */}
            <div className="glass-panel overflow-hidden rounded-xl border border-white/5 bg-slate-900/40 flex-1">
                {filteredLogs.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-slate-500 italic text-sm">
                        {searchQuery ? 'No matching logs in buffer.' : 'Waiting for events...'}
                    </div>
                ) : (
                    <TableVirtuoso
                        data={filteredLogs}
                        fixedHeaderContent={() => (
                            <tr className="bg-slate-900/90 backdrop-blur text-xs uppercase font-medium text-slate-400 border-b border-white/5">
                                <th className="px-4 py-3 w-40 text-left">Time</th>
                                <th className="px-4 py-3 w-32 text-left">Operation</th>
                                <th className="px-4 py-3 w-48 text-left">User</th>
                                <th className="px-4 py-3 w-48 text-left">Source</th>
                                <th className="px-4 py-3 text-left">Details</th>
                            </tr>
                        )}
                        itemContent={(index, log) => (
                            <>
                                <td className="px-4 py-2 text-slate-400 text-xs whitespace-nowrap align-top">
                                    <span className="font-mono text-slate-300">
                                        {new Date(log.creation_time).toLocaleString(undefined, {
                                            month: '2-digit',
                                            day: '2-digit',
                                            hour: '2-digit',
                                            minute: '2-digit',
                                            second: '2-digit',
                                            fractionalSecondDigits: 3,
                                            hour12: false
                                        }).replace(',', '')}
                                    </span>
                                </td>
                                <td className="px-4 py-2 align-top">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border whitespace-nowrap ${getBadgeColor(log.operation)}`}>
                                        {log.operation}
                                    </span>
                                </td>
                                <td className="px-4 py-2 text-slate-300 text-xs whitespace-nowrap align-top truncate max-w-[12rem]" title={log.user_id}>
                                    {log.user_id}
                                </td>
                                <td className="px-4 py-2 text-slate-500 text-xs whitespace-nowrap align-top">
                                    {log.client_ip || 'N/A'}
                                    <span className="text-slate-600"> ({log.country_code || '-'})</span>
                                </td>
                                <td className="px-4 py-2 text-slate-500 text-xs break-all align-top font-mono">
                                    <div className="max-h-16 overflow-hidden text-ellipsis">
                                        <span className="text-emerald-500/80 mr-2">[{log.workload}]</span>
                                        {JSON.stringify(log.raw_data)}
                                    </div>
                                </td>
                            </>
                        )}
                        components={{
                            Table: (props) => <table {...props} className="w-full text-left text-sm font-mono border-collapse" />,
                            TableRow: (props) => (
                                <tr
                                    {...props}
                                    onClick={() => setSelectedLog(props.item as Log)}
                                    className="group hover:bg-white/[0.04] transition-colors cursor-pointer border-b border-white/5 last:border-0"
                                />
                            )
                        }}
                    />
                )}
            </div>

            <LogDetailsModal log={selectedLog} onClose={() => setSelectedLog(null)} />
        </div>
    );
};

export default LiveLogs;
