import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import api from './lib/api';
import Navbar from './components/Navbar';
import Dashboard from './components/Dashboard';
import LiveLogs from './components/LiveLogs';
import LogInspector from './components/LogInspector';
import WorldMap from './components/WorldMap';
import Alerts from './components/Alerts';
import Integrations from './components/Integrations';
import Settings from './components/Settings';
import Investigations from './components/Investigations';
import InvestigationDetail from './components/InvestigationDetail';
import KibanaEmbed from './components/KibanaEmbed';
import Onboarding from './components/Onboarding';
import Login from './components/Login';
import Register from './components/Register';
import FirstTimeSetup from './components/FirstTimeSetup';

function AppContent() {
    const { user, isLoading: authLoading } = useAuth();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null);
    const [checkingOnboarding, setCheckingOnboarding] = useState(true);

    useEffect(() => {
        if (!authLoading && user) {
            checkOnboardingStatus();
        } else if (!authLoading && !user) {
            setCheckingOnboarding(false);
            setNeedsOnboarding(false);
        }
    }, [authLoading, user]);

    const checkOnboardingStatus = async () => {
        try {
            const response = await api.get('/tenants');
            const tenants = response.data || [];
            setNeedsOnboarding(tenants.length === 0);
        } catch (error) {
            console.error('Failed to check onboarding status:', error);
            // Assume onboarding needed if we can't check
            setNeedsOnboarding(true);
        } finally {
            setCheckingOnboarding(false);
        }
    };

    const handleOnboardingComplete = () => {
        setNeedsOnboarding(false);
    };

    // Show loading while checking onboarding status
    if (authLoading || checkingOnboarding) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center">
                <div className="text-center">
                    <div className="relative w-16 h-16 mx-auto mb-4">
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-600 to-emerald-600 rounded-xl animate-pulse"></div>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-2xl font-bold text-white">M</span>
                        </div>
                    </div>
                    <div className="flex items-center justify-center gap-2 text-slate-400">
                        <div className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full"></div>
                        Loading...
                    </div>
                </div>
            </div>
        );
    }

    // Show onboarding if needed
    if (needsOnboarding) {
        return <Onboarding onComplete={handleOnboardingComplete} />;
    }

    // Main app
    return (
        <div className="min-h-screen bg-slate-900 pb-20">
            <Navbar
                isOpen={isSidebarOpen}
                onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
            />

            {/* Main Content */}
            <main
                className={`
                    transition-all duration-300
                    ${isSidebarOpen ? 'ml-64' : 'ml-20'}
                    p-8
                    min-h-screen
                `}
            >
                <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/live" element={
                        <div className="animate-in fade-in duration-300">
                            <div className="mb-4">
                                <h1 className="text-3xl font-bold text-white tracking-tight">Real-Time Stream</h1>
                                <p className="text-slate-400 mt-2 font-light">Watching live events from all connected tenants.</p>
                            </div>
                            <LiveLogs />
                        </div>
                    } />
                    <Route path="/inspector" element={
                        <div className="animate-in fade-in duration-300">
                            <div className="mb-4">
                                <h1 className="text-3xl font-bold text-white tracking-tight">Audit Inspector</h1>
                                <p className="text-slate-400 mt-2 font-light">Search, filter, and analyze historical audit logs.</p>
                            </div>
                            <LogInspector />
                        </div>
                    } />
                    <Route path="/map" element={
                        <div className="animate-in fade-in duration-300 h-[calc(100vh-8rem)] flex flex-col">
                            <div className="mb-4">
                                <h1 className="text-3xl font-bold text-white tracking-tight">Global Threat Map</h1>
                                <p className="text-slate-400 mt-2 font-light">Fullscreen view of real-time geo-located activity.</p>
                            </div>
                            <div className="flex-1 min-h-0 bg-slate-800 rounded-xl overflow-hidden border border-white/5 shadow-2xl">
                                <WorldMap />
                            </div>
                        </div>
                    } />
                    <Route path="/investigations" element={
                        <div className="animate-in fade-in duration-300">
                            <Investigations />
                        </div>
                    } />
                    <Route path="/investigations/:id" element={
                        <div className="animate-in fade-in duration-300">
                            <InvestigationDetail />
                        </div>
                    } />
                    <Route path="/alerts" element={
                        <div className="animate-in fade-in duration-300">
                            <div className="mb-4">
                                <h1 className="text-3xl font-bold text-white tracking-tight">Threat Detection</h1>
                                <p className="text-slate-400 mt-2 font-light">Manage detection rules and view security alerts.</p>
                            </div>
                            <Alerts />
                        </div>
                    } />
                    <Route path="/integrations" element={
                        <div className="animate-in fade-in duration-300">
                            <Integrations />
                        </div>
                    } />
                    <Route path="/analytics" element={
                        <div className="animate-in fade-in duration-300 h-[calc(100vh-8rem)] flex flex-col">
                            <div className="mb-4">
                                <h1 className="text-3xl font-bold text-white tracking-tight">Analytics</h1>
                                <p className="text-slate-400 mt-2 font-light">Advanced analytics powered by Kibana.</p>
                            </div>
                            <KibanaEmbed />
                        </div>
                    } />
                    <Route path="/settings" element={
                        <div className="animate-in fade-in duration-300">
                            <div className="mb-8">
                                <h1 className="text-3xl font-bold text-white">Settings</h1>
                                <p className="text-slate-400 mt-2">Manage tenants and API configurations.</p>
                            </div>
                            <Settings />
                        </div>
                    } />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </main>
        </div>
    );
}

function App() {
    const { isAuthenticated, isLoading, checkSetupStatus } = useAuth();
    const [needsFirstSetup, setNeedsFirstSetup] = useState<boolean | null>(null);
    const [checkingSetup, setCheckingSetup] = useState(true);

    useEffect(() => {
        const checkFirstTimeSetup = async () => {
            try {
                const status = await checkSetupStatus();
                setNeedsFirstSetup(status.needs_setup);
            } catch {
                setNeedsFirstSetup(false);
            } finally {
                setCheckingSetup(false);
            }
        };

        if (!isLoading) {
            checkFirstTimeSetup();
        }
    }, [isLoading, checkSetupStatus]);

    // Show loading state
    if (isLoading || checkingSetup) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center">
                <div className="text-center">
                    <div className="relative w-16 h-16 mx-auto mb-4">
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-600 to-emerald-600 rounded-xl animate-pulse"></div>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-2xl font-bold text-white">M</span>
                        </div>
                    </div>
                    <div className="flex items-center justify-center gap-2 text-slate-400">
                        <div className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full"></div>
                        Loading...
                    </div>
                </div>
            </div>
        );
    }

    // Show first-time setup if no users exist
    if (needsFirstSetup && !isAuthenticated) {
        return <FirstTimeSetup onComplete={() => setNeedsFirstSetup(false)} />;
    }

    // Show auth pages for unauthenticated users
    if (!isAuthenticated) {
        return (
            <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
        );
    }

    // Show main app for authenticated users
    return <AppContent />;
}

export default App;
