import React, { useEffect, useState } from 'react';
import axios from 'axios';

const API_URL = 'http://localhost:8080/api';

interface Alert {
    rule_name: string;
    description: string;
    severity: string;
    created_at: string;
    raw_data?: { UserId?: string; ClientIP?: string; Operation?: string };
}

interface Rule {
    id: string;
    name: string;
    field: string;
    operator: string;
    value: string;
    severity: string;
}

const Alerts: React.FC = () => {
    const [activeView, setActiveView] = useState<'alerts' | 'rules'>('alerts');
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [rules, setRules] = useState<Rule[]>([]);

    const [newRule, setNewRule] = useState({
        name: '',
        description: '',
        field: 'Operation',
        operator: '=',
        value: '',
        severity: 'medium'
    });

    const loadAlerts = async () => {
        try {
            const res = await axios.get(`${API_URL}/alerts`);
            setAlerts(res.data || []);
        } catch (e) {
            console.error("Load alerts error", e);
        }
    };

    const loadRules = async () => {
        try {
            const res = await axios.get(`${API_URL}/rules`);
            setRules(res.data || []);
        } catch (e) {
            console.error("Load rules error", e);
        }
    };

    useEffect(() => {
        loadAlerts();
        loadRules();
        const interval = setInterval(loadAlerts, 10000);
        return () => clearInterval(interval);
    }, []);

    const createRule = async () => {
        try {
            await axios.post(`${API_URL}/rules`, newRule);
            setNewRule({ name: '', description: '', field: 'Operation', operator: '=', value: '', severity: 'medium' }); // Reset
            loadRules();
            alert('Rule Created!');
        } catch (e: any) {
            alert('Failed to create rule: ' + (e.response?.data || e.message));
        }
    };

    const deleteRule = async (id: string) => {
        if (!confirm('Are you sure you want to delete this rule?')) return;
        try {
            await axios.delete(`${API_URL}/rules/${id}`);
            loadRules();
        } catch (e) {
            alert('Failed to delete rule');
        }
    };

    const getSeverityColor = (sev: string) => {
        switch (sev) {
            case 'critical': return 'text-purple-500 bg-purple-500/10 border-purple-500/20';
            case 'high': return 'text-red-500 bg-red-500/10 border-red-500/20';
            case 'medium': return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
            case 'low': return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
            default: return 'text-slate-500 bg-slate-500/10 border-slate-500/20';
        }
    };

    return (
        <div className="mt-4">
            {/* Sub-navigation */}
            <div className="flex space-x-4 mb-6 border-b border-white/10 pb-2">
                <button
                    onClick={() => setActiveView('alerts')}
                    className={`px-4 py-2 text-sm font-medium transition-colors ${activeView === 'alerts' ? 'text-blue-400 border-b-2 border-blue-500' : 'text-slate-400 hover:text-white'}`}
                >
                    Triggered Alerts
                </button>
                <button
                    onClick={() => setActiveView('rules')}
                    className={`px-4 py-2 text-sm font-medium transition-colors ${activeView === 'rules' ? 'text-blue-400 border-b-2 border-blue-500' : 'text-slate-400 hover:text-white'}`}
                >
                    Detection Rules
                </button>
            </div>

            {activeView === 'alerts' && (
                <div className="space-y-4 animate-in fade-in duration-300">
                    {alerts.length === 0 ? (
                        <div className="glass-panel p-8 text-center text-slate-500 italic rounded-xl">
                            No alerts triggered yet. Good news!
                        </div>
                    ) : (
                        alerts.map((alert, i) => (
                            <div key={i} className="glass-panel p-4 rounded-xl border border-white/5 bg-slate-900/40 flex items-start gap-4">
                                <div className={`w-2 h-2 mt-2 rounded-full ${getSeverityColor(alert.severity).split(' ')[0].replace('text-', 'bg-')} shadow-[0_0_10px_currentColor]`}></div>
                                <div className="flex-1">
                                    <div className="flex justify-between items-start">
                                        <h3 className="text-white font-medium text-sm">{alert.rule_name}</h3>
                                        <span className="text-xs font-mono text-slate-500">{new Date(alert.created_at).toLocaleString()}</span>
                                    </div>
                                    <p className="text-slate-400 text-xs mt-1">{alert.description || 'Alert triggered by matching rule.'}</p>

                                    {/* Snapshot Data */}
                                    <div className="mt-3 p-2 bg-black/30 rounded border border-white/5 text-[10px] font-mono text-slate-400 overflow-x-auto">
                                        User: {alert.raw_data?.UserId || 'Unknown'} | IP: {alert.raw_data?.ClientIP || 'Unknown'} | Op: {alert.raw_data?.Operation}
                                    </div>
                                </div>
                                <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider border ${getSeverityColor(alert.severity)}`}>
                                    {alert.severity}
                                </span>
                            </div>
                        ))
                    )}
                </div>
            )}

            {activeView === 'rules' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in duration-300">
                    {/* Rule List */}
                    <div className="lg:col-span-2 space-y-4">
                        <h3 className="text-white font-bold mb-4">Active Rules</h3>
                        {rules.length === 0 ? (
                            <div className="p-4 text-slate-500 text-sm">No rules defined. Create one to start detecting threats.</div>
                        ) : (
                            rules.map((rule) => (
                                <div key={rule.id} className="glass-panel p-4 rounded-xl border border-white/5 bg-slate-900/40 flex justify-between items-center group">
                                    <div>
                                        <h4 className="text-slate-200 font-medium text-sm">{rule.name}</h4>
                                        <div className="text-xs text-slate-500 mt-1 font-mono">
                                            IF {rule.field} {rule.operator} "{rule.value}" THEN {rule.severity}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => deleteRule(rule.id)}
                                        className="text-slate-600 hover:text-red-400 transition-colors p-2"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    </button>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Create Form */}
                    <div className="glass-panel p-6 rounded-xl border border-white/5 bg-slate-900/60 h-fit">
                        <h3 className="text-white font-bold mb-4">Create Detection Rule</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs text-slate-400 mb-1">Rule Name</label>
                                <input type="text" value={newRule.name} onChange={(e) => setNewRule({ ...newRule, name: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm text-white focus:outline-none focus:border-blue-500" placeholder="e.g. Detect Admin Login" />
                            </div>
                            <div>
                                <label className="block text-xs text-slate-400 mb-1">Severity</label>
                                <select value={newRule.severity} onChange={(e) => setNewRule({ ...newRule, severity: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm text-white focus:outline-none focus:border-blue-500">
                                    <option value="info">Info</option>
                                    <option value="low">Low</option>
                                    <option value="medium">Medium</option>
                                    <option value="high">High</option>
                                    <option value="critical">Critical</option>
                                </select>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">Field</label>
                                    <input type="text" value={newRule.field} onChange={(e) => setNewRule({ ...newRule, field: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm text-white" />
                                </div>
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">Operator</label>
                                    <select value={newRule.operator} onChange={(e) => setNewRule({ ...newRule, operator: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm text-white">
                                        <option value="=">=</option>
                                        <option value="!=">!=</option>
                                        <option value="contains">contains</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">Value</label>
                                    <input type="text" value={newRule.value} onChange={(e) => setNewRule({ ...newRule, value: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm text-white" />
                                </div>
                            </div>
                            <button
                                onClick={createRule}
                                className="w-full py-2 mt-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-medium text-sm transition-colors shadow-lg shadow-blue-900/20"
                            >
                                Save Rule
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Alerts;
