package kafka

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/segmentio/kafka-go"
	"github.com/socr/o365-monitor/internal/models"
)

const (
	TopicLogsRaw = "logs-raw"
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

	batch := LogBatch{
		OrganizationID: orgID,
		TenantID:       tenantID,
		Logs:           logs,
	}

	value, err := json.Marshal(batch)
	if err != nil {
		return err
	}

	msg := kafka.Message{
		Key:   []byte(orgID.String()), // Partition by org_id for ordering within org
		Value: value,
		Time:  time.Now(),
	}

	return producer.WriteMessages(ctx, msg)
}

// Close closes the Kafka producer
func Close() error {
	if producer != nil {
		return producer.Close()
	}
	return nil
}
