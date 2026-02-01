package kafka

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"strings"

	"github.com/segmentio/kafka-go"
	"github.com/socr/o365-monitor/internal/elasticsearch"
)

const (
	ConsumerGroup = "es-writer"
)

// StartConsumer starts the Kafka consumer that writes to Elasticsearch
func StartConsumer() {
	brokers := os.Getenv("KAFKA_BROKERS")
	if brokers == "" {
		brokers = "localhost:9092"
	}

	brokerList := strings.Split(brokers, ",")

	reader := kafka.NewReader(kafka.ReaderConfig{
		Brokers:  brokerList,
		Topic:    TopicLogsRaw,
		GroupID:  ConsumerGroup,
		MinBytes: 1e3,  // 1KB
		MaxBytes: 10e6, // 10MB
	})

	log.Printf("Kafka consumer started for topic: %s, group: %s", TopicLogsRaw, ConsumerGroup)

	ctx := context.Background()

	for {
		msg, err := reader.ReadMessage(ctx)
		if err != nil {
			log.Printf("Kafka consumer error: %v", err)
			continue
		}

		var batch LogBatch
		if err := json.Unmarshal(msg.Value, &batch); err != nil {
			log.Printf("Failed to unmarshal log batch: %v", err)
			continue
		}

		// Write to Elasticsearch with org-specific index
		if err := elasticsearch.BulkIndexLogs(ctx, batch.OrganizationID, batch.Logs); err != nil {
			log.Printf("Failed to write logs to Elasticsearch: %v", err)
			continue
		}

		log.Printf("Indexed %d logs to ES for org %s", len(batch.Logs), batch.OrganizationID)
	}
}
