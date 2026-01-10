package alerting

import (
	"log"
	"strings"
	"sync"

	"github.com/socr/o365-monitor/internal/database"
	"github.com/socr/o365-monitor/internal/hub"
	"github.com/socr/o365-monitor/internal/models"
)

var Engine = &AlertEngine{}

type AlertEngine struct {
	rules []models.AlertRule
	mu    sync.RWMutex
}

func (e *AlertEngine) LoadRules() {
	e.mu.Lock()
	defer e.mu.Unlock()

	var rules []models.AlertRule
	if err := database.DB.Where("enabled = ?", true).Find(&rules).Error; err != nil {
		log.Printf("Error loading alert rules: %v", err)
		return
	}
	e.rules = rules
	log.Printf("AlertEngine: Loaded %d rules", len(rules))
}

func (e *AlertEngine) Evaluate(logEntry models.AuditLog) {
	e.mu.RLock()
	defer e.mu.RUnlock()

	for _, rule := range e.rules {
		matched := false

		// Simple reflection-like field access using helpers or just switch on common fields for MVP
		// For a robust system, we'd marshal to map[string]interface{}
		// Let's stick to the common fields defined in models.AuditLog

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
		case "country":
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
			e.Trigger(rule, logEntry)
		}
	}
}

func (e *AlertEngine) Trigger(rule models.AlertRule, logEntry models.AuditLog) {
	alert := models.Alert{
		RuleID:      rule.ID,
		RuleName:    rule.Name,
		Severity:    rule.Severity,
		LogID:       logEntry.ID,
		TenantID:    logEntry.TenantID,
		Description: rule.Description,
		RawData:     logEntry.RawData,
		Status:      "new",
	}

	if err := database.DB.Create(&alert).Error; err != nil {
		log.Printf("Error saving alert: %v", err)
		return
	}

	// In the future: Send email/slack/etc.

	// Broadcast via WebSocket (reuse existing hub logic?)
	// Let's add an Alert message type or just broadcast raw json.
	// Frontend will need to distinguish.
	hub.GlobalHub.BroadcastAlert(alert)
	log.Printf("ALERT TRIGGERED: %s for %s", rule.Name, logEntry.UserId)
}
