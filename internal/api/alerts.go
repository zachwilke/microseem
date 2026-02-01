package api

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/socr/o365-monitor/internal/alerting"
	"github.com/socr/o365-monitor/internal/database"
	"github.com/socr/o365-monitor/internal/middleware"
	"github.com/socr/o365-monitor/internal/models"
)

func RegisterAlertRoutes(r chi.Router) {
	r.Get("/alerts", ListAlerts)
	r.Put("/alerts/{id}/status", UpdateAlertStatus)
	r.Get("/rules", ListRules)
	r.Post("/rules", CreateRule)
	r.Put("/rules/{id}", UpdateRule)
	r.Delete("/rules/{id}", DeleteRule)
}

func ListAlerts(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())

	var alerts []models.Alert
	if err := database.DB.Where("organization_id = ?", orgID).Order("created_at desc").Limit(100).Find(&alerts).Error; err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	respondJSON(w, alerts)
}

func UpdateAlertStatus(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	idStr := chi.URLParam(r, "id")

	id, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, "Invalid UUID", http.StatusBadRequest)
		return
	}

	var update struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&update); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Validate status
	if update.Status != "new" && update.Status != "acknowledged" && update.Status != "resolved" {
		http.Error(w, "Invalid status", http.StatusBadRequest)
		return
	}

	var alert models.Alert
	if err := database.DB.First(&alert, "id = ? AND organization_id = ?", id, orgID).Error; err != nil {
		http.Error(w, "Alert not found", http.StatusNotFound)
		return
	}

	alert.Status = update.Status
	if err := database.DB.Save(&alert).Error; err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	respondJSON(w, alert)
}

func ListRules(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())

	var rules []models.AlertRule
	if err := database.DB.Where("organization_id = ?", orgID).Find(&rules).Error; err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	respondJSON(w, rules)
}

func CreateRule(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())

	var rule models.AlertRule
	if err := json.NewDecoder(r.Body).Decode(&rule); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if rule.Name == "" || rule.Field == "" || rule.Operator == "" || rule.Value == "" {
		http.Error(w, "Missing required fields", http.StatusBadRequest)
		return
	}

	// Set organization ID
	rule.OrganizationID = orgID

	// Default severity
	if rule.Severity == "" {
		rule.Severity = models.SeverityMedium
	}
	rule.Enabled = true

	if err := database.DB.Create(&rule).Error; err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Reload engine rules for this org
	alerting.Engine.LoadRulesForOrg(orgID)

	respondJSON(w, rule)
}

func UpdateRule(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	idStr := chi.URLParam(r, "id")

	id, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, "Invalid UUID", http.StatusBadRequest)
		return
	}

	var rule models.AlertRule
	if err := database.DB.First(&rule, "id = ? AND organization_id = ?", id, orgID).Error; err != nil {
		http.Error(w, "Rule not found", http.StatusNotFound)
		return
	}

	var update models.AlertRule
	if err := json.NewDecoder(r.Body).Decode(&update); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Update allowed fields
	if update.Name != "" {
		rule.Name = update.Name
	}
	if update.Description != "" {
		rule.Description = update.Description
	}
	if update.Severity != "" {
		rule.Severity = update.Severity
	}
	if update.Field != "" {
		rule.Field = update.Field
	}
	if update.Operator != "" {
		rule.Operator = update.Operator
	}
	if update.Value != "" {
		rule.Value = update.Value
	}
	rule.Enabled = update.Enabled

	if err := database.DB.Save(&rule).Error; err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Reload engine rules for this org
	alerting.Engine.LoadRulesForOrg(orgID)

	respondJSON(w, rule)
}

func DeleteRule(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	idStr := chi.URLParam(r, "id")

	id, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, "Invalid UUID", http.StatusBadRequest)
		return
	}

	result := database.DB.Delete(&models.AlertRule{}, "id = ? AND organization_id = ?", id, orgID)
	if result.Error != nil {
		http.Error(w, result.Error.Error(), http.StatusInternalServerError)
		return
	}

	if result.RowsAffected == 0 {
		http.Error(w, "Rule not found", http.StatusNotFound)
		return
	}

	// Reload engine rules for this org
	alerting.Engine.LoadRulesForOrg(orgID)

	w.WriteHeader(http.StatusOK)
}

func respondJSON(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}
