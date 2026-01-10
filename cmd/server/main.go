package main

import (
	"log"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/cors"
	"github.com/socr/o365-monitor/internal/api"
	"github.com/socr/o365-monitor/internal/database"
	"github.com/socr/o365-monitor/internal/hub"
	"github.com/socr/o365-monitor/internal/ingest"
)

func main() {
	log.Println("Starting Office 365 Audit Log Monitor...")

	// Default DSN or get from env
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "host=localhost user=o365_user password=o365_password dbname=o365_monitor port=5432 sslmode=disable"
	}

	if err := database.InitDB(dsn); err != nil {
		log.Fatalf("Error initializing database: %v", err)
	}

	// Router setup
	r := chi.NewRouter()

	// CORS setup
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://localhost:5173", "http://localhost:5174"}, // Vue/Svelte dev server
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Start Poller in background
	go ingest.StartPoller()

	// Start WebSocket Hub
	go hub.GlobalHub.Run()

	r.Route("/api", func(r chi.Router) {
		api.RegisterTenantRoutes(r)
		api.RegisterLogRoutes(r)
		api.RegisterAlertRoutes(r)
		api.RegisterInvestigationRoutes(r)
		r.Get("/stats", api.GetStats)
		r.Get("/ws", hub.ServeWS)
	})

	log.Println("Server starting on :8080")
	if err := http.ListenAndServe(":8080", r); err != nil {
		log.Fatal(err)
	}
}
