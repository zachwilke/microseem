package elasticsearch

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/elastic/go-elasticsearch/v8"
	"github.com/elastic/go-elasticsearch/v8/esapi"
	"github.com/google/uuid"
	"github.com/socr/o365-monitor/internal/models"
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

// InitClient initializes the Elasticsearch client
func InitClient() error {
	esURL := os.Getenv("ELASTICSEARCH_URL")
	if esURL == "" {
		esURL = "http://localhost:9200"
	}

	cfg := elasticsearch.Config{
		Addresses: []string{esURL},
	}

	var err error
	Client, err = elasticsearch.NewClient(cfg)
	if err != nil {
		return fmt.Errorf("failed to create ES client: %w", err)
	}

	// Test connection
	res, err := Client.Info()
	if err != nil {
		return fmt.Errorf("failed to connect to ES: %w", err)
	}
	defer res.Body.Close()

	if res.IsError() {
		return fmt.Errorf("ES error response: %s", res.String())
	}

	log.Printf("Connected to Elasticsearch: %s", esURL)

	// Create index template
	if err := createIndexTemplate(); err != nil {
		log.Printf("Warning: Failed to create index template: %v", err)
	}

	return nil
}

// createIndexTemplate creates the index template for logs
func createIndexTemplate() error {
	req := esapi.IndicesPutIndexTemplateRequest{
		Name: "logs-template",
		Body: strings.NewReader(indexTemplateBody),
	}

	res, err := req.Do(context.Background(), Client)
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

// LogDocument represents a log document for Elasticsearch
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

// GeoPoint represents a geo_point for Elasticsearch
type GeoPoint struct {
	Lat float64 `json:"lat"`
	Lon float64 `json:"lon"`
}

// AuditLogToDocument converts an AuditLog to a LogDocument
func AuditLogToDocument(log models.AuditLog) LogDocument {
	doc := LogDocument{
		ID:             log.ID.String(),
		OrganizationID: log.OrganizationID.String(),
		TenantID:       log.TenantID.String(),
		RecordType:     log.RecordType,
		CreationTime:   log.CreationTime,
		Operation:      log.Operation,
		Workload:       log.Workload,
		UserID:         log.UserId,
		ClientIP:       log.ClientIP,
		City:           log.City,
		CountryCode:    log.CountryCode,
		IngestedAt:     log.IngestedAt,
	}

	// Add geo_point if coordinates exist
	if log.Latitude != 0 || log.Longitude != 0 {
		doc.Location = &GeoPoint{
			Lat: log.Latitude,
			Lon: log.Longitude,
		}
	}

	// Parse RawData from JSON bytes
	if len(log.RawData) > 0 {
		json.Unmarshal(log.RawData, &doc.RawData)
	}

	return doc
}

// BulkIndexLogs indexes a batch of logs to Elasticsearch
func BulkIndexLogs(ctx context.Context, orgID uuid.UUID, logs []models.AuditLog) error {
	if len(logs) == 0 {
		return nil
	}

	var buf bytes.Buffer

	for _, log := range logs {
		indexName := GetIndexName(orgID, log.CreationTime)
		doc := AuditLogToDocument(log)

		// Bulk action metadata
		meta := map[string]interface{}{
			"index": map[string]interface{}{
				"_index": indexName,
				"_id":    doc.ID,
			},
		}
		metaBytes, _ := json.Marshal(meta)
		buf.Write(metaBytes)
		buf.WriteByte('\n')

		// Document
		docBytes, _ := json.Marshal(doc)
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

	return nil
}
