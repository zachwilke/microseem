import React, { useEffect, useState } from 'react';

interface LogDetailsModalProps {
    log: any; // Using any for flexibility across components, or could import Log interface
    onClose: () => void;
}

const LogDetailsModal: React.FC<LogDetailsModalProps> = ({ log, onClose }) => {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        if (log) {
            setIsVisible(true);
            document.body.style.overflow = 'hidden';
        } else {
            setIsVisible(false);
            document.body.style.overflow = 'unset';
        }
        return () => { document.body.style.overflow = 'unset'; }
    }, [log]);

    if (!log) return null;

    const formattedJSON = JSON.stringify(log, null, 2);

    return (
        <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-200 ${isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            ></div>

            {/* Modal Content */}
            <div className="relative bg-[#0f172a] border border-slate-700 w-full max-w-4xl max-h-[90vh] rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50 bg-slate-900/50">
                    <div>
                        <div className="flex items-center gap-3">
                            <span className="text-lg font-bold text-white tracking-tight">Log Details</span>
                            <span className="px-2 py-0.5 rounded textxs font-mono bg-slate-800 text-slate-400 border border-slate-700">
                                {log.ID || log.id || 'No ID'}
                            </span>
                        </div>
                        <p className="text-slate-400 text-sm mt-1 font-mono">
                            {new Date(log.creation_time).toLocaleString()}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">

                    {/* Key Fields Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-800">
                            <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">Operation</div>
                            <div className="text-emerald-400 font-medium">{log.operation}</div>
                        </div>
                        <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-800">
                            <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">User</div>
                            <div className="text-white font-mono text-sm">{log.user_id}</div>
                        </div>
                        <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-800">
                            <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">Source</div>
                            <div className="text-white font-mono text-sm">{log.client_ip || 'N/A'} <span className="text-slate-500">({log.country_code || '-'})</span></div>
                        </div>
                    </div>

                    {/* Raw Data */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-500 uppercase tracking-wider font-semibold">Raw JSON Payload</span>
                            <button
                                onClick={() => navigator.clipboard.writeText(formattedJSON)}
                                className="text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
                            >
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                Copy JSON
                            </button>
                        </div>
                        <div className="relative">
                            <pre className="text-xs font-mono bg-[#0b1120] p-4 rounded-lg border border-slate-800 text-slate-300 overflow-x-auto leading-relaxed">
                                {formattedJSON}
                            </pre>
                        </div>
                    </div>

                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/30 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition-colors border border-slate-600"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LogDetailsModal;
