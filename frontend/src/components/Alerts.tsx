import React, { useEffect, useState } from 'react';
import api from '../lib/api';

interface Alert {
    id: string;
    rule_name: string;
    description: string;
    severity: string;
    created_at: string;
    status: string;
    raw_data?: { UserId?: string; ClientIP?: string; Operation?: string };
}

interface Rule {
    id: string;
    name: string;
    description?: string;
    field: string;
    operator: string;
    value: string;
    severity: string;
    enabled: boolean;
}

// Pre-built rule templates for common security scenarios
const RULE_TEMPLATES = [
    {
        name: 'Failed Login Attempts',
        description: 'Detect failed authentication attempts',
        field: 'operation',
        operator: 'contains',
        value: 'UserLoginFailed',
        severity: 'high',
        icon: '🔐'
    },
    {
        name: 'Admin Role Changes',
        description: 'Alert when admin roles are modified',
        field: 'operation',
        operator: 'contains',
        value: 'Add member to role',
        severity: 'critical',
        icon: '👑'
    },
    {
        name: 'Mass File Deletion',
        description: 'Detect bulk file deletions',
        field: 'operation',
        operator: 'contains',
        value: 'FileDeleted',
        severity: 'high',
        icon: '🗑️'
    },
    {
        name: 'External Sharing',
        description: 'Alert on external file sharing',
        field: 'operation',
        operator: 'contains',
        value: 'SharingSet',
        severity: 'medium',
        icon: '🔗'
    },
    {
        name: 'Password Reset',
        description: 'Track password reset activities',
        field: 'operation',
        operator: 'contains',
        value: 'Reset user password',
        severity: 'medium',
        icon: '🔑'
    },
    {
        name: 'Mailbox Forwarding',
        description: 'Detect email forwarding rules',
        field: 'operation',
        operator: 'contains',
        value: 'Set-Mailbox',
        severity: 'high',
        icon: '📧'
    }
];

const Alerts: React.FC = () => {
    const [activeView, setActiveView] = useState<'alerts' | 'rules'>('alerts');
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [rules, setRules] = useState<Rule[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error', message: string } | null>(null);

    const [newRule, setNewRule] = useState({
        name: '',
        description: '',
        field: 'operation',
        operator: '=',
        value: '',
        severity: 'medium'
    });

    const loadAlerts = async () => {
        try {
            const res = await api.get('/alerts');
            setAlerts(res.data || []);
        } catch (e) {
            console.error("Load alerts error", e);
        }
    };

    const loadRules = async () => {
        try {
            const res = await api.get('/rules');
            setRules(res.data || []);
        } catch (e) {
            console.error("Load rules error", e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadAlerts();
        loadRules();
        const interval = setInterval(loadAlerts, 10000);
        return () => clearInterval(interval);
    }, []);

    const createRule = async (ruleData: typeof newRule) => {
        try {
            await api.post('/rules', ruleData);
            setFeedback({ type: 'success', message: 'Rule created successfully!' });
            loadRules();
            setShowCreateModal(false);
            setNewRule({ name: '', description: '', field: 'operation', operator: '=', value: '', severity: 'medium' });
            setTimeout(() => setFeedback(null), 3000);
        } catch (e: any) {
            setFeedback({ type: 'error', message: e.response?.data?.error || 'Failed to create rule' });
        }
    };

    const applyTemplate = (template: typeof RULE_TEMPLATES[0]) => {
        setNewRule({
            name: template.name,
            description: template.description,
            field: template.field,
            operator: template.operator,
            value: template.value,
            severity: template.severity
        });
        setShowCreateModal(true);
    };

    const deleteRule = async (id: string) => {
        if (!confirm('Delete this rule? Alerts already triggered will remain.')) return;
        try {
            await api.delete(`/rules/${id}`);
            setFeedback({ type: 'success', message: 'Rule deleted' });
            loadRules();
            setTimeout(() => setFeedback(null), 3000);
        } catch (e) {
            setFeedback({ type: 'error', message: 'Failed to delete rule' });
        }
    };

    const getSeverityColor = (sev: string) => {
        switch (sev) {
            case 'critical': return { text: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/30', dot: 'bg-purple-500' };
            case 'high': return { text: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', dot: 'bg-red-500' };
            case 'medium': return { text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', dot: 'bg-amber-500' };
            case 'low': return { text: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30', dot: 'bg-blue-500' };
            default: return { text: 'text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-500/30', dot: 'bg-slate-500' };
        }
    };

    const formatTimeAgo = (date: string) => {
        const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
        if (seconds < 60) return 'just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        return `${Math.floor(seconds / 86400)}d ago`;
    };

    return (
        <div className="space-y-6">
            {/* Feedback Toast */}
            {feedback && (
                <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-in slide-in-from-top duration-300 ${
                    feedback.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    {feedback.type === 'success' ? (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                    ) : (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    )}
                    {feedback.message}
                </div>
            )}

            {/* Header with Stats */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">Alerts & Detection</h1>
                    <p className="text-slate-400 text-sm mt-1">Monitor threats and manage detection rules</p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50">
                        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                        <span className="text-sm text-slate-300">{alerts.length} Active Alerts</span>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50">
                        <span className="text-sm text-slate-300">{rules.length} Rules</span>
                    </div>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <div className="flex space-x-1">
                    <button
                        onClick={() => setActiveView('alerts')}
                        className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                            activeView === 'alerts'
                                ? 'bg-slate-800/50 text-white border-b-2 border-blue-500'
                                : 'text-slate-400 hover:text-white hover:bg-slate-800/30'
                        }`}
                    >
                        Triggered Alerts
                    </button>
                    <button
                        onClick={() => setActiveView('rules')}
                        className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                            activeView === 'rules'
                                ? 'bg-slate-800/50 text-white border-b-2 border-blue-500'
                                : 'text-slate-400 hover:text-white hover:bg-slate-800/30'
                        }`}
                    >
                        Detection Rules
                    </button>
                </div>
                {activeView === 'rules' && (
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                        Create Rule
                    </button>
                )}
            </div>

            {/* Alerts View */}
            {activeView === 'alerts' && (
                <div className="space-y-3 animate-in fade-in duration-300">
                    {alerts.length === 0 ? (
                        <div className="glass-panel p-12 text-center rounded-xl">
                            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/10 flex items-center justify-center">
                                <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            </div>
                            <h3 className="text-lg font-medium text-white mb-2">All Clear</h3>
                            <p className="text-slate-400 text-sm">No alerts have been triggered. Your detection rules are monitoring for threats.</p>
                        </div>
                    ) : (
                        alerts.map((alert, i) => {
                            const colors = getSeverityColor(alert.severity);
                            return (
                                <div key={alert.id || i} className={`glass-panel p-4 rounded-xl border ${colors.border} ${colors.bg} flex items-start gap-4 hover:border-opacity-50 transition-colors`}>
                                    <div className={`w-3 h-3 mt-1.5 rounded-full ${colors.dot} shadow-lg`} style={{ boxShadow: `0 0 10px currentColor` }}></div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <h3 className="text-white font-medium">{alert.rule_name}</h3>
                                                <p className="text-slate-400 text-sm mt-1">{alert.description || 'Alert triggered by matching rule.'}</p>
                                            </div>
                                            <div className="flex items-center gap-3 shrink-0">
                                                <span className={`px-2 py-1 rounded text-xs uppercase font-bold tracking-wider ${colors.text} ${colors.bg} border ${colors.border}`}>
                                                    {alert.severity}
                                                </span>
                                                <span className="text-xs text-slate-500 font-mono">{formatTimeAgo(alert.created_at)}</span>
                                            </div>
                                        </div>
                                        {alert.raw_data && (
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                {alert.raw_data.UserId && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800/50 text-xs text-slate-300 font-mono">
                                                        <svg className="w-3 h-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                                        {alert.raw_data.UserId}
                                                    </span>
                                                )}
                                                {alert.raw_data.ClientIP && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800/50 text-xs text-slate-300 font-mono">
                                                        <svg className="w-3 h-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>
                                                        {alert.raw_data.ClientIP}
                                                    </span>
                                                )}
                                                {alert.raw_data.Operation && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800/50 text-xs text-slate-300 font-mono">
                                                        <svg className="w-3 h-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                                        {alert.raw_data.Operation}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {/* Rules View */}
            {activeView === 'rules' && (
                <div className="space-y-6 animate-in fade-in duration-300">
                    {/* Rule Templates */}
                    <div>
                        <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-3">Quick Start Templates</h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                            {RULE_TEMPLATES.map((template, i) => (
                                <button
                                    key={i}
                                    onClick={() => applyTemplate(template)}
                                    className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/50 hover:border-blue-500/50 hover:bg-slate-800/60 transition-all text-left group"
                                >
                                    <div className="text-2xl mb-2">{template.icon}</div>
                                    <div className="text-sm font-medium text-white group-hover:text-blue-400 transition-colors">{template.name}</div>
                                    <div className="text-xs text-slate-500 mt-1">{template.description}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Active Rules */}
                    <div>
                        <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-3">Active Rules ({rules.length})</h3>
                        {isLoading ? (
                            <div className="flex items-center justify-center py-12">
                                <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                            </div>
                        ) : rules.length === 0 ? (
                            <div className="glass-panel p-8 text-center rounded-xl">
                                <p className="text-slate-400">No rules defined. Use a template above or create a custom rule.</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {rules.map((rule) => {
                                    const colors = getSeverityColor(rule.severity);
                                    return (
                                        <div key={rule.id} className="glass-panel p-4 rounded-xl border border-white/5 bg-slate-900/40 flex items-center justify-between group hover:border-slate-600 transition-colors">
                                            <div className="flex items-center gap-4">
                                                <div className={`w-2 h-8 rounded-full ${colors.dot}`}></div>
                                                <div>
                                                    <h4 className="text-white font-medium">{rule.name}</h4>
                                                    <code className="text-xs text-slate-500 font-mono">
                                                        {rule.field} {rule.operator} "{rule.value}"
                                                    </code>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className={`px-2 py-1 rounded text-xs uppercase font-medium ${colors.text} ${colors.bg}`}>
                                                    {rule.severity}
                                                </span>
                                                <button
                                                    onClick={() => deleteRule(rule.id)}
                                                    className="p-2 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                                >
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Create Rule Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreateModal(false)}></div>
                    <div className="relative bg-[#0f172a] border border-slate-700 w-full max-w-lg rounded-xl shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50">
                            <h3 className="text-lg font-bold text-white">Create Detection Rule</h3>
                            <button onClick={() => setShowCreateModal(false)} className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs text-slate-400 mb-2 font-medium">Rule Name</label>
                                <input
                                    type="text"
                                    value={newRule.name}
                                    onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-blue-500"
                                    placeholder="e.g., Detect Suspicious Login"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-slate-400 mb-2 font-medium">Condition</label>
                                <div className="flex items-center gap-2">
                                    <select
                                        value={newRule.field}
                                        onChange={(e) => setNewRule({ ...newRule, field: e.target.value })}
                                        className="bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
                                    >
                                        <option value="operation">operation</option>
                                        <option value="user_id">user_id</option>
                                        <option value="workload">workload</option>
                                        <option value="client_ip">client_ip</option>
                                        <option value="city">city</option>
                                        <option value="country_code">country_code</option>
                                    </select>
                                    <select
                                        value={newRule.operator}
                                        onChange={(e) => setNewRule({ ...newRule, operator: e.target.value })}
                                        className="bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
                                    >
                                        <option value="=">=</option>
                                        <option value="!=">!=</option>
                                        <option value="contains">contains</option>
                                    </select>
                                    <input
                                        type="text"
                                        value={newRule.value}
                                        onChange={(e) => setNewRule({ ...newRule, value: e.target.value })}
                                        className="flex-1 bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
                                        placeholder="value"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs text-slate-400 mb-2 font-medium">Severity</label>
                                <div className="flex gap-2">
                                    {['low', 'medium', 'high', 'critical'].map((sev) => {
                                        const colors = getSeverityColor(sev);
                                        return (
                                            <button
                                                key={sev}
                                                onClick={() => setNewRule({ ...newRule, severity: sev })}
                                                className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium capitalize transition-all border-2 ${
                                                    newRule.severity === sev
                                                        ? `${colors.bg} ${colors.text} ${colors.border}`
                                                        : 'bg-slate-800 text-slate-400 border-transparent hover:border-slate-600'
                                                }`}
                                            >
                                                {sev}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            {/* Preview */}
                            <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4">
                                <div className="text-xs text-slate-500 mb-2">Preview</div>
                                <code className="text-sm text-slate-300 font-mono">
                                    IF {newRule.field} {newRule.operator} "{newRule.value}" → {newRule.severity.toUpperCase()}
                                </code>
                            </div>
                        </div>
                        <div className="px-6 py-4 border-t border-slate-700/50 flex justify-end gap-3">
                            <button
                                onClick={() => setShowCreateModal(false)}
                                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => createRule(newRule)}
                                disabled={!newRule.name || !newRule.value}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-medium rounded-lg transition-colors"
                            >
                                Create Rule
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Alerts;
