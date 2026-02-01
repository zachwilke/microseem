# MicroSeem

**Open-source Microsoft 365 SIEM Platform**

MicroSeem is a self-hosted security information and event management (SIEM) platform designed for monitoring Microsoft 365 audit logs. It provides real-time threat detection, alerting, and analytics for your organization's M365 environment.

![MicroSeem Dashboard](https://via.placeholder.com/800x400?text=MicroSeem+Dashboard)

## Features

- **Real-time Log Monitoring** - Stream M365 audit logs with WebSocket-powered live updates
- **Beautiful Onboarding** - Guided setup to connect your tenant and configure alerts
- **Multi-tenant Support** - Manage multiple M365 tenants and organizations
- **Threat Detection** - Create custom alert rules with flexible matching conditions
- **Integration Notifications** - Send alerts to Slack, Teams, Discord, PagerDuty, and more
- **Advanced Analytics** - Embedded Kibana dashboards for deep analysis
- **GeoIP Enrichment** - Visualize login locations on an interactive world map
- **Investigation Workflows** - Track and document security investigations

## Quick Start

### Prerequisites

- Docker & Docker Compose
- [Clerk](https://clerk.com) account (free tier available)

### One-Command Deploy

```bash
git clone https://github.com/zachwilke/microseem.git
cd microseem
./start.sh
```

The script will:
1. Check for Docker
2. Create configuration from template
3. Prompt you to add Clerk API keys
4. Start all services
5. Wait for health checks

Then open **http://localhost:3000** and follow the beautiful onboarding wizard!

### Manual Setup

```bash
# Clone and enter directory
git clone https://github.com/zachwilke/microseem.git
cd microseem

# Copy and configure environment
cp .env.example .env
nano .env  # Add your Clerk API keys

# Start everything
docker compose up -d

# Check status
docker compose ps
```

## Onboarding Experience

When you first open MicroSeem, you'll be guided through:

1. **Welcome** - Introduction and overview
2. **Connect M365** - Enter your Azure AD app credentials
3. **Set Up Alerts** - Choose from pre-built detection rules
4. **Ready!** - Start monitoring

![Onboarding Flow](https://via.placeholder.com/600x300?text=Onboarding+Wizard)

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
│  - Clerk authentication                                     │
│  - M365 log ingestion                                       │
│  - Alert engine                                             │
│  - Notification dispatcher                                  │
└───────────┬─────────────────────────────┬───────────────────┘
            │                             │
┌───────────▼───────────┐     ┌───────────▼───────────┐
│  PostgreSQL           │     │  Kafka                │
│  - Organizations      │     │  - Log queue          │
│  - Tenants            │     │  - Event streaming    │
│  - Alert rules        │     └───────────┬───────────┘
│  - Integrations       │                 │
└───────────────────────┘     ┌───────────▼───────────┐
                              │  Elasticsearch        │
                              │  - Audit logs         │
                              │  - Full-text search   │
                              └───────────────────────┘
```

## Configuration

### Required: Clerk Authentication

1. Go to [dashboard.clerk.com](https://dashboard.clerk.com)
2. Create a new application
3. Get your API keys from Settings → API Keys
4. Add to `.env`:
   ```
   CLERK_SECRET_KEY=sk_test_...
   VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
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
| `CLERK_SECRET_KEY` | Clerk backend API key | Required |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk frontend key | Required |
| `POSTGRES_PASSWORD` | Database password | `microseem_secret` |
| `FRONTEND_PORT` | Web UI port | `3000` |
| `API_PORT` | API port | `8080` |
| `KIBANA_PORT` | Kibana port | `5601` |
| `ES_HEAP_SIZE` | Elasticsearch memory | `512m` |

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
