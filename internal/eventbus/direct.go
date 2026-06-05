package eventbus

import (
	"context"

	"github.com/google/uuid"
	"github.com/socr/o365-monitor/internal/models"
	"github.com/socr/o365-monitor/internal/store"
)

// DirectBus writes batches directly into the active log store.
// It is useful for the lightweight ClickHouse preview before a durable
// JetStream bus adapter is enabled.
type DirectBus struct{}

// NewDirectBus creates a direct-write event bus.
func NewDirectBus() *DirectBus {
	return &DirectBus{}
}

// PublishLogs writes logs directly to the active log store.
func (b *DirectBus) PublishLogs(ctx context.Context, orgID uuid.UUID, tenantID uuid.UUID, logs []models.AuditLog) error {
	return store.BulkInsertLogs(ctx, orgID, logs)
}

// Close is a no-op for direct writes.
func (b *DirectBus) Close() error {
	return nil
}
