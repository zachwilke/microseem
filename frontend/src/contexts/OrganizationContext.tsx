import React, { createContext, useContext, useMemo } from 'react';
import { useOrganization, useAuth } from '@clerk/clerk-react';

interface OrganizationContextType {
    organizationId: string | null;
    organizationName: string | null;
    isLoaded: boolean;
    getToken: () => Promise<string | null>;
}

const OrganizationContext = createContext<OrganizationContextType | null>(null);

export const OrganizationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { organization, isLoaded: orgLoaded } = useOrganization();
    const { getToken, isLoaded: authLoaded } = useAuth();

    const value = useMemo(() => ({
        organizationId: organization?.id || null,
        organizationName: organization?.name || null,
        isLoaded: orgLoaded && authLoaded,
        getToken: async () => {
            try {
                return await getToken();
            } catch {
                return null;
            }
        },
    }), [organization, orgLoaded, authLoaded, getToken]);

    return (
        <OrganizationContext.Provider value={value}>
            {children}
        </OrganizationContext.Provider>
    );
};

export const useOrganizationContext = () => {
    const context = useContext(OrganizationContext);
    if (!context) {
        throw new Error('useOrganizationContext must be used within an OrganizationProvider');
    }
    return context;
};
