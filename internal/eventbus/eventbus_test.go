package eventbus

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/socr/o365-monitor/internal/models"
)

type fakeBus struct {
	publishCalls int
	closeCalls   int
}

func (f *fakeBus) PublishLogs(ctx context.Context, orgID uuid.UUID, tenantID uuid.UUID, logs []models.AuditLog) error {
	f.publishCalls++
	return nil
}

func (f *fakeBus) Close() error {
	f.closeCalls++
	return nil
}

func TestGetEventBusRequiresInitialization(t *testing.T) {
	SetEventBus(nil)

	if _, err := GetEventBus(); err == nil {
		t.Fatal("expected error when event bus is not initialized")
	}
}

func TestActiveEventBusDelegatesOperations(t *testing.T) {
	fake := &fakeBus{}
	SetEventBus(fake)
	t.Cleanup(func() { SetEventBus(nil) })

	ctx := context.Background()
	orgID := uuid.New()
	tenantID := uuid.New()

	if err := PublishLogs(ctx, orgID, tenantID, []models.AuditLog{{OrganizationID: orgID, TenantID: tenantID}}); err != nil {
		t.Fatalf("publish failed: %v", err)
	}
	if fake.publishCalls != 1 {
		t.Fatalf("expected publish to be delegated once, got %d", fake.publishCalls)
	}

	if err := Close(); err != nil {
		t.Fatalf("close failed: %v", err)
	}
	if fake.closeCalls != 1 {
		t.Fatalf("expected close to be delegated once, got %d", fake.closeCalls)
	}
}

func TestCloseWithoutEventBusIsNoop(t *testing.T) {
	SetEventBus(nil)

	if err := Close(); err != nil {
		t.Fatalf("expected close without event bus to be no-op, got %v", err)
	}
}
