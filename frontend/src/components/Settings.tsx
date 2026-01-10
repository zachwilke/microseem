import React, { useEffect, useState } from 'react';
import axios from 'axios';

const API_URL = 'http://localhost:8080/api';

interface Tenant {
    ID: string;
    name: string;
    tenant_id: string;
    contact_email?: string; // Added
    enabled_content_types?: string[];
    verbosity?: string;
}

const Settings: React.FC = () => {
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [formData, setFormData] = useState({
        name: '',
        tenant_id: '',
        contact_email: '', // Added
        client_id: '',
        client_secret: ''
    });
    const [isLoading, setIsLoading] = useState(false);
    const [expandedTenant, setExpandedTenant] = useState<string | null>(null);

    const loadTenants = async () => {
        try {
            const res = await axios.get(`${API_URL}/tenants`);
            setTenants(res.data || []);
        } catch (e) {
            console.error("Failed to load tenants", e);
        }
    };

    const addTenant = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            await axios.post(`${API_URL}/tenants`, formData);
            await loadTenants();
            setFormData({ name: '', tenant_id: '', contact_email: '', client_id: '', client_secret: '' }); // Reset
        } catch (e: any) {
            alert("Error adding tenant: " + e.message);
        } finally {
            setIsLoading(false);
        }
    };

    const updateTenantConfig = async (tenantId: string, enabledTypes: string[], verbosity: string, contactEmail?: string) => {
        // Optimistic UI Update
        setTenants(prev => prev.map(t =>
            t.ID === tenantId ? { ...t, enabled_content_types: enabledTypes, verbosity, contact_email: contactEmail || t.contact_email } : t
        ));

        try {
            await axios.put(`${API_URL}/tenants/${tenantId}`, {
                enabled_content_types: enabledTypes,
                verbosity: verbosity,
                contact_email: contactEmail
            });
        } catch (e) {
            console.error("Update failed", e);
            // Revert or alert on failure in a real app
        }
    };

    const toggleContentType = (tenant: Tenant, type: string) => {
        const current = tenant.enabled_content_types || [];
        const newTypes = current.includes(type)
            ? current.filter((t: string) => t !== type)
            : [...current, type];
        updateTenantConfig(tenant.ID, newTypes, tenant.verbosity || 'Standard', tenant.contact_email);
    };

    const setVerbosity = (tenant: Tenant, v: string) => {
        updateTenantConfig(tenant.ID, tenant.enabled_content_types || [], v, tenant.contact_email);
    };

    const updateContactEmail = (tenant: Tenant, email: string) => {
        updateTenantConfig(tenant.ID, tenant.enabled_content_types || [], tenant.verbosity || 'Standard', email);
    }

    useEffect(() => {
        loadTenants();
    }, []);

    const contentTypes = ["Audit.AzureActiveDirectory", "Audit.Exchange", "Audit.SharePoint", "Audit.General", "DLP.All"];

    return (
        <div className="grid md:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Add Tenant Form */}
            <div className="glass-panel p-6 rounded-2xl">
                <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                    <span className="w-2 h-8 bg-blue-500 rounded-full"></span>
                    Add New Tenant
                </h2>

                <form onSubmit={addTenant} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Tenant Name</label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            placeholder="e.g. My Organization"
                            className="input-field"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Tenant ID</label>
                        <input
                            type="text"
                            value={formData.tenant_id}
                            onChange={(e) => setFormData({ ...formData, tenant_id: e.target.value })}
                            placeholder="Azure Tenant ID"
                            className="input-field"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Contact Email</label>
                        <input
                            type="email"
                            value={formData.contact_email}
                            onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                            placeholder="admin@example.com"
                            className="input-field"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Client ID</label>
                        <input
                            type="text"
                            value={formData.client_id}
                            onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
                            placeholder="App Client ID"
                            className="input-field"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Client Secret</label>
                        <input
                            type="password"
                            value={formData.client_secret}
                            onChange={(e) => setFormData({ ...formData, client_secret: e.target.value })}
                            placeholder="App Client Secret"
                            className="input-field"
                            required
                        />
                    </div>

                    <button type="submit" className="btn-primary w-full mt-4" disabled={isLoading}>
                        {isLoading ? 'Adding...' : 'Connect Tenant'}
                    </button>
                </form>
            </div>

            {/* Tenant List */}
            <div className="space-y-4">
                <h2 className="text-xl font-semibold mb-6 text-slate-200">Connected Tenants ({tenants.length})</h2>

                {tenants.length === 0 ? (
                    <div className="glass-panel p-8 rounded-2xl text-center text-slate-400 border-dashed border-2 border-slate-700">
                        <p>No tenants connected yet.</p>
                    </div>
                ) : (
                    tenants.map((tenant, i) => (
                        <div key={i} className="glass-panel p-4 rounded-xl hover:bg-slate-800/50 transition-colors border border-white/5">
                            <div
                                className="flex justify-between items-start cursor-pointer"
                                onClick={() => setExpandedTenant(expandedTenant === tenant.ID ? null : tenant.ID)}
                            >
                                <div>
                                    <h3 className="font-bold text-lg text-white hover:text-blue-400 transition-colors">{tenant.name}</h3>
                                    <p className="text-xs text-slate-500 font-mono mt-1">{tenant.tenant_id}</p>
                                    {tenant.contact_email && <p className="text-xs text-slate-400 mt-1">{tenant.contact_email}</p>}
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="px-2 py-1 text-xs rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Active</span>
                                    <svg className={`w-5 h-5 text-slate-500 transition-transform ${expandedTenant === tenant.ID ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                                </div>
                            </div>

                            {/* Expanded Config */}
                            {expandedTenant === tenant.ID && (
                                <div className="mt-4 pt-4 border-t border-white/5 animate-in fade-in slide-in-from-top-2">
                                    <div className="grid gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase">Contact Email</label>
                                            <input
                                                type="email"
                                                className="bg-slate-900 border border-slate-700 text-slate-300 text-sm rounded px-3 py-2 w-full focus:ring-1 focus:ring-blue-500 outline-none"
                                                value={tenant.contact_email || ''}
                                                onChange={(e) => updateContactEmail(tenant, e.target.value)}
                                                onBlur={(e) => updateContactEmail(tenant, e.target.value)} // Ensure save on blur as well
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase">Audit Content Types</label>
                                            <div className="flex flex-wrap gap-2">
                                                {contentTypes.map(type => (
                                                    <label key={type} className={`px-2 py-1 rounded text-xs cursor-pointer border transition-colors select-none ${(tenant.enabled_content_types || []).includes(type)
                                                        ? 'bg-blue-600 border-blue-500 text-white'
                                                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
                                                        }`}>
                                                        <input
                                                            type="checkbox"
                                                            className="hidden"
                                                            checked={(tenant.enabled_content_types || []).includes(type)}
                                                            onChange={() => toggleContentType(tenant, type)}
                                                        />
                                                        {type}
                                                    </label>
                                                ))}
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase">Logging Verbosity</label>
                                            <select
                                                value={tenant.verbosity || 'Standard'}
                                                onChange={(e) => setVerbosity(tenant, e.target.value)}
                                                className="bg-slate-900 border border-slate-700 text-slate-300 text-sm rounded px-2 py-1 focus:ring-1 focus:ring-blue-500 outline-none"
                                            >
                                                <option value="Basic">Basic (Errors Only)</option>
                                                <option value="Standard">Standard (Ops + Security)</option>
                                                <option value="Verbose">Verbose (All Events)</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default Settings;
