# MicroSeem

**Open-source Microsoft 365 SIEM Platform**

MicroSeem is a self-hosted security information and event management (SIEM) platform designed for monitoring Microsoft 365 audit logs. It provides real-time threat detection, alerting, and analytics for your organization's M365 environment.

![MicroSeem Dashboard](https://via.placeholder.com/800x400?text=MicroSeem+Dashboard)

## Features

- **Real-time Log Monitoring** - Stream M365 audit logs with WebSocket-powered live updates
- **Beautiful Onboarding** - Guided setup to connect your tenant and configure alerts
- **Multi-tenant Support** - Manage multiple M365 tenants and organizations
- **Role-Based Access Control** - Admin, Technician, and Report Admin roles with granular permissions
- **Threat Detection** - Create custom alert rules with flexible matching conditions
- **Integration Notifications** - Send alerts to Slack, Teams, Discord, PagerDuty, and more
- **Advanced Analytics** - Embedded Kibana dashboards for deep analysis
- **GeoIP Enrichment** - Visualize login locations on an interactive world map
- **Investigation Workflows** - Track and document security investigations
- **Self-Hosted** - Keep your data on-premises with full control

## Quick Start

### Prerequisites

- Docker & Docker Compose

### One-Command Deploy

```bash
git clone https://github.com/zachwilke/microseem.git
cd microseem
./start.sh
```

The script will:
1. Check for Docker
2. Create configuration from template
3. Auto-generate secure passwords and JWT secret
4. Start all services
5. Wait for health checks

Then open **http://localhost:3000** and register your first admin account!


### Lightweight ClickHouse Preview

To try the next-generation lightweight hot path without Elasticsearch, Kibana, or Kafka:

```bash
docker compose -f docker-compose.light.yml up -d --build
```

This preview uses `MICROSEEM_LOG_STORE=clickhouse` and `MICROSEEM_EVENT_BUS=nats`, publishing normalized events to NATS JetStream and mirroring them into ClickHouse for the current API query path.

### Manual Setup

```bash
# Clone and enter directory
git clone https://github.com/zachwilke/microseem.git
cd microseem

# Copy and configure environment
cp .env.example .env
nano .env  # Optional: customize settings

# Start everything
docker compose up -d

# Check status
docker compose ps
```

## Onboarding Experience

When you first open MicroSeem:

1. **Register** - Create your admin account and organization
2. **Connect M365** - Enter your Azure AD app credentials
3. **Set Up Alerts** - Choose from pre-built detection rules
4. **Ready!** - Start monitoring

![Onboarding Flow](https://via.placeholder.com/600x300?text=Onboarding+Wizard)

## User Roles

MicroSeem supports three user roles with different permissions:

| Role | Description | Permissions |
|------|-------------|-------------|
| **Admin** | Full access | Manage users, settings, integrations, tenants, alerts, investigations |
| **Technician** | Operations focus | Manage alerts and investigations, view logs and analytics |
| **Report Admin** | Read-only reports | View logs and analytics only |

The first registered user automatically becomes an Admin.

## Lightweight SIEM Scale-Out Direction

MicroSeem's default prototype stack currently uses Kafka, Elasticsearch, and Kibana. The scale-out target is a lighter hot path built around NATS JetStream for durable event streaming and ClickHouse for high-speed security analytics, with optional Quickwit/Tantivy for full-text or cold-retention search. See [Performance Tooling Strategy](docs/performance-tooling.md) for the decision matrix, target architecture, and migration plan.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend (React + Vite + Tailwind)                         │
│  - Real-time dashboard                                       │
│  - Log inspector with filters                               │
│  - Alert management                                         │
│  - Integration configuration                                │
└──────────────────────────┬──────────────────────────────────┘
                           │ API + WebSocket
┌──────────────────────────▼──────────────────────────────────┐
│  Backend API (Go + Chi)                                     │
│  - JWT authentication with role-based access                │
│  - M365 log ingestion                                       │
│  - Alert engine                                             │
│  - Notification dispatcher                                  │
└───────────┬─────────────────────────────┬───────────────────┘
            │                             │
┌───────────▼───────────┐     ┌───────────▼───────────┐
│  PostgreSQL           │     │  Kafka                │
│  - Organizations      │     │  - Log queue          │
│  - Users & Sessions   │     │  - Event streaming    │
│  - Tenants            │     └───────────┬───────────┘
│  - Alert rules        │                 │
│  - Integrations       │     ┌───────────▼───────────┐
└───────────────────────┘     │  Elasticsearch        │
                              │  - Audit logs         │
                              │  - Full-text search   │
                              └───────────────────────┘
```

## Configuration

### JWT Authentication

MicroSeem uses JWT tokens for authentication. A secure JWT secret is automatically generated on first run. You can also set it manually in `.env`:

```
JWT_SECRET=your_secure_random_string_at_least_32_chars
```

### Optional: GeoIP Database

For IP geolocation on the world map:
1. Sign up at [maxmind.com](https://www.maxmind.com/en/geolite2/signup)
2. Download GeoLite2-City.mmdb
3. Place in project root

### Environment Variables

See [`.env.example`](.env.example) for all options.

| Variable | Description | Default |
|----------|-------------|---------|
| `JWT_SECRET` | Secret key for JWT tokens | Auto-generated |
| `POSTGRES_PASSWORD` | Database password | Auto-generated |
| `FRONTEND_PORT` | Web UI port | `3000` |
| `API_PORT` | API port | `8080` |
| `KIBANA_PORT` | Kibana port | `5601` |
| `ES_HEAP_SIZE` | Elasticsearch memory | `1g` |

## Integrations

MicroSeem can send alerts to:

| Integration | Type |
|-------------|------|
| Slack | Incoming Webhook |
| Microsoft Teams | Incoming Webhook |
| Google Chat | Webhook |
| Discord | Webhook |
| PagerDuty | Events API v2 |
| Opsgenie | Alert API |
| Generic | Any HTTP endpoint |

Configure in the web UI under **Integrations**.

## Commands

```bash
# Start all services
./start.sh

# Or with docker compose:
docker compose up -d

# View logs
docker compose logs -f

# View specific service logs
docker compose logs -f api

# Restart services
docker compose restart

# Stop services
docker compose down

# Stop and remove data (careful!)
docker compose down -v

# Update to latest
git pull
docker compose up -d --build
```

## Development

### Running Locally

```bash
# Start infrastructure only
docker compose -f docker-compose.dev.yml up -d

# Run backend
go run ./cmd/server

# Run frontend (separate terminal)
cd frontend
npm install
npm run dev
```

### Building

```bash
# Build backend
go build -o bin/server ./cmd/server

# Build frontend
cd frontend && npm run build
```

## System Requirements

- **RAM**: 4GB minimum, 8GB recommended
- **Disk**: 20GB+ for logs
- **OS**: Linux (Ubuntu 20.04+ recommended)

For Elasticsearch on Linux, you may need:
```bash
sudo sysctl -w vm.max_map_count=262144
```

## Production Deployment

For production:

1. **Use HTTPS** - Put behind nginx/Caddy with SSL
2. **Secure passwords** - Change defaults in `.env`
3. **Backup data** - Set up automated backups
4. **Monitor** - Add Prometheus/Grafana

Example nginx config:
```nginx
server {
    listen 443 ssl http2;
    server_name siem.example.com;

    ssl_certificate /etc/ssl/certs/siem.crt;
    ssl_certificate_key /etc/ssl/private/siem.key;

    location / {
        proxy_pass http://localhost:3000;
    }

    location /api {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## Troubleshooting

### Services won't start

```bash
# Check logs
docker compose logs

# Check Elasticsearch specifically
docker compose logs elasticsearch
```

### "vm.max_map_count too low"

```bash
sudo sysctl -w vm.max_map_count=262144
echo 'vm.max_map_count=262144' | sudo tee -a /etc/sysctl.conf
```

### Can't connect to M365

1. Verify Azure AD app permissions include Office 365 Management APIs
2. Check Client ID and Secret are correct
3. Ensure Tenant ID matches your Azure AD

## License

MIT License - see [LICENSE](LICENSE)

## Contributing

Contributions welcome! Please read our contributing guidelines.

## Support

- **Issues**: [GitHub Issues](https://github.com/zachwilke/microseem/issues)
- **Discussions**: [GitHub Discussions](https://github.com/zachwilke/microseem/discussions)
