import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';

interface OnboardingProps {
    onComplete: () => void;
}

const STEPS = [
    { id: 'welcome', title: 'Welcome' },
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

    const handleTenantSubmit = async () => {
        if (!tenantForm.name || !tenantForm.tenant_id || !tenantForm.client_id || !tenantForm.client_secret) {
            setError('Please fill in all required fields');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            await api.post('/tenants', tenantForm);
            setCurrentStep(2);
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
            setCurrentStep(3);
        } catch (err: any) {
            console.error('Failed to create some rules:', err);
            // Continue anyway
            setCurrentStep(3);
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

                {/* Help section */}
                <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl">
                    <h4 className="text-sm font-medium text-blue-400 mb-2 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Where do I find these?
                    </h4>
                    <ol className="text-sm text-slate-400 space-y-1 list-decimal list-inside">
                        <li>Go to <strong className="text-slate-300">Azure Portal</strong> → Azure Active Directory</li>
                        <li>Navigate to <strong className="text-slate-300">App registrations</strong></li>
                        <li>Create a new app or select existing one</li>
                        <li>Copy the <strong className="text-slate-300">Application (client) ID</strong> and <strong className="text-slate-300">Directory (tenant) ID</strong></li>
                        <li>Under Certificates & secrets, create a new client secret</li>
                    </ol>
                </div>
            </div>

            <div className="flex justify-between mt-8">
                <button
                    onClick={() => setCurrentStep(0)}
                    className="px-6 py-3 text-slate-400 hover:text-white transition-colors"
                >
                    ← Back
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
                    onClick={() => setCurrentStep(1)}
                    className="px-6 py-3 text-slate-400 hover:text-white transition-colors"
                >
                    ← Back
                </button>
                <div className="flex gap-3">
                    <button
                        onClick={() => setCurrentStep(3)}
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
                    {currentStep === 1 && renderTenantSetup()}
                    {currentStep === 2 && renderAlertSetup()}
                    {currentStep === 3 && renderComplete()}
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
