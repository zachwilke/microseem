package notifications

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/socr/o365-monitor/internal/database"
	"github.com/socr/o365-monitor/internal/models"
)

var (
	// Cache of integrations per org
	orgIntegrations = make(map[uuid.UUID][]models.Integration)
	mu              sync.RWMutex

	// HTTP client with timeout
	httpClient = &http.Client{
		Timeout: 10 * time.Second,
	}
)

// ReloadIntegrationsForOrg reloads integrations from DB for a specific org
func ReloadIntegrationsForOrg(orgID uuid.UUID) {
	var integrations []models.Integration
	if err := database.DB.Where("organization_id = ? AND enabled = ?", orgID, true).Find(&integrations).Error; err != nil {
		log.Printf("Failed to load integrations for org %s: %v", orgID, err)
		return
	}

	mu.Lock()
	orgIntegrations[orgID] = integrations
	mu.Unlock()

	log.Printf("Loaded %d integrations for org %s", len(integrations), orgID)
}

// NotifyAlert sends an alert to all matching integrations for the org
func NotifyAlert(alert models.Alert) {
	mu.RLock()
	integrations, exists := orgIntegrations[alert.OrganizationID]
	mu.RUnlock()

	if !exists {
		// Try to load integrations
		ReloadIntegrationsForOrg(alert.OrganizationID)
		mu.RLock()
		integrations = orgIntegrations[alert.OrganizationID]
		mu.RUnlock()
	}

	for _, integration := range integrations {
		// Check severity threshold
		if !shouldNotify(alert.Severity, integration.MinSeverity) {
			continue
		}

		go func(i models.Integration) {
			if err := SendToIntegration(&i, alert); err != nil {
				log.Printf("Failed to send to integration %s (%s): %v", i.Name, i.Type, err)
				// Update error in DB
				database.DB.Model(&i).Update("last_error", err.Error())
			} else {
				// Update last used
				database.DB.Model(&i).Updates(map[string]interface{}{
					"last_used_at": time.Now(),
					"last_error":   "",
				})
			}
		}(integration)
	}
}

// SendToIntegration sends an alert to a specific integration
func SendToIntegration(integration *models.Integration, alert models.Alert) error {
	switch integration.Type {
	case models.IntegrationSlack:
		return sendSlack(integration, alert)
	case models.IntegrationTeams:
		return sendTeams(integration, alert)
	case models.IntegrationDiscord:
		return sendDiscord(integration, alert)
	case models.IntegrationGoogleChat:
		return sendGoogleChat(integration, alert)
	case models.IntegrationPagerDuty:
		return sendPagerDuty(integration, alert)
	case models.IntegrationOpsgenie:
		return sendOpsgenie(integration, alert)
	case models.IntegrationWebhook:
		return sendWebhook(integration, alert)
	default:
		return fmt.Errorf("unsupported integration type: %s", integration.Type)
	}
}

func sendSlack(integration *models.Integration, alert models.Alert) error {
	color := severityColor(alert.Severity)
	payload := map[string]interface{}{
		"attachments": []map[string]interface{}{
			{
				"color":  color,
				"title":  fmt.Sprintf("[%s] %s", alert.Severity, alert.RuleName),
				"text":   alert.Description,
				"footer": "MicroSeem Alert",
				"ts":     alert.CreatedAt.Unix(),
				"fields": []map[string]interface{}{
					{"title": "Severity", "value": string(alert.Severity), "short": true},
					{"title": "Status", "value": alert.Status, "short": true},
				},
			},
		},
	}
	return postJSON(integration.WebhookURL, payload)
}

func sendTeams(integration *models.Integration, alert models.Alert) error {
	color := severityColor(alert.Severity)
	payload := map[string]interface{}{
		"@type":      "MessageCard",
		"@context":   "http://schema.org/extensions",
		"themeColor": color[1:], // Remove # prefix
		"summary":    alert.RuleName,
		"sections": []map[string]interface{}{
			{
				"activityTitle": fmt.Sprintf("[%s] %s", alert.Severity, alert.RuleName),
				"facts": []map[string]string{
					{"name": "Severity", "value": string(alert.Severity)},
					{"name": "Status", "value": alert.Status},
					{"name": "Time", "value": alert.CreatedAt.Format(time.RFC3339)},
				},
				"text":     alert.Description,
				"markdown": true,
			},
		},
	}
	return postJSON(integration.WebhookURL, payload)
}

func sendDiscord(integration *models.Integration, alert models.Alert) error {
	color := severityColorInt(alert.Severity)
	payload := map[string]interface{}{
		"embeds": []map[string]interface{}{
			{
				"title":       fmt.Sprintf("[%s] %s", alert.Severity, alert.RuleName),
				"description": alert.Description,
				"color":       color,
				"footer":      map[string]string{"text": "MicroSeem Alert"},
				"timestamp":   alert.CreatedAt.Format(time.RFC3339),
				"fields": []map[string]interface{}{
					{"name": "Severity", "value": string(alert.Severity), "inline": true},
					{"name": "Status", "value": alert.Status, "inline": true},
				},
			},
		},
	}
	return postJSON(integration.WebhookURL, payload)
}

func sendGoogleChat(integration *models.Integration, alert models.Alert) error {
	payload := map[string]interface{}{
		"cards": []map[string]interface{}{
			{
				"header": map[string]string{
					"title":    fmt.Sprintf("[%s] %s", alert.Severity, alert.RuleName),
					"subtitle": "MicroSeem Alert",
				},
				"sections": []map[string]interface{}{
					{
						"widgets": []map[string]interface{}{
							{
								"textParagraph": map[string]string{
									"text": alert.Description,
								},
							},
							{
								"keyValue": map[string]interface{}{
									"topLabel": "Severity",
									"content":  string(alert.Severity),
								},
							},
							{
								"keyValue": map[string]interface{}{
									"topLabel": "Time",
									"content":  alert.CreatedAt.Format(time.RFC3339),
								},
							},
						},
					},
				},
			},
		},
	}
	return postJSON(integration.WebhookURL, payload)
}

func sendPagerDuty(integration *models.Integration, alert models.Alert) error {
	// PagerDuty Events API v2
	var config map[string]string
	if integration.Config != nil {
		json.Unmarshal(integration.Config, &config)
	}

	routingKey := config["routing_key"]
	if routingKey == "" {
		routingKey = integration.WebhookURL // Fallback to webhook URL as routing key
	}

	severity := "warning"
	switch alert.Severity {
	case models.SeverityCritical:
		severity = "critical"
	case models.SeverityHigh:
		severity = "error"
	case models.SeverityMedium:
		severity = "warning"
	case models.SeverityLow, models.SeverityInfo:
		severity = "info"
	}

	payload := map[string]interface{}{
		"routing_key":  routingKey,
		"event_action": "trigger",
		"dedup_key":    alert.ID.String(),
		"payload": map[string]interface{}{
			"summary":   fmt.Sprintf("[%s] %s", alert.Severity, alert.RuleName),
			"source":    "MicroSeem",
			"severity":  severity,
			"timestamp": alert.CreatedAt.Format(time.RFC3339),
			"custom_details": map[string]interface{}{
				"description": alert.Description,
				"rule_id":     alert.RuleID.String(),
				"log_id":      alert.LogID.String(),
			},
		},
	}

	return postJSON("https://events.pagerduty.com/v2/enqueue", payload)
}

func sendOpsgenie(integration *models.Integration, alert models.Alert) error {
	var config map[string]string
	if integration.Config != nil {
		json.Unmarshal(integration.Config, &config)
	}

	apiKey := config["api_key"]
	priority := "P3"
	switch alert.Severity {
	case models.SeverityCritical:
		priority = "P1"
	case models.SeverityHigh:
		priority = "P2"
	case models.SeverityMedium:
		priority = "P3"
	case models.SeverityLow:
		priority = "P4"
	case models.SeverityInfo:
		priority = "P5"
	}

	payload := map[string]interface{}{
		"message":     fmt.Sprintf("[%s] %s", alert.Severity, alert.RuleName),
		"alias":       alert.ID.String(),
		"description": alert.Description,
		"priority":    priority,
		"source":      "MicroSeem",
		"details": map[string]string{
			"rule_id": alert.RuleID.String(),
			"log_id":  alert.LogID.String(),
		},
	}

	req, err := http.NewRequest("POST", "https://api.opsgenie.com/v2/alerts", jsonBody(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "GenieKey "+apiKey)

	resp, err := httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("opsgenie returned status %d", resp.StatusCode)
	}
	return nil
}

func sendWebhook(integration *models.Integration, alert models.Alert) error {
	payload := map[string]interface{}{
		"id":          alert.ID.String(),
		"rule_id":     alert.RuleID.String(),
		"rule_name":   alert.RuleName,
		"severity":    alert.Severity,
		"description": alert.Description,
		"status":      alert.Status,
		"log_id":      alert.LogID.String(),
		"tenant_id":   alert.TenantID.String(),
		"created_at":  alert.CreatedAt.Format(time.RFC3339),
		"raw_data":    alert.RawData,
	}
	return postJSON(integration.WebhookURL, payload)
}

func postJSON(url string, payload interface{}) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal payload: %w", err)
	}

	resp, err := httpClient.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("webhook returned status %d", resp.StatusCode)
	}

	return nil
}

func jsonBody(payload interface{}) *bytes.Reader {
	body, _ := json.Marshal(payload)
	return bytes.NewReader(body)
}

func severityColor(severity models.Severity) string {
	switch severity {
	case models.SeverityCritical:
		return "#dc2626" // red-600
	case models.SeverityHigh:
		return "#ea580c" // orange-600
	case models.SeverityMedium:
		return "#ca8a04" // yellow-600
	case models.SeverityLow:
		return "#2563eb" // blue-600
	case models.SeverityInfo:
		return "#6b7280" // gray-500
	default:
		return "#6b7280"
	}
}

func severityColorInt(severity models.Severity) int {
	switch severity {
	case models.SeverityCritical:
		return 14423830 // red
	case models.SeverityHigh:
		return 15358476 // orange
	case models.SeverityMedium:
		return 13276676 // yellow
	case models.SeverityLow:
		return 2456286 // blue
	case models.SeverityInfo:
		return 7041536 // gray
	default:
		return 7041536
	}
}

func shouldNotify(alertSeverity, minSeverity models.Severity) bool {
	severityOrder := map[models.Severity]int{
		models.SeverityInfo:     0,
		models.SeverityLow:      1,
		models.SeverityMedium:   2,
		models.SeverityHigh:     3,
		models.SeverityCritical: 4,
	}

	return severityOrder[alertSeverity] >= severityOrder[minSeverity]
}
