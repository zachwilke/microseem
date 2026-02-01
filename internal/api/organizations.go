package api

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/socr/o365-monitor/internal/database"
	"github.com/socr/o365-monitor/internal/middleware"
	"github.com/socr/o365-monitor/internal/models"
)

func RegisterOrganizationRoutes(r chi.Router) {
	r.Get("/org", GetCurrentOrganization)
	r.Put("/org", UpdateOrganization)
}

// GetCurrentOrganization returns the organization for the authenticated user
func GetCurrentOrganization(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())

	var org models.Organization
	if err := database.DB.First(&org, "id = ?", orgID).Error; err != nil {
		http.Error(w, "Organization not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(org)
}

// UpdateOrganization updates the organization settings
func UpdateOrganization(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())

	var org models.Organization
	if err := database.DB.First(&org, "id = ?", orgID).Error; err != nil {
		http.Error(w, "Organization not found", http.StatusNotFound)
		return
	}

	var update struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&update); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if update.Name != "" {
		org.Name = update.Name
	}

	if err := database.DB.Save(&org).Error; err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(org)
}
