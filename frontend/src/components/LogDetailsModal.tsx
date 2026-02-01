import React, { useEffect, useState } from 'react';
import api from '../lib/api';

interface LogDetailsModalProps {
    log: any;
    onClose: () => void;
    showCreateAlert?: boolean;
}

const LogDetailsModal: React.FC<LogDetailsModalProps> = ({ log, onClose, showCreateAlert = false }) => {
    const [isVisible, setIsVisible] = useState(false);
    const [activeTab, setActiveTab] = useState<'details' | 'alert'>(showCreateAlert ? 'alert' : 'details');
    const [alertForm, setAlertForm] = useState({
        name: '',
        field: 'operation',
        operator: '=',
        value: '',
        severity: 'medium'
    });
    const [isCreating, setIsCreating] = useState(false);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error', message: string } | null>(null);

    useEffect(() => {
        if (log) {
            setIsVisible(true);
            document.body.style.overflow = 'hidden';
            // Pre-fill alert form with log data
            setAlertForm(prev => ({
                ...prev,
                value: log.operation || '',
                name: `Alert on ${log.operation || 'event'}`
            }));
            if (showCreateAlert) {
                setActiveTab('alert');
            }
        } else {
            setIsVisible(false);
            document.body.style.overflow = 'unset';
            setActiveTab('details');
        }
        return () => { document.body.style.overflow = 'unset'; }
    }, [log, showCreateAlert]);

    const handleCreateAlert = async () => {
        if (!alertForm.name || !alertForm.value) {
            setFeedback({ type: 'error', message: 'Please fill in all required fields' });
            return;
        }

        setIsCreating(true);
        setFeedback(null);

        try {
            await api.post('/rules', {
                name: alertForm.name,
                description: `Auto-created from log inspection`,
                field: alertForm.field,
                operator: alertForm.operator,
                value: alertForm.value,
                severity: alertForm.severity
            });
            setFeedback({ type: 'success', message: 'Alert rule created successfully!' });
            setTimeout(() => {
                onClose();
            }, 1500);
        } catch (err: any) {
            setFeedback({ type: 'error', message: err.response?.data?.error || 'Failed to create alert rule' });
        } finally {
            setIsCreating(false);
        }
    };

    const quickSetField = (field: string, value: string) => {
        setAlertForm(prev => ({
            ...prev,
            field,
            value,
            name: `Alert on ${field}: ${value}`
        }));
    };

    if (!log) return null;

    const formattedJSON = JSON.stringify(log.raw_data || log, null, 2);

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
                    <div className="flex items-center gap-4">
                        <div>
                            <div className="flex items-center gap-3">
                                <span className="text-lg font-bold text-white tracking-tight">Log Details</span>
                                <span className="px-2 py-0.5 rounded text-xs font-mono bg-slate-800 text-slate-400 border border-slate-700">
                                    {log.ID || log.id || 'No ID'}
                                </span>
                            </div>
                            <p className="text-slate-400 text-sm mt-1 font-mono">
                                {new Date(log.creation_time).toLocaleString()}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* Tab Buttons */}
                        <div className="flex bg-slate-800/50 rounded-lg p-1 mr-4">
                            <button
                                onClick={() => setActiveTab('details')}
                                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${activeTab === 'details' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
                            >
                                Details
                            </button>
                            <button
                                onClick={() => setActiveTab('alert')}
                                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${activeTab === 'alert' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'}`}
                            >
                                Create Alert
                            </button>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                    {activeTab === 'details' ? (
                        <>
                            {/* Key Fields Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                                <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-800 group cursor-pointer hover:border-amber-500/50 transition-colors" onClick={() => { quickSetField('operation', log.operation); setActiveTab('alert'); }}>
                                    <div className="flex items-center justify-between">
                                        <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">Operation</div>
                                        <svg className="w-3 h-3 text-amber-500 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                                    </div>
                                    <div className="text-emerald-400 font-medium">{log.operation}</div>
                                </div>
                                <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-800 group cursor-pointer hover:border-amber-500/50 transition-colors" onClick={() => { quickSetField('user_id', log.user_id); setActiveTab('alert'); }}>
                                    <div className="flex items-center justify-between">
                                        <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">User</div>
                                        <svg className="w-3 h-3 text-amber-500 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                                    </div>
                                    <div className="text-white font-mono text-sm truncate" title={log.user_id}>{log.user_id}</div>
                                </div>
                                <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-800 group cursor-pointer hover:border-amber-500/50 transition-colors" onClick={() => { if (log.client_ip) { quickSetField('client_ip', log.client_ip); setActiveTab('alert'); } }}>
                                    <div className="flex items-center justify-between">
                                        <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">Source</div>
                                        {log.client_ip && <svg className="w-3 h-3 text-amber-500 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>}
                                    </div>
                                    <div className="text-white font-mono text-sm">{log.client_ip || 'N/A'} <span className="text-slate-500">({log.country_code || '-'})</span></div>
                                </div>
                            </div>

                            <p className="text-xs text-slate-500 mb-4 flex items-center gap-1">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                Click any field above to create an alert for that value
                            </p>

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
                                    <pre className="text-xs font-mono bg-[#0b1120] p-4 rounded-lg border border-slate-800 text-slate-300 overflow-x-auto leading-relaxed max-h-[300px]">
                                        {formattedJSON}
                                    </pre>
                                </div>
                            </div>
                        </>
                    ) : (
                        /* Create Alert Tab */
                        <div className="space-y-6">
                            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
                                <h3 className="text-amber-400 font-medium text-sm flex items-center gap-2">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                                    Create Alert Rule
                                </h3>
                                <p className="text-slate-400 text-xs mt-1">
                                    Create a detection rule that triggers when logs match the condition below.
                                </p>
                            </div>

                            {feedback && (
                                <div className={`p-3 rounded-lg text-sm ${feedback.type === 'success' ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'}`}>
                                    {feedback.message}
                                </div>
                            )}

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs text-slate-400 mb-2 font-medium">Alert Name</label>
                                    <input
                                        type="text"
                                        value={alertForm.name}
                                        onChange={(e) => setAlertForm({ ...alertForm, name: e.target.value })}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
                                        placeholder="e.g., Detect Failed Login from External IP"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs text-slate-400 mb-2 font-medium">Condition</label>
                                    <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg p-3">
                                        <span className="text-slate-500 text-sm">When</span>
                                        <select
                                            value={alertForm.field}
                                            onChange={(e) => setAlertForm({ ...alertForm, field: e.target.value })}
                                            className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-amber-500"
                                        >
                                            <option value="operation">operation</option>
                                            <option value="user_id">user_id</option>
                                            <option value="workload">workload</option>
                                            <option value="client_ip">client_ip</option>
                                            <option value="city">city</option>
                                            <option value="country_code">country_code</option>
                                        </select>
                                        <select
                                            value={alertForm.operator}
                                            onChange={(e) => setAlertForm({ ...alertForm, operator: e.target.value })}
                                            className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-amber-500"
                                        >
                                            <option value="=">=</option>
                                            <option value="!=">!=</option>
                                            <option value="contains">contains</option>
                                        </select>
                                        <input
                                            type="text"
                                            value={alertForm.value}
                                            onChange={(e) => setAlertForm({ ...alertForm, value: e.target.value })}
                                            className="flex-1 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-amber-500"
                                            placeholder="value"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs text-slate-400 mb-2 font-medium">Severity</label>
                                    <div className="flex gap-2">
                                        {['low', 'medium', 'high', 'critical'].map((sev) => (
                                            <button
                                                key={sev}
                                                onClick={() => setAlertForm({ ...alertForm, severity: sev })}
                                                className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium capitalize transition-all ${
                                                    alertForm.severity === sev
                                                        ? sev === 'critical' ? 'bg-purple-600 text-white border-2 border-purple-400'
                                                        : sev === 'high' ? 'bg-red-600 text-white border-2 border-red-400'
                                                        : sev === 'medium' ? 'bg-amber-600 text-white border-2 border-amber-400'
                                                        : 'bg-blue-600 text-white border-2 border-blue-400'
                                                        : 'bg-slate-800 text-slate-400 border-2 border-transparent hover:border-slate-600'
                                                }`}
                                            >
                                                {sev}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Preview */}
                                <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4">
                                    <div className="text-xs text-slate-500 mb-2 font-medium">Rule Preview</div>
                                    <code className="text-sm text-slate-300 font-mono">
                                        IF <span className="text-blue-400">{alertForm.field}</span>{' '}
                                        <span className="text-slate-500">{alertForm.operator}</span>{' '}
                                        "<span className="text-emerald-400">{alertForm.value}</span>"{' '}
                                        → <span className={
                                            alertForm.severity === 'critical' ? 'text-purple-400' :
                                            alertForm.severity === 'high' ? 'text-red-400' :
                                            alertForm.severity === 'medium' ? 'text-amber-400' : 'text-blue-400'
                                        }>{alertForm.severity.toUpperCase()}</span> alert
                                    </code>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/30 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition-colors border border-slate-600"
                    >
                        {activeTab === 'alert' ? 'Cancel' : 'Close'}
                    </button>
                    {activeTab === 'alert' && (
                        <button
                            onClick={handleCreateAlert}
                            disabled={isCreating || !alertForm.name || !alertForm.value}
                            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                        >
                            {isCreating ? (
                                <>
                                    <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                                    Creating...
                                </>
                            ) : (
                                <>
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                                    Create Alert Rule
                                </>
                            )}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default LogDetailsModal;
