package elasticsearch

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/elastic/go-elasticsearch/v8"
	"github.com/elastic/go-elasticsearch/v8/esapi"
	"github.com/google/uuid"
	"github.com/socr/o365-monitor/internal/models"
)

const (
	requestTimeout  = 30 * time.Second
	maxIdleConns    = 10
	idleConnTimeout = 30 * time.Second
	maxResultSize   = 10000 // Hard limit on search results
)

var (
	Client *elasticsearch.Client
)

// IndexTemplate for logs-* indices
const indexTemplateBody = `{
	"index_patterns": ["logs-*"],
	"template": {
		"settings": {
			"number_of_shards": 1,
			"number_of_replicas": 0,
			"refresh_interval": "5s"
		},
		"mappings": {
			"properties": {
				"id": { "type": "keyword" },
				"organization_id": { "type": "keyword" },
				"tenant_id": { "type": "keyword" },
				"record_type": { "type": "integer" },
				"creation_time": { "type": "date" },
				"operation": { "type": "keyword" },
				"workload": { "type": "keyword" },
				"user_id": { "type": "keyword" },
				"client_ip": { "type": "ip", "ignore_malformed": true },
				"city": { "type": "keyword" },
				"country_code": { "type": "keyword" },
				"location": { "type": "geo_point" },
				"raw_data": { "type": "object", "enabled": true },
				"ingested_at": { "type": "date" }
			}
		}
	}
}`

// InitClient initializes the Elasticsearch client with proper timeouts
func InitClient() error {
	esURL := os.Getenv("ELASTICSEARCH_URL")
	if esURL == "" {
		esURL = "http://localhost:9200"
	}

	// Configure HTTP transport with timeouts
	transport := &http.Transport{
		MaxIdleConns:        maxIdleConns,
		MaxIdleConnsPerHost: maxIdleConns,
		IdleConnTimeout:     idleConnTimeout,
	}

	cfg := elasticsearch.Config{
		Addresses: []string{esURL},
		Transport: transport,
	}

	var err error
	Client, err = elasticsearch.NewClient(cfg)
	if err != nil {
		return fmt.Errorf("failed to create ES client: %w", err)
	}

	// Test connection with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	res, err := Client.Info(Client.Info.WithContext(ctx))
	if err != nil {
		return fmt.Errorf("failed to connect to ES: %w", err)
	}
	defer res.Body.Close()

	if res.IsError() {
		return fmt.Errorf("ES error response: %s", res.String())
	}

	log.Printf("Connected to Elasticsearch: %s", esURL)

	// Create index template
	if err := createIndexTemplate(ctx); err != nil {
		log.Printf("Warning: Failed to create index template: %v", err)
	}

	return nil
}

// createIndexTemplate creates the index template for logs
func createIndexTemplate(ctx context.Context) error {
	req := esapi.IndicesPutIndexTemplateRequest{
		Name: "logs-template",
		Body: strings.NewReader(indexTemplateBody),
	}

	res, err := req.Do(ctx, Client)
	if err != nil {
		return err
	}
	defer res.Body.Close()

	if res.IsError() {
		return fmt.Errorf("failed to create index template: %s", res.String())
	}

	log.Println("Elasticsearch index template created/updated: logs-template")
	return nil
}

// GetIndexName returns the index name for a given org and date
func GetIndexName(orgID uuid.UUID, t time.Time) string {
	return fmt.Sprintf("logs-%s-%s", orgID.String(), t.Format("2006.01.02"))
}

// GetIndexPattern returns the index pattern for a given org
func GetIndexPattern(orgID uuid.UUID) string {
	return fmt.Sprintf("logs-%s-*", orgID.String())
}

// AuditLogToDocument converts an AuditLog to a LogDocument
func AuditLogToDocument(auditLog models.AuditLog) LogDocument {
	doc := LogDocument{
		ID:             auditLog.ID.String(),
		OrganizationID: auditLog.OrganizationID.String(),
		TenantID:       auditLog.TenantID.String(),
		RecordType:     auditLog.RecordType,
		CreationTime:   auditLog.CreationTime,
		Operation:      auditLog.Operation,
		Workload:       auditLog.Workload,
		UserID:         auditLog.UserId,
		ClientIP:       auditLog.ClientIP,
		City:           auditLog.City,
		CountryCode:    auditLog.CountryCode,
		IngestedAt:     auditLog.IngestedAt,
	}

	// Add geo_point if coordinates exist
	if auditLog.Latitude != 0 || auditLog.Longitude != 0 {
		doc.Location = &GeoPoint{
			Lat: auditLog.Latitude,
			Lon: auditLog.Longitude,
		}
	}

	// Parse RawData from JSON bytes - ignore errors for invalid JSON
	if len(auditLog.RawData) > 0 {
		_ = json.Unmarshal(auditLog.RawData, &doc.RawData)
	}

	return doc
}

// BulkIndexLogs indexes a batch of logs to Elasticsearch
func BulkIndexLogs(ctx context.Context, orgID uuid.UUID, logs []models.AuditLog) error {
	if len(logs) == 0 {
		return nil
	}

	if Client == nil {
		return fmt.Errorf("elasticsearch client not initialized")
	}

	var buf bytes.Buffer

	for _, logEntry := range logs {
		indexName := GetIndexName(orgID, logEntry.CreationTime)
		doc := AuditLogToDocument(logEntry)

		// Bulk action metadata
		meta := map[string]interface{}{
			"index": map[string]interface{}{
				"_index": indexName,
				"_id":    doc.ID,
			},
		}
		metaBytes, err := json.Marshal(meta)
		if err != nil {
			return fmt.Errorf("failed to marshal bulk metadata: %w", err)
		}
		buf.Write(metaBytes)
		buf.WriteByte('\n')

		// Document
		docBytes, err := json.Marshal(doc)
		if err != nil {
			return fmt.Errorf("failed to marshal document: %w", err)
		}
		buf.Write(docBytes)
		buf.WriteByte('\n')
	}

	res, err := Client.Bulk(bytes.NewReader(buf.Bytes()), Client.Bulk.WithContext(ctx))
	if err != nil {
		return fmt.Errorf("bulk index failed: %w", err)
	}
	defer res.Body.Close()

	if res.IsError() {
		return fmt.Errorf("bulk index error response: %s", res.String())
	}

	// Check for item-level errors
	var bulkResponse struct {
		Errors bool `json:"errors"`
		Items  []struct {
			Index struct {
				Error *struct {
					Type   string `json:"type"`
					Reason string `json:"reason"`
				} `json:"error,omitempty"`
			} `json:"index"`
		} `json:"items"`
	}

	if err := json.NewDecoder(res.Body).Decode(&bulkResponse); err != nil {
		return fmt.Errorf("failed to decode bulk response: %w", err)
	}

	if bulkResponse.Errors {
		// Count errors and log first few
		errorCount := 0
		for _, item := range bulkResponse.Items {
			if item.Index.Error != nil {
				errorCount++
				if errorCount <= 3 {
					log.Printf("Bulk index item error: %s - %s", item.Index.Error.Type, item.Index.Error.Reason)
				}
			}
		}
		return fmt.Errorf("bulk index had %d errors out of %d items", errorCount, len(logs))
	}

	return nil
}

// ValidateSize ensures the requested size is within bounds
func ValidateSize(size int) int {
	if size <= 0 {
		return 100 // default
	}
	if size > maxResultSize {
		return maxResultSize
	}
	return size
}
