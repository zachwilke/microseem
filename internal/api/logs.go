package api

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/socr/o365-monitor/internal/middleware"
	"github.com/socr/o365-monitor/internal/store"
)

func RegisterLogRoutes(r chi.Router) {
	r.Get("/logs", ListLogs)
}

type Filter struct {
	Field    string `json:"field"`
	Operator string `json:"operator"` // "=", "contains", "!="
	Value    string `json:"value"`
}

func ListLogs(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())

	// Build search params
	params := store.SearchParams{
		OrgID: orgID,
		Size:  100,
	}

	// Tenant Filter
	tenantID := r.URL.Query().Get("tenant_id")
	if tenantID != "" {
		if tid, err := uuid.Parse(tenantID); err == nil {
			params.TenantID = &tid
		}
	}

	// Date Range Params
	startDate := r.URL.Query().Get("start")
	endDate := r.URL.Query().Get("end")

	if startDate != "" {
		if t, err := time.Parse(time.RFC3339, startDate); err == nil {
			params.StartTime = &t
		}
	}
	if endDate != "" {
		if t, err := time.Parse(time.RFC3339, endDate); err == nil {
			params.EndTime = &t
		}
	}

	// Search Query
	params.Query = r.URL.Query().Get("q")
	params.Fuzzy = r.URL.Query().Get("fuzzy") == "true"

	// Advanced Filters
	filtersParam := r.URL.Query().Get("filters")
	if filtersParam != "" {
		var filters []Filter
		if err := json.Unmarshal([]byte(filtersParam), &filters); err == nil {
			for _, f := range filters {
				params.Filters = append(params.Filters, store.Filter{
					Field:    f.Field,
					Operator: f.Operator,
					Value:    f.Value,
				})
			}
		}
	}

	// Execute search
	ctx := context.Background()
	result, err := store.SearchLogs(ctx, params)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Transform to match expected frontend format
	type LogWithTenant struct {
		ID             string                 `json:"id"`
		OrganizationID string                 `json:"organization_id"`
		TenantID       string                 `json:"tenant_id"`
		TenantName     string                 `json:"tenant_name"`
		RecordType     int                    `json:"record_type"`
		CreationTime   time.Time              `json:"creation_time"`
		Operation      string                 `json:"operation"`
		Workload       string                 `json:"workload"`
		UserId         string                 `json:"user_id"`
		ClientIP       string                 `json:"client_ip"`
		City           string                 `json:"city"`
		CountryCode    string                 `json:"country_code"`
		Latitude       float64                `json:"latitude"`
		Longitude      float64                `json:"longitude"`
		RawData        map[string]interface{} `json:"raw_data"`
		IngestedAt     time.Time              `json:"ingested_at"`
	}

	logs := make([]LogWithTenant, 0, len(result.Logs))
	for _, doc := range result.Logs {
		log := LogWithTenant{
			ID:             doc.ID,
			OrganizationID: doc.OrganizationID,
			TenantID:       doc.TenantID,
			TenantName:     "", // Could be fetched separately if needed
			RecordType:     doc.RecordType,
			CreationTime:   doc.CreationTime,
			Operation:      doc.Operation,
			Workload:       doc.Workload,
			UserId:         doc.UserID,
			ClientIP:       doc.ClientIP,
			City:           doc.City,
			CountryCode:    doc.CountryCode,
			RawData:        doc.RawData,
			IngestedAt:     doc.IngestedAt,
		}
		if doc.Location != nil {
			log.Latitude = doc.Location.Lat
			log.Longitude = doc.Location.Lon
		}
		logs = append(logs, log)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(logs)
}
