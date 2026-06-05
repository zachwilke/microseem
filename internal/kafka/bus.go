package kafka

import (
	"context"

	"github.com/google/uuid"
	"github.com/socr/o365-monitor/internal/models"
)

// Bus adapts the Kafka producer to the pluggable event bus boundary.
type Bus struct{}

// NewBus creates a Kafka-backed event bus adapter.
func NewBus() *Bus {
	return &Bus{}
}

// PublishLogs sends a batch of logs to Kafka.
func (b *Bus) PublishLogs(ctx context.Context, orgID uuid.UUID, tenantID uuid.UUID, logs []models.AuditLog) error {
	return ProduceLogs(ctx, orgID, tenantID, logs)
}

// Close closes the Kafka producer.
func (b *Bus) Close() error {
	return Close()
}
