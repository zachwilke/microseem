package ingest

import (
	"context"
	"encoding/json"
	"log"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"os"

	"github.com/google/uuid"
	"github.com/socr/o365-monitor/internal/alerting"
	"github.com/socr/o365-monitor/internal/database"
	"github.com/socr/o365-monitor/internal/geoip"
	"github.com/socr/o365-monitor/internal/hub"
	"github.com/socr/o365-monitor/internal/kafka"
	"github.com/socr/o365-monitor/internal/models"
	"github.com/socr/o365-monitor/internal/o365"
	"gorm.io/datatypes"
)

const (
	WorkerCount = 25
)

type Job struct {
	Tenant      models.Tenant
	ContentType string
	StartTime   time.Time
	EndTime     time.Time
}

var manualTrigger = make(chan struct{}, 1)
var ingestCounter uint64
var errorCounter uint64

func TriggerPoll() {
	select {
	case manualTrigger <- struct{}{}:
	default:
	}
}

func StartPoller(ctx context.Context) {
	// Initialize GeoIP
	dbPath := os.Getenv("GEOIP_DB_PATH")
	if dbPath == "" {
		dbPath = "GeoLite2-City.mmdb"
	}
	geoip.Init(dbPath)

	jobQueue := make(chan Job, 100)
	var wg sync.WaitGroup

	// Initialize Alert Rules
	alerting.Engine.LoadRules()

	// Start Workers
	for i := 0; i < WorkerCount; i++ {
		wg.Add(1)
		go worker(ctx, i, jobQueue, &wg)
	}

	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	// Health Reporter
	go func() {
		rateTicker := time.NewTicker(2 * time.Second)
		defer rateTicker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-rateTicker.C:
				count := atomic.SwapUint64(&ingestCounter, 0)
				errCount := atomic.SwapUint64(&errorCounter, 0)

				// Calculate rate (logs per minute)
				rate := float64(count) * 30.0
				errorRate := float64(errCount) * 30.0

				// Calculate Lag
				var maxLagSeconds float64
				var oldestTenant models.Tenant
				if err := database.DB.Order("last_poll asc").Where("last_poll > '2000-01-01'").First(&oldestTenant).Error; err == nil {
					lag := time.Since(oldestTenant.LastPoll)
					maxLagSeconds = lag.Seconds()
				}

				hub.GlobalHub.BroadcastHealth(map[string]interface{}{
					"ingest_rate": rate,
					"error_rate":  errorRate,
					"lag_seconds": maxLagSeconds,
				})
			}
		}
	}()

	// Initial Poll
	QueueJobs(jobQueue)

	// Main polling loop
	for {
		select {
		case <-ctx.Done():
			log.Println("Poller shutting down...")
			close(jobQueue)
			wg.Wait()
			log.Println("Poller shutdown complete")
			return
		case <-ticker.C:
			QueueJobs(jobQueue)
		case <-manualTrigger:
			log.Println("Triggered Poll started")
			QueueJobs(jobQueue)
		}
	}
}

func PollAllTenants() {
	// One-off sync poll not supported in new model effectively,
	// but we can trigger the queue logic manually if needed.
	// For now, this is legacy or can just push to queue.
	log.Println("Manual poll triggered - logic moved to background queue")
}

func QueueJobs(jobQueue chan Job) {
	var tenants []models.Tenant
	if err := database.DB.Find(&tenants).Error; err != nil {
		log.Printf("Error checking tenants: %v", err)
		return
	}

	defaultContentTypes := []string{"Audit.AzureActiveDirectory", "Audit.Exchange", "Audit.SharePoint", "Audit.General"}
	endTime := time.Now()

	for _, t := range tenants {
		startTime := t.LastPoll
		if startTime.IsZero() {
			startTime = time.Now().Add(-24 * time.Hour)
		}

		// Determine content types to poll
		var typesToPoll []string
		if len(t.EnabledContentTypes) > 0 {
			// Datatypes.JSON handles unmarshalling internally usually but here it's a byte slice essentially
			// But wait, GORM `datatypes.JSON` is alias for []byte? Or similar.
			// Let's unmarshal manually to be safe.
			json.Unmarshal(t.EnabledContentTypes, &typesToPoll)
		}

		if len(typesToPoll) == 0 {
			typesToPoll = defaultContentTypes
		}

		// Update LastPoll immediately to prevent overlap (optimistic)
		// Or update after success. For simplicity, we update after job execution in a real system.
		// Here we just queue.

		for _, ct := range typesToPoll {
			jobQueue <- Job{
				Tenant:      t,
				ContentType: ct,
				StartTime:   startTime,
				EndTime:     endTime,
			}
		}

		// Update DB timestamp
		database.DB.Model(&t).Update("last_poll", endTime)
	}
}

func worker(ctx context.Context, id int, jobs <-chan Job, wg *sync.WaitGroup) {
	defer wg.Done()
	log.Printf("Worker %d started", id)

	for {
		select {
		case <-ctx.Done():
			log.Printf("Worker %d shutting down", id)
			return
		case job, ok := <-jobs:
			if !ok {
				log.Printf("Worker %d: job queue closed", id)
				return
			}
			processJob(ctx, id, job)
		}
	}
}

func processJob(ctx context.Context, workerId int, job Job) {
	// Check for cancellation before starting
	select {
	case <-ctx.Done():
		return
	default:
	}

	client := o365.NewClient(job.Tenant.TenantID, job.Tenant.ClientID, job.Tenant.ClientSecret)

	token, err := client.GetAccessToken()
	if err != nil {
		log.Printf("[Worker %d] Failed to auth tenant %s: %v", workerId, job.Tenant.Name, err)
		atomic.AddUint64(&errorCounter, 1)
		return
	}

	blobs, err := client.ListAvailableContent(token, job.ContentType, job.StartTime, job.EndTime)
	if err != nil {
		if hasSubscriptionDisabledError(err) {
			log.Printf("[Worker %d] Subscription disabled for %s on %s. Attempting to start...", workerId, job.ContentType, job.Tenant.Name)
			if startErr := client.StartSubscription(token, job.ContentType); startErr != nil {
				log.Printf("[Worker %d] Failed to start subscription: %v", workerId, startErr)
				return
			}
			// Retry once
			blobs, err = client.ListAvailableContent(token, job.ContentType, job.StartTime, job.EndTime)
			if err != nil {
				log.Printf("[Worker %d] Retry failed list %s: %v", workerId, job.ContentType, err)
				return
			}
		} else {
			log.Printf("[Worker %d] Error listing %s for %s: %v", workerId, job.ContentType, job.Tenant.Name, err)
			atomic.AddUint64(&errorCounter, 1)
			return
		}
	}

	if len(blobs) > 0 {
		log.Printf("[Worker %d] Found %d blobs for %s (%s)", workerId, len(blobs), job.Tenant.Name, job.ContentType)
	}

	for _, blob := range blobs {
		// Check for cancellation between blobs
		select {
		case <-ctx.Done():
			return
		default:
		}

		events, err := client.FetchContent(token, blob.ContentUri)
		if err != nil {
			log.Printf("[Worker %d] Error fetching blob: %v", workerId, err)
			continue
		}

		var batch []models.AuditLog
		for _, ev := range events {
			if logEntry := buildAuditLog(job.Tenant, ev, job.ContentType); logEntry != nil {
				batch = append(batch, *logEntry)
			}
		}

		if len(batch) > 0 {
			saveBatch(ctx, batch, job.Tenant.OrganizationID, job.Tenant.ID)
		}
	}
}

func saveBatch(ctx context.Context, logs []models.AuditLog, orgID uuid.UUID, tenantID uuid.UUID) {
	if len(logs) == 0 {
		return
	}

	// Produce to Kafka (replaces direct DB write)
	// Kafka consumer will write to Elasticsearch
	if err := kafka.ProduceLogs(ctx, orgID, tenantID, logs); err != nil {
		log.Printf("Failed to produce %d logs to Kafka: %v", len(logs), err)
		atomic.AddUint64(&errorCounter, uint64(len(logs)))
		return
	}

	// Broadcast via WebSocket (Hub handles buffering/batching internally too)
	// Pass orgID for org-scoped broadcasting
	hub.GlobalHub.BroadcastLogs(logs, orgID)

	// Check for Alerts (Sequential for now, could be parallelized)
	for _, l := range logs {
		// Check for cancellation between alerts
		select {
		case <-ctx.Done():
			return
		default:
		}
		alerting.Engine.Evaluate(l, orgID)
	}

	// Update Ingest Rate Counter
	atomic.AddUint64(&ingestCounter, uint64(len(logs)))
}

func buildAuditLog(t models.Tenant, raw map[string]interface{}, workload string) *models.AuditLog {
	// idStr, _ := raw["Id"].(string)
	op, _ := raw["Operation"].(string)
	userId, _ := raw["UserId"].(string)
	// Helper to get string case-insensitive
	getString := func(m map[string]interface{}, key string) string {
		if v, ok := m[key]; ok {
			if s, ok := v.(string); ok {
				return s
			}
		}
		// Case insensitive search
		for k, v := range m {
			if strings.EqualFold(k, key) {
				if s, ok := v.(string); ok {
					return s
				}
			}
		}
		return ""
	}

	recordType, _ := raw["RecordType"].(float64)

	// Normalize Workload if not present in supported way
	if _, ok := raw["Workload"]; !ok {
		// Guess or use ContentType
		// raw["Workload"] = workload // optional
	}
	// Extract workload from raw if exists
	wl, _ := raw["Workload"].(string)
	if wl == "" {
		// Map content type to workload name for UI
		switch workload {
		case "Audit.Exchange":
			wl = "Exchange"
		case "Audit.SharePoint":
			wl = "SharePoint"
		case "Audit.AzureActiveDirectory":
			wl = "AzureActiveDirectory"
		default:
			wl = "General"
		}
	}

	creationTimeStr := getString(raw, "CreationTime")

	var creationTime time.Time
	var err error

	if creationTimeStr != "" {
		creationTime, err = time.Parse(time.RFC3339, creationTimeStr)
		if err != nil {
			// Try without timezone, assume UTC
			creationTime, err = time.Parse("2006-01-02T15:04:05", creationTimeStr)
			if err != nil {
				log.Printf("Failed to parse timestamp '%s', falling back to Now()", creationTimeStr)
				creationTime = time.Now()
			}
		}
	} else {
		// log.Printf("CreationTime missing in raw data. Keys: %v", getKeys(raw))
		creationTime = time.Now()
	}
	jsonBytes, _ := json.Marshal(raw)

	// GeoIP Lookup
	var clientIP string
	if ip, ok := raw["ClientIP"].(string); ok {
		clientIP = ip
	} else if ip, ok := raw["ActorIpAddress"].(string); ok {
		clientIP = ip
	}

	var city, countryCode string
	var lat, lon float64

	if clientIP != "" {
		loc := geoip.LookupIP(clientIP)
		if loc != nil {
			city = loc.City
			countryCode = loc.CountryCode
			lat = loc.Latitude
			lon = loc.Longitude
		}
	}

	return &models.AuditLog{
		OrganizationID: t.OrganizationID,
		TenantID:       t.ID,
		Operation:      op,
		UserId:         userId,
		RecordType:     int(recordType),
		Workload:       wl,
		CreationTime:   creationTime,
		RawData:        datatypes.JSON(jsonBytes),
		ClientIP:       clientIP,
		City:           city,
		CountryCode:    countryCode,
		Latitude:       lat,
		Longitude:      lon,
		IngestedAt:     time.Now(),
	}
}

func hasSubscriptionDisabledError(err error) bool {
	if err == nil {
		return false
	}
	// "The subscription was disabled" or similar
	// We check for typical codes or messages.
	// The error we saw: API error: 400 Bad Request {"error":{"code":"AF20023","message":"The subscription was disabled."}}
	s := err.Error()
	// contains check
	return strings.Contains(s, "AF20023") || strings.Contains(s, "subscription was disabled")
}

func getKeys(m map[string]interface{}) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	return keys
}
