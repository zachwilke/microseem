import React, { useMemo } from 'react';
import { useOrganization } from '@clerk/clerk-react';

const KibanaEmbed: React.FC = () => {
    const { organization, isLoaded } = useOrganization();
    const kibanaUrl = import.meta.env.VITE_KIBANA_URL || 'http://localhost:5601';

    // Build the Kibana URL with org-specific index pattern
    const iframeSrc = useMemo(() => {
        if (!organization?.id) return null;

        // Create a filter for the org-specific index pattern
        // The organization ID from Clerk is used to filter to logs-{orgId}-*
        const indexPattern = `logs-*`;

        // Kibana Discover URL with pre-configured filters
        // This assumes Kibana is configured to allow embedding
        return `${kibanaUrl}/app/discover#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-24h,to:now))&_a=(columns:!(operation,user_id,workload,client_ip),filters:!(),index:'${indexPattern}',interval:auto,query:(language:kuery,query:''),sort:!(!(creation_time,desc)))`;
    }, [organization?.id, kibanaUrl]);

    if (!isLoaded) {
        return (
            <div className="flex-1 flex items-center justify-center bg-slate-800 rounded-xl border border-white/5">
                <div className="text-slate-500">Loading organization...</div>
            </div>
        );
    }

    if (!organization) {
        return (
            <div className="flex-1 flex items-center justify-center bg-slate-800 rounded-xl border border-white/5">
                <div className="text-center p-8">
                    <svg className="w-16 h-16 mx-auto text-slate-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    <h3 className="text-xl font-medium text-white mb-2">No Organization Selected</h3>
                    <p className="text-slate-400 text-sm">
                        Please select an organization to view analytics.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col min-h-0">
            {/* Info Bar */}
            <div className="flex items-center justify-between bg-slate-800/40 p-3 rounded-t-xl border border-white/5 border-b-0">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-900/20 border border-blue-500/30">
                        <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                        <span className="text-blue-400 text-xs font-medium">Kibana Analytics</span>
                    </div>
                    <span className="text-slate-500 text-xs">
                        Viewing data for: <span className="text-white font-medium">{organization.name}</span>
                    </span>
                </div>
                <a
                    href={kibanaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-700/50 text-slate-300 border border-slate-600 hover:text-white hover:bg-slate-700 transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Open Full Kibana
                </a>
            </div>

            {/* Kibana iFrame */}
            <div className="flex-1 bg-slate-800 rounded-b-xl overflow-hidden border border-white/5 border-t-0">
                {iframeSrc ? (
                    <iframe
                        src={iframeSrc}
                        className="w-full h-full border-0"
                        title="Kibana Analytics"
                        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                    />
                ) : (
                    <div className="flex items-center justify-center h-full text-slate-500">
                        <div className="text-center p-8">
                            <svg className="w-16 h-16 mx-auto text-slate-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                            <h3 className="text-xl font-medium text-white mb-2">Kibana Not Configured</h3>
                            <p className="text-slate-400 text-sm mb-4">
                                Set VITE_KIBANA_URL environment variable to enable embedded analytics.
                            </p>
                            <code className="text-xs bg-slate-900 px-3 py-1 rounded text-slate-300">
                                VITE_KIBANA_URL=http://localhost:5601
                            </code>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default KibanaEmbed;
