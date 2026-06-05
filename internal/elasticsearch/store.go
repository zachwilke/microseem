package elasticsearch

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/socr/o365-monitor/internal/models"
	"github.com/socr/o365-monitor/internal/store"
)

// Type aliases keep the Elasticsearch package compatible while the generic
// storage boundary moves to internal/store.
type SearchParams = store.SearchParams
type Filter = store.Filter
type SearchResult = store.SearchResult
type LogDocument = store.LogDocument
type GeoPoint = store.GeoPoint
type StatsResult = store.StatsResult
type BucketResult = store.BucketResult
type VolumeDataPoint = store.VolumeDataPoint

// Store adapts the existing Elasticsearch implementation to store.LogStore.
type Store struct{}

// NewStore returns an Elasticsearch-backed log store adapter.
func NewStore() *Store {
	return &Store{}
}

// BulkInsertLogs writes a batch of audit logs to Elasticsearch.
func (s *Store) BulkInsertLogs(ctx context.Context, orgID uuid.UUID, logs []models.AuditLog) error {
	return BulkIndexLogs(ctx, orgID, logs)
}

// SearchLogs searches Elasticsearch-backed audit logs.
func (s *Store) SearchLogs(ctx context.Context, params SearchParams) (*SearchResult, error) {
	return SearchLogs(ctx, params)
}

// GetStats retrieves Elasticsearch-backed log aggregations.
func (s *Store) GetStats(ctx context.Context, orgID uuid.UUID, tenantID *uuid.UUID) (*StatsResult, error) {
	return GetStats(ctx, orgID, tenantID)
}

// Health verifies the Elasticsearch client can answer an info request.
func (s *Store) Health(ctx context.Context) error {
	if Client == nil {
		return fmt.Errorf("elasticsearch client not initialized")
	}

	res, err := Client.Info(Client.Info.WithContext(ctx))
	if err != nil {
		return err
	}
	defer res.Body.Close()

	if res.IsError() {
		return fmt.Errorf("elasticsearch health error: %s", res.String())
	}

	return nil
}
