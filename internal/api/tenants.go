package api

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/socr/o365-monitor/internal/database"
	"github.com/socr/o365-monitor/internal/ingest"
	"github.com/socr/o365-monitor/internal/models"
)

func RegisterTenantRoutes(r chi.Router) {
	r.Post("/tenants", CreateTenant)
	r.Get("/tenants", ListTenants)
	r.Get("/tenants/{id}", GetTenantByID)
	r.Put("/tenants/{id}", UpdateTenant)
}

func GetTenantByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var tenant models.Tenant
	if err := database.DB.First(&tenant, "id = ?", id).Error; err != nil {
		http.Error(w, "Tenant not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tenant)
}

func CreateTenant(w http.ResponseWriter, r *http.Request) {
	var tenant models.Tenant
	if err := json.NewDecoder(r.Body).Decode(&tenant); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

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
	var tenants []models.Tenant
	result := database.DB.Find(&tenants)
	if result.Error != nil {
		http.Error(w, result.Error.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tenants)
}

func UpdateTenant(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req models.Tenant
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	var tenant models.Tenant
	if err := database.DB.First(&tenant, "id = ?", id).Error; err != nil {
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
