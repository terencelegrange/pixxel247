# Pixxel247

**Continuous Enterprise Monitoring & Service Dependency Platform**

Pixxel247 is a self-hosted platform for continuous uptime monitoring, business service dependency mapping, and enterprise outage visualization. It bridges infrastructure monitoring with business impact by linking underlying technical assets (APIs, databases, web applications, Statuspage.io providers) to critical business services, providing automated recurring health checks, real-time service status dashboards, multi-channel alerting, and seamless integration with the Pixxel Enterprise Architecture platform.

Docker Hub: [`tlgrange/pixxel247`](https://hub.docker.com/r/tlgrange/pixxel247)  
Source: [github.com/terencelegrange/pixxel247](https://github.com/terencelegrange/pixxel247)

---

## 🎯 Purpose & Key Features

Modern enterprise architectures consist of interconnected microservices, SaaS providers, databases, and third-party APIs. When an infrastructure component fails, traditional ping tools only report that a server is down—they cannot determine which business operations are impacted.

Pixxel247 solves this by structuring monitoring around **Business Services** and **Assets**:

- **Continuous Asset Monitoring** — Configure HTTP/HTTPS probes, custom headers, payload bodies, status code assertions, timeout thresholds, and customizable check intervals (10s to 86,400s).
- **Statuspage.io Component Integration** — Native monitoring of third-party SaaS vendors by tracking individual Statuspage.io component health with automatic degradation detection.
- **Business Service Dependency Mapping** — Group technical assets into overarching business services (e.g. E-Commerce, Identity & Access, Core Billing, Customer Support) and automatically compute overall service health (`Healthy`, `Degraded`, `Down`, `Unknown`) based on dependency impact.
- **Real-Time Outage & Service Status Dashboard** — Single-pane-of-glass live status overview featuring 90-segment uptime history bars, latency trends, and diagnostic failure messages.
- **Multi-Channel Alerting** — Automated alert dispatching to webhook destinations, Slack, Discord, Microsoft Teams, and email when business services change state.
- **Pixxel Architecture Platform Integration** — Native synchronization with the Pixxel Enterprise Architecture repository (`http://<host>:3030`) to pull portfolio applications, application tiers (Tier 1 Mission Critical, Tier 2 Business Critical), business/technical owners, and SLAs (RTO/RPO/Availability targets).
- **AI Agent & Developer Automation** — Scoped Bearer token API authentication (`POST /api/assets`, `PUT /api/assets/[id]/monitor`, `POST /api/assets/[id]/monitor`) allowing CI/CD pipelines and autonomous AI agents to register and monitor new production apps in seconds.
- **Dual Database Support (SQLite & MySQL/MariaDB)** — Zero-config SQLite mode for instant local testing, or MySQL/MariaDB for high-concurrency enterprise homelab and production environments.
- **First-Run Web Setup Wizard** — Interactive setup wizard at `/setup` that tests database connectivity, seeds initial schemas, and registers the administrator account.
- **Enterprise Security & Observability** — Edge-safe JWT authentication (`jose`), role-based access control (Admin, Editor, Viewer), multi-profile switcher, encrypted credentials storage (AES-256-GCM for probe headers and tokens), non-blocking audit logging, dynamic feature flags, and dark/light mode SSR.

---

## 🚀 Quick Start

Just pull and run — nothing has to be configured up front. If you don't set `JWT_SECRET` (which signs session cookies) or `MONITORING_ENCRYPTION_KEY` (which encrypts probe headers and request bodies with AES-256-GCM), Pixxel247 generates them on first boot.

A container with no database configured starts up and serves the first-run setup wizard at `/setup`, where you can select SQLite or MySQL/MariaDB and create the initial administrator account.

### Option A — SQLite Mode (Fastest way to try it out)

All data lives in a single database file inside a named volume.

```bash
docker run -d \
  --name pixxel247 \
  -p 7247:3336 \
  -v pixxel247-data:/app/data \
  -e DB_TYPE=sqlite \
  -e DB_FILE=data/pixxel247.db \
  tlgrange/pixxel247:latest
```

Open [http://localhost:7247](http://localhost:7247) to complete the setup wizard.

---

### Option B — MySQL / MariaDB (Recommended for production)

```bash
docker run -d \
  --name pixxel247 \
  -p 7247:3336 \
  -e DB_TYPE=mysql \
  -e DB_HOST=your-db-host \
  -e DB_PORT=3306 \
  -e DB_USER=pixxel247 \
  -e DB_PASSWORD=your_password \
  -e DB_NAME=pixxel247 \
  tlgrange/pixxel247:latest
```

Ensure the target database exists (`CREATE DATABASE pixxel247 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`)—tables, relational constraints, and seed data are initialized automatically on boot.

---

### Option C — Docker Compose

```yaml
services:
  pixxel247:
    image: tlgrange/pixxel247:latest
    container_name: pixxel247
    restart: unless-stopped
    ports:
      - "7247:3336"
    environment:
      DATABASE_URL: mysql://pixxel247:secretpassword@db:3306/pixxel247
      JWT_SECRET: your_jwt_secret_at_least_32_characters_long
      MONITORING_ENCRYPTION_KEY: your_monitoring_aes_key_at_least_32_characters_long
      ADMIN_EMAIL: admin@example.com
      ADMIN_PASSWORD_HASH: "$2a$10$YourBcryptPasswordHashHere"
      PIXXEL247_DATA_DIR: data
    depends_on:
      db:
        condition: service_healthy
    dns:
      - 8.8.8.8
      - 1.1.1.1
    volumes:
      - pixxel247-data:/app/data
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3336/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 20s

  db:
    image: mariadb:11
    container_name: pixxel247-db
    restart: unless-stopped
    environment:
      MYSQL_DATABASE: pixxel247
      MYSQL_USER: pixxel247
      MYSQL_PASSWORD: secretpassword
      MYSQL_ROOT_PASSWORD: change_me_root
    volumes:
      - pixxel247-db-data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "healthcheck.sh", "--connect", "--innodb_initialized"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  pixxel247-data:
  pixxel247-db-data:
```

---

## ⚙️ Environment Variables

| Variable | Applies To | Default | Description |
|---|---|---|---|
| `PORT` | All | `3336` | Internal container port served by Next.js standalone server. |
| `JWT_SECRET` | All | Auto-generated | 32+ character secret used to sign session cookies. |
| `MONITORING_ENCRYPTION_KEY` | All | Auto-generated | Secret key used to encrypt probe authentication headers and payloads via AES-256-GCM. |
| `DB_TYPE` | All | `mysql` | `mysql` or `sqlite`. Determines the active database client. |
| `DATABASE_URL` | All | Computed | Database connection string (e.g. `mysql://user:pass@host:3306/pixxel247` or `file:data/pixxel247.db`). |
| `DB_HOST` | MySQL | — | Database hostname or IP address. |
| `DB_PORT` | MySQL | `3306` | Database port. |
| `DB_USER` | MySQL | — | Database username. |
| `DB_PASSWORD` | MySQL | — | Database password. |
| `DB_NAME` | MySQL | `pixxel247` | Database name. |
| `DB_FILE` | SQLite | `data/pixxel247.db` | Relative path to the SQLite file. Mount `/app/data` to persist. |
| `ADMIN_EMAIL` | All | — | Optional admin email for unattended setup. |
| `ADMIN_PASSWORD_HASH` | All | — | Optional bcrypt hash for initial unattended admin password. |
| `PIXXEL247_DATA_DIR` | All | `data` | Directory path for local runtime data and configurations. |

---

## 🤖 Programmatic Monitoring API (AI Agent Integration)

Pixxel247 provides a REST API supporting `Authorization: Bearer <API_KEY>` authentication so that CI/CD pipelines or autonomous AI agents can instantly provision monitoring when new services are deployed.

### 1. Register or Update an Asset
```bash
curl -s -X POST \
  -H "Authorization: Bearer <PIXXEL247_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "my-service-prod",
    "name": "My Service (Production)",
    "short_code": "SVC-PRD",
    "category": "API Service",
    "type": "Cloud",
    "lifecycle_status": "Production",
    "description": "Production API endpoint for My Service",
    "business_owner": "Platform Team",
    "technical_owner": "DevOps",
    "app_url": "https://service.example.com"
  }' \
  http://<pixxel247-host>:7247/api/assets
```

### 2. Configure Continuous Monitoring
```bash
curl -s -X PUT \
  -H "Authorization: Bearer <PIXXEL247_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "check_type": "http",
    "url": "https://service.example.com/api/health",
    "method": "GET",
    "expected_status": 200,
    "timeout_ms": 10000,
    "interval_seconds": 60,
    "enabled": true
  }' \
  http://<pixxel247-host>:7247/api/assets/my-service-prod/monitor
```

### 3. Run an Immediate On-Demand Health Verification
```bash
curl -s -X POST \
  -H "Authorization: Bearer <PIXXEL247_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "check_type": "http",
    "url": "https://service.example.com/api/health",
    "method": "GET",
    "expected_status": 200,
    "timeout_ms": 10000
  }' \
  http://<pixxel247-host>:7247/api/assets/my-service-prod/monitor
```

**Response:**
```json
{
  "ok": true,
  "result": {
    "status": "healthy",
    "message": "Received expected HTTP 200",
    "responseCode": 200,
    "responseTimeMs": 85,
    "checkedAt": "2026-10-29T11:00:00.000Z"
  }
}
```

---

## 🔍 Health Check & Diagnostics

`GET /api/health` performs a live database ping and verifies the background monitoring engine status:
- `200 OK` — `{"ok": true, "service": "pixxel247", "setup": true, "database": "connected", "dialect": "mysql"}`
- `503 Service Unavailable` — `{"ok": false, "error": "Database connection error"}`

---

## 🏗️ Architecture & Technology Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 15 (App Router, Standalone output) |
| **Language** | TypeScript (Strict) |
| **UI & Styling** | React 19, Tailwind CSS v3 (class-based dark mode) |
| **ORM & Database** | Dual Prisma 5 client (dynamic SQLite & MySQL runtime engine) |
| **Security & Secrets** | `jose` (JWT), `bcryptjs`, AES-256-GCM encryption for credentials |
| **Continuous Engine** | In-process timer scheduling engine with service status state transition alerts |
| **Specification** | OpenAPI 3.0 specification auto-generated at `/api/openapi` |

---

## 📄 License

MIT © [Terence Le Grange](https://github.com/terencelegrange)
