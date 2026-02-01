import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';

interface Integration {
    id: string;
    name: string;
    type: string;
    enabled: boolean;
    webhook_url: string;
    config?: Record<string, string>;
    min_severity: string;
    last_used_at?: string;
    last_error?: string;
    created_at: string;
}

const INTEGRATION_TYPES = [
    {
        id: 'slack',
        name: 'Slack',
        icon: (
            <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
                <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
            </svg>
        ),
        color: 'bg-[#4A154B]',
        description: 'Send alerts to Slack channels via Incoming Webhooks',
        docsUrl: 'https://api.slack.com/messaging/webhooks',
        placeholderUrl: 'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXX',
        fields: []
    },
    {
        id: 'teams',
        name: 'Microsoft Teams',
        icon: (
            <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.625 8.073c.574 0 1.125.23 1.531.64.406.408.635.961.635 1.539v5.534c0 1.201-.47 2.353-1.309 3.203-.837.85-1.973 1.327-3.157 1.327h-.938c-.184 0-.359-.074-.489-.206-.129-.131-.201-.308-.201-.495v-5.09c0-.288.018-.575.053-.86.193-1.59.938-3.067 2.106-4.178.312-.296.72-.415 1.125-.415h.644zm-9.281 4.135v6.545c0 .345-.135.676-.377.92-.24.246-.569.383-.91.383-.341 0-.67-.138-.91-.383-.24-.244-.377-.575-.377-.92v-6.545c0-.344.136-.676.377-.92.24-.245.569-.383.91-.383.341 0 .67.138.91.383.241.244.377.576.377.92zM12 3.682c1.406 0 2.754.565 3.749 1.572.995 1.007 1.553 2.373 1.553 3.798 0 1.424-.558 2.79-1.553 3.797-.995 1.007-2.343 1.573-3.749 1.573-1.406 0-2.754-.566-3.749-1.573-.995-1.006-1.553-2.373-1.553-3.797 0-1.425.558-2.791 1.553-3.798C9.246 4.247 10.594 3.682 12 3.682z" />
            </svg>
        ),
        color: 'bg-[#464EB8]',
        description: 'Post alerts to Teams channels via Incoming Webhooks',
        docsUrl: 'https://docs.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook',
        placeholderUrl: 'https://outlook.office.com/webhook/...',
        fields: []
    },
    {
        id: 'google_chat',
        name: 'Google Chat',
        icon: (
            <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.372 0 0 5.373 0 12s5.372 12 12 12 12-5.373 12-12S18.628 0 12 0zm5.894 16.456c-.046.075-.1.146-.16.21l-.002.002a1.51 1.51 0 0 1-1.068.45H7.336a1.51 1.51 0 0 1-1.068-.45l-.002-.002a1.51 1.51 0 0 1-.16-.21c-.196-.31-.242-.66-.242-1.006V8.55c0-.346.046-.696.242-1.006.046-.075.1-.146.16-.21l.002-.002a1.51 1.51 0 0 1 1.068-.45h9.328a1.51 1.51 0 0 1 1.068.45l.002.002c.06.064.114.135.16.21.196.31.242.66.242 1.006v6.9c0 .346-.046.696-.242 1.006z" />
            </svg>
        ),
        color: 'bg-[#00897B]',
        description: 'Send alerts to Google Chat spaces via Webhooks',
        docsUrl: 'https://developers.google.com/chat/how-tos/webhooks',
        placeholderUrl: 'https://chat.googleapis.com/v1/spaces/...',
        fields: []
    },
    {
        id: 'discord',
        name: 'Discord',
        icon: (
            <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
            </svg>
        ),
        color: 'bg-[#5865F2]',
        description: 'Post alerts to Discord channels via Webhooks',
        docsUrl: 'https://discord.com/developers/docs/resources/webhook',
        placeholderUrl: 'https://discord.com/api/webhooks/...',
        fields: []
    },
    {
        id: 'pagerduty',
        name: 'PagerDuty',
        icon: (
            <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16.965 1.18C15.085.164 13.769 0 10.683 0H3.73v14.55h6.926c2.743 0 4.8-.164 6.61-1.37 1.975-1.303 3.004-3.44 3.004-6.168 0-3.013-1.36-4.94-3.305-5.832zM11.57 10.2H8.318v-5.9h3.2c2.198 0 3.764.726 3.764 2.883 0 2.295-1.46 3.017-3.712 3.017zM3.73 17.616h4.588V24H3.73z" />
            </svg>
        ),
        color: 'bg-[#06AC38]',
        description: 'Create incidents in PagerDuty for critical alerts',
        docsUrl: 'https://developer.pagerduty.com/docs/events-api-v2/overview/',
        placeholderUrl: 'Your Integration Key (Routing Key)',
        fields: [
            { key: 'routing_key', label: 'Integration Key', placeholder: 'Enter your PagerDuty Integration Key', secret: true }
        ]
    },
    {
        id: 'opsgenie',
        name: 'Opsgenie',
        icon: (
            <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 4.8a7.2 7.2 0 1 1 0 14.4 7.2 7.2 0 0 1 0-14.4z" />
            </svg>
        ),
        color: 'bg-[#172B4D]',
        description: 'Create alerts in Opsgenie for on-call management',
        docsUrl: 'https://docs.opsgenie.com/docs/alert-api',
        placeholderUrl: 'Your API Key',
        fields: [
            { key: 'api_key', label: 'API Key', placeholder: 'Enter your Opsgenie API Key', secret: true }
        ]
    },
    {
        id: 'webhook',
        name: 'Generic Webhook',
        icon: (
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
        ),
        color: 'bg-slate-700',
        description: 'Send raw JSON payloads to any HTTP endpoint',
        docsUrl: null,
        placeholderUrl: 'https://your-endpoint.com/webhook',
        fields: []
    }
];

const SEVERITY_OPTIONS = [
    { value: 'info', label: 'Info & Above', description: 'All alerts' },
    { value: 'low', label: 'Low & Above', description: 'Low, Medium, High, Critical' },
    { value: 'medium', label: 'Medium & Above', description: 'Medium, High, Critical' },
    { value: 'high', label: 'High & Above', description: 'High and Critical only' },
    { value: 'critical', label: 'Critical Only', description: 'Only critical alerts' },
];

const Integrations: React.FC = () => {
    const { user, isLoading: authLoading } = useAuth();
    const [integrations, setIntegrations] = useState<Integration[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [selectedType, setSelectedType] = useState<typeof INTEGRATION_TYPES[0] | null>(null);
    const [formData, setFormData] = useState({
        name: '',
        webhook_url: '',
        min_severity: 'medium',
        enabled: true,
        config: {} as Record<string, string>
    });
    const [testing, setTesting] = useState<string | null>(null);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);

    useEffect(() => {
        if (user) {
            fetchIntegrations();
        }
    }, [user]);

    const fetchIntegrations = async () => {
        try {
            const response = await api.get('/integrations');
            setIntegrations(response.data || []);
        } catch (error) {
            console.error('Failed to fetch integrations:', error);
        } finally {
            setLoading(false);
        }
    };

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    };

    const handleCreate = async () => {
        if (!selectedType) return;

        try {
            const payload = {
                name: formData.name || `${selectedType.name} Integration`,
                type: selectedType.id,
                webhook_url: formData.webhook_url,
                min_severity: formData.min_severity,
                enabled: formData.enabled,
                config: Object.keys(formData.config).length > 0 ? formData.config : undefined
            };

            if (editingId) {
                await api.put(`/integrations/${editingId}`, payload);
                showToast('Integration updated successfully', 'success');
            } else {
                await api.post('/integrations', payload);
                showToast('Integration created successfully', 'success');
            }

            setShowModal(false);
            resetForm();
            fetchIntegrations();
        } catch (error: any) {
            showToast(error.response?.data || 'Failed to save integration', 'error');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this integration?')) return;

        try {
            await api.delete(`/integrations/${id}`);
            showToast('Integration deleted', 'success');
            fetchIntegrations();
        } catch (error: any) {
            showToast(error.response?.data || 'Failed to delete integration', 'error');
        }
    };

    const handleTest = async (id: string) => {
        setTesting(id);
        try {
            await api.post(`/integrations/${id}/test`);
            showToast('Test notification sent successfully!', 'success');
            fetchIntegrations();
        } catch (error: any) {
            showToast(error.response?.data || 'Test failed', 'error');
        } finally {
            setTesting(null);
        }
    };

    const handleToggle = async (integration: Integration) => {
        try {
            await api.put(`/integrations/${integration.id}`, {
                ...integration,
                enabled: !integration.enabled
            });
            fetchIntegrations();
        } catch (error: any) {
            showToast(error.response?.data || 'Failed to update integration', 'error');
        }
    };

    const openEditModal = (integration: Integration) => {
        const type = INTEGRATION_TYPES.find(t => t.id === integration.type);
        if (type) {
            setSelectedType(type);
            setFormData({
                name: integration.name,
                webhook_url: '', // Don't show obfuscated URL
                min_severity: integration.min_severity,
                enabled: integration.enabled,
                config: integration.config || {}
            });
            setEditingId(integration.id);
            setShowModal(true);
        }
    };

    const resetForm = () => {
        setSelectedType(null);
        setFormData({
            name: '',
            webhook_url: '',
            min_severity: 'medium',
            enabled: true,
            config: {}
        });
        setEditingId(null);
    };

    const getIntegrationMeta = (type: string) => {
        return INTEGRATION_TYPES.find(t => t.id === type);
    };

    if (authLoading || loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-start">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">Integrations</h1>
                    <p className="text-slate-400 mt-2 font-light">
                        Connect your alert pipeline to external services for real-time notifications.
                    </p>
                </div>
                <button
                    onClick={() => { resetForm(); setShowModal(true); }}
                    className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                    </svg>
                    Add Integration
                </button>
            </div>

            {/* Active Integrations */}
            {integrations.length > 0 ? (
                <div className="grid gap-4">
                    {integrations.map((integration) => {
                        const meta = getIntegrationMeta(integration.type);
                        return (
                            <div
                                key={integration.id}
                                className={`bg-slate-800/50 rounded-xl border transition-all ${
                                    integration.enabled
                                        ? 'border-slate-700/50'
                                        : 'border-slate-700/30 opacity-60'
                                }`}
                            >
                                <div className="p-5 flex items-center gap-4">
                                    {/* Icon */}
                                    <div className={`w-14 h-14 rounded-xl ${meta?.color || 'bg-slate-700'} flex items-center justify-center text-white flex-shrink-0`}>
                                        {meta?.icon}
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-3">
                                            <h3 className="text-lg font-medium text-white">{integration.name}</h3>
                                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                                integration.enabled
                                                    ? 'bg-emerald-500/20 text-emerald-400'
                                                    : 'bg-slate-600/20 text-slate-400'
                                            }`}>
                                                {integration.enabled ? 'Active' : 'Disabled'}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-4 mt-1 text-sm text-slate-400">
                                            <span>{meta?.name}</span>
                                            <span className="text-slate-600">|</span>
                                            <span>Min: {integration.min_severity}</span>
                                            {integration.last_used_at && (
                                                <>
                                                    <span className="text-slate-600">|</span>
                                                    <span>Last used: {new Date(integration.last_used_at).toLocaleDateString()}</span>
                                                </>
                                            )}
                                        </div>
                                        {integration.last_error && (
                                            <div className="mt-2 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
                                                Last error: {integration.last_error}
                                            </div>
                                        )}
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => handleTest(integration.id)}
                                            disabled={testing === integration.id}
                                            className="px-3 py-2 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-700/50 transition-colors disabled:opacity-50"
                                        >
                                            {testing === integration.id ? (
                                                <div className="flex items-center gap-2">
                                                    <div className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full"></div>
                                                    Testing...
                                                </div>
                                            ) : (
                                                'Test'
                                            )}
                                        </button>
                                        <button
                                            onClick={() => openEditModal(integration)}
                                            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors"
                                        >
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                            </svg>
                                        </button>
                                        <button
                                            onClick={() => handleToggle(integration)}
                                            className={`relative w-12 h-6 rounded-full transition-colors ${
                                                integration.enabled ? 'bg-blue-600' : 'bg-slate-600'
                                            }`}
                                        >
                                            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                                                integration.enabled ? 'translate-x-7' : 'translate-x-1'
                                            }`}></div>
                                        </button>
                                        <button
                                            onClick={() => handleDelete(integration.id)}
                                            className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                        >
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="bg-slate-800/30 rounded-xl border border-dashed border-slate-700 p-12 text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-800 flex items-center justify-center">
                        <svg className="w-8 h-8 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                    </div>
                    <h3 className="text-xl font-medium text-white mb-2">No Integrations Configured</h3>
                    <p className="text-slate-400 text-sm mb-6 max-w-md mx-auto">
                        Connect your alert pipeline to Slack, Teams, Discord, PagerDuty, and more to receive real-time notifications when security events occur.
                    </p>
                    <button
                        onClick={() => setShowModal(true)}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                        Add Your First Integration
                    </button>
                </div>
            )}

            {/* Available Integrations Grid */}
            <div className="mt-8">
                <h2 className="text-lg font-semibold text-white mb-4">Available Integrations</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {INTEGRATION_TYPES.map((type) => (
                        <button
                            key={type.id}
                            onClick={() => {
                                resetForm();
                                setSelectedType(type);
                                setFormData(f => ({ ...f, name: `${type.name} Integration` }));
                                setShowModal(true);
                            }}
                            className="group p-4 bg-slate-800/30 hover:bg-slate-800/60 rounded-xl border border-slate-700/50 hover:border-slate-600 text-left transition-all"
                        >
                            <div className={`w-12 h-12 rounded-lg ${type.color} flex items-center justify-center text-white mb-3`}>
                                {type.icon}
                            </div>
                            <h3 className="font-medium text-white group-hover:text-blue-400 transition-colors">{type.name}</h3>
                            <p className="text-sm text-slate-400 mt-1 line-clamp-2">{type.description}</p>
                        </button>
                    ))}
                </div>
            </div>

            {/* Create/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-lg shadow-2xl">
                        {/* Modal Header */}
                        <div className="p-6 border-b border-slate-700">
                            <div className="flex items-center gap-4">
                                {selectedType ? (
                                    <>
                                        <div className={`w-12 h-12 rounded-xl ${selectedType.color} flex items-center justify-center text-white`}>
                                            {selectedType.icon}
                                        </div>
                                        <div>
                                            <h2 className="text-xl font-semibold text-white">
                                                {editingId ? 'Edit' : 'Add'} {selectedType.name}
                                            </h2>
                                            <p className="text-sm text-slate-400">{selectedType.description}</p>
                                        </div>
                                    </>
                                ) : (
                                    <div>
                                        <h2 className="text-xl font-semibold text-white">Choose Integration Type</h2>
                                        <p className="text-sm text-slate-400">Select a service to connect</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 space-y-5">
                            {!selectedType ? (
                                <div className="grid grid-cols-2 gap-3">
                                    {INTEGRATION_TYPES.map((type) => (
                                        <button
                                            key={type.id}
                                            onClick={() => {
                                                setSelectedType(type);
                                                setFormData(f => ({ ...f, name: `${type.name} Integration` }));
                                            }}
                                            className="p-4 bg-slate-700/50 hover:bg-slate-700 rounded-xl border border-slate-600/50 hover:border-slate-500 text-left transition-all"
                                        >
                                            <div className={`w-10 h-10 rounded-lg ${type.color} flex items-center justify-center text-white mb-2`}>
                                                {type.icon}
                                            </div>
                                            <div className="font-medium text-white text-sm">{type.name}</div>
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <>
                                    {/* Name */}
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-2">Integration Name</label>
                                        <input
                                            type="text"
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            placeholder="e.g., Security Alerts Channel"
                                            className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                                        />
                                    </div>

                                    {/* Webhook URL */}
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-2">
                                            {selectedType.id === 'pagerduty' ? 'Integration Key' :
                                             selectedType.id === 'opsgenie' ? 'API Key' : 'Webhook URL'}
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.webhook_url}
                                            onChange={(e) => setFormData({ ...formData, webhook_url: e.target.value })}
                                            placeholder={selectedType.placeholderUrl}
                                            className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono text-sm"
                                        />
                                        {selectedType.docsUrl && (
                                            <a
                                                href={selectedType.docsUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 mt-2 text-xs text-blue-400 hover:text-blue-300"
                                            >
                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                                </svg>
                                                View setup documentation
                                            </a>
                                        )}
                                    </div>

                                    {/* Additional Fields */}
                                    {selectedType.fields?.map((field) => (
                                        <div key={field.key}>
                                            <label className="block text-sm font-medium text-slate-300 mb-2">{field.label}</label>
                                            <input
                                                type={field.secret ? 'password' : 'text'}
                                                value={formData.config[field.key] || ''}
                                                onChange={(e) => setFormData({
                                                    ...formData,
                                                    config: { ...formData.config, [field.key]: e.target.value }
                                                })}
                                                placeholder={field.placeholder}
                                                className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono text-sm"
                                            />
                                        </div>
                                    ))}

                                    {/* Min Severity */}
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-2">Minimum Severity</label>
                                        <select
                                            value={formData.min_severity}
                                            onChange={(e) => setFormData({ ...formData, min_severity: e.target.value })}
                                            className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                                        >
                                            {SEVERITY_OPTIONS.map((opt) => (
                                                <option key={opt.value} value={opt.value}>
                                                    {opt.label} - {opt.description}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Enabled Toggle */}
                                    <div className="flex items-center justify-between py-2">
                                        <div>
                                            <div className="text-sm font-medium text-slate-300">Enable Integration</div>
                                            <div className="text-xs text-slate-500">Start receiving notifications immediately</div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setFormData({ ...formData, enabled: !formData.enabled })}
                                            className={`relative w-12 h-6 rounded-full transition-colors ${
                                                formData.enabled ? 'bg-blue-600' : 'bg-slate-600'
                                            }`}
                                        >
                                            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                                                formData.enabled ? 'translate-x-7' : 'translate-x-1'
                                            }`}></div>
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="p-6 border-t border-slate-700 flex justify-end gap-3">
                            {selectedType && !editingId && (
                                <button
                                    onClick={() => setSelectedType(null)}
                                    className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                                >
                                    Back
                                </button>
                            )}
                            <button
                                onClick={() => { setShowModal(false); resetForm(); }}
                                className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                            {selectedType && (
                                <button
                                    onClick={handleCreate}
                                    disabled={!formData.webhook_url && selectedType.id !== 'email'}
                                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                                >
                                    {editingId ? 'Update Integration' : 'Create Integration'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Toast */}
            {toast && (
                <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-in slide-in-from-bottom-2 ${
                    toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
                } text-white`}>
                    {toast.type === 'success' ? (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                    ) : (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    )}
                    {toast.message}
                </div>
            )}
        </div>
    );
};

export default Integrations;
