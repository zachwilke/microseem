import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';

// Custom Icon fix for Leaflet + Vite/Webpack issues
const DefaultIcon = L.icon({
    iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

const WorldMap: React.FC = () => {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<L.Map | null>(null);
    const wsRef = useRef<WebSocket | null>(null);

    const handleLog = (log: any) => {
        if (log.latitude && log.longitude && mapRef.current) {
            const latlng: L.LatLngExpression = [log.latitude, log.longitude];

            const marker = L.circleMarker(latlng, {
                radius: 6,
                fillColor: "#3b82f6", // Blue-500
                color: "#60a5fa", // Blue-400
                weight: 1,
                opacity: 1,
                fillOpacity: 0.8
            }).addTo(mapRef.current);

            marker.bindPopup(`
                <div class="p-1 font-sans">
                    <div class="font-bold text-white text-sm mb-1">${log.city || "Unknown"}, ${log.country_code || ""}</div>
                    <div class="text-xs text-blue-400 font-medium mb-0.5">${log.operation}</div>
                    <div class="text-[10px] text-slate-400 font-mono">${log.user_id}</div>
                </div>
            `, {
                className: 'dark-popup'
            });

            // Animate/Remove after delay for "live" feel
            setTimeout(() => {
                if (mapRef.current) {
                    mapRef.current.removeLayer(marker);
                }
            }, 5000);
        }
    };

    const fetchRecentLogs = async () => {
        try {
            const res = await axios.get('http://localhost:8080/api/logs?limit=50');
            const logs = res.data || [];
            console.log(`[Map] Fetched ${logs.length} historical logs`);
            logs.forEach((log: any) => handleLog(log));
        } catch (e) {
            console.error("[Map] Failed to fetch history", e);
        }
    };

    const connectWS = () => {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const host = "localhost:8080";
        const ws = new WebSocket(`${protocol}//${host}/api/ws`);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log("Map WS Connected");
        };

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'log' && msg.payload) {
                    handleLog(msg.payload);
                }
            } catch (err) {
                console.error("WS Parse Error", err);
            }
        };

        ws.onclose = () => {
            console.log("Map WS Closed, retrying...");
            setTimeout(connectWS, 3000);
        };
    };

    useEffect(() => {
        if (mapContainerRef.current && !mapRef.current) {
            mapRef.current = L.map(mapContainerRef.current, {
                center: [20, 0],
                zoom: 2,
                zoomControl: false,
                attributionControl: false,
            });

            L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
                subdomains: "abcd",
                maxZoom: 19,
            }).addTo(mapRef.current);

            connectWS();
            fetchRecentLogs();
        }

        return () => {
            if (wsRef.current) {
                wsRef.current.close();
            }
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
            }
        };
    }, []);

    return (
        <div className="glass-panel rounded-2xl overflow-hidden p-1 border border-white/5 shadow-2xl relative h-full w-full">
            <div className="absolute top-4 left-4 z-[400] bg-slate-900/80 backdrop-blur px-3 py-1 rounded-lg border border-white/10 text-xs text-slate-300 font-mono shadow-lg">
                LIVE ACTIVITY MAP
            </div>
            <div ref={mapContainerRef} className="w-full h-full rounded-xl bg-slate-900"></div>
            <style>{`
                /* Custom Dark Popup Styles */
                .leaflet-popup-content-wrapper,
                .leaflet-popup-tip {
                    background: #1e293b; /* slate-800 */
                    color: #f8fafc; /* slate-50 */
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.5);
                }
                .leaflet-popup-content {
                    margin: 8px;
                }
                .leaflet-container {
                    font-family: inherit;
                }
            `}</style>
        </div>
    );
};

export default WorldMap;
