package alerting

import (
	"log"
	"strings"
	"sync"

	"github.com/google/uuid"
	"github.com/socr/o365-monitor/internal/database"
	"github.com/socr/o365-monitor/internal/hub"
	"github.com/socr/o365-monitor/internal/models"
	"github.com/socr/o365-monitor/internal/notifications"
)

var Engine = &AlertEngine{
	rulesByOrg: make(map[uuid.UUID][]models.AlertRule),
}

type AlertEngine struct {
	rulesByOrg map[uuid.UUID][]models.AlertRule
	mu         sync.RWMutex
}

// LoadRules loads all enabled rules for all organizations (used on startup)
func (e *AlertEngine) LoadRules() {
	e.mu.Lock()
	defer e.mu.Unlock()

	var rules []models.AlertRule
	if err := database.DB.Where("enabled = ?", true).Find(&rules).Error; err != nil {
		log.Printf("Error loading alert rules: %v", err)
		return
	}

	// Clear existing rules
	e.rulesByOrg = make(map[uuid.UUID][]models.AlertRule)

	// Group by organization
	for _, rule := range rules {
		e.rulesByOrg[rule.OrganizationID] = append(e.rulesByOrg[rule.OrganizationID], rule)
	}

	log.Printf("AlertEngine: Loaded %d rules across %d organizations", len(rules), len(e.rulesByOrg))
}

// LoadRulesForOrg loads rules for a specific organization
func (e *AlertEngine) LoadRulesForOrg(orgID uuid.UUID) {
	e.mu.Lock()
	defer e.mu.Unlock()

	var rules []models.AlertRule
	if err := database.DB.Where("enabled = ? AND organization_id = ?", true, orgID).Find(&rules).Error; err != nil {
		log.Printf("Error loading alert rules for org %s: %v", orgID, err)
		return
	}

	e.rulesByOrg[orgID] = rules
	log.Printf("AlertEngine: Loaded %d rules for org %s", len(rules), orgID)
}

// Evaluate evaluates all rules for a log entry within its organization context
func (e *AlertEngine) Evaluate(logEntry models.AuditLog, orgID uuid.UUID) {
	e.mu.RLock()
	rules, ok := e.rulesByOrg[orgID]
	e.mu.RUnlock()

	if !ok || len(rules) == 0 {
		return
	}

	for _, rule := range rules {
		matched := false

		// Simple field matching
		var fieldValue string
		switch strings.ToLower(rule.Field) {
		case "operation":
			fieldValue = logEntry.Operation
		case "workload":
			fieldValue = logEntry.Workload
		case "userid", "user_id":
			fieldValue = logEntry.UserId
		case "clientip", "client_ip", "ip":
			fieldValue = logEntry.ClientIP
		case "city":
			fieldValue = logEntry.City
		case "country", "country_code":
			fieldValue = logEntry.CountryCode
		}

		// Operator Check
		switch rule.Operator {
		case "=":
			matched = (fieldValue == rule.Value)
		case "contains":
			matched = strings.Contains(strings.ToLower(fieldValue), strings.ToLower(rule.Value))
		case "!=":
			matched = (fieldValue != rule.Value)
		}

		if matched {
			e.Trigger(rule, logEntry, orgID)
		}
	}
}

// Trigger creates an alert and broadcasts it
func (e *AlertEngine) Trigger(rule models.AlertRule, logEntry models.AuditLog, orgID uuid.UUID) {
	alert := models.Alert{
		OrganizationID: orgID,
		RuleID:         rule.ID,
		RuleName:       rule.Name,
		Severity:       rule.Severity,
		LogID:          logEntry.ID,
		TenantID:       logEntry.TenantID,
		Description:    rule.Description,
		RawData:        logEntry.RawData,
		Status:         "new",
	}

	if err := database.DB.Create(&alert).Error; err != nil {
		log.Printf("Error saving alert: %v", err)
		return
	}

	// Broadcast via WebSocket to the correct org room
	hub.GlobalHub.BroadcastAlert(alert, orgID)

	// Send notifications to configured integrations
	notifications.NotifyAlert(alert)

	log.Printf("ALERT TRIGGERED: %s for %s (org: %s)", rule.Name, logEntry.UserId, orgID)
}
