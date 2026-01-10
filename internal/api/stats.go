package api

import (
	"net/http"
	"time"

	"github.com/socr/o365-monitor/internal/database"
	"github.com/socr/o365-monitor/internal/models"
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
	stats := StatsResponse{}

	now := time.Now()
	last24h := now.Add(-24 * time.Hour)

	// Total Logs 24h
	database.DB.Model(&models.AuditLog{}).Where("creation_time > ?", last24h).Count(&stats.Total24h)

	// Total Alerts 24h
	database.DB.Model(&models.Alert{}).Where("created_at > ?", last24h).Count(&stats.TotalAlerts24h)

	// Top Users
	database.DB.Model(&models.AuditLog{}).
		Select("user_id as key, count(*) as count").
		Where("creation_time > ?", last24h).
		Group("user_id").
		Order("count desc").
		Limit(5).
		Scan(&stats.TopUsers)

	// Top Operations
	database.DB.Model(&models.AuditLog{}).
		Select("operation as key, count(*) as count").
		Where("creation_time > ?", last24h).
		Group("operation").
		Order("count desc").
		Limit(5).
		Scan(&stats.TopOperations)

	// Volume History (Last 24 hours grouped by hour)
	// Postgres dependent query
	rows, err := database.DB.Raw(`
		SELECT to_char(creation_time, 'HH24:00') as time, count(*) as count
		FROM audit_logs
		WHERE creation_time > ?
		GROUP BY 1
		ORDER BY 1
	`, last24h).Rows()

	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var v VolumeItem
			rows.Scan(&v.Time, &v.Count)
			stats.VolumeHistory = append(stats.VolumeHistory, v)
		}
	}

	respondJSON(w, stats)
}
