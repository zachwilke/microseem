package api

import (
	"context"
	"net/http"

	"github.com/google/uuid"
	"github.com/socr/o365-monitor/internal/database"
	"github.com/socr/o365-monitor/internal/middleware"
	"github.com/socr/o365-monitor/internal/models"
	"github.com/socr/o365-monitor/internal/store"
)

type StatsResponse struct {
	Total24h       int64        `json:"total_24h"`
	TotalAlerts24h int64        `json:"total_alerts_24h"`
	TopUsers       []CountItem  `json:"top_users"`
	TopOperations  []CountItem  `json:"top_operations"`
	VolumeHistory  []VolumeItem `json:"volume_history"`
}

type CountItem struct {
	Key   string `json:"key"`
	Count int64  `json:"count"`
}

type VolumeItem struct {
	Time  string `json:"time"`
	Count int64  `json:"count"`
}

func GetStats(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())

	// Get tenant filter if provided
	var tenantID *uuid.UUID
	tenantIDStr := r.URL.Query().Get("tenant_id")
	if tenantIDStr != "" {
		if tid, err := uuid.Parse(tenantIDStr); err == nil {
			tenantID = &tid
		}
	}

	// Get stats from the active log store
	ctx := context.Background()
	logStats, err := store.GetStats(ctx, orgID, tenantID)
	if err != nil {
		// Fall back to empty stats on error
		respondJSON(w, StatsResponse{})
		return
	}

	stats := StatsResponse{
		Total24h:      logStats.TotalLogs,
		TopUsers:      make([]CountItem, 0),
		TopOperations: make([]CountItem, 0),
		VolumeHistory: make([]VolumeItem, 0),
	}

	// Convert log store results to API format
	for _, u := range logStats.TopUsers {
		stats.TopUsers = append(stats.TopUsers, CountItem{
			Key:   u.Key,
			Count: u.Count,
		})
	}

	for _, o := range logStats.TopOperations {
		stats.TopOperations = append(stats.TopOperations, CountItem{
			Key:   o.Key,
			Count: o.Count,
		})
	}

	for _, v := range logStats.VolumeHistory {
		stats.VolumeHistory = append(stats.VolumeHistory, VolumeItem{
			Time:  v.Time.Format("15:04"),
			Count: v.Count,
		})
	}

	// Get alert count from PostgreSQL (alerts still stored there)
	database.DB.Model(&models.Alert{}).
		Where("organization_id = ? AND created_at > NOW() - INTERVAL '24 hours'", orgID).
		Count(&stats.TotalAlerts24h)

	respondJSON(w, stats)
}
