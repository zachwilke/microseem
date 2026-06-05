package natsbus

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"github.com/socr/o365-monitor/internal/models"
	"github.com/socr/o365-monitor/internal/store"
)

const (
	defaultURL         = "nats://localhost:4222"
	defaultStream      = "MICROSEEM_LOGS"
	defaultSubject     = "logs.raw"
	defaultTimeout     = 10 * time.Second
	defaultMaxAgeHours = 168
)

// Bus publishes log batches into NATS JetStream and mirrors successful batches
// into the active log store. The direct store mirror keeps the current API path
// usable while durable JetStream replay consumers are added in the next step.
type Bus struct {
	client  *client
	stream  string
	subject string
}

// NewFromEnv initializes a NATS JetStream-backed event bus from environment variables.
func NewFromEnv(ctx context.Context) (*Bus, error) {
	natsURL := os.Getenv("NATS_URL")
	if natsURL == "" {
		natsURL = defaultURL
	}

	stream := os.Getenv("NATS_STREAM")
	if stream == "" {
		stream = defaultStream
	}

	subject := os.Getenv("NATS_SUBJECT")
	if subject == "" {
		subject = defaultSubject
	}

	maxAgeHours := defaultMaxAgeHours
	if rawMaxAge := os.Getenv("NATS_MAX_AGE_HOURS"); rawMaxAge != "" {
		parsed, err := strconv.Atoi(rawMaxAge)
		if err != nil {
			return nil, fmt.Errorf("parse NATS_MAX_AGE_HOURS: %w", err)
		}
		maxAgeHours = parsed
	}

	bus, err := New(ctx, Config{URL: natsURL, Stream: stream, Subject: subject, MaxAge: time.Duration(maxAgeHours) * time.Hour})
	if err != nil {
		return nil, err
	}

	return bus, nil
}

// Config contains NATS JetStream event bus settings.
type Config struct {
	URL     string
	Stream  string
	Subject string
	MaxAge  time.Duration
}

// New initializes a NATS JetStream-backed event bus.
func New(ctx context.Context, cfg Config) (*Bus, error) {
	if cfg.URL == "" {
		cfg.URL = defaultURL
	}
	if cfg.Stream == "" {
		cfg.Stream = defaultStream
	}
	if cfg.Subject == "" {
		cfg.Subject = defaultSubject
	}
	if cfg.MaxAge <= 0 {
		cfg.MaxAge = defaultMaxAgeHours * time.Hour
	}

	parsed, err := parseURL(cfg.URL)
	if err != nil {
		return nil, err
	}

	client, err := connect(ctx, parsed)
	if err != nil {
		return nil, err
	}

	bus := &Bus{client: client, stream: cfg.Stream, subject: cfg.Subject}
	if err := bus.ensureStream(ctx, cfg.MaxAge); err != nil {
		_ = client.close()
		return nil, err
	}

	log.Printf("NATS JetStream event bus initialized: url=%s stream=%s subject=%s", cfg.URL, cfg.Stream, cfg.Subject)
	return bus, nil
}

// PublishLogs publishes logs to JetStream, then mirrors them to the active log store.
func (b *Bus) PublishLogs(ctx context.Context, orgID uuid.UUID, tenantID uuid.UUID, logs []models.AuditLog) error {
	if len(logs) == 0 {
		return nil
	}

	batch := logBatch{OrganizationID: orgID, TenantID: tenantID, Logs: logs}
	payload, err := json.Marshal(batch)
	if err != nil {
		return fmt.Errorf("marshal NATS log batch: %w", err)
	}

	publishSubject := jetStreamPublishSubject(b.stream, b.subject)
	ackPayload, err := b.client.request(ctx, publishSubject, payload)
	if err != nil {
		return fmt.Errorf("publish logs to NATS JetStream: %w", err)
	}

	if err := validatePublishAck(ackPayload); err != nil {
		return err
	}

	if err := store.BulkInsertLogs(ctx, orgID, logs); err != nil {
		return fmt.Errorf("mirror NATS log batch to log store: %w", err)
	}

	return nil
}

// Close closes the NATS connection.
func (b *Bus) Close() error {
	return b.client.close()
}

func (b *Bus) ensureStream(ctx context.Context, maxAge time.Duration) error {
	payload := streamConfigRequest{
		Name:     b.stream,
		Subjects: []string{b.subject},
		Storage:  "file",
		MaxAge:   int64(maxAge),
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal NATS stream config: %w", err)
	}

	response, err := b.client.request(ctx, "$JS.API.STREAM.CREATE."+b.stream, body)
	if err != nil {
		return fmt.Errorf("create NATS JetStream stream: %w", err)
	}

	var parsed apiResponse
	if err := json.Unmarshal(response, &parsed); err != nil {
		return fmt.Errorf("decode NATS stream create response: %w", err)
	}
	if parsed.Error != nil {
		// Treat existing stream as success. This keeps restarts idempotent even when
		// the stream already exists with compatible settings.
		if parsed.Error.Code == 400 && strings.Contains(strings.ToLower(parsed.Error.Description), "already") {
			return nil
		}
		return fmt.Errorf("NATS stream create error: %s", parsed.Error.Description)
	}

	return nil
}

type logBatch struct {
	OrganizationID uuid.UUID         `json:"organization_id"`
	TenantID       uuid.UUID         `json:"tenant_id"`
	Logs           []models.AuditLog `json:"logs"`
}

type streamConfigRequest struct {
	Name     string   `json:"name"`
	Subjects []string `json:"subjects"`
	Storage  string   `json:"storage"`
	MaxAge   int64    `json:"max_age"`
}

type apiResponse struct {
	Error *struct {
		Code        int    `json:"code"`
		Description string `json:"description"`
	} `json:"error,omitempty"`
}

type publishAck struct {
	Stream string `json:"stream"`
	Seq    uint64 `json:"seq"`
	Error  *struct {
		Code        int    `json:"code"`
		Description string `json:"description"`
	} `json:"error,omitempty"`
}

func validatePublishAck(payload []byte) error {
	var ack publishAck
	if err := json.Unmarshal(payload, &ack); err != nil {
		return fmt.Errorf("decode NATS publish ack: %w", err)
	}
	if ack.Error != nil {
		return fmt.Errorf("NATS publish error: %s", ack.Error.Description)
	}
	if ack.Stream == "" || ack.Seq == 0 {
		return fmt.Errorf("invalid NATS publish ack: %s", string(payload))
	}
	return nil
}

func jetStreamPublishSubject(streamName, subject string) string {
	return "$JS.API.PUB." + streamName + "." + subject
}

type connectionSettings struct {
	address  string
	username string
	password string
}

func parseURL(rawURL string) (connectionSettings, error) {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return connectionSettings{}, fmt.Errorf("parse NATS_URL: %w", err)
	}
	if parsed.Scheme != "nats" && parsed.Scheme != "tcp" {
		return connectionSettings{}, fmt.Errorf("unsupported NATS_URL scheme %q", parsed.Scheme)
	}
	if parsed.Host == "" {
		return connectionSettings{}, fmt.Errorf("NATS_URL must include host")
	}

	settings := connectionSettings{address: parsed.Host}
	if parsed.User != nil {
		settings.username = parsed.User.Username()
		settings.password, _ = parsed.User.Password()
	}
	return settings, nil
}

type client struct {
	conn   net.Conn
	reader *bufio.Reader
	mu     sync.Mutex
	sid    uint64
	inbox  uint64
}

func connect(ctx context.Context, settings connectionSettings) (*client, error) {
	dialer := net.Dialer{}
	conn, err := dialer.DialContext(ctx, "tcp", settings.address)
	if err != nil {
		return nil, fmt.Errorf("connect to NATS: %w", err)
	}

	client := &client{conn: conn, reader: bufio.NewReader(conn)}
	if deadline, ok := ctx.Deadline(); ok {
		_ = conn.SetDeadline(deadline)
	} else {
		_ = conn.SetDeadline(time.Now().Add(defaultTimeout))
	}
	defer conn.SetDeadline(time.Time{})

	line, err := client.reader.ReadString('\n')
	if err != nil {
		_ = conn.Close()
		return nil, fmt.Errorf("read NATS INFO: %w", err)
	}
	if !strings.HasPrefix(line, "INFO") {
		_ = conn.Close()
		return nil, fmt.Errorf("expected NATS INFO, got %q", strings.TrimSpace(line))
	}

	connectPayload := map[string]interface{}{
		"verbose":  false,
		"pedantic": false,
		"lang":     "go",
		"version":  "microseem",
		"protocol": 1,
	}
	if settings.username != "" {
		connectPayload["user"] = settings.username
		connectPayload["pass"] = settings.password
	}
	payload, _ := json.Marshal(connectPayload)
	if _, err := fmt.Fprintf(conn, "CONNECT %s\r\nPING\r\n", payload); err != nil {
		_ = conn.Close()
		return nil, fmt.Errorf("write NATS CONNECT: %w", err)
	}
	if err := client.readUntilPong(); err != nil {
		_ = conn.Close()
		return nil, err
	}

	return client, nil
}

func (c *client) request(ctx context.Context, subject string, payload []byte) ([]byte, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if deadline, ok := ctx.Deadline(); ok {
		_ = c.conn.SetDeadline(deadline)
	} else {
		_ = c.conn.SetDeadline(time.Now().Add(defaultTimeout))
	}
	defer c.conn.SetDeadline(time.Time{})

	sid := atomic.AddUint64(&c.sid, 1)
	inboxID := atomic.AddUint64(&c.inbox, 1)
	inbox := fmt.Sprintf("_INBOX.microseem.%d", inboxID)

	var command bytes.Buffer
	fmt.Fprintf(&command, "SUB %s %d\r\n", inbox, sid)
	fmt.Fprintf(&command, "PUB %s %s %d\r\n", subject, inbox, len(payload))
	command.Write(payload)
	command.WriteString("\r\n")
	fmt.Fprintf(&command, "UNSUB %d 1\r\n", sid)

	if _, err := c.conn.Write(command.Bytes()); err != nil {
		return nil, fmt.Errorf("write NATS request: %w", err)
	}

	return c.readMessage(sid)
}

func (c *client) readUntilPong() error {
	for {
		line, err := c.reader.ReadString('\n')
		if err != nil {
			return fmt.Errorf("read NATS PONG: %w", err)
		}
		line = strings.TrimSpace(line)
		switch {
		case line == "PONG":
			return nil
		case strings.HasPrefix(line, "-ERR"):
			return fmt.Errorf("NATS protocol error: %s", line)
		case line == "PING":
			if _, err := io.WriteString(c.conn, "PONG\r\n"); err != nil {
				return fmt.Errorf("write NATS PONG: %w", err)
			}
		}
	}
}

func (c *client) readMessage(expectedSID uint64) ([]byte, error) {
	for {
		line, err := c.reader.ReadString('\n')
		if err != nil {
			return nil, fmt.Errorf("read NATS message: %w", err)
		}
		line = strings.TrimSpace(line)
		switch {
		case line == "PING":
			if _, err := io.WriteString(c.conn, "PONG\r\n"); err != nil {
				return nil, fmt.Errorf("write NATS PONG: %w", err)
			}
		case strings.HasPrefix(line, "-ERR"):
			return nil, fmt.Errorf("NATS protocol error: %s", line)
		case strings.HasPrefix(line, "MSG "):
			parts := strings.Fields(line)
			if len(parts) < 4 {
				return nil, fmt.Errorf("invalid NATS MSG line: %q", line)
			}
			sid, err := strconv.ParseUint(parts[2], 10, 64)
			if err != nil {
				return nil, fmt.Errorf("parse NATS MSG sid: %w", err)
			}
			lengthRaw := parts[len(parts)-1]
			length, err := strconv.Atoi(lengthRaw)
			if err != nil {
				return nil, fmt.Errorf("parse NATS MSG length: %w", err)
			}

			payload := make([]byte, length+2)
			if _, err := io.ReadFull(c.reader, payload); err != nil {
				return nil, fmt.Errorf("read NATS MSG payload: %w", err)
			}
			if sid == expectedSID {
				return payload[:length], nil
			}
		}
	}
}

func (c *client) close() error {
	if c == nil || c.conn == nil {
		return nil
	}
	return c.conn.Close()
}
