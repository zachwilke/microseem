import axios from 'axios';

// API base URL - uses env var in production, localhost in development
const getApiBase = () => {
    if (import.meta.env.VITE_API_URL) {
        return import.meta.env.VITE_API_URL;
    }
    // Development fallback
    return 'http://localhost:8080/api';
};

const API_BASE = getApiBase();

// Create axios instance with auth interceptor
export const api = axios.create({
    baseURL: API_BASE,
});

// Add auth token to requests
export const setAuthToken = (getToken: () => Promise<string | null>) => {
    api.interceptors.request.use(async (config) => {
        const token = await getToken();
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    });
};

export const getWebSocketUrl = (token: string) => {
    // Derive WebSocket URL from API URL or current location
    let wsHost: string;
    let wsProtocol: string;

    if (import.meta.env.VITE_API_URL) {
        const apiUrl = new URL(import.meta.env.VITE_API_URL);
        wsHost = apiUrl.host;
        wsProtocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    } else {
        // Development fallback
        wsHost = 'localhost:8080';
        wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    }

    return `${wsProtocol}//${wsHost}/api/ws?token=${encodeURIComponent(token)}`;
};

export default api;
