import axios from 'axios';

const API_BASE = 'http://localhost:8080/api';

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
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = "localhost:8080";
    return `${protocol}//${host}/api/ws?token=${encodeURIComponent(token)}`;
};

export default api;
