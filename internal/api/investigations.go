package api

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/socr/o365-monitor/internal/database"
	"github.com/socr/o365-monitor/internal/middleware"
	"github.com/socr/o365-monitor/internal/models"
	"github.com/socr/o365-monitor/internal/store"
)

func RegisterInvestigationRoutes(r chi.Router) {
	r.Route("/investigations", func(r chi.Router) {
		r.Get("/", ListInvestigations)
		r.Post("/", CreateInvestigation)
		r.Route("/{id}", func(r chi.Router) {
			r.Get("/", GetInvestigation)
			r.Put("/", UpdateInvestigation)
			r.Delete("/", DeleteInvestigation)
			r.Get("/export", ExportInvestigationCsv)
		})
	})
}

func ListInvestigations(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())

	var invs []models.Investigation
	if err := database.DB.Where("organization_id = ?", orgID).Order("updated_at desc").Find(&invs).Error; err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(invs)
}

func CreateInvestigation(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())

	var inv models.Investigation
	if err := json.NewDecoder(r.Body).Decode(&inv); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Set organization ID
	inv.OrganizationID = orgID

	if err := database.DB.Create(&inv).Error; err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(inv)
}

func GetInvestigation(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	id := chi.URLParam(r, "id")

	var inv models.Investigation
	if err := database.DB.First(&inv, "id = ? AND organization_id = ?", id, orgID).Error; err != nil {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(inv)
}

func UpdateInvestigation(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	id := chi.URLParam(r, "id")

	var inv models.Investigation
	if err := database.DB.First(&inv, "id = ? AND organization_id = ?", id, orgID).Error; err != nil {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}

	var update models.Investigation
	if err := json.NewDecoder(r.Body).Decode(&update); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	inv.Name = update.Name
	inv.Description = update.Description
	inv.Filters = update.Filters
	inv.UpdatedAt = time.Now()

	if err := database.DB.Save(&inv).Error; err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(inv)
}

func DeleteInvestigation(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	id := chi.URLParam(r, "id")

	result := database.DB.Delete(&models.Investigation{}, "id = ? AND organization_id = ?", id, orgID)
	if result.Error != nil {
		http.Error(w, result.Error.Error(), http.StatusInternalServerError)
		return
	}

	if result.RowsAffected == 0 {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusOK)
}

// ExportInvestigationCsv streams the logs based on the investigation filters from Elasticsearch
func ExportInvestigationCsv(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	id := chi.URLParam(r, "id")

	var inv models.Investigation
	if err := database.DB.First(&inv, "id = ? AND organization_id = ?", id, orgID).Error; err != nil {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}

	// Parse stored filters
	type FilterState struct {
		StartDate   string `json:"start"`
		EndDate     string `json:"end"`
		SearchQuery string `json:"q"`
		IsFuzzy     bool   `json:"fuzzy"`
		Filters     []struct {
			Field    string `json:"field"`
			Operator string `json:"operator"`
			Value    string `json:"value"`
		} `json:"filters"`
	}

	var state FilterState
	json.Unmarshal(inv.Filters, &state)

	// Build log store search params
	params := store.SearchParams{
		OrgID: orgID,
		Size:  10000, // Export limit
	}

	if state.StartDate != "" {
		if t, err := time.Parse(time.RFC3339, state.StartDate); err == nil {
			params.StartTime = &t
		}
	}
	if state.EndDate != "" {
		if t, err := time.Parse(time.RFC3339, state.EndDate); err == nil {
			params.EndTime = &t
		}
	}

	params.Query = state.SearchQuery
	params.Fuzzy = state.IsFuzzy

	for _, f := range state.Filters {
		if f.Value == "" {
			continue
		}
		params.Filters = append(params.Filters, store.Filter{
			Field:    f.Field,
			Operator: f.Operator,
			Value:    f.Value,
		})
	}

	// Execute search
	ctx := context.Background()
	result, err := store.SearchLogs(ctx, params)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment;filename=investigation_%s.csv", id))

	writer := csv.NewWriter(w)
	defer writer.Flush()

	// Write Header
	writer.Write([]string{"Time", "Tenant", "Operation", "User", "IP", "Workload", "City", "Country"})

	for _, doc := range result.Logs {
		row := []string{
			doc.CreationTime.Format(time.RFC3339),
			doc.TenantID, // Would need lookup for name
			doc.Operation,
			doc.UserID,
			doc.ClientIP,
			doc.Workload,
			doc.City,
			doc.CountryCode,
		}
		writer.Write(row)
	}
}
