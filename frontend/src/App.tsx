import React, { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Dashboard from './components/Dashboard';
import LiveLogs from './components/LiveLogs';
import LogInspector from './components/LogInspector';
import WorldMap from './components/WorldMap';
import Alerts from './components/Alerts';
import Settings from './components/Settings';

function App() {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

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
                    <Route path="/alerts" element={
                        <div className="animate-in fade-in duration-300">
                            <div className="mb-4">
                                <h1 className="text-3xl font-bold text-white tracking-tight">Threat Detection</h1>
                                <p className="text-slate-400 mt-2 font-light">Manage detection rules and view security alerts.</p>
                            </div>
                            <Alerts />
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

export default App;
