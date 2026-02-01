package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
)

// Organization represents a customer organization (multi-tenant SaaS)
type Organization struct {
	ID               uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	Name             string    `json:"name"`
	ClerkOrgID       string    `gorm:"uniqueIndex" json:"clerk_org_id"`
	SubscriptionTier string    `json:"subscription_tier" gorm:"default:'free'"`
	Status           string    `json:"status" gorm:"default:'active'"`
	MaxTenants       int       `json:"max_tenants" gorm:"default:5"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

type Tenant struct {
	ID                  uuid.UUID      `gorm:"type:uuid;default:gen_random_uuid();primaryKey"`
	OrganizationID      uuid.UUID      `gorm:"type:uuid;index" json:"organization_id"`
	Organization        Organization   `gorm:"foreignKey:OrganizationID" json:"-"`
	Name                string         `json:"name"`
	ContactEmail        string         `json:"contact_email"`
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
	ID             uuid.UUID      `gorm:"type:uuid;default:gen_random_uuid();primaryKey"`
	OrganizationID uuid.UUID      `gorm:"type:uuid;index" json:"organization_id"`
	TenantID       uuid.UUID      `gorm:"type:uuid;index" json:"tenant_id"`
	RecordType     int            `json:"record_type"`
	CreationTime   time.Time      `gorm:"index" json:"creation_time"`
	Operation      string         `gorm:"index" json:"operation"`
	Workload       string         `gorm:"index" json:"workload"`
	UserId         string         `gorm:"index" json:"user_id"`
	RawData        datatypes.JSON `gorm:"type:jsonb;index:idx_audit_logs_raw_data,type:gin" json:"raw_data"`
	ClientIP       string         `gorm:"index" json:"client_ip"`
	City           string         `json:"city"`
	CountryCode    string         `json:"country_code"`
	Latitude       float64        `json:"latitude"`
	Longitude      float64        `json:"longitude"`
	IngestedAt     time.Time      `json:"ingested_at"`
}

type Investigation struct {
	ID             uuid.UUID      `gorm:"type:uuid;default:gen_random_uuid();primaryKey"`
	OrganizationID uuid.UUID      `gorm:"type:uuid;index" json:"organization_id"`
	Organization   Organization   `gorm:"foreignKey:OrganizationID" json:"-"`
	Name           string         `json:"name"`
	Description    string         `json:"description"`
	Filters        datatypes.JSON `gorm:"type:jsonb" json:"filters"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
}
