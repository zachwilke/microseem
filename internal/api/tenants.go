package api

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/socr/o365-monitor/internal/database"
	"github.com/socr/o365-monitor/internal/ingest"
	"github.com/socr/o365-monitor/internal/middleware"
	"github.com/socr/o365-monitor/internal/models"
)

func RegisterTenantRoutes(r chi.Router) {
	r.Post("/tenants", CreateTenant)
	r.Get("/tenants", ListTenants)
	r.Get("/tenants/{id}", GetTenantByID)
	r.Put("/tenants/{id}", UpdateTenant)
	r.Delete("/tenants/{id}", DeleteTenant)
}

func GetTenantByID(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	id := chi.URLParam(r, "id")

	var tenant models.Tenant
	if err := database.DB.First(&tenant, "id = ? AND organization_id = ?", id, orgID).Error; err != nil {
		http.Error(w, "Tenant not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tenant)
}

func CreateTenant(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())

	// Check tenant limit
	var org models.Organization
	if err := database.DB.First(&org, "id = ?", orgID).Error; err != nil {
		http.Error(w, "Organization not found", http.StatusNotFound)
		return
	}

	var tenantCount int64
	database.DB.Model(&models.Tenant{}).Where("organization_id = ?", orgID).Count(&tenantCount)
	if tenantCount >= int64(org.MaxTenants) {
		http.Error(w, "Tenant limit reached for your subscription", http.StatusForbidden)
		return
	}

	var tenant models.Tenant
	if err := json.NewDecoder(r.Body).Decode(&tenant); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Set organization ID
	tenant.OrganizationID = orgID

	result := database.DB.Create(&tenant)
	if result.Error != nil {
		http.Error(w, result.Error.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tenant)

	// Trigger immediate poll
	ingest.TriggerPoll()
}

func ListTenants(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())

	var tenants []models.Tenant
	result := database.DB.Where("organization_id = ?", orgID).Find(&tenants)
	if result.Error != nil {
		http.Error(w, result.Error.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tenants)
}

func UpdateTenant(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	id := chi.URLParam(r, "id")

	var req models.Tenant
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	var tenant models.Tenant
	if err := database.DB.First(&tenant, "id = ? AND organization_id = ?", id, orgID).Error; err != nil {
		http.Error(w, "Tenant not found", http.StatusNotFound)
		return
	}

	// Update allowed fields
	tenant.EnabledContentTypes = req.EnabledContentTypes
	tenant.Verbosity = req.Verbosity
	if req.ContactEmail != "" {
		tenant.ContactEmail = req.ContactEmail
	}

	if err := database.DB.Save(&tenant).Error; err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tenant)

	// Retrigger poll to pick up config
	ingest.TriggerPoll()
}

func DeleteTenant(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	id := chi.URLParam(r, "id")

	result := database.DB.Delete(&models.Tenant{}, "id = ? AND organization_id = ?", id, orgID)
	if result.Error != nil {
		http.Error(w, result.Error.Error(), http.StatusInternalServerError)
		return
	}

	if result.RowsAffected == 0 {
		http.Error(w, "Tenant not found", http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusOK)
}
