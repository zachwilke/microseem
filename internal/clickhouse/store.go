package clickhouse

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/socr/o365-monitor/internal/models"
	"github.com/socr/o365-monitor/internal/store"
)

const (
	defaultURL      = "http://localhost:8123"
	defaultDatabase = "microseem"
	defaultTimeout  = 30 * time.Second
	maxResultSize   = 10000
)

var safeIdentifier = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)

// Store is a ClickHouse-backed implementation of store.LogStore that uses the
// ClickHouse HTTP API. It intentionally avoids extra client dependencies so the
// lightweight path remains buildable in constrained environments.
type Store struct {
	baseURL    string
	database   string
	username   string
	password   string
	httpClient *http.Client
}

// NewFromEnv creates a ClickHouse store from environment variables.
func NewFromEnv() (*Store, error) {
	baseURL := os.Getenv("CLICKHOUSE_URL")
	if baseURL == "" {
		baseURL = defaultURL
	}

	database := os.Getenv("CLICKHOUSE_DATABASE")
	if database == "" {
		database = defaultDatabase
	}

	return NewStore(baseURL, database, os.Getenv("CLICKHOUSE_USER"), os.Getenv("CLICKHOUSE_PASSWORD"))
}

// NewStore creates and initializes a ClickHouse store.
func NewStore(baseURL, database, username, password string) (*Store, error) {
	if !safeIdentifier.MatchString(database) {
		return nil, fmt.Errorf("invalid ClickHouse database name %q", database)
	}

	store := &Store{
		baseURL:  strings.TrimRight(baseURL, "/"),
		database: database,
		username: username,
		password: password,
		httpClient: &http.Client{
			Timeout: defaultTimeout,
		},
	}

	ctx, cancel := context.WithTimeout(context.Background(), defaultTimeout)
	defer cancel()

	if err := store.initSchema(ctx); err != nil {
		return nil, err
	}

	return store, nil
}

func (s *Store) initSchema(ctx context.Context) error {
	if err := s.exec(ctx, fmt.Sprintf("CREATE DATABASE IF NOT EXISTS %s", quoteIdentifier(s.database)), nil); err != nil {
		return fmt.Errorf("create ClickHouse database: %w", err)
	}

	query := fmt.Sprintf(`CREATE TABLE IF NOT EXISTS %s.security_events
(
    id String,
    organization_id UUID,
    tenant_id UUID,
    record_type Int32,
    creation_time DateTime64(3, 'UTC'),
    operation LowCardinality(String),
    workload LowCardinality(String),
    user_id String,
    client_ip String,
    city LowCardinality(String),
    country_code LowCardinality(String),
    latitude Float64,
    longitude Float64,
    raw_data String,
    ingested_at DateTime64(3, 'UTC')
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(creation_time)
ORDER BY (organization_id, creation_time, tenant_id, workload, operation, user_id, client_ip)`, quoteIdentifier(s.database))

	if err := s.exec(ctx, query, nil); err != nil {
		return fmt.Errorf("create ClickHouse security_events table: %w", err)
	}

	return nil
}

// Health verifies ClickHouse can answer a lightweight query.
func (s *Store) Health(ctx context.Context) error {
	return s.exec(ctx, "SELECT 1", nil)
}

// BulkInsertLogs writes normalized audit logs to ClickHouse.
func (s *Store) BulkInsertLogs(ctx context.Context, orgID uuid.UUID, logs []models.AuditLog) error {
	if len(logs) == 0 {
		return nil
	}

	var body bytes.Buffer
	writer := bufio.NewWriter(&body)
	encoder := json.NewEncoder(writer)

	for _, logEntry := range logs {
		rawData := string(logEntry.RawData)
		if rawData == "" {
			rawData = "{}"
		}

		row := map[string]interface{}{
			"id":              logEntry.ID.String(),
			"organization_id": orgID.String(),
			"tenant_id":       logEntry.TenantID.String(),
			"record_type":     logEntry.RecordType,
			"creation_time":   formatClickHouseTime(logEntry.CreationTime),
			"operation":       logEntry.Operation,
			"workload":        logEntry.Workload,
			"user_id":         logEntry.UserId,
			"client_ip":       logEntry.ClientIP,
			"city":            logEntry.City,
			"country_code":    logEntry.CountryCode,
			"latitude":        logEntry.Latitude,
			"longitude":       logEntry.Longitude,
			"raw_data":        rawData,
			"ingested_at":     formatClickHouseTime(logEntry.IngestedAt),
		}

		if err := encoder.Encode(row); err != nil {
			return fmt.Errorf("encode ClickHouse insert row: %w", err)
		}
	}

	if err := writer.Flush(); err != nil {
		return fmt.Errorf("flush ClickHouse insert body: %w", err)
	}

	query := fmt.Sprintf("INSERT INTO %s.security_events FORMAT JSONEachRow", quoteIdentifier(s.database))
	if err := s.exec(ctx, query, &body); err != nil {
		return fmt.Errorf("insert ClickHouse log batch: %w", err)
	}

	return nil
}

// SearchLogs searches ClickHouse-backed audit logs.
func (s *Store) SearchLogs(ctx context.Context, params store.SearchParams) (*store.SearchResult, error) {
	params.Size = validateSize(params.Size)

	where, err := buildWhereClause(params)
	if err != nil {
		return nil, err
	}

	query := fmt.Sprintf(`SELECT
    id,
    toString(organization_id) AS organization_id,
    toString(tenant_id) AS tenant_id,
    record_type,
    toUnixTimestamp64Milli(creation_time) AS creation_time_ms,
    operation,
    workload,
    user_id,
    client_ip,
    city,
    country_code,
    latitude,
    longitude,
    raw_data,
    toUnixTimestamp64Milli(ingested_at) AS ingested_at_ms,
    count() OVER() AS total
FROM %s.security_events
WHERE %s
ORDER BY creation_time DESC
LIMIT %d OFFSET %d
FORMAT JSON`, quoteIdentifier(s.database), where, params.Size, max(params.From, 0))

	var response searchResponse
	if err := s.queryJSON(ctx, query, &response); err != nil {
		return nil, fmt.Errorf("query ClickHouse logs: %w", err)
	}

	result := &store.SearchResult{Logs: make([]store.LogDocument, 0, len(response.Data))}
	for _, row := range response.Data {
		if int64(row.Total) > result.Total {
			result.Total = int64(row.Total)
		}

		doc := store.LogDocument{
			ID:             row.ID,
			OrganizationID: row.OrganizationID,
			TenantID:       row.TenantID,
			RecordType:     row.RecordType,
			CreationTime:   time.UnixMilli(int64(row.CreationTimeMS)).UTC(),
			Operation:      row.Operation,
			Workload:       row.Workload,
			UserID:         row.UserID,
			ClientIP:       row.ClientIP,
			City:           row.City,
			CountryCode:    row.CountryCode,
			IngestedAt:     time.UnixMilli(int64(row.IngestedAtMS)).UTC(),
		}

		if row.Latitude != 0 || row.Longitude != 0 {
			doc.Location = &store.GeoPoint{Lat: row.Latitude, Lon: row.Longitude}
		}
		if row.RawData != "" {
			_ = json.Unmarshal([]byte(row.RawData), &doc.RawData)
		}

		result.Logs = append(result.Logs, doc)
	}

	return result, nil
}

// GetStats retrieves 24-hour log aggregations from ClickHouse.
func (s *Store) GetStats(ctx context.Context, orgID uuid.UUID, tenantID *uuid.UUID) (*store.StatsResult, error) {
	baseFilter := []string{
		"organization_id = " + quoteString(orgID.String()),
		"creation_time >= now() - INTERVAL 24 HOUR",
	}
	if tenantID != nil {
		baseFilter = append(baseFilter, "tenant_id = "+quoteString(tenantID.String()))
	}
	where := strings.Join(baseFilter, " AND ")

	result := &store.StatsResult{
		TopUsers:      make([]store.BucketResult, 0),
		TopOperations: make([]store.BucketResult, 0),
		VolumeHistory: make([]store.VolumeDataPoint, 0),
	}

	var countResp countResponse
	if err := s.queryJSON(ctx, fmt.Sprintf("SELECT count() AS count FROM %s.security_events WHERE %s FORMAT JSON", quoteIdentifier(s.database), where), &countResp); err != nil {
		return nil, fmt.Errorf("query ClickHouse total logs: %w", err)
	}
	if len(countResp.Data) > 0 {
		result.TotalLogs = int64(countResp.Data[0].Count)
	}

	var topUsers bucketResponse
	if err := s.queryJSON(ctx, fmt.Sprintf("SELECT user_id AS key, count() AS count FROM %s.security_events WHERE %s AND user_id != '' GROUP BY user_id ORDER BY count DESC LIMIT 5 FORMAT JSON", quoteIdentifier(s.database), where), &topUsers); err != nil {
		return nil, fmt.Errorf("query ClickHouse top users: %w", err)
	}
	result.TopUsers = topUsers.toStoreBuckets()

	var topOps bucketResponse
	if err := s.queryJSON(ctx, fmt.Sprintf("SELECT operation AS key, count() AS count FROM %s.security_events WHERE %s AND operation != '' GROUP BY operation ORDER BY count DESC LIMIT 5 FORMAT JSON", quoteIdentifier(s.database), where), &topOps); err != nil {
		return nil, fmt.Errorf("query ClickHouse top operations: %w", err)
	}
	result.TopOperations = topOps.toStoreBuckets()

	var volume volumeResponse
	if err := s.queryJSON(ctx, fmt.Sprintf("SELECT toUnixTimestamp64Milli(toStartOfHour(creation_time)) AS time_ms, count() AS count FROM %s.security_events WHERE %s GROUP BY time_ms ORDER BY time_ms ASC FORMAT JSON", quoteIdentifier(s.database), where), &volume); err != nil {
		return nil, fmt.Errorf("query ClickHouse volume history: %w", err)
	}
	for _, row := range volume.Data {
		result.VolumeHistory = append(result.VolumeHistory, store.VolumeDataPoint{Time: time.UnixMilli(int64(row.TimeMS)).UTC(), Count: int64(row.Count)})
	}

	return result, nil
}

func (s *Store) exec(ctx context.Context, query string, body io.Reader) error {
	resBody, err := s.do(ctx, query, body)
	if err != nil {
		return err
	}
	defer resBody.Close()
	_, _ = io.Copy(io.Discard, resBody)
	return nil
}

func (s *Store) queryJSON(ctx context.Context, query string, target interface{}) error {
	resBody, err := s.do(ctx, query, nil)
	if err != nil {
		return err
	}
	defer resBody.Close()
	if err := json.NewDecoder(resBody).Decode(target); err != nil {
		return fmt.Errorf("decode ClickHouse response: %w", err)
	}
	return nil
}

func (s *Store) do(ctx context.Context, query string, body io.Reader) (io.ReadCloser, error) {
	endpoint, err := url.Parse(s.baseURL)
	if err != nil {
		return nil, fmt.Errorf("parse ClickHouse URL: %w", err)
	}

	values := endpoint.Query()
	values.Set("query", query)
	endpoint.RawQuery = values.Encode()

	method := http.MethodPost
	if body == nil {
		body = http.NoBody
	}

	req, err := http.NewRequestWithContext(ctx, method, endpoint.String(), body)
	if err != nil {
		return nil, fmt.Errorf("create ClickHouse request: %w", err)
	}
	if s.username != "" {
		req.SetBasicAuth(s.username, s.password)
	}

	res, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("execute ClickHouse request: %w", err)
	}

	if res.StatusCode < 200 || res.StatusCode >= 300 {
		defer res.Body.Close()
		bodyBytes, _ := io.ReadAll(io.LimitReader(res.Body, 4096))
		return nil, fmt.Errorf("ClickHouse HTTP %d: %s", res.StatusCode, strings.TrimSpace(string(bodyBytes)))
	}

	return res.Body, nil
}

type searchResponse struct {
	Data []struct {
		ID             string        `json:"id"`
		OrganizationID string        `json:"organization_id"`
		TenantID       string        `json:"tenant_id"`
		RecordType     int           `json:"record_type"`
		CreationTimeMS flexibleInt64 `json:"creation_time_ms"`
		Operation      string        `json:"operation"`
		Workload       string        `json:"workload"`
		UserID         string        `json:"user_id"`
		ClientIP       string        `json:"client_ip"`
		City           string        `json:"city"`
		CountryCode    string        `json:"country_code"`
		Latitude       float64       `json:"latitude"`
		Longitude      float64       `json:"longitude"`
		RawData        string        `json:"raw_data"`
		IngestedAtMS   flexibleInt64 `json:"ingested_at_ms"`
		Total          flexibleInt64 `json:"total"`
	} `json:"data"`
}

type countResponse struct {
	Data []struct {
		Count flexibleInt64 `json:"count"`
	} `json:"data"`
}

type bucketResponse struct {
	Data []struct {
		Key   string        `json:"key"`
		Count flexibleInt64 `json:"count"`
	} `json:"data"`
}

func (r bucketResponse) toStoreBuckets() []store.BucketResult {
	buckets := make([]store.BucketResult, 0, len(r.Data))
	for _, row := range r.Data {
		buckets = append(buckets, store.BucketResult{Key: row.Key, Count: int64(row.Count)})
	}
	return buckets
}

type volumeResponse struct {
	Data []struct {
		TimeMS flexibleInt64 `json:"time_ms"`
		Count  flexibleInt64 `json:"count"`
	} `json:"data"`
}

func buildWhereClause(params store.SearchParams) (string, error) {
	filters := []string{"organization_id = " + quoteString(params.OrgID.String())}

	if params.StartTime != nil {
		filters = append(filters, "creation_time >= parseDateTime64BestEffort("+quoteString(params.StartTime.UTC().Format(time.RFC3339Nano))+", 3)")
	}
	if params.EndTime != nil {
		filters = append(filters, "creation_time <= parseDateTime64BestEffort("+quoteString(params.EndTime.UTC().Format(time.RFC3339Nano))+", 3)")
	}
	if params.TenantID != nil {
		filters = append(filters, "tenant_id = "+quoteString(params.TenantID.String()))
	}
	if params.Query != "" {
		filters = append(filters, buildContainsAnyClause(params.Query))
	}

	for _, filter := range params.Filters {
		clause, err := buildFilterClause(filter)
		if err != nil {
			return "", err
		}
		if clause != "" {
			filters = append(filters, clause)
		}
	}

	return strings.Join(filters, " AND "), nil
}

func buildContainsAnyClause(value string) string {
	pattern := quoteLikePattern(value)
	fields := []string{"operation", "user_id", "workload", "city", "country_code", "client_ip", "raw_data"}
	clauses := make([]string, 0, len(fields))
	for _, field := range fields {
		clauses = append(clauses, fmt.Sprintf("positionCaseInsensitive(%s, %s) > 0", field, quoteString(pattern)))
	}
	return "(" + strings.Join(clauses, " OR ") + ")"
}

func buildFilterClause(filter store.Filter) (string, error) {
	field, ok := mapFieldName(filter.Field)
	if !ok {
		return "", fmt.Errorf("unsupported ClickHouse filter field %q", filter.Field)
	}

	switch filter.Operator {
	case "=":
		return fmt.Sprintf("%s = %s", field, quoteString(filter.Value)), nil
	case "!=":
		return fmt.Sprintf("%s != %s", field, quoteString(filter.Value)), nil
	case "contains":
		return fmt.Sprintf("positionCaseInsensitive(%s, %s) > 0", field, quoteString(quoteLikePattern(filter.Value))), nil
	default:
		return "", fmt.Errorf("unsupported ClickHouse filter operator %q", filter.Operator)
	}
}

func mapFieldName(field string) (string, bool) {
	switch field {
	case "id":
		return "id", true
	case "organization_id", "organizationId":
		return "organization_id", true
	case "tenant_id", "tenantId":
		return "tenant_id", true
	case "record_type", "recordType":
		return "toString(record_type)", true
	case "operation":
		return "operation", true
	case "workload":
		return "workload", true
	case "user_id", "userId":
		return "user_id", true
	case "client_ip", "clientIp":
		return "client_ip", true
	case "city":
		return "city", true
	case "country_code", "countryCode":
		return "country_code", true
	case "raw_data", "rawData":
		return "raw_data", true
	default:
		return "", false
	}
}

func formatClickHouseTime(t time.Time) string {
	if t.IsZero() {
		t = time.Now().UTC()
	}
	return t.UTC().Format("2006-01-02 15:04:05.000")
}

func validateSize(size int) int {
	if size <= 0 {
		return 100
	}
	if size > maxResultSize {
		return maxResultSize
	}
	return size
}

func quoteIdentifier(identifier string) string {
	return "`" + identifier + "`"
}

func quoteString(value string) string {
	return "'" + strings.ReplaceAll(strings.ReplaceAll(value, "\\", "\\\\"), "'", "\\'") + "'"
}

func quoteLikePattern(value string) string {
	return strings.TrimSpace(value)
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

type flexibleInt64 int64

func (i *flexibleInt64) UnmarshalJSON(data []byte) error {
	value := strings.Trim(string(data), "\"")
	if value == "" || value == "null" {
		*i = 0
		return nil
	}

	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil {
		return err
	}

	*i = flexibleInt64(parsed)
	return nil
}
