import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from '../lib/api';

export type Role = 'admin' | 'technician' | 'report_admin';

export interface User {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    role: Role;
    organization_id: string;
    organization: {
        id: string;
        name: string;
        slug: string;
    };
    is_active: boolean;
    created_at: string;
}

interface AuthState {
    user: User | null;
    isLoading: boolean;
    isAuthenticated: boolean;
}

interface AuthContextType extends AuthState {
    login: (email: string, password: string) => Promise<void>;
    register: (data: RegisterData) => Promise<void>;
    logout: () => Promise<void>;
    refreshUser: () => Promise<void>;
}

interface RegisterData {
    email: string;
    password: string;
    first_name: string;
    last_name: string;
    organization_name: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = 'microseem_access_token';
const REFRESH_KEY = 'microseem_refresh_token';

export function AuthProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<AuthState>({
        user: null,
        isLoading: true,
        isAuthenticated: false,
    });

    // Initialize auth state
    useEffect(() => {
        const initAuth = async () => {
            const token = localStorage.getItem(TOKEN_KEY);
            if (token) {
                try {
                    await refreshUser();
                } catch {
                    // Token invalid, try refresh
                    const refreshToken = localStorage.getItem(REFRESH_KEY);
                    if (refreshToken) {
                        try {
                            await refreshTokens(refreshToken);
                        } catch {
                            clearTokens();
                        }
                    } else {
                        clearTokens();
                    }
                }
            }
            setState(prev => ({ ...prev, isLoading: false }));
        };

        initAuth();
    }, []);

    // Set up axios interceptor for auth header
    useEffect(() => {
        const interceptor = api.interceptors.request.use((config) => {
            const token = localStorage.getItem(TOKEN_KEY);
            if (token) {
                config.headers.Authorization = `Bearer ${token}`;
            }
            return config;
        });

        // Response interceptor for token refresh
        const responseInterceptor = api.interceptors.response.use(
            (response) => response,
            async (error) => {
                const originalRequest = error.config;
                if (error.response?.status === 401 && !originalRequest._retry) {
                    originalRequest._retry = true;
                    const refreshToken = localStorage.getItem(REFRESH_KEY);
                    if (refreshToken) {
                        try {
                            await refreshTokens(refreshToken);
                            const token = localStorage.getItem(TOKEN_KEY);
                            originalRequest.headers.Authorization = `Bearer ${token}`;
                            return api(originalRequest);
                        } catch {
                            clearTokens();
                            setState({ user: null, isLoading: false, isAuthenticated: false });
                        }
                    }
                }
                return Promise.reject(error);
            }
        );

        return () => {
            api.interceptors.request.eject(interceptor);
            api.interceptors.response.eject(responseInterceptor);
        };
    }, []);

    const refreshTokens = async (refreshToken: string) => {
        const response = await api.post('/auth/refresh', { refresh_token: refreshToken });
        const { access_token, refresh_token, user } = response.data;
        localStorage.setItem(TOKEN_KEY, access_token);
        localStorage.setItem(REFRESH_KEY, refresh_token);
        setState({ user, isLoading: false, isAuthenticated: true });
    };

    const clearTokens = () => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_KEY);
        setState({ user: null, isLoading: false, isAuthenticated: false });
    };

    const login = async (email: string, password: string) => {
        const response = await api.post('/auth/login', { email, password });
        const { access_token, refresh_token, user } = response.data;
        localStorage.setItem(TOKEN_KEY, access_token);
        localStorage.setItem(REFRESH_KEY, refresh_token);
        setState({ user, isLoading: false, isAuthenticated: true });
    };

    const register = async (data: RegisterData) => {
        const response = await api.post('/auth/register', data);
        const { access_token, refresh_token, user } = response.data;
        localStorage.setItem(TOKEN_KEY, access_token);
        localStorage.setItem(REFRESH_KEY, refresh_token);
        setState({ user, isLoading: false, isAuthenticated: true });
    };

    const logout = async () => {
        const refreshToken = localStorage.getItem(REFRESH_KEY);
        if (refreshToken) {
            try {
                await api.post('/auth/logout', { refresh_token: refreshToken });
            } catch {
                // Ignore logout errors
            }
        }
        clearTokens();
    };

    const refreshUser = async () => {
        const response = await api.get('/users/me');
        setState({ user: response.data, isLoading: false, isAuthenticated: true });
    };

    return (
        <AuthContext.Provider value={{ ...state, login, register, logout, refreshUser }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

// Role-based permission helpers
export function usePermissions() {
    const { user } = useAuth();
    const role = user?.role;

    return {
        isAdmin: role === 'admin',
        isTechnician: role === 'technician',
        isReportAdmin: role === 'report_admin',
        canManageUsers: role === 'admin',
        canManageSettings: role === 'admin',
        canManageAlerts: role === 'admin' || role === 'technician',
        canManageIntegrations: role === 'admin',
        canViewLogs: true, // All authenticated users
        canViewAnalytics: true, // All authenticated users
        canManageInvestigations: role === 'admin' || role === 'technician',
    };
}
