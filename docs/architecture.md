# Architecture Guide

> Route Core — Cable Harness Design & Management Platform

## Table of Contents

- [System Overview](#system-overview)
- [Package Architecture](#package-architecture)
- [Data Model](#data-model)
- [Data Flow](#data-flow)
- [Core Engine Design](#core-engine-design)
- [Frontend Architecture](#frontend-architecture)
- [Desktop Architecture](#desktop-architecture)
- [Persistence Layer](#persistence-layer)
- [Architecture Decision Records](#architecture-decision-records)

---

## System Overview

Route Core follows a **layered monorepo architecture** with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────┐
│                    Presentation Layer                     │
│  ┌──────────────────┐    ┌────────────────────────────┐  │
│  │   packages/web    │    │    packages/desktop        │  │
│  │  React + Zustand  │    │  Electrobun + Bun          │  │
│  │  Vite + SVG Canvas│    │  Native Webview + Embedded │  │
│  └────────┬─────────┘    │  Express Server             │  │
│           │              └──────────┬─────────────────┘  │
├───────────┼─────────────────────────┼────────────────────┤
│           │        API Layer        │                    │
│           ▼                         ▼                    │
│  ┌──────────────────────────────────────────────────┐    │
│  │              packages/server                      │    │
│  │         Express REST API + SQLite                 │    │
│  └────────────────────┬─────────────────────────────┘    │
├───────────────────────┼──────────────────────────────────┤
│                       ▼                                  │
│  ┌──────────────────────────────────────────────────┐    │
│  │               packages/core                       │    │
│  │   Models • Validation • Routing • Export • BOM    │    │
│  │          (Zero runtime dependencies)              │    │
│  └──────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

### Design Principles

1. **Dependency Inversion**: The core package has zero runtime dependencies and defines all domain models and business logic. Higher layers depend downward only.
2. **Framework Agnosticism**: Core logic is decoupled from React, Express, and Electrobun, enabling reuse across web, server, CLI, and desktop contexts.
3. **Single Source of Truth**: The `Harness` data model is the canonical representation, serializable to/from JSON.
4. **Fail-Safe Validation**: All design rule checks are non-destructive and produce advisory issue lists rather than throwing exceptions.

---

## Package Architecture

### `@route-core/core`

The domain engine. Contains:

| Module | Responsibility |
|--------|---------------|
| `models/` | TypeScript types and factory functions: `Harness`, `Component`, `Wire`, `Cable`, `Pin`, `Connection` |
| `harness/builder.ts` | Imperative API for constructing harnesses: add nodes, connect pins, add wires/cables, manage revisions |
| `harness/validator.ts` | Design rule checker: unconnected pins, duplicate labels, current ratings, overlapping nodes, self-connections |
| `harness/router.ts` | Manhattan (orthogonal) wire routing with clearance margins |
| `bom/generator.ts` | Bill of materials generation with consolidation by part number |
| `cable/creator.ts` | Cable factory with predefined color sequences (IEC, power DC/AC, Ethernet) |
| `component/creator.ts` | Component factory with 23 built-in templates and custom creation |
| `export/manager.ts` | Coordinates SVG, BOM (CSV/text), JSON, and netlist exports |
| `export/svg.ts` | Full SVG schematic renderer with styles, grid, components, wires, splice points |
| `parts/parts-db.ts` | In-memory parts catalog with CRUD, search, and serialization |
| `parts/search.ts` | Fuzzy search using bigram/Dice coefficient scoring |

### `@route-core/server`

RESTful API service:

- Express 4 with JSON body parsing (10 MB limit)
- CORS enabled for cross-origin development
- SQLite via better-sqlite3 with WAL mode and foreign keys
- Tables: `harnesses`, `components`, `cables`
- Automatic seeding from `data/seed/connectors.json`
- Graceful shutdown on SIGTERM/SIGINT

### `@route-core/web`

Interactive design frontend:

- React 18 with functional components and hooks
- Zustand store wrapping `HarnessBuilder`, `WireRouter`, `HarnessValidator`
- SVG-based canvas with drag, pan, zoom, and interactive node manipulation
- Component tabs: Parts Library, Component Creator, Cable Creator, BOM Viewer, Properties
- Fetch-based API client for server communication

### `@route-core/desktop`

Portable desktop application:

- Electrobun framework with Bun runtime
- Embedded Express server (same API as standalone)
- Native webview rendering the React UI
- Single-binary distribution (~14 MB)

---

## Data Model

### Entity Relationship

```
Harness
├── nodes: Component[]
│   └── pins: Pin[]
├── connections: Connection[]
│   ├── sourceComponentId → Component.id
│   ├── sourcePinId → Pin.id
│   ├── targetComponentId → Component.id
│   ├── targetPinId → Pin.id
│   └── splicePoints: SplicePoint[]
├── wires: Wire[]
│   └── gauge (AWG), color, length, properties
├── cables: Cable[]
│   └── conductors: CableConductor[]
├── canvas: CanvasState
│   └── zoom, panX, panY, gridSize, snapToGrid
└── revisions: Revision[]
    └── timestamp, author, data (snapshot)
```

### Key Types

```typescript
interface Harness {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  nodes: Component[];
  connections: Connection[];
  wires: Wire[];
  cables: Cable[];
  canvas: CanvasState;
  revisions: Revision[];
  createdAt: string;
  updatedAt: string;
}

interface Component {
  id: string;
  name: string;
  category: ComponentCategory;
  partNumber?: string;
  manufacturer?: string;
  pins: Pin[];
  position: { x: number; y: number };
  rotation: number;
  label: string;
  properties: Record<string, string>;
}

interface Pin {
  id: string;
  name: string;
  type: 'male' | 'female' | 'terminal' | 'wire';
  signal?: string;
  maxCurrent?: number;
  connected: boolean;
}
```

---

## Data Flow

### Design Session

```
User Interaction (Canvas)
        │
        ▼
Zustand Store (harness-store.ts)
        │
        ├──► HarnessBuilder   → mutates Harness state
        ├──► WireRouter        → computes wire paths
        └──► HarnessValidator  → returns ValidationIssue[]
        │
        ▼
React Components re-render (SVG canvas, sidebar panels)
        │
        ▼
API Client (on save) ──► Express Server ──► SQLite
```

### Export Pipeline

```
Harness (in-memory)
        │
        ▼
ExportManager.export(harness, format)
        │
        ├──► "svg"     → SvgExporter.export()     → SVG string
        ├──► "bom-csv" → BomGenerator.toCSV()      → CSV string
        ├──► "bom-txt" → BomGenerator.toTextTable() → formatted table
        ├──► "json"    → JSON.stringify()           → JSON string
        └──► "netlist" → formatNetlist()            → netlist text
```

---

## Core Engine Design

### HarnessBuilder

The `HarnessBuilder` class provides a fluent, imperative API for constructing harness designs:

```typescript
const builder = new HarnessBuilder();
const harness = builder.createNew("Main Wiring Harness");

// Add components
const connector = builder.addNode(harness, {
  name: "ECU Connector",
  category: "connector",
  pins: [{ name: "VCC", type: "female" }, { name: "GND", type: "female" }]
});

// Connect pins
builder.connect(harness, sourceComponentId, sourcePinId, targetComponentId, targetPinId);

// Revision control
builder.saveRevision(harness, "Initial design");
builder.restoreRevision(harness, 0);
```

**Auto-labeling**: Components are automatically labeled with category-specific prefixes:
- `J` = connector, `M` = motor, `K` = relay, `F` = fuse, `SW` = switch, `TB` = terminal block, `PS` = power supply, `CB` = circuit breaker, `S` = sensor, `L` = LED

### HarnessValidator

Non-destructive validation producing typed issue objects:

```typescript
interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  message: string;
  componentId?: string;
  pinId?: string;
}
```

Checks performed:
1. **Unconnected pins** — warnings for pins not part of any connection
2. **Duplicate labels** — errors for non-unique component labels
3. **Current rating violations** — errors when wire gauge insufficient for pin current
4. **Overlapping nodes** — warnings for components at identical positions
5. **Self-connections** — errors for connections where source and target are the same component

### WireRouter (Manhattan Routing)

Computes orthogonal (right-angle) wire paths between component pins:

```
Source Pin ──► Horizontal Segment ──► Vertical Segment ──► Target Pin
```

- Uses a 20 px clearance margin from component boundaries
- Generates intermediate waypoints for clean routing
- Avoids diagonal lines for professional schematic appearance

---

## Frontend Architecture

### State Management

The Zustand store (`harness-store.ts`) acts as the single source of truth for the UI:

```typescript
interface HarnessStore {
  harness: Harness | null;
  validationIssues: ValidationIssue[];
  selectedNodeId: string | null;
  tool: 'select' | 'connect' | 'wire';

  // Actions
  createHarness: (name: string) => void;
  addNode: (component: ComponentInput) => void;
  connectPins: (...) => void;
  moveNode: (id: string, x: number, y: number) => void;
  validate: () => void;
  save: () => Promise<void>;
  load: (id: string) => Promise<void>;
}
```

### Canvas Rendering

The harness canvas uses SVG for rendering:

1. **Grid Layer** — Optional snap-to-grid background
2. **Wire Layer** — Routed connections rendered as SVG paths
3. **Component Layer** — Positioned component nodes with pin indicators
4. **Interaction Layer** — Mouse/touch event handlers for drag, select, connect

---

## Desktop Architecture

The Electrobun desktop app uses a dual-process model:

```
┌────────────────────────────────────┐
│          Bun Main Process          │
│  ┌─────────────────────────────┐   │
│  │   Embedded Express Server   │   │
│  │   (same API as standalone)  │   │
│  └──────────────┬──────────────┘   │
│                 │ localhost:3001    │
│  ┌──────────────▼──────────────┐   │
│  │     Native Webview          │   │
│  │   (React UI via views://)   │   │
│  └─────────────────────────────┘   │
└────────────────────────────────────┘
```

Benefits:
- **Single binary** distribution (~14 MB)
- **Offline capable** — no external server needed
- **Cross-platform** — macOS, Windows, Linux
- **Same codebase** — web and desktop share the React UI

---

## Persistence Layer

### SQLite Schema

```sql
CREATE TABLE harnesses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  data TEXT NOT NULL,      -- JSON-serialized Harness object
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE components (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  part_number TEXT,
  manufacturer TEXT,
  description TEXT DEFAULT '',
  data TEXT NOT NULL,      -- JSON-serialized Component object
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE cables (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  part_number TEXT,
  data TEXT NOT NULL,      -- JSON-serialized Cable object
  created_at TEXT DEFAULT (datetime('now'))
);
```

Configuration: WAL mode enabled, foreign keys enforced, busy timeout 5000 ms.

---

## Architecture Decision Records

### ADR-001: Monorepo with npm Workspaces

**Status**: Accepted  
**Context**: Need to share TypeScript types and business logic between server, web, and desktop packages.  
**Decision**: Use npm workspaces (`packages/*`) with a single root `tsconfig.json` for shared compiler options.  
**Consequences**: Simple dependency management, single `npm install`, shared TypeScript configuration. No need for external monorepo tools (Turborepo, Nx).

### ADR-002: Zero-Dependency Core Package

**Status**: Accepted  
**Context**: Core business logic (validation, BOM generation, routing) must be reusable across all deployment targets.  
**Decision**: The `@route-core/core` package has zero runtime dependencies. All types are defined in plain TypeScript.  
**Consequences**: Core can be used in browser, Node.js, Bun, Deno, or any JavaScript runtime without compatibility concerns.

### ADR-003: SVG-Based Canvas (Not Canvas2D/WebGL)

**Status**: Accepted  
**Context**: Schematic rendering needs to support zoom, pan, selection, and export.  
**Decision**: Use inline SVG for the harness canvas.  
**Consequences**: DOM-based hit testing, CSS styling, native export to SVG files. Trade-off: lower performance for very large schematics (>1000 components).

### ADR-004: SQLite for Server Persistence

**Status**: Accepted  
**Context**: Server needs persistence without requiring external database infrastructure.  
**Decision**: Use better-sqlite3 with WAL mode.  
**Consequences**: Zero-config database, single-file storage, excellent read performance. Trade-off: single-writer concurrency.

### ADR-005: Electrobun for Desktop

**Status**: Accepted  
**Context**: Need portable desktop distribution for offline use.  
**Decision**: Use Electrobun (Bun + native webview) instead of Electron.  
**Consequences**: ~14 MB bundle (vs ~150 MB Electron), Bun-native performance, cross-platform. Trade-off: newer framework, smaller ecosystem.

### ADR-006: Zustand for State Management

**Status**: Accepted  
**Context**: React state management for complex harness design state with undo/redo potential.  
**Decision**: Use Zustand with a single store wrapping HarnessBuilder.  
**Consequences**: Minimal boilerplate, direct mutation support, easy persistence middleware integration. Simpler than Redux for this domain.

### ADR-007: Manhattan Wire Routing

**Status**: Accepted  
**Context**: Wire routing between component pins needs to produce professional-looking schematics.  
**Decision**: Implement Manhattan (orthogonal) routing with fixed clearance margins.  
**Consequences**: Clean right-angle wire paths typical of industry schematics. Trade-off: not optimal for dense layouts (no obstacle avoidance yet).

### ADR-008: Vitest for Testing

**Status**: Accepted  
**Context**: Need a fast, TypeScript-native test runner compatible with ESM modules.  
**Decision**: Use Vitest with v8 coverage provider.  
**Consequences**: Near-zero config, native TypeScript support, compatible with existing Vite tooling. Coverage thresholds enforced at 80%.
