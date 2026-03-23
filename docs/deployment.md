# Deployment Guide

> Route Core — Production Deployment

## Table of Contents

- [Deployment Options](#deployment-options)
- [Web Deployment](#web-deployment)
- [Server Deployment](#server-deployment)
- [Desktop Distribution](#desktop-distribution)
- [Docker Deployment](#docker-deployment)
- [Reverse Proxy Configuration](#reverse-proxy-configuration)
- [Environment Variables](#environment-variables)
- [Monitoring](#monitoring)
- [Backup & Recovery](#backup--recovery)

---

## Deployment Options

| Mode | Description | Use Case |
|------|-------------|----------|
| **Web + Server** | Deploy frontend and API separately | Multi-user, cloud-hosted |
| **Desktop** | Portable Electrobun app with embedded server | Single-user, offline |
| **Docker** | Containerized server + static frontend | On-premise, Kubernetes |

---

## Web Deployment

### Build the Frontend

```bash
npm run build:web
```

Output is in `packages/web/dist/`. Deploy to any static hosting:

- **Nginx** / **Apache** — serve the `dist/` directory
- **Vercel** / **Netlify** — connect the repository, set build command to `npm run build:web`, publish directory to `packages/web/dist`
- **AWS S3 + CloudFront** — upload `dist/` to S3, configure CloudFront distribution

### SPA Routing

Configure your web server to serve `index.html` for all routes (SPA fallback):

**Nginx:**

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

**Vercel (`vercel.json`):**

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

### API Base URL

Set the API base URL for the frontend to connect to your deployed server:

```typescript
// packages/web/src/api/client.ts
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001';
```

Build with:

```bash
VITE_API_BASE=https://api.yourcompany.com npm run build:web
```

---

## Server Deployment

### Build

```bash
npm run build:core
npm run build:server
```

### Run

```bash
cd packages/server
node dist/index.js
```

The server listens on port **3001** by default.

### Process Management

Use a process manager for production:

**PM2:**

```bash
npm install -g pm2

pm2 start packages/server/dist/index.js \
  --name "route-core-api" \
  --instances 1 \
  --max-memory-restart 512M

pm2 save
pm2 startup
```

**systemd:**

```ini
[Unit]
Description=Route Core API Server
After=network.target

[Service]
Type=simple
User=routecore
WorkingDirectory=/opt/route-core
ExecStart=/usr/bin/node packages/server/dist/index.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3001

[Install]
WantedBy=multi-user.target
```

### Health Check

```bash
curl http://localhost:3001/api/health
# {"status":"ok","version":"0.1.0"}
```

---

## Desktop Distribution

### Prerequisites

- [Bun](https://bun.sh/) runtime installed
- Platform build tools (Xcode CLI tools on macOS, Visual Studio Build Tools on Windows)

### Build

```bash
cd packages/desktop

# Development build
bun run build

# Release build (optimized + packaged)
bun run build:release
```

### Output

| Platform | Output |
|----------|--------|
| macOS | `.app` bundle in `dist/` |
| Windows | `.exe` portable executable in `dist/` |
| Linux | AppImage or binary in `dist/` |

### Distribution

- **Direct download**: Host the built binaries on your website or CDN
- **GitHub Releases**: Automated via the release workflow (`.github/workflows/release.yml`)
- **Auto-updates**: Configure `release.baseUrl` in `electrobun.config.ts` to enable OTA updates

---

## Docker Deployment

### Dockerfile

```dockerfile
# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY packages/core/package.json packages/core/
COPY packages/server/package.json packages/server/
RUN npm ci --workspace=packages/core --workspace=packages/server
COPY packages/core packages/core
COPY packages/server packages/server
COPY data data
COPY tsconfig.json .
RUN npm run build:core && npm run build:server

# Production stage
FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache sqlite
COPY --from=builder /app/packages/core/dist packages/core/dist
COPY --from=builder /app/packages/core/package.json packages/core/
COPY --from=builder /app/packages/server/dist packages/server/dist
COPY --from=builder /app/packages/server/package.json packages/server/
COPY --from=builder /app/data data
COPY package*.json ./
RUN npm ci --omit=dev --workspace=packages/core --workspace=packages/server
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3001/api/health || exit 1
CMD ["node", "packages/server/dist/index.js"]
```

### docker-compose.yml

```yaml
version: '3.8'
services:
  api:
    build: .
    ports:
      - "3001:3001"
    volumes:
      - db-data:/app/data/db
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3001/api/health"]
      interval: 30s
      timeout: 3s
      retries: 3

  web:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./packages/web/dist:/usr/share/nginx/html:ro
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      api:
        condition: service_healthy

volumes:
  db-data:
```

### Build & Run

```bash
# Build everything
npm run build

# Start containers
docker-compose up -d

# Check status
docker-compose ps
docker-compose logs -f api
```

---

## Reverse Proxy Configuration

### Nginx

```nginx
upstream route_core_api {
    server 127.0.0.1:3001;
}

server {
    listen 80;
    server_name harness.yourcompany.com;

    # Frontend
    location / {
        root /var/www/route-core;
        try_files $uri $uri/ /index.html;
    }

    # API proxy
    location /api/ {
        proxy_pass http://route_core_api;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Request size (for large harness JSON)
        client_max_body_size 10M;
    }
}
```

### TLS (Let's Encrypt)

```bash
certbot --nginx -d harness.yourcompany.com
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | API server port |
| `NODE_ENV` | `development` | Environment mode |
| `VITE_API_BASE` | `http://localhost:3001` | API URL for frontend builds |
| `DB_PATH` | `./data/route-core.db` | SQLite database file path |
| `CORS_ORIGIN` | `*` | Allowed CORS origins |
| `LOG_LEVEL` | `info` | Logging verbosity |

---

## Monitoring

### Health Endpoint

```
GET /api/health → { "status": "ok", "version": "0.1.0" }
```

### Recommended Stack

| Tool | Purpose |
|------|---------|
| **PM2** | Process management, auto-restart |
| **Prometheus + Grafana** | Metrics collection and visualization |
| **Sentry** | Error tracking and alerting |
| **Winston / Pino** | Structured logging |

### Key Metrics to Monitor

- API response times (p50, p95, p99)
- Error rate (5xx responses)
- SQLite database file size
- Memory usage (Node.js heap)
- Active connections

---

## Backup & Recovery

### SQLite Backup

```bash
# Online backup (safe while server is running with WAL mode)
sqlite3 data/route-core.db ".backup data/backup-$(date +%Y%m%d).db"
```

### Automated Backup (cron)

```bash
# Daily backup at 2 AM
0 2 * * * sqlite3 /opt/route-core/data/route-core.db ".backup /opt/backups/route-core-$(date +\%Y\%m\%d).db"
```

### Recovery

```bash
# Stop the server
pm2 stop route-core-api

# Restore from backup
cp data/backup-20240115.db data/route-core.db

# Restart
pm2 start route-core-api
```

### Data Export

Use the API to export harness designs as JSON for portable backup:

```bash
curl http://localhost:3001/api/harnesses/hrn-001 > harness-backup.json
```
