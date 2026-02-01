package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/cors"
	"github.com/socr/o365-monitor/internal/api"
	"github.com/socr/o365-monitor/internal/database"
	"github.com/socr/o365-monitor/internal/elasticsearch"
	"github.com/socr/o365-monitor/internal/hub"
	"github.com/socr/o365-monitor/internal/ingest"
	"github.com/socr/o365-monitor/internal/kafka"
	"github.com/socr/o365-monitor/internal/middleware"
)

const (
	shutdownTimeout = 30 * time.Second
	readTimeout     = 15 * time.Second
	writeTimeout    = 15 * time.Second
	idleTimeout     = 60 * time.Second
)

func main() {
	log.Println("Starting Office 365 Audit Log Monitor (Multi-Tenant SaaS)...")

	// Create root context with cancellation for graceful shutdown
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Default DSN or get from env
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "host=localhost user=o365_user password=o365_password dbname=o365_monitor port=5432 sslmode=disable"
	}

	if err := database.InitDB(dsn); err != nil {
		log.Fatalf("Error initializing database: %v", err)
	}

	// Initialize Elasticsearch
	if err := elasticsearch.InitClient(); err != nil {
		log.Fatalf("Error initializing Elasticsearch: %v", err)
	}

	// Initialize Kafka producer
	if err := kafka.InitProducer(); err != nil {
		log.Fatalf("Error initializing Kafka producer: %v", err)
	}

	// Start Kafka consumer (ES writer) with context
	go kafka.StartConsumer(ctx)

	// Router setup
	r := chi.NewRouter()

	// CORS setup
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://localhost:5173", "http://localhost:5174"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Initialize Clerk auth middleware
	clerkAuth := middleware.NewClerkAuth()

	// Start Poller in background with context
	go ingest.StartPoller(ctx)

	// Start WebSocket Hub with context
	go hub.GlobalHub.Run(ctx)

	// Health check endpoint (no auth required)
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok"}`))
	})

	r.Route("/api", func(r chi.Router) {
		// Apply Clerk auth to all API routes except WebSocket
		r.Group(func(r chi.Router) {
			r.Use(clerkAuth.Middleware)
			api.RegisterOrganizationRoutes(r)
			api.RegisterTenantRoutes(r)
			api.RegisterLogRoutes(r)
			api.RegisterAlertRoutes(r)
			api.RegisterInvestigationRoutes(r)
			r.Get("/stats", api.GetStats)
		})

		// WebSocket handles its own auth via query param
		r.Get("/ws", hub.ServeWS)
	})

	// Create HTTP server with timeouts
	server := &http.Server{
		Addr:         ":8080",
		Handler:      r,
		ReadTimeout:  readTimeout,
		WriteTimeout: writeTimeout,
		IdleTimeout:  idleTimeout,
	}

	// Channel to receive shutdown signal
	shutdown := make(chan os.Signal, 1)
	signal.Notify(shutdown, os.Interrupt, syscall.SIGTERM)

	// Start server in goroutine
	serverErr := make(chan error, 1)
	go func() {
		log.Println("Server starting on :8080")
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			serverErr <- err
		}
	}()

	// Wait for shutdown signal or server error
	select {
	case err := <-serverErr:
		log.Fatalf("Server error: %v", err)
	case sig := <-shutdown:
		log.Printf("Received signal %v, initiating graceful shutdown...", sig)
	}

	// Cancel context to stop all background goroutines
	cancel()

	// Create shutdown context with timeout
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer shutdownCancel()

	// Shutdown HTTP server gracefully
	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Printf("HTTP server shutdown error: %v", err)
	}

	// Close Kafka producer
	if err := kafka.Close(); err != nil {
		log.Printf("Kafka producer close error: %v", err)
	}

	// Close database connection
	if err := database.Close(); err != nil {
		log.Printf("Database close error: %v", err)
	}

	log.Println("Server shutdown complete")
}
