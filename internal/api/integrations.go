package api

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/socr/o365-monitor/internal/database"
	"github.com/socr/o365-monitor/internal/middleware"
	"github.com/socr/o365-monitor/internal/models"
	"github.com/socr/o365-monitor/internal/notifications"
)

func RegisterIntegrationRoutes(r chi.Router) {
	r.Get("/integrations", ListIntegrations)
	r.Post("/integrations", CreateIntegration)
	r.Get("/integrations/{id}", GetIntegration)
	r.Put("/integrations/{id}", UpdateIntegration)
	r.Delete("/integrations/{id}", DeleteIntegration)
	r.Post("/integrations/{id}/test", TestIntegration)
}

func ListIntegrations(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())

	var integrations []models.Integration
	if err := database.DB.Where("organization_id = ?", orgID).Order("created_at desc").Find(&integrations).Error; err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Mask webhook URLs for security (show only last 8 chars)
	for i := range integrations {
		if len(integrations[i].WebhookURL) > 12 {
			integrations[i].WebhookURL = "••••••••" + integrations[i].WebhookURL[len(integrations[i].WebhookURL)-8:]
		}
	}

	respondJSON(w, integrations)
}

func GetIntegration(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	idStr := chi.URLParam(r, "id")

	id, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, "Invalid UUID", http.StatusBadRequest)
		return
	}

	var integration models.Integration
	if err := database.DB.First(&integration, "id = ? AND organization_id = ?", id, orgID).Error; err != nil {
		http.Error(w, "Integration not found", http.StatusNotFound)
		return
	}

	// Mask webhook URL
	if len(integration.WebhookURL) > 12 {
		integration.WebhookURL = "••••••••" + integration.WebhookURL[len(integration.WebhookURL)-8:]
	}

	respondJSON(w, integration)
}

type CreateIntegrationRequest struct {
	Name        string                 `json:"name"`
	Type        models.IntegrationType `json:"type"`
	WebhookURL  string                 `json:"webhook_url"`
	Config      map[string]interface{} `json:"config,omitempty"`
	MinSeverity models.Severity        `json:"min_severity"`
	Enabled     bool                   `json:"enabled"`
}

func CreateIntegration(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())

	var req CreateIntegrationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate required fields
	if req.Name == "" {
		http.Error(w, "Name is required", http.StatusBadRequest)
		return
	}

	if !isValidIntegrationType(req.Type) {
		http.Error(w, "Invalid integration type", http.StatusBadRequest)
		return
	}

	// Most integrations require a webhook URL
	if req.WebhookURL == "" && req.Type != models.IntegrationEmail {
		http.Error(w, "Webhook URL is required for this integration type", http.StatusBadRequest)
		return
	}

	// Default severity
	if req.MinSeverity == "" {
		req.MinSeverity = models.SeverityMedium
	}

	// Marshal config to JSON
	var configJSON []byte
	if req.Config != nil {
		var err error
		configJSON, err = json.Marshal(req.Config)
		if err != nil {
			http.Error(w, "Invalid config", http.StatusBadRequest)
			return
		}
	}

	integration := models.Integration{
		OrganizationID: orgID,
		Name:           req.Name,
		Type:           req.Type,
		WebhookURL:     req.WebhookURL,
		Config:         configJSON,
		MinSeverity:    req.MinSeverity,
		Enabled:        req.Enabled,
	}

	if err := database.DB.Create(&integration).Error; err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Reload integrations in notification service
	notifications.ReloadIntegrationsForOrg(orgID)

	// Mask webhook URL in response
	if len(integration.WebhookURL) > 12 {
		integration.WebhookURL = "••••••••" + integration.WebhookURL[len(integration.WebhookURL)-8:]
	}

	respondJSON(w, integration)
}

func UpdateIntegration(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	idStr := chi.URLParam(r, "id")

	id, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, "Invalid UUID", http.StatusBadRequest)
		return
	}

	var integration models.Integration
	if err := database.DB.First(&integration, "id = ? AND organization_id = ?", id, orgID).Error; err != nil {
		http.Error(w, "Integration not found", http.StatusNotFound)
		return
	}

	var req CreateIntegrationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Update fields
	if req.Name != "" {
		integration.Name = req.Name
	}
	if req.Type != "" && isValidIntegrationType(req.Type) {
		integration.Type = req.Type
	}
	if req.WebhookURL != "" && !isObfuscatedURL(req.WebhookURL) {
		integration.WebhookURL = req.WebhookURL
	}
	if req.MinSeverity != "" {
		integration.MinSeverity = req.MinSeverity
	}
	if req.Config != nil {
		configJSON, err := json.Marshal(req.Config)
		if err != nil {
			http.Error(w, "Invalid config", http.StatusBadRequest)
			return
		}
		integration.Config = configJSON
	}
	integration.Enabled = req.Enabled

	if err := database.DB.Save(&integration).Error; err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Reload integrations
	notifications.ReloadIntegrationsForOrg(orgID)

	// Mask webhook URL in response
	if len(integration.WebhookURL) > 12 {
		integration.WebhookURL = "••••••••" + integration.WebhookURL[len(integration.WebhookURL)-8:]
	}

	respondJSON(w, integration)
}

func DeleteIntegration(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	idStr := chi.URLParam(r, "id")

	id, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, "Invalid UUID", http.StatusBadRequest)
		return
	}

	result := database.DB.Delete(&models.Integration{}, "id = ? AND organization_id = ?", id, orgID)
	if result.Error != nil {
		http.Error(w, result.Error.Error(), http.StatusInternalServerError)
		return
	}

	if result.RowsAffected == 0 {
		http.Error(w, "Integration not found", http.StatusNotFound)
		return
	}

	// Reload integrations
	notifications.ReloadIntegrationsForOrg(orgID)

	w.WriteHeader(http.StatusOK)
}

func TestIntegration(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	idStr := chi.URLParam(r, "id")

	id, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, "Invalid UUID", http.StatusBadRequest)
		return
	}

	var integration models.Integration
	if err := database.DB.First(&integration, "id = ? AND organization_id = ?", id, orgID).Error; err != nil {
		http.Error(w, "Integration not found", http.StatusNotFound)
		return
	}

	// Send test notification
	testAlert := models.Alert{
		ID:          uuid.New(),
		RuleName:    "Test Alert",
		Severity:    models.SeverityInfo,
		Description: "This is a test notification from MicroSeem. If you receive this, your integration is working correctly!",
		Status:      "test",
		CreatedAt:   time.Now(),
	}

	err = notifications.SendToIntegration(&integration, testAlert)
	if err != nil {
		// Update last error
		database.DB.Model(&integration).Updates(map[string]interface{}{
			"last_error": err.Error(),
		})
		http.Error(w, "Test failed: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Update last used
	now := time.Now()
	database.DB.Model(&integration).Updates(map[string]interface{}{
		"last_used_at": now,
		"last_error":   "",
	})

	respondJSON(w, map[string]string{"status": "success", "message": "Test notification sent successfully"})
}

func isValidIntegrationType(t models.IntegrationType) bool {
	switch t {
	case models.IntegrationSlack, models.IntegrationTeams, models.IntegrationGoogleChat,
		models.IntegrationDiscord, models.IntegrationPagerDuty, models.IntegrationWebhook,
		models.IntegrationEmail, models.IntegrationOpsgenie, models.IntegrationJira:
		return true
	}
	return false
}

func isObfuscatedURL(url string) bool {
	return len(url) > 0 && url[0:8] == "••••••••"
}
