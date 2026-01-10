import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { BuildingOffice2Icon, UserGroupIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';

interface Tenant {
    ID: string;
    name: string;
    contact_email: string;
    tenant_id: string;
    verbosity: string;
    last_poll: string;
}

const Organizations: React.FC = () => {
    const [orgs, setOrgs] = useState<Tenant[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchOrgs();
    }, []);

    const fetchOrgs = async () => {
        try {
            const res = await axios.get('http://localhost:8080/api/tenants');
            setOrgs(res.data || []);
        } catch (e) {
            console.error("Failed to fetch orgs", e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-light text-white tracking-tight">Organizations</h1>
                    <p className="text-slate-400 mt-1 font-light">Manage connected Office 365 tenants</p>
                </div>
                <Link to="/settings" className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-indigo-500/20">
                    Add Organization
                </Link>
            </div>

            {loading ? (
                <div className="text-center text-slate-500 py-12">Loading organizations...</div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {orgs.map(org => (
                        <Link
                            key={org.ID}
                            to={`/organizations/${org.ID}`}
                            className="group relative bg-slate-900/50 border border-white/5 rounded-2xl p-6 hover:bg-slate-800/50 transition-all duration-300 hover:border-indigo-500/30 hover:shadow-2xl hover:shadow-indigo-500/10 block"
                        >
                            <div className="absolute top-6 right-6">
                                <span className={`flex h-3 w-3 rounded-full ${new Date(org.last_poll).getTime() > Date.now() - 300000 ? 'bg-emerald-500 shadow-lg shadow-emerald-500/50' : 'bg-amber-500 shadow-lg shadow-amber-500/50'}`}></span>
                            </div>

                            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center mb-4 text-indigo-400 group-hover:scale-110 transition-transform duration-300">
                                <BuildingOffice2Icon className="w-6 h-6" />
                            </div>

                            <h3 className="text-xl font-medium text-white mb-1 group-hover:text-indigo-400 transition-colors">{org.name}</h3>
                            <p className="text-sm text-slate-500 font-mono mb-4 truncate">{org.tenant_id}</p>

                            <div className="space-y-3 pt-4 border-t border-white/5">
                                <div className="flex items-center text-sm text-slate-400 gap-2">
                                    <UserGroupIcon className="w-4 h-4 text-slate-600" />
                                    <span>{org.contact_email || 'No contact set'}</span>
                                </div>
                                <div className="flex items-center text-sm text-slate-400 gap-2">
                                    <ShieldCheckIcon className="w-4 h-4 text-slate-600" />
                                    <span>{org.verbosity} Logging</span>
                                </div>
                            </div>
                        </Link>
                    ))}

                    {/* Add New Card (Empty State) */}
                    {orgs.length === 0 && (
                        <div className="col-span-full text-center py-12 border border-dashed border-slate-700/50 rounded-2xl">
                            <BuildingOffice2Icon className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                            <h3 className="text-slate-300 font-medium">No Organizations Found</h3>
                            <p className="text-slate-500 text-sm mt-1 mb-4">Connect your first Office 365 tenant to get started.</p>
                            <Link to="/settings" className="text-indigo-400 hover:text-indigo-300 text-sm font-medium">
                                Configure in Settings &rarr;
                            </Link>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default Organizations;
