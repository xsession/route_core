# Changelog

All notable changes to Route Core are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

- **Testing**: Comprehensive Vitest test suites for all core modules (12 test files)
  - Models: `harness.test.ts`, `wire.test.ts`
  - Harness: `builder.test.ts`, `validator.test.ts`, `router.test.ts`
  - BOM: `generator.test.ts`
  - Cable: `creator.test.ts`
  - Component: `creator.test.ts`
  - Export: `manager.test.ts`, `svg.test.ts`
  - Parts: `parts-db.test.ts`, `search.test.ts`
  - Server: `routes.test.ts`
- **CI/CD**: GitHub Actions workflows
  - `ci.yml`: Lint, test (Node 18/20/22 matrix), build, desktop build
  - `release.yml`: Tag-triggered releases with cross-platform desktop binaries
- **Desktop**: Electrobun-based portable desktop application
  - Embedded Express API server (in-process)
  - Native webview rendering the React UI
  - Cross-platform builds (macOS, Windows, Linux)
- **Documentation**: Enterprise-grade documentation suite
  - Architecture guide with ADRs (8 decisions documented)
  - Complete REST API reference
  - Core library TypeScript API reference
  - Deployment guide (Docker, PM2, systemd, reverse proxy)
  - Contributing guide with coding standards and PR process
  - Testing guide with coverage requirements
  - Security policy with vulnerability reporting
  - This changelog
- **Build Scripts**: Enhanced npm scripts
  - `build:core`, `build:server`, `build:web` — individual package builds
  - `test:core`, `test:server` — package-specific test runs
  - `test:coverage` — coverage with v8 provider
  - `typecheck` — TypeScript type checking without emit
  - `clean` — remove dist and coverage directories

---

## [0.1.0] — 2024-01-15

### Added

- **Core Package** (`@route-core/core`)
  - Data models: `Harness`, `Component`, `Wire`, `Cable`, `Pin`, `Connection`
  - `HarnessBuilder` — imperative API for harness construction with auto-labeling
  - `HarnessValidator` — design rule checking (5 rules)
  - `WireRouter` — Manhattan routing algorithm
  - `BomGenerator` — bill of materials with CSV and text table export
  - `CableCreator` — cable factory with 5 color sequences
  - `ComponentCreator` — 23 built-in component templates
  - `SvgExporter` — full SVG schematic rendering
  - `ExportManager` — coordinates all export formats (SVG, BOM, JSON, netlist)
  - `PartsDatabase` — in-memory parts catalog with CRUD and serialization
  - Fuzzy search with bigram/Dice coefficient scoring

- **Server Package** (`@route-core/server`)
  - Express REST API on port 3001
  - SQLite persistence with WAL mode
  - CRUD endpoints for harnesses, parts, and cables
  - Export endpoints (validate, BOM, SVG, netlist)
  - Automatic seeding from `connectors.json` (200+ components)
  - Graceful shutdown on SIGTERM/SIGINT

- **Web Package** (`@route-core/web`)
  - React 18 + Vite 5 frontend
  - Zustand state management wrapping HarnessBuilder
  - SVG-based interactive canvas with drag, pan, zoom
  - Sidebar with tabbed panels (Parts, Component Creator, Cable Creator, BOM, Properties)
  - Fetch-based API client
  - Responsive layout with CSS custom properties

- **Seed Data**
  - JST PH/XH connectors (2–8 pin)
  - Molex Micro-Fit 3.0 series
  - DB9 D-Sub connectors
  - M12 industrial circular connectors
  - Phoenix Contact terminal blocks
  - Relays, fuses, circuit breakers
  - DIN rail power supplies
  - Motors and switches
