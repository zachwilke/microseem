package eventbus

import (
	"context"
	"fmt"
	"sync"

	"github.com/google/uuid"
	"github.com/socr/o365-monitor/internal/models"
)

var (
	activeBus EventBus
	busMu     sync.RWMutex
)

// EventBus is the ingestion boundary for normalized audit-log batches.
//
// Implementations can be backed by Kafka, NATS JetStream, direct store writes,
// or another durable queue without changing poller code.
type EventBus interface {
	PublishLogs(ctx context.Context, orgID uuid.UUID, tenantID uuid.UUID, logs []models.AuditLog) error
	Close() error
}

// SetEventBus registers the process-wide event bus implementation.
func SetEventBus(bus EventBus) {
	busMu.Lock()
	defer busMu.Unlock()
	activeBus = bus
}

// GetEventBus returns the configured process-wide event bus implementation.
func GetEventBus() (EventBus, error) {
	busMu.RLock()
	defer busMu.RUnlock()

	if activeBus == nil {
		return nil, fmt.Errorf("event bus not initialized")
	}

	return activeBus, nil
}

// PublishLogs publishes a normalized audit-log batch through the active event bus.
func PublishLogs(ctx context.Context, orgID uuid.UUID, tenantID uuid.UUID, logs []models.AuditLog) error {
	bus, err := GetEventBus()
	if err != nil {
		return err
	}
	return bus.PublishLogs(ctx, orgID, tenantID, logs)
}

// Close closes the active event bus.
func Close() error {
	bus, err := GetEventBus()
	if err != nil {
		return nil
	}
	return bus.Close()
}
