package kafka

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/segmentio/kafka-go"
	"github.com/socr/o365-monitor/internal/models"
)

const (
	TopicLogsRaw  = "logs-raw"
	writeTimeout  = 10 * time.Second
)

var (
	producer *kafka.Writer
)

// LogBatch represents a batch of logs to be produced to Kafka
type LogBatch struct {
	OrganizationID uuid.UUID         `json:"organization_id"`
	TenantID       uuid.UUID         `json:"tenant_id"`
	Logs           []models.AuditLog `json:"logs"`
}

// InitProducer initializes the Kafka producer
func InitProducer() error {
	brokers := os.Getenv("KAFKA_BROKERS")
	if brokers == "" {
		brokers = "localhost:9092"
	}

	brokerList := strings.Split(brokers, ",")

	producer = &kafka.Writer{
		Addr:         kafka.TCP(brokerList...),
		Topic:        TopicLogsRaw,
		Balancer:     &kafka.Hash{}, // Partition by key (org_id)
		BatchSize:    100,
		BatchTimeout: 10 * time.Millisecond,
		RequiredAcks: kafka.RequireOne,
		Async:        false,
	}

	log.Printf("Kafka producer initialized for topic: %s, brokers: %v", TopicLogsRaw, brokerList)
	return nil
}

// ProduceLogs sends a batch of logs to Kafka, partitioned by organization ID
func ProduceLogs(ctx context.Context, orgID uuid.UUID, tenantID uuid.UUID, logs []models.AuditLog) error {
	if producer == nil {
		return nil // Kafka not configured, skip
	}

	if len(logs) == 0 {
		return nil
	}

	batch := LogBatch{
		OrganizationID: orgID,
		TenantID:       tenantID,
		Logs:           logs,
	}

	value, err := json.Marshal(batch)
	if err != nil {
		return fmt.Errorf("failed to marshal log batch: %w", err)
	}

	msg := kafka.Message{
		Key:   []byte(orgID.String()), // Partition by org_id for ordering within org
		Value: value,
		Time:  time.Now(),
	}

	// Use timeout context for write
	writeCtx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()

	if err := producer.WriteMessages(writeCtx, msg); err != nil {
		return fmt.Errorf("kafka write failed: %w", err)
	}

	return nil
}

// Close closes the Kafka producer
func Close() error {
	if producer != nil {
		return producer.Close()
	}
	return nil
}
