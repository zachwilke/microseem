package store

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/socr/o365-monitor/internal/models"
)

var (
	activeLogStore LogStore
	storeMu        sync.RWMutex
)

// LogStore is the storage boundary for normalized audit logs.
//
// Implementations can be backed by Elasticsearch, ClickHouse, or another
// hot-log analytics engine without changing API handlers or ingestion code.
type LogStore interface {
	BulkInsertLogs(ctx context.Context, orgID uuid.UUID, logs []models.AuditLog) error
	SearchLogs(ctx context.Context, params SearchParams) (*SearchResult, error)
	GetStats(ctx context.Context, orgID uuid.UUID, tenantID *uuid.UUID) (*StatsResult, error)
	Health(ctx context.Context) error
}

// SearchParams contains parameters for log search.
type SearchParams struct {
	OrgID     uuid.UUID
	TenantID  *uuid.UUID
	StartTime *time.Time
	EndTime   *time.Time
	Query     string
	Fuzzy     bool
	Filters   []Filter
	Size      int
	From      int
}

// Filter represents a field filter.
type Filter struct {
	Field    string `json:"field"`
	Operator string `json:"operator"`
	Value    string `json:"value"`
}

// SearchResult contains search results.
type SearchResult struct {
	Total int64         `json:"total"`
	Logs  []LogDocument `json:"logs"`
}

// LogDocument represents a normalized log document returned by a log store.
type LogDocument struct {
	ID             string                 `json:"id"`
	OrganizationID string                 `json:"organization_id"`
	TenantID       string                 `json:"tenant_id"`
	RecordType     int                    `json:"record_type"`
	CreationTime   time.Time              `json:"creation_time"`
	Operation      string                 `json:"operation"`
	Workload       string                 `json:"workload"`
	UserID         string                 `json:"user_id"`
	ClientIP       string                 `json:"client_ip,omitempty"`
	City           string                 `json:"city,omitempty"`
	CountryCode    string                 `json:"country_code,omitempty"`
	Location       *GeoPoint              `json:"location,omitempty"`
	RawData        map[string]interface{} `json:"raw_data"`
	IngestedAt     time.Time              `json:"ingested_at"`
}

// GeoPoint represents a geographic coordinate.
type GeoPoint struct {
	Lat float64 `json:"lat"`
	Lon float64 `json:"lon"`
}

// StatsResult contains aggregation results.
type StatsResult struct {
	TotalLogs     int64             `json:"total_logs"`
	TotalAlerts   int64             `json:"total_alerts"`
	TopUsers      []BucketResult    `json:"top_users"`
	TopOperations []BucketResult    `json:"top_operations"`
	VolumeHistory []VolumeDataPoint `json:"volume_history"`
}

// BucketResult represents an aggregation bucket.
type BucketResult struct {
	Key   string `json:"key"`
	Count int64  `json:"count"`
}

// VolumeDataPoint represents a data point in volume history.
type VolumeDataPoint struct {
	Time  time.Time `json:"time"`
	Count int64     `json:"count"`
}

// SetLogStore registers the process-wide log store implementation.
func SetLogStore(logStore LogStore) {
	storeMu.Lock()
	defer storeMu.Unlock()
	activeLogStore = logStore
}

// GetLogStore returns the configured process-wide log store implementation.
func GetLogStore() (LogStore, error) {
	storeMu.RLock()
	defer storeMu.RUnlock()

	if activeLogStore == nil {
		return nil, fmt.Errorf("log store not initialized")
	}

	return activeLogStore, nil
}

// BulkInsertLogs writes normalized audit logs through the active log store.
func BulkInsertLogs(ctx context.Context, orgID uuid.UUID, logs []models.AuditLog) error {
	logStore, err := GetLogStore()
	if err != nil {
		return err
	}
	return logStore.BulkInsertLogs(ctx, orgID, logs)
}

// SearchLogs searches normalized audit logs through the active log store.
func SearchLogs(ctx context.Context, params SearchParams) (*SearchResult, error) {
	logStore, err := GetLogStore()
	if err != nil {
		return nil, err
	}
	return logStore.SearchLogs(ctx, params)
}

// GetStats retrieves log aggregations through the active log store.
func GetStats(ctx context.Context, orgID uuid.UUID, tenantID *uuid.UUID) (*StatsResult, error) {
	logStore, err := GetLogStore()
	if err != nil {
		return nil, err
	}
	return logStore.GetStats(ctx, orgID, tenantID)
}

// Health checks the active log store.
func Health(ctx context.Context) error {
	logStore, err := GetLogStore()
	if err != nil {
		return err
	}
	return logStore.Health(ctx)
}
