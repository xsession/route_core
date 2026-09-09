# RouteCore Offline Studio — Implementation Status

Version: 0.4.0  
Date: 2026-08-26

## Release classification

RouteCore is the canonical product identity in this release. New projects use `.routecore`; legacy `.ohcad` projects remain directly openable. Package, SVG, export-schema, launcher, and local-storage namespaces have been migrated to RouteCore.

This is a runnable clean-room reference implementation of the offline wiring-harness CAD system described by the project specifications. It is not a mock-up: the editor, local persistence, revisions, libraries, exports, validation, and generated assembly workflow execute against real application state and a real SQLite project file.

It is also not yet presented as a production-certified replacement for every workflow in a mature commercial harness CAD product. Qualification against an organization’s manufacturing rules, ERP/PLM formats, accessibility requirements, and very-large-project performance targets remains deployment work.

## Implemented application surfaces

- Dense desktop-style CAD shell with menu bar, command bar, model tabs, view tabs, Explorer, local Library, BOM, Properties, Style, Rules, Problems, Connectivity, History, and Output panels.
- Plan Layout and Schematic workspaces plus generated Assembly models.
- Local Component Creator with dynamic pin matrices, measured collision-safe four-sided pin bands, automatic geometry sizing, manual size overrides, component labels, designators, metadata, style controls, and reusable library storage.
- Local Cable Creator with conductor/core definitions and application of cable-core appearance and metadata to selected wires.
- Component transforms: move, multi-select move, rotate, mirror-ready core model, duplicate, delete, lock, hide, fit-to-content, and connected-pin mutation policies.
- Wire creation between ports, endpoint target validation, port connection limits, component-normal lead-ins, live route preview, reconnection-capable core model, segment manipulation, route constraints, automatic reroute, and undo/redo.
- Direct, orthogonal, horizontal-first, vertical-first, horizontal/vertical dogleg, horizontal/vertical trunk, manual, and fan-out routing patterns.
- Rounded bends with requested-radius clamping, component keep-outs, obstacle avoidance, route diagnostics, crossing bridges, lane separation, and deterministic serialization.
- Engineering wire appearances: solid, stripe, tracer, dual, shield, layered strokes, configurable width, dash, opacity, base color, secondary color, and contrast-preserving overlays.
- First-class labels with automatic placement, owner-relative placement, manual offset, world pinning, collision scoring, reset-to-auto, background-derived foreground contrast, and independent content/appearance controls.
- Selection, hover, marquee, CAD window/crossing semantics, panning, focal zoom, fit, grid, snapping, route handles, context menus, keyboard commands, and status feedback.
- Validation feedback for routing, endpoint, geometry, radius, and document-integrity conditions.
- Local component and cable libraries in an application SQLite database.
- Project-local BOM assignments, immutable revisions, command-level non-destructive history checkout, checkpoints, a 500-state rolling recovery window, normalized projections, generated-assembly mappings, and integrity checks.
- Eight offline exports: editor JSON, project interchange JSON, SVG, BOM CSV, cut-list CSV, pinout CSV, continuity CSV, and netlist JSON.

## Persistence architecture

- Each project is a single `.routecore` SQLite file.
- The editor document is stored as deterministic JSON and projected into normalized component, pin, conductor, endpoint, BOM, revision, and mapping tables.
- Database migrations are applied locally from the bundled SQL schemas.
- Foreign keys, WAL journaling, transactions, checkpoints, and `PRAGMA integrity_check` are used.
- No remote database or cloud service is needed.

## Runtime architecture

- Frontend: strict TypeScript compiled to browser-native ES modules.
- Editor engine: framework-neutral `@xsession/editor-core` submodule, exposed through a thin RouteCore compatibility distribution.
- Backend: Node.js ES modules and built-in `node:sqlite`.
- Host: loopback-only HTTP server bound to `127.0.0.1` or `::1`.
- Runtime dependencies: zero third-party packages.
- Runtime network policy: local-origin requests only; no telemetry, accounts, remote assets, external fonts, update check, WebSocket, or cloud API.

## Known deployment work

- Native Tauri/Electron packaging, platform signing, installers, and automatic local updates are not part of this release archive.
- Multi-user real-time collaboration and optional self-hosted synchronization are not implemented.
- Native importers for proprietary commercial CAD formats are not implemented.
- Formal ERP/PLM exchange certification and customer-specific manufacturing rules are not included.
- Full WCAG and keyboard-only accessibility audit remains to be completed.
- Stress qualification on projects with tens of thousands of components and conductors remains to be completed.
- Automated autorouting is production-capable for the implemented patterns but is not claimed to be globally optimal for every harness topology.
