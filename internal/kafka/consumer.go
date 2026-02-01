package kafka

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"strings"
	"time"

	"github.com/segmentio/kafka-go"
	"github.com/socr/o365-monitor/internal/elasticsearch"
)

const (
	ConsumerGroup   = "es-writer"
	maxRetries      = 3
	retryBackoff    = 1 * time.Second
	commitInterval  = 1 * time.Second
	maxWait         = 10 * time.Second
)

// StartConsumer starts the Kafka consumer that writes to Elasticsearch
// It respects context cancellation for graceful shutdown
func StartConsumer(ctx context.Context) {
	brokers := os.Getenv("KAFKA_BROKERS")
	if brokers == "" {
		brokers = "localhost:9092"
	}

	brokerList := strings.Split(brokers, ",")

	reader := kafka.NewReader(kafka.ReaderConfig{
		Brokers:        brokerList,
		Topic:          TopicLogsRaw,
		GroupID:        ConsumerGroup,
		MinBytes:       1e3,  // 1KB
		MaxBytes:       10e6, // 10MB
		MaxWait:        maxWait,
		CommitInterval: commitInterval,
	})

	// Ensure reader is closed on exit
	defer func() {
		if err := reader.Close(); err != nil {
			log.Printf("Kafka consumer close error: %v", err)
		} else {
			log.Println("Kafka consumer closed successfully")
		}
	}()

	log.Printf("Kafka consumer started for topic: %s, group: %s", TopicLogsRaw, ConsumerGroup)

	for {
		select {
		case <-ctx.Done():
			log.Println("Kafka consumer shutting down...")
			return
		default:
		}

		// Use context with timeout for each read
		readCtx, cancel := context.WithTimeout(ctx, maxWait+5*time.Second)
		msg, err := reader.ReadMessage(readCtx)
		cancel()

		if err != nil {
			// Check if shutdown requested
			if ctx.Err() != nil {
				return
			}
			// Log error but continue - transient errors are expected
			log.Printf("Kafka consumer read error: %v", err)
			continue
		}

		if err := processMessage(ctx, msg); err != nil {
			log.Printf("Failed to process message: %v", err)
			// Continue processing other messages
		}
	}
}

// processMessage handles a single Kafka message with retries
func processMessage(ctx context.Context, msg kafka.Message) error {
	var batch LogBatch
	if err := json.Unmarshal(msg.Value, &batch); err != nil {
		// Invalid JSON - log and skip (no point retrying)
		log.Printf("Failed to unmarshal log batch: %v", err)
		return nil
	}

	// Retry logic for ES writes
	var lastErr error
	for attempt := 1; attempt <= maxRetries; attempt++ {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		// Use context with timeout for ES write
		writeCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
		err := elasticsearch.BulkIndexLogs(writeCtx, batch.OrganizationID, batch.Logs)
		cancel()

		if err == nil {
			log.Printf("Indexed %d logs to ES for org %s", len(batch.Logs), batch.OrganizationID)
			return nil
		}

		lastErr = err
		log.Printf("ES write attempt %d/%d failed: %v", attempt, maxRetries, err)

		if attempt < maxRetries {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(retryBackoff * time.Duration(attempt)):
				// Exponential backoff
			}
		}
	}

	return lastErr
}
