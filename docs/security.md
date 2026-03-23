# Security Policy

> Route Core — Security & Compliance

## Table of Contents

- [Reporting Vulnerabilities](#reporting-vulnerabilities)
- [Supported Versions](#supported-versions)
- [Security Model](#security-model)
- [Data Handling](#data-handling)
- [Authentication Roadmap](#authentication-roadmap)
- [Dependency Management](#dependency-management)
- [Compliance Considerations](#compliance-considerations)

---

## Reporting Vulnerabilities

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT** open a public GitHub issue
2. Email: **security@routecore.dev** (or create a private security advisory on GitHub)
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact assessment
   - Suggested fix (if any)

### Response Timeline

| Stage | SLA |
|-------|-----|
| Acknowledgment | 48 hours |
| Triage & severity assessment | 5 business days |
| Fix development | 14 business days (critical), 30 business days (other) |
| Public disclosure | After fix is released |

---

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x | ✅ Current |
| < 0.1.0 | ❌ Not supported |

---

## Security Model

### Current Architecture

Route Core v0.1.x is designed for **trusted environments**:

| Aspect | Status | Notes |
|--------|--------|-------|
| Authentication | ❌ None | All API endpoints are open |
| Authorization | ❌ None | No role-based access control |
| Transport encryption | ⚠️ Optional | TLS via reverse proxy |
| Input validation | ✅ Basic | JSON schema validation on API inputs |
| SQL injection | ✅ Protected | Parameterized queries via better-sqlite3 |
| XSS | ✅ Protected | React's default escaping, no `dangerouslySetInnerHTML` |
| CSRF | ⚠️ Partial | CORS configured but no CSRF tokens |
| Rate limiting | ❌ None | Must be configured at proxy level |

### Desktop Security

The Electrobun desktop app runs with:
- **No network exposure**: Embedded server binds to `localhost` only
- **Single-user model**: No multi-user authentication needed
- **Local data**: SQLite database stored on user's filesystem
- **No telemetry**: No data sent to external services

### Threat Model

| Threat | Mitigation |
|--------|-----------|
| Unauthorized API access | Deploy behind reverse proxy with authentication |
| Data exfiltration | Local-only data, no cloud sync |
| Supply chain attack | Dependabot alerts, locked dependency versions |
| Malicious file upload | No file upload endpoints |
| Denial of service | Rate limiting at proxy level |

---

## Data Handling

### Data at Rest

| Data | Storage | Encryption |
|------|---------|-----------|
| Harness designs | SQLite (server) / In-memory (desktop) | ❌ Unencrypted |
| Parts library | SQLite / In-memory | ❌ Unencrypted |
| Application config | `electrobun.config.ts` | N/A (no secrets) |

### Data in Transit

| Channel | Encryption |
|---------|-----------|
| Browser ↔ API (dev) | ❌ HTTP (localhost) |
| Browser ↔ API (production) | ✅ HTTPS (via reverse proxy) |
| Desktop webview ↔ API | ❌ HTTP (localhost only, not exposed) |

### Data Retention

- No automatic data deletion policies
- Users manage their own data via API (CRUD)
- SQLite database can be manually deleted or backed up

### PII Handling

Route Core does **not** collect or store personally identifiable information by design. The `author` field in harness designs is user-supplied and optional.

---

## Authentication Roadmap

Planned for future versions:

### Phase 1: API Key Authentication

```
Authorization: Bearer <api-key>
```

- API keys stored hashed in SQLite
- Scoped permissions (read-only, read-write, admin)

### Phase 2: OAuth 2.0 / OIDC

- Integration with corporate identity providers (Azure AD, Okta, Auth0)
- JWT-based session management
- Role-based access control (RBAC)

### Phase 3: Multi-Tenancy

- Organization-level data isolation
- Team-based collaboration with shared harness designs
- Audit logging

---

## Dependency Management

### Principles

1. **Minimal dependencies**: Core package has zero runtime dependencies
2. **Locked versions**: `package-lock.json` committed for reproducible builds
3. **Regular updates**: Dependencies reviewed monthly
4. **Automated alerts**: GitHub Dependabot enabled for security advisories

### Current Dependencies

#### Core (Zero Runtime Dependencies)

No external packages — pure TypeScript.

#### Server

| Package | Purpose | Risk Level |
|---------|---------|-----------|
| express | HTTP server | Low (widely audited) |
| better-sqlite3 | Database | Low (native addon) |
| cors | CORS headers | Low (simple middleware) |

#### Web

| Package | Purpose | Risk Level |
|---------|---------|-----------|
| react | UI framework | Low |
| react-dom | DOM rendering | Low |
| zustand | State management | Low |
| react-router-dom | Routing | Low |
| vite | Build tool | Low (dev only) |

### Vulnerability Response

1. **Critical**: Patch within 24 hours
2. **High**: Patch within 7 days
3. **Medium**: Patch within 30 days
4. **Low**: Next scheduled update

---

## Compliance Considerations

### Industry Standards

Route Core is designed with awareness of:

| Standard | Relevance | Status |
|----------|-----------|--------|
| IEC 61082 | Document types for electrotechnology | SVG export follows schematic conventions |
| IEC 62023 | Harness documentation | BOM format compatible |
| ISO 27001 | Information security | Deployment guide covers encryption, access control |
| GDPR | Data protection | No PII collected; self-hosted |

### Export Control

Cable harness designs may be subject to export control regulations (ITAR, EAR) depending on their application. Organizations are responsible for:

- Classifying their designs appropriately
- Implementing access controls as required
- Maintaining audit trails (planned in future versions)

### Audit Readiness

- All source code is version-controlled in Git
- CI/CD pipeline provides build provenance
- Dependency versions are locked and reproducible
- SQLite WAL mode provides transaction safety

---

## Best Practices for Deployment

1. **Always use HTTPS** in production (TLS 1.2+)
2. **Deploy behind a reverse proxy** (Nginx, Caddy) with rate limiting
3. **Restrict CORS origins** to known domains
4. **Keep dependencies updated** — run `npm audit` regularly
5. **Back up SQLite database** daily
6. **Use process manager** (PM2) for automatic restarts
7. **Monitor health endpoint** for uptime
8. **Rotate API keys** (when authentication is implemented)
