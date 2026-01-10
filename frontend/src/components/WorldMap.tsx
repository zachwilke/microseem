import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';
import LogDetailsModal from './LogDetailsModal';

// Custom Icon fix for Leaflet + Vite/Webpack issues
const DefaultIcon = L.icon({
    iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

interface WorldMapProps {
    tenantId?: string;
}

const WorldMap: React.FC<WorldMapProps> = ({ tenantId }) => {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<L.Map | null>(null);
    const wsRef = useRef<WebSocket | null>(null);

    // Track markers by Log ID (or unique key)
    // Key: string (log ID or temporary ID), Value: { marker: L.CircleMarker, timestamp: number }
    const markersRef = useRef<Map<string, { marker: L.CircleMarker; timestamp: number }>>(new Map());

    const [selectedLog, setSelectedLog] = useState<any>(null);

    const handleLog = (log: any) => {
        if (!log.latitude || !log.longitude || !mapRef.current) return;

        // Ensure uniqueness if possible, fallback to random if no ID
        const logId = log.ID || log.id || Math.random().toString(36);

        // If already exists, ignore (deduplication)
        if (markersRef.current.has(logId)) return;

        const latlng: L.LatLngExpression = [log.latitude, log.longitude];

        // Determine color based on operation (reusing logic from LiveLogs generally)
        let color = "#3b82f6"; // Blue
        let fillColor = "#60a5fa";
        const op = (log.operation || "").toLowerCase();

        if (op.includes('fail')) { color = "#ef4444"; fillColor = "#f87171"; }      // Red
        else if (op.includes('delete')) { color = "#f97316"; fillColor = "#fb923c"; } // Orange
        else if (op.includes('admin')) { color = "#a855f7"; fillColor = "#c084fc"; }  // Purple

        const marker = L.circleMarker(latlng, {
            radius: 5,
            fillColor: fillColor,
            color: color,
            weight: 1,
            opacity: 1,
            fillOpacity: 0.8
        }).addTo(mapRef.current);

        // Tooltip for quick hover info
        marker.bindTooltip(`
            <div class="font-sans text-xs">
                <div class="font-bold">${log.city || "Unknown"}, ${log.country_code || ""}</div>
                <div class="text-blue-300">${log.operation}</div>
            </div>
        `, {
            direction: 'top',
            offset: [0, -5],
            className: 'bg-slate-900 border border-slate-700 text-white px-2 py-1 rounded shadow-xl'
        });

        // Click to open details
        marker.on('click', () => {
            setSelectedLog(log);
        });

        // Store reference
        let ts = new Date(log.creation_time).getTime();
        if (isNaN(ts)) ts = Date.now();

        markersRef.current.set(logId, { marker, timestamp: ts });
    };

    const fetchHistory = async () => {
        try {
            // Fetch last 15 minutes
            const start = new Date(Date.now() - 15 * 60 * 1000).toISOString();
            const res = await axios.get('http://localhost:8080/api/logs', {
                params: { start: start, limit: 2000 } // Reasonable limit for map points
            });
            const logs = res.data || [];
            console.log(`[Map] Fetched ${logs.length} logs from last 15m`);
            logs.forEach((log: any) => handleLog(log));
        } catch (e) {
            console.error("[Map] Failed to fetch history", e);
        }
    };

    const pruneMarkers = () => {
        const now = Date.now();
        const cutoff = now - 15 * 60 * 1000; // 15 mins ago

        markersRef.current.forEach((value, key) => {
            if (value.timestamp < cutoff) {
                if (mapRef.current) {
                    mapRef.current.removeLayer(value.marker);
                }
                markersRef.current.delete(key);
            }
        });
    };

    const connectWS = () => {
        if (wsRef.current) wsRef.current.close();

        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const host = "localhost:8080";
        const ws = new WebSocket(`${protocol}//${host}/api/ws`);
        wsRef.current = ws;

        ws.onopen = () => console.log("Map WS Connected");

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'log' && msg.payload) {
                    handleLog(msg.payload);
                } else if (msg.type === 'logs' && Array.isArray(msg.payload)) {
                    msg.payload.forEach((l: any) => handleLog(l));
                }
            } catch (err) {
                console.error("WS Parse Error", err);
            }
        };

        ws.onclose = () => {
            // Simple retry logic could go here
        };
    };

    useEffect(() => {
        if (mapContainerRef.current && !mapRef.current) {
            mapRef.current = L.map(mapContainerRef.current, {
                center: [20, 0],
                zoom: 2,
                zoomControl: false,
                attributionControl: false,
                minZoom: 2,
                maxBounds: [[-90, -180], [90, 180]]
            });

            L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
                attribution: '&copy; OpenStreetMap &copy; CARTO',
                subdomains: "abcd",
                maxZoom: 19,
            }).addTo(mapRef.current);

            connectWS();
            fetchHistory();
        } else {
            // If map already exists but tenantId changed, re-fetch
            // Note: This logic assumes markers are just added, we should probably clear for a clean switch if implementing dynamic switching
            // For now, simpler to just remount or implement clear logic.
            // Given how we use it, a key change on the component in parent is easiest. 
            // But if we want it internal:
            // clear all markers
            // fetchHistory()
        }

        // Pruning Interval
        const intervalId = setInterval(pruneMarkers, 10000); // Check every 10s

        return () => {
            clearInterval(intervalId);
            if (wsRef.current) wsRef.current.close();
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
            }
        };
    }, [tenantId]);

    return (
        <div className="glass-panel rounded-2xl overflow-hidden p-1 border border-white/5 shadow-2xl relative h-full w-full">
            <div className="absolute top-4 left-4 z-[400] bg-slate-900/80 backdrop-blur px-3 py-1 rounded-lg border border-white/10 text-xs text-slate-300 font-mono shadow-lg flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                LIVE ACTIVITY (15m RAW)
            </div>

            <div ref={mapContainerRef} className="w-full h-full rounded-xl bg-slate-900 z-0"></div>

            <LogDetailsModal log={selectedLog} onClose={() => setSelectedLog(null)} />

            <style>{`
                .leaflet-container {
                    background: #0f172a;
                }
                .leaflet-tooltip {
                    background: transparent;
                    border: none;
                    box-shadow: none;
                }
            `}</style>
        </div>
    );
};

export default WorldMap;
