import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface FirstTimeSetupProps {
    onComplete: () => void;
}

const FirstTimeSetup: React.FC<FirstTimeSetupProps> = ({ onComplete }) => {
    const navigate = useNavigate();
    const { register } = useAuth();
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        confirmPassword: '',
        first_name: '',
        last_name: '',
        organization_name: '',
    });
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (formData.password !== formData.confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        if (formData.password.length < 8) {
            setError('Password must be at least 8 characters');
            return;
        }

        setIsLoading(true);

        try {
            await register({
                email: formData.email,
                password: formData.password,
                first_name: formData.first_name,
                last_name: formData.last_name,
                organization_name: formData.organization_name,
            });
            onComplete();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to create account. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-900 flex flex-col">
            {/* Background effects */}
            <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 pointer-events-none"></div>
            <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-transparent to-transparent pointer-events-none"></div>
            <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-emerald-900/10 via-transparent to-transparent pointer-events-none"></div>

            <div className="relative flex-1 flex flex-col justify-center py-12 px-4">
                <div className="max-w-lg mx-auto w-full">
                    {/* Header */}
                    <div className="text-center mb-8">
                        <div className="relative w-20 h-20 mx-auto mb-6">
                            <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-emerald-500 rounded-2xl rotate-6 opacity-20 animate-pulse"></div>
                            <div className="absolute inset-0 bg-gradient-to-br from-blue-600 to-emerald-600 rounded-2xl flex items-center justify-center">
                                <span className="text-4xl font-bold text-white">M</span>
                            </div>
                        </div>
                        <h1 className="text-3xl font-bold text-white mb-2">Welcome to MicroSeem</h1>
                        <p className="text-slate-400">Let's set up your first administrator account</p>
                    </div>

                    {/* Setup indicator */}
                    <div className="flex items-center justify-center gap-2 mb-8">
                        <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-full">
                            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                            <span className="text-emerald-400 text-sm font-medium">First Time Setup</span>
                        </div>
                    </div>

                    {/* Form Card */}
                    <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-8">
                        {error && (
                            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                                {error}
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-5">
                            {/* Organization */}
                            <div>
                                <label htmlFor="organization_name" className="block text-sm font-medium text-slate-300 mb-2">
                                    Organization Name
                                </label>
                                <input
                                    id="organization_name"
                                    name="organization_name"
                                    type="text"
                                    value={formData.organization_name}
                                    onChange={handleChange}
                                    required
                                    className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                                    placeholder="Your Company Name"
                                />
                                <p className="mt-1 text-xs text-slate-500">This will be your workspace name</p>
                            </div>

                            {/* Name fields */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="first_name" className="block text-sm font-medium text-slate-300 mb-2">
                                        First Name
                                    </label>
                                    <input
                                        id="first_name"
                                        name="first_name"
                                        type="text"
                                        value={formData.first_name}
                                        onChange={handleChange}
                                        required
                                        className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                                        placeholder="John"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="last_name" className="block text-sm font-medium text-slate-300 mb-2">
                                        Last Name
                                    </label>
                                    <input
                                        id="last_name"
                                        name="last_name"
                                        type="text"
                                        value={formData.last_name}
                                        onChange={handleChange}
                                        required
                                        className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                                        placeholder="Doe"
                                    />
                                </div>
                            </div>

                            {/* Email */}
                            <div>
                                <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                                    Email Address
                                </label>
                                <input
                                    id="email"
                                    name="email"
                                    type="email"
                                    value={formData.email}
                                    onChange={handleChange}
                                    required
                                    autoComplete="email"
                                    className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                                    placeholder="admin@company.com"
                                />
                            </div>

                            {/* Password */}
                            <div>
                                <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
                                    Password
                                </label>
                                <input
                                    id="password"
                                    name="password"
                                    type="password"
                                    value={formData.password}
                                    onChange={handleChange}
                                    required
                                    autoComplete="new-password"
                                    className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                                    placeholder="Create a strong password"
                                />
                                <p className="mt-1 text-xs text-slate-500">Must be at least 8 characters</p>
                            </div>

                            {/* Confirm Password */}
                            <div>
                                <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-300 mb-2">
                                    Confirm Password
                                </label>
                                <input
                                    id="confirmPassword"
                                    name="confirmPassword"
                                    type="password"
                                    value={formData.confirmPassword}
                                    onChange={handleChange}
                                    required
                                    autoComplete="new-password"
                                    className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                                    placeholder="Confirm your password"
                                />
                            </div>

                            {/* Info box */}
                            <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl">
                                <div className="flex items-start gap-3">
                                    <svg className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <div className="text-sm text-slate-400">
                                        <p className="text-blue-300 font-medium mb-1">Administrator Account</p>
                                        <p>This account will have full administrative access to manage users, settings, and all security features.</p>
                                    </div>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500 disabled:from-slate-600 disabled:to-slate-600 text-white rounded-xl font-medium transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
                            >
                                {isLoading ? (
                                    <>
                                        <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full"></div>
                                        Setting up...
                                    </>
                                ) : (
                                    <>
                                        Create Admin Account
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                        </svg>
                                    </>
                                )}
                            </button>
                        </form>
                    </div>

                    {/* Footer */}
                    <div className="mt-8 text-center text-slate-600 text-sm">
                        MicroSeem - Open Source Microsoft 365 SIEM
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FirstTimeSetup;
