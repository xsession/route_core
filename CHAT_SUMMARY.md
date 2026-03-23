# Chat Summary — Route Core Project

## Session: March 23, 2026

### Request

The user asked to build a cable harness design application inspired by the feature set of splice-cad.com — specifically the builders and parts library modules.

### Research Phase

1. **Initial request**: Extract project source from splice-cad.com — declined due to copyright concerns.
2. **Narrowed scope**: User wanted just the builders and parts library — still proprietary, declined extraction.
3. **Source search**: Fetched the splice-cad.com homepage and found two open-source repos:
   - `splice-embed` (GitHub) — web embed viewer for harness SVGs
   - `splice-py` (GitHub) — Python library for programmatic harness creation
   - The **Harness Builder**, **Component Creator**, **Cable Creator**, and **Parts Library** are proprietary SaaS — no public source.
4. **Final decision**: User asked to design and build the same app and feature set from scratch.

### What Was Built

A complete full-stack cable harness design platform (`route_core`) using a monorepo structure with 3 packages:

#### `packages/core/` — Business Logic (TypeScript)

| Module | Files | Purpose |
|--------|-------|---------|
| **Data Models** | `models/pin.ts`, `component.ts`, `wire.ts`, `cable.ts`, `connection.ts`, `harness.ts` | Full type system for pins, components, wires, cables, connections, harness documents |
| **Parts Library** | `parts/parts-db.ts`, `search.ts` | In-memory parts catalog with fuzzy search (Dice coefficient bigram matching) |
| **Harness Builder** | `harness/builder.ts` | Imperative API — place components, connect pins, splices, snap-to-grid, auto-labeling, revision control |
| **Wire Router** | `harness/router.ts` | Manhattan routing (orthogonal L/Z bends) for visual wire paths |
| **Validator** | `harness/validator.ts` | Design rule checks — unconnected pins, duplicates, current ratings, overlaps, self-connections |
| **Component Creator** | `component/creator.ts` | 23 templates + custom builder with auto pin layouts (single row, dual row, grid, circular) |
| **Cable Creator** | `cable/creator.ts` | Multi-conductor cables with AWG specs, shielding, jackets, color sequences, quick presets |
| **BOM Generator** | `bom/generator.ts` | Aggregates parts, consolidates by P/N, exports CSV and text table |
| **Export Engine** | `export/svg.ts`, `manager.ts` | SVG schematic rendering, JSON save/load, netlist export |

#### `packages/server/` — REST API (Express + SQLite)

- Auto-migrating SQLite database schema
- Full CRUD for harnesses, parts, cables
- Export endpoints (validate, BOM, SVG, netlist)
- Auto-seeds 12 real-world components on first startup (JST, Molex, DB9, M12, Phoenix Contact, relays, fuses, etc.)

#### `packages/web/` — React Frontend (Vite + Zustand)

- **HarnessCanvas** — Interactive SVG canvas with pan, zoom, drag-and-drop
- **ConnectorNode** — Visual component rendering with pin dots and labels
- **WireConnection** — Routed wire paths with signal-based coloring
- **CanvasToolbar** — Select/Connect/Pan tools, validation, save
- **PartsLibrary** — Searchable/filterable parts panel with live API queries
- **ComponentCreatorPanel** — Template picker + custom component form
- **CableCreatorPanel** — Quick presets (power/signal/ethernet) + custom cable form
- **BomView** — Generate and download BOM as CSV
- **Sidebar** — Tabbed layout with Parts, Components, Cables, BOM, Properties panels
- **AppShell** — Top-level layout with import/export actions

### Files Created (40+)

```
route_core/
├── package.json                          # Monorepo root (npm workspaces)
├── tsconfig.json                         # Shared TypeScript config
├── .gitignore
├── README.md
├── data/seed/connectors.json             # 12 seed components
├── packages/core/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts                      # Barrel export
│       ├── models/{pin,component,wire,cable,connection,harness,index}.ts
│       ├── parts/{parts-db,search,index}.ts
│       ├── harness/{builder,router,validator,index}.ts
│       ├── component/{creator,index}.ts
│       ├── cable/{creator,index}.ts
│       ├── bom/{generator,index}.ts
│       └── export/{svg,manager,index}.ts
├── packages/server/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts                      # Express server entry
│       ├── db/{schema,seed}.ts
│       └── routes/{harness,parts,cables,export}.ts
└── packages/web/
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── index.css
        ├── api/client.ts
        ├── store/harness-store.ts
        └── components/
            ├── canvas/{HarnessCanvas,ConnectorNode,WireConnection,CanvasToolbar}.tsx
            ├── parts/{PartsLibrary,PartCard}.tsx
            ├── creators/{ComponentCreator,CableCreator}.tsx
            ├── bom/BomView.tsx
            └── layout/{AppShell,Sidebar}.tsx
```

### How to Run

```bash
cd e:\GIT\route_core
npm install
npm run dev:server   # API on port 3001
npm run dev          # Frontend on port 5173
```

### Tech Stack

- TypeScript (ES2022, strict)
- React 18 + Zustand + Vite
- Express + better-sqlite3
- SVG-based canvas rendering
