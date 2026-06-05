package store

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/socr/o365-monitor/internal/models"
)

type fakeLogStore struct {
	bulkCalled  bool
	searchCalls int
	statsCalls  int
	healthCalls int
}

func (f *fakeLogStore) BulkInsertLogs(ctx context.Context, orgID uuid.UUID, logs []models.AuditLog) error {
	f.bulkCalled = true
	return nil
}

func (f *fakeLogStore) SearchLogs(ctx context.Context, params SearchParams) (*SearchResult, error) {
	f.searchCalls++
	return &SearchResult{Total: 1}, nil
}

func (f *fakeLogStore) GetStats(ctx context.Context, orgID uuid.UUID, tenantID *uuid.UUID) (*StatsResult, error) {
	f.statsCalls++
	return &StatsResult{TotalLogs: 1}, nil
}

func (f *fakeLogStore) Health(ctx context.Context) error {
	f.healthCalls++
	return nil
}

func TestGetLogStoreRequiresInitialization(t *testing.T) {
	SetLogStore(nil)

	if _, err := GetLogStore(); err == nil {
		t.Fatal("expected error when log store is not initialized")
	}
}

func TestActiveLogStoreDelegatesOperations(t *testing.T) {
	fake := &fakeLogStore{}
	SetLogStore(fake)
	t.Cleanup(func() { SetLogStore(nil) })

	ctx := context.Background()
	orgID := uuid.New()

	if err := BulkInsertLogs(ctx, orgID, []models.AuditLog{{OrganizationID: orgID}}); err != nil {
		t.Fatalf("bulk insert failed: %v", err)
	}
	if !fake.bulkCalled {
		t.Fatal("expected bulk insert to be delegated")
	}

	result, err := SearchLogs(ctx, SearchParams{OrgID: orgID})
	if err != nil {
		t.Fatalf("search failed: %v", err)
	}
	if result.Total != 1 || fake.searchCalls != 1 {
		t.Fatalf("expected search to be delegated once, got total=%d calls=%d", result.Total, fake.searchCalls)
	}

	stats, err := GetStats(ctx, orgID, nil)
	if err != nil {
		t.Fatalf("stats failed: %v", err)
	}
	if stats.TotalLogs != 1 || fake.statsCalls != 1 {
		t.Fatalf("expected stats to be delegated once, got total=%d calls=%d", stats.TotalLogs, fake.statsCalls)
	}

	if err := Health(ctx); err != nil {
		t.Fatalf("health failed: %v", err)
	}
	if fake.healthCalls != 1 {
		t.Fatalf("expected health to be delegated once, got calls=%d", fake.healthCalls)
	}
}
