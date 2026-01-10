package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/socr/o365-monitor/internal/database"
	"github.com/socr/o365-monitor/internal/models"
)

func RegisterLogRoutes(r chi.Router) {
	r.Get("/logs", ListLogs)
}

type Filter struct {
	Field    string `json:"field"`
	Operator string `json:"operator"` // "=", "contains"
	Value    string `json:"value"`
}

func ListLogs(w http.ResponseWriter, r *http.Request) {
	// Custom result struct to include TenantName
	type LogWithTenant struct {
		models.AuditLog
		TenantName string `json:"tenant_name"`
	}

	var results []LogWithTenant

	// Select specific fields or all from logs, plus tenant name
	// GORM Join
	query := database.DB.Table("audit_logs").
		Select("audit_logs.*, tenants.name as tenant_name").
		Joins("left join tenants on tenants.id = audit_logs.tenant_id").
		Order("audit_logs.creation_time desc").
		Limit(100)

	// Date Range Params
	startDate := r.URL.Query().Get("start")
	endDate := r.URL.Query().Get("end")

	if startDate != "" {
		if t, err := time.Parse(time.RFC3339, startDate); err == nil {
			query = query.Where("audit_logs.creation_time >= ?", t)
		}
	}
	if endDate != "" {
		if t, err := time.Parse(time.RFC3339, endDate); err == nil {
			query = query.Where("audit_logs.creation_time <= ?", t)
		}
	}

	// Advanced Filters (JSON array in 'filters' param)
	filtersParam := r.URL.Query().Get("filters")
	if filtersParam != "" {
		var filters []Filter
		if err := json.Unmarshal([]byte(filtersParam), &filters); err == nil {
			for _, f := range filters {
				if f.Value == "" {
					continue
				}

				// Map generic fields to DB columns where appropriate, else RawData
				// For simplicity, we prioritize RawData for the "Wazuh-like" feel on arbitrary JSON fields

				if f.Operator == "=" {
					// STRICT MATCH: Use GIN Index (@>)
					// Construct a JSON object string for containment: {"Field": "Value"}
					// We need to be careful with types, but generally logs store strings.
					// RawData is map[string]interface{}.

					// We construct a map to marshal to JSON for the query
					filterMap := map[string]interface{}{
						f.Field: f.Value,
					}
					filterJson, _ := json.Marshal(filterMap)

					// Uses GIN index if available on raw_data
					query = query.Where("audit_logs.raw_data @> ?", string(filterJson))

				} else if f.Operator == "contains" {
					// PARTIAL MATCH: Use ->> operator and ILIKE (Index scan not guaranteed for ILIKE without trigram)
					query = query.Where("audit_logs.raw_data ->> ? ILIKE ?", f.Field, "%"+f.Value+"%")
				}
			}
		}
	}

	// Search Query (q param)
	q := r.URL.Query().Get("q")
	fuzzy := r.URL.Query().Get("fuzzy") == "true"

	if q != "" {
		likeQ := "%" + q + "%"
		if fuzzy {
			// Use pg_trgm similarity for fuzzy matching
			// We combine fields into a document or search individually with OR
			// "raw_data::text % ?" uses the trgm index
			query = query.Where(
				"audit_logs.operation % ? OR audit_logs.user_id % ? OR audit_logs.raw_data::text % ?",
				q, q, q,
			)
			// Order by similarity
			query = query.Order(fmt.Sprintf("SIMILARITY(audit_logs.raw_data::text, '%s') DESC", q))
		} else {
			// Standard partial match
			query = query.Where(
				"audit_logs.operation ILIKE ? OR audit_logs.user_id ILIKE ? OR audit_logs.raw_data::text ILIKE ?",
				likeQ, likeQ, likeQ,
			)
		}
	}

	result := query.Scan(&results) // Scan into custom struct slice
	if result.Error != nil {
		http.Error(w, result.Error.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(results)
}
