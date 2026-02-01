import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { UserButton, OrganizationSwitcher } from '@clerk/clerk-react';

interface NavbarProps {
    isOpen: boolean;
    onToggle: () => void;
}

const Navbar: React.FC<NavbarProps> = ({ isOpen, onToggle }) => {
    const location = useLocation();

    // Map paths to tab IDs properly
    const getActiveTab = (path: string) => {
        if (path === '/') return 'dashboard';
        if (path.startsWith('/live')) return 'livelogs';
        if (path.startsWith('/inspector')) return 'inspector';
        if (path.startsWith('/map')) return 'map';
        if (path.startsWith('/investigations')) return 'investigations';
        if (path.startsWith('/alerts')) return 'alerts';
        if (path.startsWith('/analytics')) return 'analytics';
        if (path.startsWith('/settings')) return 'settings';
        return 'dashboard';
    };

    const activeTab = getActiveTab(location.pathname);

    const navItems = [
        {
            id: 'dashboard', path: '/', label: 'Dashboard', icon: (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
            )
        },
        {
            id: 'livelogs', path: '/live', label: 'Live Feed', icon: (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            )
        },
        {
            id: 'inspector', path: '/inspector', label: 'Inspect', icon: (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            )
        },
        {
            id: 'map', path: '/map', label: 'Map', icon: (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            )
        },
        {
            id: 'investigations', path: '/investigations', label: 'Investigations', icon: (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
            )
        },
        {
            id: 'alerts', path: '/alerts', label: 'Threats', icon: (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            )
        },
        {
            id: 'analytics', path: '/analytics', label: 'Analytics', icon: (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
            )
        },
        {
            id: 'settings', path: '/settings', label: 'Settings', icon: (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            )
        },
    ];

    return (
        <nav
            className={`fixed top-0 left-0 h-full bg-[#0b1120] border-r border-white/5 transition-all duration-300 z-50 flex flex-col ${isOpen ? 'w-64' : 'w-20'}`}
        >
            {/* Header / Logo */}
            <div className={`h-16 flex items-center px-4 border-b border-white/5 ${isOpen ? 'justify-between' : 'justify-center'}`}>
                {isOpen ? (
                    <div className="flex items-center gap-3 overflow-hidden whitespace-nowrap">
                        <div className="relative h-8 w-8 rounded-lg bg-slate-900 flex items-center justify-center border border-white/10 flex-shrink-0">
                            <span className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">M</span>
                        </div>
                        <span className="font-bold text-white tracking-tight">MicroSeem</span>
                    </div>
                ) : (
                    <div className="relative h-8 w-8 rounded-lg bg-slate-900 flex items-center justify-center border border-white/10">
                        <span className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">M</span>
                    </div>
                )}

                {/* Toggle Button */}
                {isOpen && (
                    <button onClick={onToggle} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" /></svg>
                    </button>
                )}
            </div>

            {/* Organization Switcher */}
            {isOpen && (
                <div className="px-3 py-4 border-b border-white/5">
                    <OrganizationSwitcher
                        appearance={{
                            elements: {
                                rootBox: 'w-full',
                                organizationSwitcherTrigger: 'w-full bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-white hover:bg-slate-800',
                            }
                        }}
                    />
                </div>
            )}

            {/* Nav Links */}
            <div className="flex-1 py-6 space-y-2 px-3 overflow-y-auto">
                {/* Explicit Toggle Button when collapsed */}
                {!isOpen && (
                    <div className="flex justify-center mb-6">
                        <button onClick={onToggle} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
                        </button>
                    </div>
                )}

                {navItems.map(item => (
                    <Link
                        key={item.id}
                        to={item.path}
                        className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 group relative
                            ${activeTab === item.id
                                ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20 shadow-[0_0_15px_rgba(37,99,235,0.1)]'
                                : 'text-slate-400 hover:text-white hover:bg-white/5'
                            }
                            ${!isOpen ? 'justify-center' : ''}
                        `}
                        title={!isOpen ? item.label : ''}
                    >
                        <span className={`${activeTab === item.id ? 'text-blue-400' : 'text-slate-400 group-hover:text-white'}`}>
                            {item.icon}
                        </span>

                        {isOpen && (
                            <span className="text-sm font-medium whitespace-nowrap overflow-hidden">
                                {item.label}
                            </span>
                        )}

                        {/* Active Indicator Bar */}
                        {activeTab === item.id && (
                            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-blue-500 rounded-r-full"></div>
                        )}
                    </Link>
                ))}
            </div>

            {/* Footer / User */}
            <div className="p-4 border-t border-white/5">
                <div className={`flex items-center gap-3 ${!isOpen ? 'justify-center' : ''}`}>
                    <UserButton
                        appearance={{
                            elements: {
                                avatarBox: 'h-8 w-8',
                            }
                        }}
                    />
                    {isOpen && (
                        <div className="overflow-hidden flex-1">
                            <div className="text-sm font-medium text-white truncate">Account</div>
                            <div className="text-xs text-slate-500 truncate">Manage Profile</div>
                        </div>
                    )}
                </div>
            </div>
        </nav>
    );
};

export default Navbar;
