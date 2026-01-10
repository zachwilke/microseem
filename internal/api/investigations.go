package api

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/socr/o365-monitor/internal/database"
	"github.com/socr/o365-monitor/internal/models"
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
	var invs []models.Investigation
	if err := database.DB.Order("updated_at desc").Find(&invs).Error; err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(invs)
}

func CreateInvestigation(w http.ResponseWriter, r *http.Request) {
	var inv models.Investigation
	if err := json.NewDecoder(r.Body).Decode(&inv); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := database.DB.Create(&inv).Error; err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(inv)
}

func GetInvestigation(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var inv models.Investigation
	if err := database.DB.First(&inv, "id = ?", id).Error; err != nil {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}
	json.NewEncoder(w).Encode(inv)
}

func UpdateInvestigation(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var inv models.Investigation
	if err := database.DB.First(&inv, "id = ?", id).Error; err != nil {
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
	json.NewEncoder(w).Encode(inv)
}

func DeleteInvestigation(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := database.DB.Delete(&models.Investigation{}, "id = ?", id).Error; err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

// ExportInvestigationCsv streams the logs based on the investigation filters
func ExportInvestigationCsv(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var inv models.Investigation
	if err := database.DB.First(&inv, "id = ?", id).Error; err != nil {
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
	// datatypes.JSON is []byte
	json.Unmarshal(inv.Filters, &state)

	// Build Query (Similar to ListLogs but for all records)
	query := database.DB.Table("audit_logs").
		Select("audit_logs.*, tenants.name as tenant_name").
		Joins("left join tenants on tenants.id = audit_logs.tenant_id").
		Order("audit_logs.creation_time desc")

	if state.StartDate != "" {
		if t, err := time.Parse(time.RFC3339, state.StartDate); err == nil {
			query = query.Where("audit_logs.creation_time >= ?", t)
		}
	}
	if state.EndDate != "" {
		if t, err := time.Parse(time.RFC3339, state.EndDate); err == nil {
			query = query.Where("audit_logs.creation_time <= ?", t)
		}
	}

	// Apply Filters
	for _, f := range state.Filters {
		if f.Value == "" {
			continue
		}
		if f.Operator == "=" {
			filterMap := map[string]interface{}{f.Field: f.Value}
			filterJson, _ := json.Marshal(filterMap)
			query = query.Where("audit_logs.raw_data @> ?", string(filterJson))
		} else if f.Operator == "contains" {
			query = query.Where("audit_logs.raw_data ->> ? ILIKE ?", f.Field, "%"+f.Value+"%")
		}
	}

	// Search
	if state.SearchQuery != "" {
		q := state.SearchQuery
		likeQ := "%" + q + "%"
		if state.IsFuzzy {
			query = query.Where("audit_logs.operation % ? OR audit_logs.user_id % ? OR audit_logs.raw_data::text % ?", q, q, q)
		} else {
			query = query.Where("audit_logs.operation ILIKE ? OR audit_logs.user_id ILIKE ? OR audit_logs.raw_data::text ILIKE ?", likeQ, likeQ, likeQ)
		}
	}

	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment;filename=investigation_%s.csv", id))

	writer := csv.NewWriter(w)
	defer writer.Flush()

	// Write Header
	writer.Write([]string{"Time", "Tenant", "Operation", "User", "IP", "Workload", "Details"})

	// Batch fetch to avoid memory overload
	rows, err := query.Rows()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	for rows.Next() {
		// We need to scan into a struct compatible with scan or Scan supports map?
		// GORM Rows.Scan needs variables.
		// Let's use database.DB.ScanRows if possible, or just struct scan.
		type Result struct {
			models.AuditLog
			TenantName string
		}
		var res Result
		database.DB.ScanRows(rows, &res)

		// Create CSV Row
		rawDataStr := string(res.RawData)
		row := []string{
			res.CreationTime.Format(time.RFC3339),
			res.TenantName,
			res.Operation,
			res.UserId,
			res.ClientIP,
			res.Workload,
			rawDataStr,
		}
		writer.Write(row)
	}
}
