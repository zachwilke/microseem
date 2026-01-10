package api

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/socr/o365-monitor/internal/alerting"
	"github.com/socr/o365-monitor/internal/database"
	"github.com/socr/o365-monitor/internal/models"
)

func RegisterAlertRoutes(r chi.Router) {
	r.Get("/alerts", ListAlerts)
	r.Get("/rules", ListRules)
	r.Post("/rules", CreateRule)
	r.Delete("/rules/{id}", DeleteRule)
}

func ListAlerts(w http.ResponseWriter, r *http.Request) {
	var alerts []models.Alert
	// Simple list for now, order by latest
	if err := database.DB.Order("created_at desc").Limit(100).Find(&alerts).Error; err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	respondJSON(w, alerts)
}

func ListRules(w http.ResponseWriter, r *http.Request) {
	var rules []models.AlertRule
	if err := database.DB.Find(&rules).Error; err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	respondJSON(w, rules)
}

func CreateRule(w http.ResponseWriter, r *http.Request) {
	var rule models.AlertRule
	if err := json.NewDecoder(r.Body).Decode(&rule); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if rule.Name == "" || rule.Field == "" || rule.Operator == "" || rule.Value == "" {
		http.Error(w, "Missing required fields", http.StatusBadRequest)
		return
	}

	// Default severity
	if rule.Severity == "" {
		rule.Severity = models.SeverityMedium
	}
	rule.Enabled = true

	if err := database.DB.Create(&rule).Error; err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Reload engine rules
	alerting.Engine.LoadRules()

	respondJSON(w, rule)
}

func DeleteRule(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, "Invalid UUID", http.StatusBadRequest)
		return
	}

	if err := database.DB.Delete(&models.AlertRule{}, id).Error; err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Reload engine rules
	alerting.Engine.LoadRules()

	w.WriteHeader(http.StatusOK)
}

func respondJSON(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}
