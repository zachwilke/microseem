package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
)

type Tenant struct {
	ID                  uuid.UUID      `gorm:"type:uuid;default:gen_random_uuid();primaryKey"`
	Name                string         `json:"name"`
	TenantID            string         `json:"tenant_id"`
	ClientID            string         `json:"client_id"`
	ClientSecret        string         `json:"client_secret"` // In a real app, encrypt this!
	EnabledContentTypes datatypes.JSON `gorm:"type:jsonb" json:"enabled_content_types"`
	Verbosity           string         `json:"verbosity" gorm:"default:'Standard'"`
	LastPoll            time.Time      `json:"last_poll"`
	CreatedAt           time.Time      `json:"created_at"`
	UpdatedAt           time.Time      `json:"updated_at"`
}

type AuditLog struct {
	ID           uuid.UUID      `gorm:"type:uuid;default:gen_random_uuid();primaryKey"`
	TenantID     uuid.UUID      `gorm:"type:uuid;index" json:"tenant_id"`
	RecordType   int            `json:"record_type"`
	CreationTime time.Time      `gorm:"index" json:"creation_time"`
	Operation    string         `gorm:"index" json:"operation"`
	Workload     string         `gorm:"index" json:"workload"`
	UserId       string         `gorm:"index" json:"user_id"`
	RawData      datatypes.JSON `gorm:"type:jsonb;index:idx_audit_logs_raw_data,type:gin" json:"raw_data"`
	ClientIP     string         `gorm:"index" json:"client_ip"`
	City         string         `json:"city"`
	CountryCode  string         `json:"country_code"`
	Latitude     float64        `json:"latitude"`
	Longitude    float64        `json:"longitude"`
	IngestedAt   time.Time      `json:"ingested_at"`
}
