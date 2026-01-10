import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';

interface Investigation {
    ID: string;
    name: string;
    description: string;
    created_at: string;
    updated_at: string;
}

const Investigations: React.FC = () => {
    const [investigations, setInvestigations] = useState<Investigation[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [newInvName, setNewInvName] = useState('');
    const navigate = useNavigate();

    const fetchInvestigations = async () => {
        try {
            const res = await axios.get('http://localhost:8080/api/investigations');
            setInvestigations(res.data || []);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchInvestigations();
    }, []);

    const createInvestigation = async () => {
        if (!newInvName.trim()) return;
        try {
            const res = await axios.post('http://localhost:8080/api/investigations', {
                name: newInvName,
                description: '',
                filters: [] // Empty initial filters
            });
            setIsCreating(false);
            setNewInvName('');
            navigate(`/investigations/${res.data.ID}`);
        } catch (e) {
            console.error("Failed to create", e);
        }
    };

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.preventDefault();
        e.stopPropagation();
        if (!window.confirm("Are you sure you want to delete this investigation?")) return;
        try {
            await axios.delete(`http://localhost:8080/api/investigations/${id}`);
            setInvestigations(prev => prev.filter(inv => inv.ID !== id));
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-end">
                <div>
                    <h2 className="text-xl font-semibold text-white">Active Investigations</h2>
                    <p className="text-slate-400 text-sm mt-1">Manage and access your saved forensic contexts.</p>
                </div>
                <button
                    onClick={() => setIsCreating(true)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                    New Investigation
                </button>
            </div>

            {/* Create Modal */}
            {isCreating && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200">
                        <h3 className="text-lg font-bold text-white mb-4">Start New Investigation</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1">Name</label>
                                <input
                                    autoFocus
                                    type="text"
                                    value={newInvName}
                                    onChange={e => setNewInvName(e.target.value)}
                                    placeholder="e.g. Suspicious Login Activity - Jan 10"
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                                    onKeyDown={e => e.key === 'Enter' && createInvestigation()}
                                />
                            </div>
                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    onClick={() => setIsCreating(false)}
                                    className="px-3 py-2 text-slate-400 hover:text-white text-sm"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={createInvestigation}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium"
                                >
                                    Create & Open
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* List */}
            {isLoading ? (
                <div className="text-center py-12 text-slate-500">Loading...</div>
            ) : investigations.length === 0 ? (
                <div className="text-center py-20 bg-slate-800/20 rounded-xl border border-dashed border-slate-700">
                    <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-slate-500 mx-auto mb-3">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                    </div>
                    <h3 className="text-slate-300 font-medium">No investigations found</h3>
                    <p className="text-slate-500 text-sm mt-1 max-w-xs mx-auto">Create a new investigation to start filtering and exporting logs.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {investigations.map(inv => (
                        <Link
                            key={inv.ID}
                            to={`/investigations/${inv.ID}`}
                            className="group block bg-slate-800/40 border border-white/5 hover:bg-slate-800/60 hover:border-blue-500/30 rounded-xl p-5 transition-all"
                        >
                            <div className="flex justify-between items-start mb-4">
                                <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg group-hover:bg-blue-500/20 transition-colors">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                </div>
                                <button
                                    onClick={(e) => handleDelete(e, inv.ID)}
                                    className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors opacity-0 group-hover:opacity-100"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                            </div>
                            <h3 className="text-white font-medium truncate pr-2" title={inv.name}>{inv.name}</h3>
                            <p className="text-slate-500 text-xs mt-1">
                                Last updated {new Date(inv.updated_at).toLocaleDateString()}
                            </p>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
};

export default Investigations;
