import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';

interface OnboardingProps {
    onComplete: () => void;
}

const STEPS = [
    { id: 'welcome', title: 'Welcome' },
    { id: 'account', title: 'Team Setup' },
    { id: 'tenant', title: 'Connect M365' },
    { id: 'alerts', title: 'Set Up Alerts' },
    { id: 'complete', title: 'Ready!' }
];

const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
    const { user } = useAuth();
    const [currentStep, setCurrentStep] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Tenant form state
    const [tenantForm, setTenantForm] = useState({
        name: '',
        tenant_id: '',
        client_id: '',
        client_secret: '',
        contact_email: ''
    });

    // Alert form state
    const [selectedAlertTemplates, setSelectedAlertTemplates] = useState<string[]>([]);

    // Team invite form state
    const [teamInvites, setTeamInvites] = useState<Array<{ email: string; role: string }>>([
        { email: '', role: 'technician' }
    ]);
    const [invitesSent, setInvitesSent] = useState(false);

    // Connection test state
    const [testResult, setTestResult] = useState<{
        success: boolean;
        message: string;
        details?: string;
        auth_ok?: boolean;
        permissions_ok?: boolean;
        subscriptions?: string[];
    } | null>(null);
    const [isTesting, setIsTesting] = useState(false);

    const alertTemplates = [
        {
            id: 'failed-login',
            name: 'Failed Login Attempts',
            description: 'Detect when users fail to authenticate',
            field: 'operation',
            operator: 'contains',
            value: 'UserLoginFailed',
            severity: 'high',
            icon: '🔐'
        },
        {
            id: 'admin-changes',
            name: 'Admin Role Changes',
            description: 'Monitor when admin roles are assigned or removed',
            field: 'operation',
            operator: 'contains',
            value: 'role',
            severity: 'critical',
            icon: '👑'
        },
        {
            id: 'external-sharing',
            name: 'External Sharing',
            description: 'Track when files are shared externally',
            field: 'operation',
            operator: 'contains',
            value: 'SharingSet',
            severity: 'medium',
            icon: '🔗'
        },
        {
            id: 'password-changes',
            name: 'Password Changes',
            description: 'Monitor password resets and changes',
            field: 'operation',
            operator: 'contains',
            value: 'password',
            severity: 'medium',
            icon: '🔑'
        },
        {
            id: 'mailbox-delegation',
            name: 'Mailbox Delegation',
            description: 'Detect when mailbox permissions are granted',
            field: 'operation',
            operator: 'contains',
            value: 'MailboxPermission',
            severity: 'high',
            icon: '📬'
        },
        {
            id: 'dlp-violations',
            name: 'DLP Policy Violations',
            description: 'Catch data loss prevention policy matches',
            field: 'workload',
            operator: '=',
            value: 'DLP',
            severity: 'critical',
            icon: '🛡️'
        }
    ];

    useEffect(() => {
        if (user?.email) {
            setTenantForm(f => ({ ...f, contact_email: user.email || '' }));
        }
    }, [user]);

    const addTeamInvite = () => {
        if (teamInvites.length < 5) {
            setTeamInvites([...teamInvites, { email: '', role: 'technician' }]);
        }
    };

    const removeTeamInvite = (index: number) => {
        setTeamInvites(teamInvites.filter((_, i) => i !== index));
    };

    const updateTeamInvite = (index: number, field: 'email' | 'role', value: string) => {
        const updated = [...teamInvites];
        updated[index][field] = value;
        setTeamInvites(updated);
    };

    const handleTeamInvitesSubmit = async () => {
        const validInvites = teamInvites.filter(inv => inv.email.trim() !== '');

        if (validInvites.length === 0) {
            setCurrentStep(2);
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            for (const invite of validInvites) {
                await api.post('/users', {
                    email: invite.email,
                    password: generateTempPassword(),
                    first_name: invite.email.split('@')[0],
                    last_name: '',
                    role: invite.role
                });
            }
            setInvitesSent(true);
            setCurrentStep(2);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to create some team members.');
            // Continue anyway after showing error
            setTimeout(() => {
                setError(null);
                setCurrentStep(2);
            }, 2000);
        } finally {
            setIsLoading(false);
        }
    };

    const generateTempPassword = () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
        return Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    };

    const handleTestConnection = async () => {
        if (!tenantForm.tenant_id || !tenantForm.client_id || !tenantForm.client_secret) {
            setError('Please fill in Tenant ID, Client ID, and Client Secret to test the connection');
            return;
        }

        setIsTesting(true);
        setError(null);
        setTestResult(null);

        try {
            const response = await api.post('/tenants/test', {
                tenant_id: tenantForm.tenant_id,
                client_id: tenantForm.client_id,
                client_secret: tenantForm.client_secret
            });
            setTestResult(response.data);
        } catch (err: any) {
            setTestResult({
                success: false,
                message: 'Connection test failed',
                details: err.response?.data?.details || err.message || 'Unable to reach the server'
            });
        } finally {
            setIsTesting(false);
        }
    };

    const handleTenantSubmit = async () => {
        if (!tenantForm.name || !tenantForm.tenant_id || !tenantForm.client_id || !tenantForm.client_secret) {
            setError('Please fill in all required fields');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            await api.post('/tenants', tenantForm);
            setCurrentStep(3);
        } catch (err: any) {
            setError(err.response?.data || 'Failed to connect tenant. Please check your credentials.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleAlertsSubmit = async () => {
        setIsLoading(true);

        try {
            // Create selected alert rules
            for (const templateId of selectedAlertTemplates) {
                const template = alertTemplates.find(t => t.id === templateId);
                if (template) {
                    await api.post('/rules', {
                        name: template.name,
                        description: template.description,
                        field: template.field,
                        operator: template.operator,
                        value: template.value,
                        severity: template.severity,
                        enabled: true
                    });
                }
            }
            setCurrentStep(4);
        } catch (err: any) {
            console.error('Failed to create some rules:', err);
            // Continue anyway
            setCurrentStep(4);
        } finally {
            setIsLoading(false);
        }
    };

    const toggleAlertTemplate = (id: string) => {
        setSelectedAlertTemplates(prev =>
            prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
        );
    };

    const renderStepIndicator = () => (
        <div className="flex items-center justify-center gap-2 mb-8">
            {STEPS.map((step, index) => (
                <React.Fragment key={step.id}>
                    <div className={`flex items-center gap-2 ${index <= currentStep ? 'text-white' : 'text-slate-500'}`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-300 ${
                            index < currentStep
                                ? 'bg-emerald-500 text-white'
                                : index === currentStep
                                    ? 'bg-blue-600 text-white ring-4 ring-blue-600/30'
                                    : 'bg-slate-700 text-slate-400'
                        }`}>
                            {index < currentStep ? (
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                </svg>
                            ) : (
                                index + 1
                            )}
                        </div>
                        <span className={`text-sm font-medium hidden sm:block ${index <= currentStep ? 'text-white' : 'text-slate-500'}`}>
                            {step.title}
                        </span>
                    </div>
                    {index < STEPS.length - 1 && (
                        <div className={`w-12 h-0.5 transition-all duration-300 ${index < currentStep ? 'bg-emerald-500' : 'bg-slate-700'}`} />
                    )}
                </React.Fragment>
            ))}
        </div>
    );

    const renderWelcome = () => (
        <div className="text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Logo Animation */}
            <div className="relative w-32 h-32 mx-auto mb-8">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-emerald-500 rounded-3xl rotate-6 opacity-20 animate-pulse"></div>
                <div className="absolute inset-0 bg-gradient-to-br from-blue-600 to-emerald-600 rounded-3xl flex items-center justify-center">
                    <span className="text-6xl font-bold text-white">M</span>
                </div>
                {/* Orbiting particles */}
                <div className="absolute -inset-4 animate-spin" style={{ animationDuration: '8s' }}>
                    <div className="absolute top-0 left-1/2 w-3 h-3 bg-blue-400 rounded-full"></div>
                </div>
                <div className="absolute -inset-6 animate-spin" style={{ animationDuration: '12s', animationDirection: 'reverse' }}>
                    <div className="absolute bottom-0 right-0 w-2 h-2 bg-emerald-400 rounded-full"></div>
                </div>
            </div>

            <h1 className="text-4xl font-bold text-white mb-4">
                Welcome to MicroSeem
            </h1>
            <p className="text-xl text-slate-400 mb-2">
                Hi {user?.first_name || 'there'}! Let's set up your security monitoring.
            </p>
            <p className="text-slate-500 mb-8 max-w-md mx-auto">
                In just a few steps, you'll have real-time visibility into your Microsoft 365 environment.
            </p>

            {user?.organization && (
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800/50 rounded-full border border-slate-700 mb-8">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                        {user.organization.name?.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-slate-300">{user.organization.name}</span>
                </div>
            )}

            <div className="grid gap-4 max-w-lg mx-auto text-left mb-8">
                {[
                    { icon: '🔗', title: 'Connect your M365 tenant', desc: 'Securely link your Microsoft 365 environment' },
                    { icon: '⚡', title: 'Real-time monitoring', desc: 'Stream audit logs as they happen' },
                    { icon: '🚨', title: 'Instant alerts', desc: 'Get notified of suspicious activity' }
                ].map((item, i) => (
                    <div key={i} className="flex items-start gap-4 p-4 bg-slate-800/30 rounded-xl border border-slate-700/50">
                        <span className="text-2xl">{item.icon}</span>
                        <div>
                            <h3 className="font-medium text-white">{item.title}</h3>
                            <p className="text-sm text-slate-400">{item.desc}</p>
                        </div>
                    </div>
                ))}
            </div>

            <button
                onClick={() => setCurrentStep(1)}
                className="px-8 py-3 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white rounded-xl font-medium text-lg transition-all duration-200 shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40"
            >
                Get Started
                <svg className="inline-block w-5 h-5 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
            </button>
        </div>
    );

    const renderAccountSetup = () => (
        <div className="max-w-xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center mb-8">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                    <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Set Up Your Team</h2>
                <p className="text-slate-400">Invite team members to collaborate on security monitoring.</p>
            </div>

            {/* Account Info Card */}
            <div className="mb-6 p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-lg font-bold">
                        {user?.first_name?.charAt(0).toUpperCase()}{user?.last_name?.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1">
                        <div className="font-medium text-white">{user?.first_name} {user?.last_name}</div>
                        <div className="text-sm text-slate-400">{user?.email}</div>
                    </div>
                    <div className="px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
                        Admin
                    </div>
                </div>
            </div>

            {error && (
                <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                    {error}
                </div>
            )}

            {/* Team Invites */}
            <div className="bg-slate-800/30 rounded-2xl border border-slate-700/50 p-6 mb-6">
                <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                    Invite Team Members
                    <span className="text-slate-500 text-sm font-normal">(optional)</span>
                </h3>

                <div className="space-y-3">
                    {teamInvites.map((invite, index) => (
                        <div key={index} className="flex gap-3">
                            <input
                                type="email"
                                value={invite.email}
                                onChange={(e) => updateTeamInvite(index, 'email', e.target.value)}
                                placeholder="colleague@company.com"
                                className="flex-1 px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm"
                            />
                            <select
                                value={invite.role}
                                onChange={(e) => updateTeamInvite(index, 'role', e.target.value)}
                                className="px-3 py-3 bg-slate-900/50 border border-slate-600 rounded-xl text-white focus:outline-none focus:border-blue-500 transition-all text-sm"
                            >
                                <option value="admin">Admin</option>
                                <option value="technician">Technician</option>
                                <option value="report_admin">Report Admin</option>
                            </select>
                            {teamInvites.length > 1 && (
                                <button
                                    onClick={() => removeTeamInvite(index)}
                                    className="p-3 text-slate-500 hover:text-red-400 transition-colors"
                                >
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                </button>
                            )}
                        </div>
                    ))}
                </div>

                {teamInvites.length < 5 && (
                    <button
                        onClick={addTeamInvite}
                        className="mt-4 flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                        </svg>
                        Add another team member
                    </button>
                )}

                {/* Role descriptions */}
                <div className="mt-6 p-4 bg-slate-900/50 rounded-xl">
                    <h4 className="text-sm font-medium text-slate-300 mb-3">Role Permissions</h4>
                    <div className="space-y-2 text-xs text-slate-400">
                        <div className="flex items-start gap-2">
                            <span className="text-purple-400 font-medium min-w-[90px]">Admin</span>
                            <span>Full access - manage users, settings, integrations, and all features</span>
                        </div>
                        <div className="flex items-start gap-2">
                            <span className="text-blue-400 font-medium min-w-[90px]">Technician</span>
                            <span>Operational access - view logs, manage alerts, investigations</span>
                        </div>
                        <div className="flex items-start gap-2">
                            <span className="text-emerald-400 font-medium min-w-[90px]">Report Admin</span>
                            <span>Read-only access - view logs, analytics, and dashboards</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex justify-between">
                <button
                    onClick={() => setCurrentStep(0)}
                    className="px-6 py-3 text-slate-400 hover:text-white transition-colors"
                >
                    Back
                </button>
                <div className="flex gap-3">
                    <button
                        onClick={() => setCurrentStep(2)}
                        className="px-6 py-3 text-slate-400 hover:text-white transition-colors"
                    >
                        Skip for now
                    </button>
                    <button
                        onClick={handleTeamInvitesSubmit}
                        disabled={isLoading}
                        className="px-8 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 text-white rounded-xl font-medium transition-all disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isLoading ? (
                            <>
                                <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full"></div>
                                Creating...
                            </>
                        ) : (
                            <>
                                {teamInvites.some(inv => inv.email.trim()) ? 'Create & Continue' : 'Continue'}
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                </svg>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );

    const renderTenantSetup = () => (
        <div className="max-w-xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center mb-8">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                    <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Connect Your Microsoft 365 Tenant</h2>
                <p className="text-slate-400">Enter your Azure AD app credentials to start monitoring audit logs.</p>
            </div>

            {error && (
                <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                    {error}
                </div>
            )}

            <div className="space-y-5 bg-slate-800/30 rounded-2xl border border-slate-700/50 p-6">
                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Organization Name</label>
                    <input
                        type="text"
                        value={tenantForm.name}
                        onChange={(e) => setTenantForm({ ...tenantForm, name: e.target.value })}
                        placeholder="e.g., Acme Corporation"
                        className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Azure Tenant ID</label>
                    <input
                        type="text"
                        value={tenantForm.tenant_id}
                        onChange={(e) => setTenantForm({ ...tenantForm, tenant_id: e.target.value })}
                        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                        className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono text-sm"
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Client ID</label>
                        <input
                            type="text"
                            value={tenantForm.client_id}
                            onChange={(e) => setTenantForm({ ...tenantForm, client_id: e.target.value })}
                            placeholder="App Client ID"
                            className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Client Secret</label>
                        <input
                            type="password"
                            value={tenantForm.client_secret}
                            onChange={(e) => setTenantForm({ ...tenantForm, client_secret: e.target.value })}
                            placeholder="••••••••••••"
                            className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Contact Email</label>
                    <input
                        type="email"
                        value={tenantForm.contact_email}
                        onChange={(e) => setTenantForm({ ...tenantForm, contact_email: e.target.value })}
                        placeholder="admin@company.com"
                        className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                    />
                </div>

                {/* Test Connection Button */}
                <div className="pt-2">
                    <button
                        type="button"
                        onClick={handleTestConnection}
                        disabled={isTesting || !tenantForm.tenant_id || !tenantForm.client_id || !tenantForm.client_secret}
                        className="w-full py-3 px-4 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-xl font-medium transition-all duration-200 flex items-center justify-center gap-2 border border-slate-600 disabled:border-slate-700"
                    >
                        {isTesting ? (
                            <>
                                <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full"></div>
                                Testing Connection...
                            </>
                        ) : (
                            <>
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                </svg>
                                Test Connection
                            </>
                        )}
                    </button>
                </div>

                {/* Test Result Display */}
                {testResult && (
                    <div className={`p-4 rounded-xl border ${
                        testResult.success
                            ? 'bg-emerald-500/10 border-emerald-500/30'
                            : 'bg-red-500/10 border-red-500/30'
                    }`}>
                        <div className="flex items-start gap-3">
                            {testResult.success ? (
                                <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                                    <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                    </svg>
                                </div>
                            ) : (
                                <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                                    <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </div>
                            )}
                            <div className="flex-1">
                                <h4 className={`font-medium ${testResult.success ? 'text-emerald-300' : 'text-red-300'}`}>
                                    {testResult.message}
                                </h4>
                                {testResult.details && (
                                    <p className={`text-sm mt-1 ${testResult.success ? 'text-emerald-400/80' : 'text-red-400/80'}`}>
                                        {testResult.details}
                                    </p>
                                )}

                                {/* Detailed status for failures */}
                                {!testResult.success && (
                                    <div className="mt-3 space-y-2">
                                        <div className="flex items-center gap-2 text-sm">
                                            {testResult.auth_ok ? (
                                                <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                                </svg>
                                            ) : (
                                                <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            )}
                                            <span className={testResult.auth_ok ? 'text-emerald-400' : 'text-red-400'}>
                                                Authentication {testResult.auth_ok ? 'OK' : 'Failed'}
                                            </span>
                                        </div>
                                        {testResult.auth_ok && (
                                            <div className="flex items-center gap-2 text-sm">
                                                {testResult.permissions_ok ? (
                                                    <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                                    </svg>
                                                ) : (
                                                    <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                                    </svg>
                                                )}
                                                <span className={testResult.permissions_ok ? 'text-emerald-400' : 'text-red-400'}>
                                                    API Permissions {testResult.permissions_ok ? 'OK' : 'Missing or Not Consented'}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Show subscriptions if available */}
                                {testResult.success && testResult.subscriptions && testResult.subscriptions.length > 0 && (
                                    <div className="mt-3">
                                        <p className="text-xs text-emerald-400/70 mb-1">Active subscriptions:</p>
                                        <div className="flex flex-wrap gap-1">
                                            {testResult.subscriptions.map((sub, i) => (
                                                <span key={i} className="px-2 py-0.5 bg-emerald-500/20 rounded text-xs text-emerald-300">
                                                    {sub}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

            </div>

            {/* Detailed Setup Guide */}
            <div className="mt-6 space-y-4">
                <div className="p-5 bg-slate-800/50 rounded-2xl border border-slate-700/50">
                    <h4 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold">1</span>
                        Create App Registration
                    </h4>
                    <ol className="text-sm text-slate-400 space-y-2 ml-8">
                        <li className="flex items-start gap-2">
                            <span className="text-slate-500 select-none">a.</span>
                            <span>Go to <a href="https://portal.azure.com/#view/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/~/RegisteredApps" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">Azure Portal → App registrations</a></span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-slate-500 select-none">b.</span>
                            <span>Click <strong className="text-slate-300">+ New registration</strong></span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-slate-500 select-none">c.</span>
                            <span>Name: <code className="px-1.5 py-0.5 bg-slate-900 rounded text-blue-300 text-xs">MicroSeem SIEM</code> (or any name)</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-slate-500 select-none">d.</span>
                            <span>Supported account types: <strong className="text-slate-300">Single tenant</strong></span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-slate-500 select-none">e.</span>
                            <span>Click <strong className="text-slate-300">Register</strong></span>
                        </li>
                    </ol>
                    <div className="mt-3 ml-8 p-3 bg-slate-900/50 rounded-lg">
                        <p className="text-xs text-slate-500">After registration, copy these values from the Overview page:</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                            <code className="px-2 py-1 bg-slate-800 rounded text-xs text-emerald-400">Application (client) ID</code>
                            <code className="px-2 py-1 bg-slate-800 rounded text-xs text-emerald-400">Directory (tenant) ID</code>
                        </div>
                    </div>
                </div>

                <div className="p-5 bg-slate-800/50 rounded-2xl border border-slate-700/50">
                    <h4 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold">2</span>
                        Configure API Permissions
                    </h4>
                    <ol className="text-sm text-slate-400 space-y-2 ml-8">
                        <li className="flex items-start gap-2">
                            <span className="text-slate-500 select-none">a.</span>
                            <span>In your app, go to <strong className="text-slate-300">API permissions</strong> → <strong className="text-slate-300">+ Add a permission</strong></span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-slate-500 select-none">b.</span>
                            <span>Select <strong className="text-slate-300">APIs my organization uses</strong> tab</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-slate-500 select-none">c.</span>
                            <span>Search for <code className="px-1.5 py-0.5 bg-slate-900 rounded text-blue-300 text-xs">Office 365 Management APIs</code></span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-slate-500 select-none">d.</span>
                            <span>Select <strong className="text-slate-300">Application permissions</strong> (not Delegated)</span>
                        </li>
                    </ol>

                    {/* Required Permissions Table */}
                    <div className="mt-4 ml-8">
                        <p className="text-xs font-medium text-slate-300 mb-2">Required Permissions:</p>
                        <div className="bg-slate-900/70 rounded-lg overflow-hidden border border-slate-700/50">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="border-b border-slate-700/50">
                                        <th className="px-3 py-2 text-left text-slate-400 font-medium">Permission</th>
                                        <th className="px-3 py-2 text-left text-slate-400 font-medium">Type</th>
                                        <th className="px-3 py-2 text-left text-slate-400 font-medium">Purpose</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-700/50">
                                    <tr>
                                        <td className="px-3 py-2 font-mono text-emerald-400">ActivityFeed.Read</td>
                                        <td className="px-3 py-2 text-slate-400">Application</td>
                                        <td className="px-3 py-2 text-slate-400">Read audit logs</td>
                                    </tr>
                                    <tr>
                                        <td className="px-3 py-2 font-mono text-emerald-400">ActivityFeed.ReadDlp</td>
                                        <td className="px-3 py-2 text-slate-400">Application</td>
                                        <td className="px-3 py-2 text-slate-400">Read DLP events</td>
                                    </tr>
                                    <tr>
                                        <td className="px-3 py-2 font-mono text-emerald-400">ServiceHealth.Read</td>
                                        <td className="px-3 py-2 text-slate-400">Application</td>
                                        <td className="px-3 py-2 text-slate-400">Service health info</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="mt-4 ml-8 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                        <div className="flex items-start gap-2">
                            <svg className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <div>
                                <p className="text-xs text-amber-300 font-medium">Admin Consent Required</p>
                                <p className="text-xs text-amber-400/80 mt-1">After adding permissions, click <strong>"Grant admin consent for [Your Org]"</strong> button. A Global Admin must approve this.</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-5 bg-slate-800/50 rounded-2xl border border-slate-700/50">
                    <h4 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold">3</span>
                        Create Client Secret
                    </h4>
                    <ol className="text-sm text-slate-400 space-y-2 ml-8">
                        <li className="flex items-start gap-2">
                            <span className="text-slate-500 select-none">a.</span>
                            <span>Go to <strong className="text-slate-300">Certificates & secrets</strong> → <strong className="text-slate-300">Client secrets</strong></span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-slate-500 select-none">b.</span>
                            <span>Click <strong className="text-slate-300">+ New client secret</strong></span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-slate-500 select-none">c.</span>
                            <span>Description: <code className="px-1.5 py-0.5 bg-slate-900 rounded text-blue-300 text-xs">MicroSeem Production</code></span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-slate-500 select-none">d.</span>
                            <span>Expiration: <strong className="text-slate-300">24 months</strong> (recommended)</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-slate-500 select-none">e.</span>
                            <span>Click <strong className="text-slate-300">Add</strong> and <strong className="text-red-400">immediately copy the Value</strong></span>
                        </li>
                    </ol>
                    <div className="mt-3 ml-8 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                        <div className="flex items-start gap-2">
                            <svg className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <p className="text-xs text-red-300">The secret value is only shown once! Copy it immediately after creation. You cannot retrieve it later.</p>
                        </div>
                    </div>
                </div>

                {/* Quick Reference */}
                <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
                    <h4 className="text-sm font-medium text-emerald-400 mb-3 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Quick Checklist
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-400">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" className="rounded bg-slate-800 border-slate-600 text-emerald-500 focus:ring-emerald-500/30" />
                            <span>App registered in Azure AD</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" className="rounded bg-slate-800 border-slate-600 text-emerald-500 focus:ring-emerald-500/30" />
                            <span>ActivityFeed.Read permission added</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" className="rounded bg-slate-800 border-slate-600 text-emerald-500 focus:ring-emerald-500/30" />
                            <span>Admin consent granted</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" className="rounded bg-slate-800 border-slate-600 text-emerald-500 focus:ring-emerald-500/30" />
                            <span>Client secret created & copied</span>
                        </label>
                    </div>
                </div>
            </div>

            <div className="flex justify-between mt-8">
                <button
                    onClick={() => setCurrentStep(1)}
                    className="px-6 py-3 text-slate-400 hover:text-white transition-colors"
                >
                    Back
                </button>
                <button
                    onClick={handleTenantSubmit}
                    disabled={isLoading}
                    className="px-8 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 text-white rounded-xl font-medium transition-all disabled:cursor-not-allowed flex items-center gap-2"
                >
                    {isLoading ? (
                        <>
                            <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full"></div>
                            Connecting...
                        </>
                    ) : (
                        <>
                            Connect Tenant
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                            </svg>
                        </>
                    )}
                </button>
            </div>
        </div>
    );

    const renderAlertSetup = () => (
        <div className="max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center mb-8">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
                    <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Set Up Alert Rules</h2>
                <p className="text-slate-400">Choose which security events you want to be notified about.</p>
            </div>

            <div className="grid gap-3 mb-8">
                {alertTemplates.map((template) => (
                    <button
                        key={template.id}
                        onClick={() => toggleAlertTemplate(template.id)}
                        className={`p-4 rounded-xl border text-left transition-all duration-200 ${
                            selectedAlertTemplates.includes(template.id)
                                ? 'bg-blue-600/10 border-blue-500/50 ring-1 ring-blue-500/30'
                                : 'bg-slate-800/30 border-slate-700/50 hover:border-slate-600'
                        }`}
                    >
                        <div className="flex items-start gap-4">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${
                                selectedAlertTemplates.includes(template.id)
                                    ? 'bg-blue-600/20'
                                    : 'bg-slate-700/50'
                            }`}>
                                {template.icon}
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center justify-between">
                                    <h3 className={`font-medium ${
                                        selectedAlertTemplates.includes(template.id) ? 'text-white' : 'text-slate-300'
                                    }`}>
                                        {template.name}
                                    </h3>
                                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                        template.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                                        template.severity === 'high' ? 'bg-orange-500/20 text-orange-400' :
                                        'bg-yellow-500/20 text-yellow-400'
                                    }`}>
                                        {template.severity}
                                    </span>
                                </div>
                                <p className="text-sm text-slate-500 mt-1">{template.description}</p>
                            </div>
                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                                selectedAlertTemplates.includes(template.id)
                                    ? 'bg-blue-600 border-blue-600'
                                    : 'border-slate-600'
                            }`}>
                                {selectedAlertTemplates.includes(template.id) && (
                                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                    </svg>
                                )}
                            </div>
                        </div>
                    </button>
                ))}
            </div>

            <p className="text-center text-slate-500 text-sm mb-8">
                You can always add, edit, or remove alert rules later from the Threats section.
            </p>

            <div className="flex justify-between">
                <button
                    onClick={() => setCurrentStep(2)}
                    className="px-6 py-3 text-slate-400 hover:text-white transition-colors"
                >
                    Back
                </button>
                <div className="flex gap-3">
                    <button
                        onClick={() => setCurrentStep(4)}
                        className="px-6 py-3 text-slate-400 hover:text-white transition-colors"
                    >
                        Skip for now
                    </button>
                    <button
                        onClick={handleAlertsSubmit}
                        disabled={isLoading || selectedAlertTemplates.length === 0}
                        className="px-8 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 text-white rounded-xl font-medium transition-all disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isLoading ? (
                            <>
                                <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full"></div>
                                Creating...
                            </>
                        ) : (
                            <>
                                Create {selectedAlertTemplates.length} Rule{selectedAlertTemplates.length !== 1 ? 's' : ''}
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                </svg>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );

    const renderComplete = () => (
        <div className="max-w-xl mx-auto text-center animate-in fade-in zoom-in-95 duration-500">
            {/* Success animation */}
            <div className="relative w-32 h-32 mx-auto mb-8">
                <div className="absolute inset-0 bg-emerald-500/20 rounded-full animate-ping"></div>
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-full flex items-center justify-center">
                    <svg className="w-16 h-16 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                </div>
                {/* Confetti-like particles */}
                <div className="absolute -inset-8 animate-spin" style={{ animationDuration: '20s' }}>
                    <div className="absolute top-0 left-1/2 w-2 h-2 bg-yellow-400 rounded-full"></div>
                    <div className="absolute bottom-0 right-0 w-2 h-2 bg-pink-400 rounded-full"></div>
                    <div className="absolute top-1/2 left-0 w-2 h-2 bg-blue-400 rounded-full"></div>
                </div>
            </div>

            <h2 className="text-3xl font-bold text-white mb-4">You're All Set!</h2>
            <p className="text-xl text-slate-400 mb-8">
                MicroSeem is now monitoring your Microsoft 365 environment.
            </p>

            <div className="grid gap-4 text-left mb-8">
                <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                        <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <div>
                        <div className="font-medium text-white">Account Created</div>
                        <div className="text-sm text-slate-500">You're signed in as {user?.email}</div>
                    </div>
                </div>
                {invitesSent && teamInvites.filter(inv => inv.email.trim()).length > 0 && (
                    <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50 flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <div>
                            <div className="font-medium text-white">{teamInvites.filter(inv => inv.email.trim()).length} Team Members Added</div>
                            <div className="text-sm text-slate-500">They'll need to reset their password to sign in</div>
                        </div>
                    </div>
                )}
                <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                        <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <div>
                        <div className="font-medium text-white">Tenant Connected</div>
                        <div className="text-sm text-slate-500">Audit logs will start flowing shortly</div>
                    </div>
                </div>
                {selectedAlertTemplates.length > 0 && (
                    <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50 flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <div>
                            <div className="font-medium text-white">{selectedAlertTemplates.length} Alert Rules Created</div>
                            <div className="text-sm text-slate-500">You'll be notified of matching events</div>
                        </div>
                    </div>
                )}
            </div>

            <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl mb-8">
                <h4 className="text-sm font-medium text-blue-400 mb-2">Pro Tip</h4>
                <p className="text-sm text-slate-400">
                    Add integrations like Slack or Teams in the <strong className="text-slate-300">Integrations</strong> section to receive alerts in real-time.
                </p>
            </div>

            <button
                onClick={onComplete}
                className="px-8 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl font-medium text-lg transition-all duration-200 shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40"
            >
                Go to Dashboard
                <svg className="inline-block w-5 h-5 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
            </button>
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-900 flex flex-col">
            {/* Background gradient */}
            <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 pointer-events-none"></div>
            <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-transparent to-transparent pointer-events-none"></div>

            {/* Content */}
            <div className="relative flex-1 flex flex-col justify-center px-6 py-12">
                <div className="max-w-4xl mx-auto w-full">
                    {renderStepIndicator()}

                    {currentStep === 0 && renderWelcome()}
                    {currentStep === 1 && renderAccountSetup()}
                    {currentStep === 2 && renderTenantSetup()}
                    {currentStep === 3 && renderAlertSetup()}
                    {currentStep === 4 && renderComplete()}
                </div>
            </div>

            {/* Footer */}
            <div className="relative text-center py-6 text-slate-600 text-sm">
                MicroSeem - Open Source Microsoft 365 SIEM
            </div>
        </div>
    );
};

export default Onboarding;
