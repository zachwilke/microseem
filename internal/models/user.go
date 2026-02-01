package models

import (
	"time"

	"github.com/google/uuid"
)

// Role represents a user's role in the system
type Role string

const (
	RoleAdmin       Role = "admin"        // Full access to everything
	RoleTechnician  Role = "technician"   // Can view/manage logs, alerts, investigations
	RoleReportAdmin Role = "report_admin" // Read-only access to analytics and reports
)

// User represents a user account
type User struct {
	ID             uuid.UUID    `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	OrganizationID uuid.UUID    `gorm:"type:uuid;index" json:"organization_id"`
	Organization   Organization `gorm:"foreignKey:OrganizationID" json:"-"`
	Email          string       `gorm:"uniqueIndex;not null" json:"email"`
	PasswordHash   string       `gorm:"not null" json:"-"`
	FirstName      string       `json:"first_name"`
	LastName       string       `json:"last_name"`
	Role           Role         `gorm:"type:varchar(20);default:'technician'" json:"role"`
	IsActive       bool         `gorm:"default:true" json:"is_active"`
	LastLoginAt    *time.Time   `json:"last_login_at,omitempty"`
	CreatedAt      time.Time    `json:"created_at"`
	UpdatedAt      time.Time    `json:"updated_at"`
}

// Session represents an active user session
type Session struct {
	ID           uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	UserID       uuid.UUID `gorm:"type:uuid;index;not null" json:"user_id"`
	User         User      `gorm:"foreignKey:UserID" json:"-"`
	RefreshToken string    `gorm:"uniqueIndex;not null" json:"-"`
	UserAgent    string    `json:"user_agent"`
	IPAddress    string    `json:"ip_address"`
	ExpiresAt    time.Time `gorm:"index" json:"expires_at"`
	CreatedAt    time.Time `json:"created_at"`
}

// IsValidRole checks if a role string is valid
func IsValidRole(role Role) bool {
	switch role {
	case RoleAdmin, RoleTechnician, RoleReportAdmin:
		return true
	}
	return false
}

// CanManageUsers returns true if the role can manage other users
func (r Role) CanManageUsers() bool {
	return r == RoleAdmin
}

// CanManageSettings returns true if the role can modify settings/tenants
func (r Role) CanManageSettings() bool {
	return r == RoleAdmin
}

// CanManageAlerts returns true if the role can create/edit alert rules
func (r Role) CanManageAlerts() bool {
	return r == RoleAdmin || r == RoleTechnician
}

// CanManageIntegrations returns true if the role can configure integrations
func (r Role) CanManageIntegrations() bool {
	return r == RoleAdmin
}

// CanViewLogs returns true if the role can view audit logs
func (r Role) CanViewLogs() bool {
	return r == RoleAdmin || r == RoleTechnician || r == RoleReportAdmin
}

// CanViewAnalytics returns true if the role can view analytics
func (r Role) CanViewAnalytics() bool {
	return r == RoleAdmin || r == RoleTechnician || r == RoleReportAdmin
}

// CanManageInvestigations returns true if the role can create/edit investigations
func (r Role) CanManageInvestigations() bool {
	return r == RoleAdmin || r == RoleTechnician
}
