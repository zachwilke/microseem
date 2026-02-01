.PHONY: help install dev dev-infra build run test clean docker-build docker-up docker-down docker-logs

# Default target
help:
	@echo "MicroSeem - Microsoft 365 SIEM Platform"
	@echo ""
	@echo "Usage:"
	@echo "  make install       Install dependencies"
	@echo "  make dev           Start development environment"
	@echo "  make dev-infra     Start only infrastructure (DB, ES, Kafka)"
	@echo "  make build         Build the Go backend"
	@echo "  make run           Run the Go backend locally"
	@echo "  make test          Run tests"
	@echo "  make clean         Clean build artifacts"
	@echo ""
	@echo "Docker:"
	@echo "  make docker-build  Build Docker images"
	@echo "  make docker-up     Start all services"
	@echo "  make docker-down   Stop all services"
	@echo "  make docker-logs   View logs"
	@echo ""

# Install dependencies
install:
	go mod download
	cd frontend && npm install

# Start development (infrastructure + local backend + frontend)
dev: dev-infra
	@echo "Starting backend..."
	@DATABASE_URL="host=localhost user=microseem password=microseem_dev dbname=microseem port=5432 sslmode=disable" \
		ELASTICSEARCH_URL="http://localhost:9200" \
		KAFKA_BROKERS="localhost:9092" \
		go run ./cmd/server &
	@echo "Starting frontend..."
	@cd frontend && npm run dev

# Start only infrastructure services
dev-infra:
	docker compose -f docker-compose.dev.yml up -d
	@echo "Waiting for services..."
	@sleep 10
	@echo "Infrastructure ready!"
	@echo "  PostgreSQL: localhost:5432"
	@echo "  Elasticsearch: localhost:9200"
	@echo "  Kibana: localhost:5601"
	@echo "  Kafka: localhost:9092"

# Build the Go backend
build:
	CGO_ENABLED=0 go build -ldflags="-w -s" -o bin/server ./cmd/server

# Run the Go backend
run:
	go run ./cmd/server

# Run tests
test:
	go test -v ./...

# Clean build artifacts
clean:
	rm -rf bin/
	rm -rf frontend/dist/
	rm -rf frontend/node_modules/.vite/

# Docker commands
docker-build:
	docker compose build

docker-up:
	docker compose up -d

docker-down:
	docker compose down

docker-logs:
	docker compose logs -f

# Full production build and start
prod: docker-build docker-up
	@echo "MicroSeem is running!"
	@echo "  Frontend: http://localhost:3000"
	@echo "  API: http://localhost:8080"
	@echo "  Kibana: http://localhost:5601"
