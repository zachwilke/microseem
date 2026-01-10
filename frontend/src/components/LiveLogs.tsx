import React, { useEffect, useState, useRef } from 'react';
import LogDetailsModal from './LogDetailsModal';

const MAX_LOGS = 100;

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

const LiveLogs: React.FC = () => {
    const [logs, setLogs] = useState<Log[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedLog, setSelectedLog] = useState<Log | null>(null);
    const wsRef = useRef<WebSocket | null>(null);

    const connectWS = () => {
        if (wsRef.current) wsRef.current.close();

        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const host = "localhost:8080";
        const ws = new WebSocket(`${protocol}//${host}/api/ws`);
        wsRef.current = ws;

        ws.onopen = () => {
            setIsConnected(true);
            console.log('Live Stream Connected');
        };

        ws.onclose = () => {
            setIsConnected(false);
            console.log('Live Stream Disconnected');
        };

        ws.onmessage = (event) => {
            if (isPaused) return;

            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'log' && msg.payload) {
                    setLogs(prevLogs => {
                        const newLogs = [msg.payload, ...prevLogs];
                        return newLogs.length > MAX_LOGS ? newLogs.slice(0, MAX_LOGS) : newLogs;
                    });
                } else if (msg.type === 'logs' && Array.isArray(msg.payload)) {
                    setLogs(prevLogs => {
                        const newLogs = [...msg.payload, ...prevLogs];
                        return newLogs.length > MAX_LOGS ? newLogs.slice(0, MAX_LOGS) : newLogs;
                    });
                }
            } catch (e) {
                console.error(e);
            }
        };
    };

    const fetchRecentLogs = async () => {
        try {
            // Using axios directly or fetch
            const response = await fetch('http://localhost:8080/api/logs?limit=' + MAX_LOGS);
            if (response.ok) {
                const data = await response.json();
                if (Array.isArray(data)) {
                    setLogs(data);
                }
            }
        } catch (e) {
            console.error("Failed to fetch recent logs", e);
        }
    };

    useEffect(() => {
        fetchRecentLogs();
        connectWS();
        return () => {
            if (wsRef.current) wsRef.current.close();
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Using ref for isPaused in onmessage callback or just state if re-binding?
    // In React useEffect with empty deps, the closure captures initial state.
    // However, ws.onmessage is defined once. We need to handle 'isPaused' correctly.
    // A ref for isPaused is the safest way to access current value in the callback without reconnecting.
    const isPausedRef = useRef(isPaused);
    useEffect(() => {
        isPausedRef.current = isPaused;
    }, [isPaused]);

    // Re-bind onmessage to use current isPaused ref
    useEffect(() => {
        if (wsRef.current) {
            wsRef.current.onmessage = (event) => {
                if (isPausedRef.current) return;
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === 'log' && msg.payload) {
                        setLogs(prevLogs => {
                            const newLogs = [msg.payload, ...prevLogs];
                            return newLogs.length > MAX_LOGS ? newLogs.slice(0, MAX_LOGS) : newLogs;
                        });
                    } else if (msg.type === 'logs' && Array.isArray(msg.payload)) {
                        setLogs(prevLogs => {
                            const newLogs = [...msg.payload, ...prevLogs];
                            return newLogs.length > MAX_LOGS ? newLogs.slice(0, MAX_LOGS) : newLogs;
                        });
                    }
                } catch (e) {
                    console.error(e);
                }
            }
        }
    }, [isConnected]); // Re-bind when connection status changes (or established)

    const getBadgeColor = (op: string) => {
        if (!op) return 'border-slate-600 text-slate-400';
        const lower = op.toLowerCase();
        if (lower.includes('fail')) return 'border-red-500 text-red-400 bg-red-500/10';
        if (lower.includes('delete')) return 'border-orange-500 text-orange-400 bg-orange-500/10';
        if (lower.includes('admin') || lower.includes('role')) return 'border-purple-500 text-purple-400 bg-purple-500/10';
        return 'border-slate-600 text-slate-300';
    };

    const filteredLogs = logs.filter(log =>
        !searchQuery || JSON.stringify(log).toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="space-y-4">
            {/* Status Bar */}
            <div className="flex justify-between items-center bg-slate-800/40 p-3 rounded-xl border border-white/5 backdrop-blur-sm">
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
                        <span className={`text-xs font-mono ${isConnected ? 'text-emerald-400' : 'text-slate-500'}`}>
                            {isConnected ? 'LIVE STREAM' : 'DISCONNECTED'}
                        </span>
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

            {/* Stream View */}
            <div className="glass-panel overflow-hidden rounded-xl border border-white/5 bg-slate-900/40">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm font-mono">
                        <thead className="bg-slate-900/50 text-xs uppercase font-medium text-slate-400 border-b border-white/5">
                            <tr>
                                <th className="px-4 py-3 w-32">Time</th>
                                <th className="px-4 py-3">Operation</th>
                                <th className="px-4 py-3">User</th>
                                <th className="px-4 py-3">Source</th>
                                <th className="px-4 py-3 w-full">Details</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {filteredLogs.length === 0 ? (
                                <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-500 italic">
                                    {searchQuery ? 'No matching logs in buffer.' : 'Waiting for events...'}
                                </td></tr>
                            ) : (
                                filteredLogs.map((log) => (
                                    <tr
                                        key={log.ID || log.id || Math.random()}
                                        onClick={() => setSelectedLog(log)}
                                        className="group hover:bg-white/[0.04] transition-colors animate-in fade-in slide-in-from-top-1 duration-300 cursor-pointer"
                                    >
                                        <td className="px-4 py-2 text-slate-400 text-xs whitespace-nowrap">
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
                                        <td className="px-4 py-2">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getBadgeColor(log.operation)}`}>
                                                {log.operation}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2 text-slate-300 text-xs whitespace-nowrap">
                                            {log.user_id}
                                        </td>
                                        <td className="px-4 py-2 text-slate-500 text-xs whitespace-nowrap">
                                            {log.client_ip || 'N/A'}
                                            <span className="text-slate-600"> ({log.country_code || '-'})</span>
                                        </td>
                                        <td className="px-4 py-2 text-slate-500 text-xs truncate max-w-md">
                                            {log.workload}
                                            <span className="opacity-50 mx-1">|</span>
                                            {JSON.stringify(log.raw_data).substring(0, 100)}...
                                        </td>
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

export default LiveLogs;
