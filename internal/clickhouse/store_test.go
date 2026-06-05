package clickhouse

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/socr/o365-monitor/internal/store"
)

func TestFlexibleInt64AcceptsNumbersAndStrings(t *testing.T) {
	tests := []string{`123`, `"123"`}
	for _, input := range tests {
		var value flexibleInt64
		if err := json.Unmarshal([]byte(input), &value); err != nil {
			t.Fatalf("unmarshal %s: %v", input, err)
		}
		if int64(value) != 123 {
			t.Fatalf("expected 123 for %s, got %d", input, value)
		}
	}
}

func TestBuildWhereClauseMapsSupportedFilters(t *testing.T) {
	orgID := uuid.MustParse("11111111-1111-1111-1111-111111111111")
	tenantID := uuid.MustParse("22222222-2222-2222-2222-222222222222")

	where, err := buildWhereClause(store.SearchParams{
		OrgID:    orgID,
		TenantID: &tenantID,
		Query:    "login",
		Filters: []store.Filter{
			{Field: "userId", Operator: "=", Value: "alice@example.com"},
			{Field: "clientIp", Operator: "contains", Value: "10.0."},
		},
	})
	if err != nil {
		t.Fatalf("build where clause: %v", err)
	}

	for _, expected := range []string{
		"organization_id = '11111111-1111-1111-1111-111111111111'",
		"tenant_id = '22222222-2222-2222-2222-222222222222'",
		"positionCaseInsensitive(operation, 'login') > 0",
		"user_id = 'alice@example.com'",
		"positionCaseInsensitive(client_ip, '10.0.') > 0",
	} {
		if !strings.Contains(where, expected) {
			t.Fatalf("expected where clause to contain %q, got %s", expected, where)
		}
	}
}

func TestBuildWhereClauseRejectsUnsupportedFilters(t *testing.T) {
	_, err := buildWhereClause(store.SearchParams{
		OrgID: uuid.New(),
		Filters: []store.Filter{
			{Field: "unsupported", Operator: "=", Value: "x"},
		},
	})
	if err == nil {
		t.Fatal("expected unsupported field to fail")
	}

	_, err = buildWhereClause(store.SearchParams{
		OrgID: uuid.New(),
		Filters: []store.Filter{
			{Field: "user_id", Operator: "starts_with", Value: "x"},
		},
	})
	if err == nil {
		t.Fatal("expected unsupported operator to fail")
	}
}
