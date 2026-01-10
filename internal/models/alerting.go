package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
)

type Severity string

const (
	SeverityInfo     Severity = "info"
	SeverityLow      Severity = "low"
	SeverityMedium   Severity = "medium"
	SeverityHigh     Severity = "high"
	SeverityCritical Severity = "critical"
)

// AlertRule defines a condition to watch for
type AlertRule struct {
	ID          uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Severity    Severity  `json:"severity"`
	Enabled     bool      `json:"enabled" gorm:"default:true"`

	// Simple matching logic for now: Field == Value
	// e.g. "Operation" == "UserLoggedIn"
	// Future: Support complex JSON logic or CEL
	Field    string `json:"field"`    // e.g. "operation", "workload", "city"
	Operator string `json:"operator"` // e.g. "bg", "=", "contains" (simple implementation)
	Value    string `json:"value"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Alert represents a triggered event
type Alert struct {
	ID       uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	RuleID   uuid.UUID `json:"rule_id"`
	RuleName string    `json:"rule_name"` // Snapshot of rule name
	Severity Severity  `json:"severity"`

	LogID       uuid.UUID `json:"log_id"`
	Description string    `json:"description"` // e.g. "UserLoggedIn matches Operation"

	TenantID uuid.UUID      `json:"tenant_id"`
	RawData  datatypes.JSON `json:"raw_data"` // Copy of log data for convenience

	Status    string    `json:"status" gorm:"default:'new'"` // new, acknowledged, resolved
	CreatedAt time.Time `json:"created_at"`
}
