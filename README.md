<p align="center">
  <strong>Route Core</strong><br />
  Professional Cable Harness Design & Management Platform
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#documentation">Documentation</a> •
  <a href="#api-reference">API Reference</a> •
  <a href="#contributing">Contributing</a> •
  <a href="#license">License</a>
</p>

---

## Overview

**Route Core** is a full-stack, enterprise-grade cable harness design and management platform built with TypeScript. It provides an interactive canvas for placing components, routing wires, creating custom cables, generating bills of materials, and exporting production-ready schematics.

### Key Capabilities

| Capability | Description |
|-----------|-------------|
| **Harness Builder** | Drag-and-drop SVG canvas with pan/zoom for placing components and routing wires |
| **Parts Library** | Searchable database of connectors, terminals, relays, motors, and more — extensible with custom parts |
| **Component Creator** | Create components from 23+ templates or fully custom pin layouts |
| **Cable Creator** | Define multi-conductor cables with conductor specs, shielding, jacket properties, and standard color codes |
| **BOM Generator** | Automatic bill of materials with consolidation, CSV, and text-table export |
| **Export Engine** | SVG schematics, JSON save/load, netlist generation |
| **Validator** | Design-rule checking: unconnected pins, current ratings, duplicate labels, overlapping nodes |
| **Wire Router** | Manhattan (orthogonal) routing with 20 px clearance margins |
| **Version Control** | Built-in revision snapshots with rollback support |
| **Desktop App** | Portable desktop application via Electrobun with embedded API server |

---

## Quick Start

### Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 18.0.0 |
| npm | ≥ 9.0.0 |
| Bun *(desktop only)* | latest |

### Installation

```bash
# Clone the repository
git clone https://github.com/xsession/route_core.git
cd route_core

# Install all workspace dependencies
npm install
```

### Running

```bash
# Start the API server (http://localhost:3001)
npm run dev:server

# Start the web frontend (http://localhost:5173)
npm run dev
```

Open **http://localhost:5173** in your browser.

### Running Tests

```bash
# All tests
npm test

# Core package only
npm run test:core

# With coverage report
npm run test:coverage
```

### Building

```bash
# Build all packages
npm run build

# Build individual packages
npm run build:core
npm run build:server
npm run build:web

# Type-check without emitting
npm run typecheck
```

---

## Architecture

Route Core uses a **monorepo** managed by npm workspaces, split into four packages:

```
route_core/
├── packages/
│   ├── core/         # Models, business logic, export engine (zero dependencies)
│   ├── server/       # REST API with SQLite persistence (Express)
│   ├── web/          # Interactive design UI (React + Vite + Zustand)
│   └── desktop/      # Portable desktop app (Electrobun + Bun)
├── data/
│   └── seed/         # Pre-loaded parts library (connectors.json)
├── docs/             # Enterprise documentation suite
└── .github/
    └── workflows/    # CI/CD pipelines
```

### Dependency Graph

```
web  ──►  core  ◄──  server
              ▲
              │
          desktop (embeds server + core)
```

### Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Core | TypeScript (ES2022, strict) | Models, validation, routing, export |
| Frontend | React 18 + Vite 5 + Zustand 4 | Interactive design canvas |
| Backend | Express 4 + better-sqlite3 | REST API, persistence |
| Desktop | Electrobun + Bun | Native cross-platform desktop app |
| Testing | Vitest + v8 coverage | Unit & integration tests |
| CI/CD | GitHub Actions | Lint, test, build, release |

> For a deep-dive into architectural decisions, see [docs/architecture.md](./docs/architecture.md).

---

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture Guide](./docs/architecture.md) | System design, data flow, ADRs |
| [API Reference](./docs/api-reference.md) | Full REST API documentation |
| [Core Library Reference](./docs/core-reference.md) | Classes, types, and functions in `@route-core/core` |
| [Deployment Guide](./docs/deployment.md) | Production deployment, Docker, desktop distribution |
| [Contributing Guide](./docs/contributing.md) | Development workflow, coding standards, PR process |
| [Testing Guide](./docs/testing.md) | Test strategy, writing tests, coverage requirements |
| [Security Policy](./docs/security.md) | Vulnerability reporting, data handling, compliance |
| [Changelog](./docs/CHANGELOG.md) | Version history and release notes |

---

## API Reference

### Base URL

- **Web**: `http://localhost:3001/api`
- **Desktop**: `http://localhost:3001/api` (embedded)

### Endpoints

#### Harnesses

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/harnesses` | List all harness designs |
| `POST` | `/api/harnesses` | Create new harness |
| `GET` | `/api/harnesses/:id` | Get harness by ID |
| `PUT` | `/api/harnesses/:id` | Update harness |
| `DELETE` | `/api/harnesses/:id` | Delete harness |

#### Parts Library

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/parts?q=&category=` | Search parts with fuzzy matching |
| `POST` | `/api/parts` | Add custom component |
| `GET` | `/api/parts/meta/categories` | List categories |
| `GET` | `/api/parts/meta/manufacturers` | List manufacturers |

#### Cables

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/cables` | List all cables |
| `POST` | `/api/cables` | Create cable |

#### Export

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/export/validate` | Validate harness design |
| `POST` | `/api/export/bom` | Generate BOM |
| `POST` | `/api/export/svg` | Export SVG schematic |
| `POST` | `/api/export/netlist` | Export netlist |

> For detailed request/response schemas, see [docs/api-reference.md](./docs/api-reference.md).

---

## Seed Data

The parts library ships with production-grade pre-loaded components:

- **JST** PH/XH series connectors (2–8 pin)
- **Molex** Micro-Fit 3.0 series
- **DB9** D-Sub connectors
- **M12** industrial circular connectors (A/D coded)
- **Phoenix Contact** terminal blocks
- **Relays**, fuses, circuit breakers
- **DIN rail** power supplies (5 V, 12 V, 24 V)
- **Motors** and **switches**

---

## Contributing

We welcome contributions! Please read our [Contributing Guide](./docs/contributing.md) before submitting a pull request.

```bash
# Create a feature branch
git checkout -b feature/your-feature

# Make changes, add tests, verify
npm test
npm run typecheck

# Commit using conventional commits
git commit -m "feat: add support for shielded cables"
```

---

## License

See [LICENSE](./LICENSE) for details.

---

<p align="center">
  Built with TypeScript • React • Express • Electrobun
</p>
