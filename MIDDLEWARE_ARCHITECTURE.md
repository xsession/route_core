# Route Core — Integration Middleware Architecture

> System Architecture for FreeCAD, KiCad, and Dolibarr ERP Integration

**Version:** 1.0  
**Date:** 2026-03-23  
**Author:** Route Core Team

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Package Structure](#3-package-structure)
4. [Integration Bus (Message Broker)](#4-integration-bus)
5. [FreeCAD Adapter](#5-freecad-adapter)
6. [KiCad Adapter](#6-kicad-adapter)
7. [Dolibarr ERP Adapter](#7-dolibarr-erp-adapter)
8. [Shared Data Model & Mappers](#8-shared-data-model--mappers)
9. [Sync Engine](#9-sync-engine)
10. [API Gateway Layer](#10-api-gateway-layer)
11. [Event System & Webhooks](#11-event-system--webhooks)
12. [Authentication & Security](#12-authentication--security)
13. [File Format Bridges](#13-file-format-bridges)
14. [Deployment Topology](#14-deployment-topology)
15. [Implementation Phases](#15-implementation-phases)
16. [Appendix: Data Mapping Tables](#appendix-data-mapping-tables)

---

## 1. Executive Summary

Route Core is a cable harness designer with a core library (`@route-core/core`), an Express API server (`@route-core/server`), a React/Vite web UI (`@route-core/web`), and an Electrobun desktop app (`@route-core/desktop`).

This document defines a **middleware layer** (`@route-core/middleware`) that bridges Route Core with three external systems:

| System | Role | Integration Method |
|---|---|---|
| **FreeCAD** | 3D parametric CAD — physical harness routing, enclosure design, STEP/IGES export | Python IPC (FreeCADCmd headless), macro execution, FCStd/STEP file I/O |
| **KiCad** | EDA schematic & PCB — electrical schematics, netlists, symbol/footprint libraries | IPC API (Protocol Buffers over NNG sockets) + HTTP Libraries API (REST) |
| **Dolibarr** | Open-source ERP — BOM management, purchasing, inventory, suppliers, invoicing | REST API (Luracast/Restler) with `DOLAPIKEY` token auth |

The middleware acts as an **integration bus** — each external system has a dedicated **adapter** that translates between Route Core's internal data model and the foreign system's API/file format. A **sync engine** handles bidirectional state propagation, conflict resolution, and event-driven notifications.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          ROUTE CORE PLATFORM                            │
│                                                                         │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌───────────────────────┐  │
│  │   Web    │  │ Desktop  │  │   Server  │  │     @route-core/core  │  │
│  │ (React)  │  │(Electron)│  │ (Express) │  │  models, builder,     │  │
│  │          │  │          │  │           │  │  BOM, export, router  │  │
│  └────┬─────┘  └────┬─────┘  └─────┬─────┘  └───────────┬───────────┘  │
│       │              │              │                    │              │
│       └──────────────┴──────┬───────┴────────────────────┘              │
│                             │                                           │
│                    ┌────────▼─────────┐                                 │
│                    │  MIDDLEWARE BUS  │                                 │
│                    │  @route-core/    │                                 │
│                    │   middleware     │                                 │
│                    └──┬─────┬─────┬──┘                                 │
│                       │     │     │                                     │
└───────────────────────┼─────┼─────┼─────────────────────────────────────┘
                        │     │     │
              ┌─────────▼┐ ┌──▼──┐ ┌▼──────────┐
              │ FreeCAD  │ │KiCad│ │ Dolibarr  │
              │ Adapter  │ │Adapt│ │  Adapter  │
              └─────┬────┘ └──┬──┘ └─────┬─────┘
                    │         │          │
              ┌─────▼────┐ ┌──▼──────┐ ┌─▼──────────┐
              │ FreeCAD  │ │ KiCad   │ │  Dolibarr  │
              │ (Python  │ │ (IPC +  │ │  (REST     │
              │  IPC /   │ │  HTTP   │ │   API)     │
              │  FCStd)  │ │  Libs)  │ │            │
              └──────────┘ └─────────┘ └────────────┘
```

### Design Principles

1. **Adapter Pattern** — Each external system is isolated behind a typed adapter interface. Route Core never imports system-specific code directly.
2. **Event-Driven** — Changes in Route Core emit domain events. Adapters subscribe and push deltas to external systems. External changes are polled or webhook-received and mapped back.
3. **Offline-First** — All adapters support a file-based fallback when the external system is not running. Export/import files (STEP, KiCad S-Expression, JSON) can be exchanged manually.
4. **Idempotent Sync** — The sync engine uses entity versioning and last-modified timestamps to prevent duplicate writes.

---

## 3. Package Structure

```
packages/
  middleware/
    package.json
    tsconfig.json
    src/
      index.ts                     # Public API surface
      bus/
        event-bus.ts               # In-process event emitter (EventEmitter3)
        events.ts                  # Domain event type definitions
      adapters/
        adapter.ts                 # Base adapter interface
        freecad/
          freecad-adapter.ts       # FreeCAD adapter implementation
          freecad-ipc.ts           # Python subprocess IPC manager
          freecad-mapper.ts        # RouteCore ↔ FreeCAD data mapping
          scripts/                 # Python scripts executed in FreeCADCmd
            harness_to_3d.py       # Generate 3D harness from Route Core JSON
            export_step.py         # Export STEP/IGES files
            import_enclosure.py    # Import enclosure geometry
        kicad/
          kicad-adapter.ts         # KiCad adapter implementation
          kicad-ipc-client.ts      # Protocol Buffers / NNG client
          kicad-http-server.ts     # HTTP Libraries API server (parts feed)
          kicad-mapper.ts          # RouteCore ↔ KiCad data mapping
          kicad-sexpr.ts           # S-Expression parser/serializer
        dolibarr/
          dolibarr-adapter.ts      # Dolibarr adapter implementation
          dolibarr-client.ts       # REST API client (fetch-based)
          dolibarr-mapper.ts       # RouteCore ↔ Dolibarr data mapping
      sync/
        sync-engine.ts             # Bidirectional sync coordinator
        conflict-resolver.ts       # Conflict detection and resolution
        sync-log.ts                # Audit trail of all sync operations
      models/
        unified-part.ts            # Cross-system part representation
        mapping-config.ts          # Field mapping configuration
      gateway/
        middleware-routes.ts       # Express routes for middleware API
      __tests__/
        freecad-adapter.test.ts
        kicad-adapter.test.ts
        dolibarr-adapter.test.ts
        sync-engine.test.ts
```

---

## 4. Integration Bus

The middleware bus is an in-process event system that decouples Route Core from adapter-specific logic.

### Domain Events

```typescript
// packages/middleware/src/bus/events.ts

export type DomainEvent =
  | { type: 'harness:created';       payload: { harnessId: string } }
  | { type: 'harness:updated';       payload: { harnessId: string; changes: string[] } }
  | { type: 'harness:deleted';       payload: { harnessId: string } }
  | { type: 'component:added';       payload: { harnessId: string; nodeId: string } }
  | { type: 'component:removed';     payload: { harnessId: string; nodeId: string } }
  | { type: 'connection:created';    payload: { harnessId: string; connectionId: string } }
  | { type: 'connection:removed';    payload: { harnessId: string; connectionId: string } }
  | { type: 'cable:assigned';        payload: { harnessId: string; cableId: string; connectionId: string } }
  | { type: 'bom:generated';         payload: { harnessId: string; bomSummary: object } }
  | { type: 'export:requested';      payload: { harnessId: string; format: string; target: string } }
  | { type: 'sync:started';          payload: { adapter: string; direction: 'push' | 'pull' } }
  | { type: 'sync:completed';        payload: { adapter: string; stats: SyncStats } }
  | { type: 'sync:conflict';         payload: { adapter: string; entity: string; details: object } }
  | { type: 'external:part-updated'; payload: { source: string; partId: string } };
```

### Event Bus Interface

```typescript
// packages/middleware/src/bus/event-bus.ts

export interface IEventBus {
  emit(event: DomainEvent): void;
  on(type: DomainEvent['type'], handler: (event: DomainEvent) => void): void;
  off(type: DomainEvent['type'], handler: (event: DomainEvent) => void): void;
  once(type: DomainEvent['type'], handler: (event: DomainEvent) => void): void;
}
```

Implementation uses `EventEmitter3` for in-process pub/sub. For distributed deployment, this can be swapped with Redis Pub/Sub or NATS without changing adapter code.

---

## 5. FreeCAD Adapter

### Integration Strategy

FreeCAD does not expose a REST API or socket server. Integration is achieved through:

1. **FreeCADCmd** — The headless FreeCAD binary (`FreeCADCmd.exe` / `freecadcmd`) that executes Python scripts without a GUI.
2. **Python subprocess IPC** — The middleware spawns `FreeCADCmd` with Python scripts that read Route Core JSON and produce 3D geometry.
3. **File-based exchange** — FCStd (FreeCAD native), STEP, IGES, STL file import/export.

### Adapter Interface

```typescript
export interface FreeCADAdapter extends BaseAdapter {
  // 3D Harness Generation
  generateHarness3D(harness: Harness): Promise<{ stepFile: Buffer; fcstdFile: Buffer }>;

  // Export enclosure with harness routing path
  exportAssembly(harnessId: string, enclosureFile: string): Promise<Buffer>;

  // Import enclosure geometry to extract mounting points & routing channels
  importEnclosure(stepFile: Buffer): Promise<EnclosureGeometry>;

  // Get 3D preview (lightweight mesh for web viewer)
  getPreviewMesh(harnessId: string): Promise<{ vertices: Float32Array; faces: Uint32Array }>;

  // Validate physical routing (bend radius, clearance)
  validatePhysical(harness: Harness, enclosure: EnclosureGeometry): Promise<PhysicalValidation>;
}
```

### Python Script Architecture

```
FreeCADCmd ← stdin (JSON harness data)
          → stdout (result JSON / file paths)
          → stderr (progress / errors)
```

**Key Scripts:**

| Script | Purpose | Input | Output |
|---|---|---|---|
| `harness_to_3d.py` | Convert Route Core harness to 3D Part objects | Harness JSON (nodes, cables, routing paths) | FCStd file + STEP export |
| `export_step.py` | Export assembly as STEP/IGES | FCStd file path | STEP/IGES file |
| `import_enclosure.py` | Parse enclosure geometry for routing constraints | STEP/IGES file | JSON: mounting points, channels, keep-out zones |
| `validate_routing.py` | Check bend radii, cable clearances, bundle diameters | Harness JSON + Enclosure JSON | Validation report JSON |

### FreeCAD Data Mapping

| Route Core | FreeCAD | Notes |
|---|---|---|
| `HarnessNode.position` (2D) | `Part.Vertex` (3D) | 2D → 3D with Z from enclosure surface |
| `Connection` (pin-to-pin) | `Part.Wire` (3D spline) | Routed through channels, respecting bend radius |
| `Cable.outerDiameter` | `Part.Cylinder` sweep | Cable diameter → 3D cylinder swept along spline |
| `Cable.bendRadius` | Spline curvature constraint | Minimum radius enforced in routing algorithm |
| `Component.footprint` | `Part.Box` / imported STEP | Component housing as 3D block or detailed model |

### FreeCAD IPC Manager

```typescript
// packages/middleware/src/adapters/freecad/freecad-ipc.ts

export class FreeCADIPC {
  constructor(private config: {
    freecadPath: string;          // Path to FreeCADCmd executable
    workDir: string;              // Temp directory for file exchange
    timeout: number;              // Script execution timeout (ms)
    pythonScriptsDir: string;     // Path to Python scripts
  }) {}

  async execute(script: string, input: object): Promise<object> {
    // 1. Write input JSON to temp file
    // 2. Spawn FreeCADCmd with script path
    // 3. Pipe input file path as argument
    // 4. Read stdout for result JSON
    // 5. Parse and return
  }
}
```

---

## 6. KiCad Adapter

### Integration Strategy (Dual-Mode)

KiCad offers two complementary integration paths:

#### Mode A: IPC API (KiCad 9.0+)

- **Protocol:** Protocol Buffers messages over NNG (nanomsg next-gen) sockets
- **Transport:** UNIX sockets (Windows: named pipes via NNG)
- **Direction:** Route Core → KiCad (push schematic data, read netlist)
- **Use case:** Live sync with running KiCad instance

#### Mode B: HTTP Libraries API

- **Protocol:** REST/JSON
- **Direction:** KiCad → Route Core (KiCad queries our parts server)
- **Use case:** Route Core acts as a **parts library server** for KiCad. KiCad's Symbol Chooser shows Route Core components with linked symbols/footprints.

#### Mode C: File-Based (Offline)

- **Protocol:** S-Expression file I/O
- **Formats:** `.kicad_sch` (schematic), `.kicad_pcb` (board), `.kicad_sym` (symbol lib)
- **Direction:** Bidirectional import/export
- **Use case:** Exchange without running KiCad

### Adapter Interface

```typescript
export interface KiCadAdapter extends BaseAdapter {
  // === IPC API (live connection to running KiCad) ===
  connect(socketPath?: string): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // Push harness netlist to KiCad schematic editor
  pushNetlist(harness: Harness): Promise<void>;

  // Pull netlist from KiCad schematic
  pullNetlist(): Promise<PartialHarness>;

  // Sync component symbols bidirectionally
  syncSymbols(components: Component[]): Promise<SyncResult>;

  // === HTTP Libraries API (Route Core as parts server for KiCad) ===
  startHttpLibraryServer(port: number): Promise<void>;
  stopHttpLibraryServer(): Promise<void>;

  // === File-based I/O ===
  exportSchematic(harness: Harness): Promise<string>;    // .kicad_sch content
  importSchematic(content: string): Promise<PartialHarness>;
  exportSymbolLib(components: Component[]): Promise<string>; // .kicad_sym content
}
```

### KiCad HTTP Libraries Server

Route Core runs a lightweight HTTP server that implements KiCad's HTTP Libraries specification. This lets KiCad users browse Route Core's connector/component library directly from KiCad's Symbol Chooser.

**Endpoints implemented:**

```
GET /kicad-api/v1/                              → { "categories": "", "parts": "" }
GET /kicad-api/v1/categories.json               → [ { id, name, description } ]
GET /kicad-api/v1/parts/category/{id}.json      → [ { id, name, description } ]
GET /kicad-api/v1/parts/{id}.json               → { id, name, symbolIdStr, fields: { ... } }
```

**Category mapping** (Route Core `ComponentCategory` → KiCad categories):

| Route Core Category | KiCad Category Name |
|---|---|
| `connector` | `Connectors/RouteCore` |
| `terminal` | `Connectors/Terminals` |
| `relay` | `Relay/RouteCore` |
| `sensor` | `Sensor/RouteCore` |
| `fuse` | `Power_Protection/Fuses` |
| `switch` | `Switch/RouteCore` |
| `resistor`, `capacitor`, `diode` | `Passive/RouteCore` |
| `pcb` | `PCB_Modules/RouteCore` |

**Field mapping** (Route Core `Component` → KiCad part fields):

```json
{
  "id": "comp-001",
  "name": "Molex_Mini-Fit_Jr_4pin",
  "symbolIdStr": "Connector:Conn_01x04_Pin",
  "fields": {
    "footprint":    { "value": "Connector_Molex:Molex_Mini-Fit_Jr_2x02", "visible": "False" },
    "value":        { "value": "Mini-Fit Jr 4-Pin" },
    "reference":    { "value": "J" },
    "manufacturer": { "value": "Molex", "visible": "False" },
    "mpn":          { "value": "39-01-2040", "visible": "False" },
    "description":  { "value": "4-pin power connector, 4.2mm pitch", "visible": "False" },
    "datasheet":    { "value": "https://...", "visible": "False" },
    "rc_category":  { "value": "connector", "visible": "False" },
    "rc_gender":    { "value": "female", "visible": "False" },
    "rc_max_awg":   { "value": "16", "visible": "False" },
    "rc_min_awg":   { "value": "24", "visible": "False" }
  }
}
```

### KiCad IPC Client

```typescript
// packages/middleware/src/adapters/kicad/kicad-ipc-client.ts

export class KiCadIPCClient {
  private socket: NNGSocket | null = null;

  constructor(private config: {
    socketPath?: string;       // Auto-detect from env KICAD_API_SOCKET
    timeout: number;           // Request timeout (ms)
    retryAttempts: number;     // Retries on busy
    retryDelay: number;        // Delay between retries (ms)
  }) {}

  async connect(): Promise<void>;
  async disconnect(): Promise<void>;
  async send(message: Uint8Array): Promise<Uint8Array>;

  // High-level operations
  async getOpenDocuments(): Promise<DocumentInfo[]>;
  async getSchematicNets(): Promise<Net[]>;
  async addComponent(symbol: KiCadSymbol, position: Point): Promise<void>;
  async addWire(from: Point, to: Point): Promise<void>;
}
```

### KiCad S-Expression Parser

For offline file exchange, the middleware includes a parser/serializer for KiCad's S-Expression format:

```typescript
// packages/middleware/src/adapters/kicad/kicad-sexpr.ts

export class KiCadSExpr {
  // Parse .kicad_sch file to AST
  static parse(content: string): SExprNode;

  // Serialize AST back to S-Expression string
  static serialize(node: SExprNode): string;

  // Convert Route Core harness → KiCad schematic AST
  static harnessToSchematic(harness: Harness): SExprNode;

  // Convert KiCad schematic AST → partial Route Core harness
  static schematicToHarness(root: SExprNode): PartialHarness;
}
```

---

## 7. Dolibarr ERP Adapter

### Integration Strategy

Dolibarr provides a REST API (Luracast Restler-based) with `DOLAPIKEY` token authentication. The middleware connects as a REST client.

**Relevant Dolibarr modules:**

| Module | Route Core Use |
|---|---|
| **Products/Services** | Sync connectors, cables, wires as Dolibarr products |
| **BOM (Bill of Materials)** | Push Route Core BOM as Dolibarr BOM for manufacturing |
| **Third Parties** | Sync component manufacturers/suppliers |
| **Stock/Warehouse** | Check inventory levels for harness components |
| **Supplier Orders** | Create purchase orders for missing components |
| **Proposals/Invoices** | Generate customer quotes from harness BOM |
| **Categories** | Map Route Core `ComponentCategory` to Dolibarr product categories |

### Adapter Interface

```typescript
export interface DolibarrAdapter extends BaseAdapter {
  // === Product Sync ===
  syncProducts(components: Component[], cables: Cable[]): Promise<SyncResult>;
  getProduct(partNumber: string): Promise<DolibarrProduct | null>;
  searchProducts(query: string): Promise<DolibarrProduct[]>;

  // === BOM Management ===
  pushBom(bom: BomSummary, harnessName: string): Promise<{ bomId: number }>;
  getBom(bomId: number): Promise<DolibarrBom>;

  // === Inventory ===
  checkStock(partNumbers: string[]): Promise<StockCheck[]>;
  getStockForBom(bom: BomSummary): Promise<BomStockStatus>;

  // === Suppliers ===
  syncSuppliers(manufacturers: string[]): Promise<SyncResult>;
  getSupplierPrices(partNumber: string): Promise<SupplierPrice[]>;

  // === Purchasing ===
  createPurchaseOrder(shortages: StockShortage[]): Promise<{ orderId: number }>;

  // === Quoting ===
  createProposal(bom: BomSummary, customerId: number): Promise<{ proposalId: number }>;
}
```

### Dolibarr REST Client

```typescript
// packages/middleware/src/adapters/dolibarr/dolibarr-client.ts

export class DolibarrClient {
  constructor(private config: {
    baseUrl: string;            // e.g. "https://erp.example.com/api/index.php"
    apiKey: string;             // DOLAPIKEY token
    entity?: number;            // Multi-entity support (DOLAPIENTITY header)
    timeout: number;
  }) {}

  // Generic REST methods
  async get<T>(endpoint: string, params?: Record<string, string>): Promise<T>;
  async post<T>(endpoint: string, body: object): Promise<T>;
  async put<T>(endpoint: string, body: object): Promise<T>;
  async delete(endpoint: string): Promise<void>;

  // === Product endpoints ===
  async getProducts(filters?: ProductFilter): Promise<DolibarrProduct[]>;
  async getProduct(id: number): Promise<DolibarrProduct>;
  async createProduct(product: CreateProduct): Promise<number>;
  async updateProduct(id: number, data: Partial<CreateProduct>): Promise<void>;

  // === BOM endpoints ===
  async createBom(bom: CreateBom): Promise<number>;
  async getBom(id: number): Promise<DolibarrBom>;
  async addBomLine(bomId: number, line: BomLine): Promise<number>;

  // === Stock endpoints ===
  async getStockMovements(productId: number): Promise<StockMovement[]>;
  async getWarehouseStock(warehouseId: number): Promise<WarehouseStock>;

  // === Third Party endpoints ===
  async getThirdParties(filters?: ThirdPartyFilter): Promise<DolibarrThirdParty[]>;
  async createThirdParty(data: CreateThirdParty): Promise<number>;

  // === Supplier Order endpoints ===
  async createSupplierOrder(supplierId: number): Promise<number>;
  async addOrderLine(orderId: number, line: OrderLine): Promise<number>;
  async validateOrder(orderId: number): Promise<void>;

  // === Proposal (Quote) endpoints ===
  async createProposal(customerId: number): Promise<number>;
  async addProposalLine(proposalId: number, line: ProposalLine): Promise<number>;
}
```

### Dolibarr Data Mapping

| Route Core | Dolibarr | API Endpoint | Notes |
|---|---|---|---|
| `Component.partNumber` | `Product.ref` | `GET /products?sqlfilters=ref='{pn}'` | Primary key for sync |
| `Component.name` | `Product.label` | — | Human-readable name |
| `Component.manufacturer` | `ThirdParty.name` (supplier) | `GET /thirdparties?sqlfilters=nom='{mfg}'` | Linked as supplier |
| `Component.category` | `Product.categories[]` | `POST /categories` | Create if missing |
| `Component.description` | `Product.description` | — | |
| `Cable.partNumber` | `Product.ref` | — | Cables are products of type "service" or "product" |
| `BomEntry.partNumber` | `BomLine.fk_product` | `POST /boms/{id}/lines` | Link by product ID |
| `BomEntry.quantity` | `BomLine.qty` | — | |
| `BomEntry.unitPrice` | `Product.price` | `GET /products/{id}` | Pull price from Dolibarr |
| `BomSummary` | `Bom` (header) | `POST /boms` | One BOM per harness version |

### Product Sync Flow

```
Route Core Component                    Dolibarr Product
─────────────────                       ────────────────
partNumber: "39-01-2040"     ──────►    ref: "39-01-2040"
name: "Mini-Fit Jr 4pin"    ──────►    label: "Mini-Fit Jr 4-Pin Connector"
manufacturer: "Molex"       ──────►    (linked ThirdParty as supplier)
category: "connector"       ──────►    categories: [{ id: 5, label: "Connectors" }]
description: "..."           ──────►    description: "..."
                             ◄──────    price: 2.45 (pull price back)
                             ◄──────    stock_reel: 150 (pull stock back)
                             ◄──────    suppliers[]: (pull supplier info)
```

---

## 8. Shared Data Model & Mappers

### Unified Part Model

A cross-system representation used as the canonical intermediate format during sync:

```typescript
// packages/middleware/src/models/unified-part.ts

export interface UnifiedPart {
  // Identity
  routeCoreId?: string;
  kicadSymbolId?: string;
  dolibarrProductId?: number;
  freecadObjectName?: string;

  // Core fields
  partNumber: string;               // Primary key across systems
  name: string;
  manufacturer: string;
  category: string;
  description: string;

  // Electrical
  pinCount?: number;
  maxVoltage?: number;
  maxCurrent?: number;
  awgRange?: { min: number; max: number };

  // Physical
  pitch?: number;
  dimensions?: { length: number; width: number; height: number };
  weight?: number;

  // Commercial
  unitPrice?: number;
  currency?: string;
  stockLevel?: number;
  suppliersCount?: number;
  leadTime?: number;             // days

  // Metadata
  datasheetUrl?: string;
  imageUrl?: string;
  tags: string[];
  lastSyncedAt: Record<string, string>;   // { 'kicad': ISO, 'dolibarr': ISO, ... }
}
```

### Mapper Interface

Each adapter implements a mapper that converts between Route Core types and the unified model, and between the unified model and the external system's types:

```typescript
export interface DataMapper<TExternal> {
  toUnified(external: TExternal): UnifiedPart;
  fromUnified(unified: UnifiedPart): TExternal;
  toRouteCore(unified: UnifiedPart): Partial<Component>;
  fromRouteCore(component: Component): UnifiedPart;
}
```

---

## 9. Sync Engine

### Sync Coordinator

```typescript
// packages/middleware/src/sync/sync-engine.ts

export class SyncEngine {
  constructor(
    private bus: IEventBus,
    private adapters: Map<string, BaseAdapter>,
    private conflictResolver: ConflictResolver,
    private syncLog: SyncLog,
  ) {}

  // Full sync: push Route Core state to all adapters, pull updates back
  async syncAll(harness: Harness): Promise<SyncReport>;

  // Targeted sync: only sync with one adapter
  async syncWith(adapterName: string, harness: Harness): Promise<SyncReport>;

  // Incremental sync: only sync changed entities since last sync
  async syncDelta(adapterName: string, since: Date): Promise<SyncReport>;

  // Conflict resolution
  async resolveConflict(conflictId: string, resolution: 'ours' | 'theirs' | 'merge'): Promise<void>;
}
```

### Conflict Resolution Strategy

| Conflict Type | Default Resolution | User Override |
|---|---|---|
| Part number exists in Dolibarr with different name | Use Dolibarr name (ERP is source of truth for commercial data) | Yes |
| Pin count mismatch between KiCad and Route Core | Flag for manual review | Yes |
| Price updated in Dolibarr after BOM export | Auto-update BOM in Route Core | Yes |
| 3D model missing in FreeCAD for component | Skip, add to report | Yes |
| Stock level is zero for BOM item | Flag warning, suggest alternatives | Yes |

### Sync Audit Log

Every sync operation is recorded:

```typescript
export interface SyncLogEntry {
  id: string;
  timestamp: string;
  adapter: string;
  direction: 'push' | 'pull';
  entityType: 'component' | 'cable' | 'bom' | 'harness';
  entityId: string;
  action: 'created' | 'updated' | 'deleted' | 'skipped' | 'conflict';
  details: object;
  durationMs: number;
}
```

---

## 10. API Gateway Layer

New Express routes exposed by the middleware, mounted on the existing server:

```
POST   /api/middleware/sync                          # Full sync all adapters
POST   /api/middleware/sync/:adapter                 # Sync with specific adapter
GET    /api/middleware/sync/status                    # Last sync status & stats
GET    /api/middleware/sync/log                       # Audit log

# FreeCAD
POST   /api/middleware/freecad/generate-3d           # Generate 3D harness
POST   /api/middleware/freecad/export-step            # Export STEP file
POST   /api/middleware/freecad/import-enclosure       # Import enclosure geometry
POST   /api/middleware/freecad/validate-physical      # Physical routing validation

# KiCad
POST   /api/middleware/kicad/connect                  # Connect to running KiCad
POST   /api/middleware/kicad/disconnect                # Disconnect
POST   /api/middleware/kicad/push-netlist             # Push netlist to KiCad
POST   /api/middleware/kicad/pull-netlist             # Pull netlist from KiCad
GET    /api/middleware/kicad/status                    # Connection status
POST   /api/middleware/kicad/export-schematic         # Export .kicad_sch file
POST   /api/middleware/kicad/import-schematic         # Import .kicad_sch file

# KiCad HTTP Libraries (separate server for KiCad to query)
GET    /kicad-api/v1/                                 # Root validation
GET    /kicad-api/v1/categories.json                  # Part categories
GET    /kicad-api/v1/parts/category/:id.json          # Parts in category
GET    /kicad-api/v1/parts/:id.json                   # Part details

# Dolibarr
POST   /api/middleware/dolibarr/sync-products         # Sync components as products
POST   /api/middleware/dolibarr/push-bom              # Push BOM to Dolibarr
GET    /api/middleware/dolibarr/stock-check            # Check stock levels
POST   /api/middleware/dolibarr/create-order           # Create purchase order
POST   /api/middleware/dolibarr/create-proposal        # Create customer quote
GET    /api/middleware/dolibarr/prices/:partNumber     # Get supplier prices

# Configuration
GET    /api/middleware/config                          # Get adapter configs
PUT    /api/middleware/config/:adapter                 # Update adapter config
```

---

## 11. Event System & Webhooks

### Internal Events → External Actions

```
┌──────────────────────┐     ┌───────────────┐     ┌──────────────────┐
│   Route Core Store   │────►│   Event Bus   │────►│   Adapter        │
│                      │     │               │     │   Handlers       │
│ • Component added    │     │ Dispatches    │     │                  │
│ • Connection made    │     │ domain events │     │ • FreeCAD: regen │
│ • BOM exported       │     │               │     │ • KiCad: update  │
│ • Harness saved      │     │               │     │ • Dolibarr: sync │
└──────────────────────┘     └───────────────┘     └──────────────────┘
```

### Webhook Support (Dolibarr → Route Core)

Dolibarr can send webhooks on product/stock changes. The middleware exposes:

```
POST /api/middleware/webhooks/dolibarr      # Receives Dolibarr trigger events
```

Subscribed Dolibarr triggers:
- `PRODUCT_MODIFY` — Update price/stock in Route Core parts library
- `STOCK_MOVEMENT` — Update stock levels
- `ORDER_VALIDATE` — Confirm purchase order was placed

---

## 12. Authentication & Security

### Credential Management

```typescript
// packages/middleware/src/models/mapping-config.ts

export interface MiddlewareConfig {
  freecad: {
    enabled: boolean;
    executablePath: string;           // Path to FreeCADCmd
    workDirectory: string;            // Temp file exchange dir
    timeout: number;                  // Script timeout (ms), default 60000
  };
  kicad: {
    enabled: boolean;
    ipcEnabled: boolean;              // Enable IPC API connection
    ipcSocketPath?: string;           // Auto-detect if not set
    httpLibraryEnabled: boolean;      // Enable HTTP Library server
    httpLibraryPort: number;          // Default 8456
    httpLibraryToken: string;         // Token for AUTHORIZATION header
  };
  dolibarr: {
    enabled: boolean;
    baseUrl: string;                  // Dolibarr instance URL
    apiKey: string;                   // DOLAPIKEY (encrypted at rest)
    entity?: number;                  // Multi-entity ID
    syncInterval: number;            // Auto-sync interval (ms), 0 = manual only
    productCategoryId?: number;       // Default Dolibarr category for new products
  };
  sync: {
    conflictStrategy: 'ours' | 'theirs' | 'manual';
    maxRetries: number;
    retryDelay: number;
    logRetentionDays: number;
  };
}
```

### Security Measures

| Concern | Solution |
|---|---|
| Dolibarr API key storage | Encrypted with `node:crypto` AES-256-GCM, key from env var `RC_ENCRYPTION_KEY` |
| KiCad HTTP Library auth | Token-based (`AUTHORIZATION: Token xxx`), configurable |
| FreeCAD script execution | Scripts are bundled with the middleware (no arbitrary code execution). Input is sanitized JSON. |
| CORS | KiCad HTTP Library server has CORS disabled (KiCad is not a browser) |
| Rate limiting | Dolibarr adapter respects rate limits, backs off on 429 |
| Input validation | All external data validated with Zod schemas before mapping |

---

## 13. File Format Bridges

### Supported Import/Export Formats

| Format | Extension | Direction | Adapter | Description |
|---|---|---|---|---|
| **STEP** | `.step`, `.stp` | Export/Import | FreeCAD | ISO 10303, 3D geometry exchange |
| **IGES** | `.iges`, `.igs` | Export/Import | FreeCAD | Legacy 3D format (broad compatibility) |
| **STL** | `.stl` | Export | FreeCAD | Mesh for 3D printing / preview |
| **FCStd** | `.FCStd` | Export/Import | FreeCAD | FreeCAD native project file |
| **KiCad Schematic** | `.kicad_sch` | Export/Import | KiCad | S-Expression schematic |
| **KiCad Symbol Lib** | `.kicad_sym` | Export | KiCad | Symbol library for Route Core parts |
| **KiCad Netlist** | `.net` | Export | KiCad | Netlist for PCB handoff |
| **Route Core JSON** | `.rcjson` | Export/Import | All | Native Route Core harness format |
| **CSV BOM** | `.csv` | Export | Dolibarr | BOM in CSV for ERP import |
| **SVG** | `.svg` | Export | (existing) | 2D schematic drawing |

### Format Pipeline

```
Route Core Harness (in-memory)
       │
       ├──► JSON ──► FreeCAD Python ──► FCStd ──► STEP/IGES/STL
       │
       ├──► Mapper ──► S-Expression ──► .kicad_sch / .kicad_sym
       │
       ├──► BOM Generator ──► CSV ──► Dolibarr Import
       │
       └──► SVG Exporter ──► .svg (existing)
```

---

## 14. Deployment Topology

### Development (Single Machine)

```
┌──────────────────────────────────────────────────────────────────────┐
│ Developer Workstation                                                │
│                                                                      │
│  Route Core Desktop (Electrobun)                                     │
│    └── Embedded Server (Express :3001)                               │
│         └── Middleware Module (in-process)                            │
│              ├── FreeCAD Adapter → FreeCADCmd (local install)        │
│              ├── KiCad Adapter → KiCad 9.x (local install, IPC)     │
│              │    └── HTTP Library Server (:8456)                    │
│              └── Dolibarr Adapter → Dolibarr (Docker or remote)     │
│                                                                      │
│  FreeCAD 1.x (installed)                                             │
│  KiCad 9.x (installed)                                               │
│  Dolibarr (Docker: dolibarr/dolibarr:latest) ──► MariaDB container  │
└──────────────────────────────────────────────────────────────────────┘
```

### Production (Team/Enterprise)

```
┌─────────────────────┐     ┌──────────────────────┐     ┌────────────┐
│  Route Core Server  │────►│   Middleware Server   │────►│  FreeCAD   │
│  (Express, :3001)   │     │   (Express, :3002)    │     │  Worker    │
│                     │     │                       │     │ (headless) │
│  Route Core Web     │     │  Event Bus (Redis)    │     └────────────┘
│  (Vite, :5173)      │     │  Sync Engine          │
└─────────────────────┘     │  Audit Log (SQLite)   │     ┌────────────┐
                            │                       │────►│  KiCad     │
                            └───────┬───────────────┘     │  (IPC)     │
                                    │                     └────────────┘
                                    │
                            ┌───────▼───────────────┐
                            │     Dolibarr ERP      │
                            │  (PHP/MariaDB, :8080) │
                            └───────────────────────┘
```

---

## 15. Implementation Phases

### Phase 1 — Foundation (2 weeks)

| Task | Deliverable |
|---|---|
| Scaffold `packages/middleware` | Package structure, tsconfig, dependencies |
| Event bus implementation | `EventBus` class with typed events |
| Base adapter interface | `BaseAdapter` abstract class |
| Configuration model | `MiddlewareConfig` with Zod validation |
| Sync log (SQLite) | `SyncLog` class with `better-sqlite3` |
| API gateway routes (skeleton) | Express router mounted on server |
| Unit test infrastructure | Vitest tests for bus, config, log |

### Phase 2 — Dolibarr Integration (2 weeks)

| Task | Deliverable |
|---|---|
| Dolibarr REST client | `DolibarrClient` with full CRUD |
| Product sync (Component → Product) | Bidirectional product sync |
| BOM push (BomSummary → Dolibarr BOM) | Create/update BOMs with line items |
| Stock check | Query warehouse stock for BOM items |
| Supplier sync | Manufacturer → ThirdParty mapping |
| Dolibarr data mapper | `DolibarrMapper` with complete field mapping |
| Webhook receiver | `/webhooks/dolibarr` endpoint |
| Integration tests | Tests against Dolibarr Docker container |

### Phase 3 — KiCad Integration (3 weeks)

| Task | Deliverable |
|---|---|
| S-Expression parser/serializer | `KiCadSExpr` class (parse + serialize) |
| KiCad HTTP Libraries server | Express routes for `/kicad-api/v1/*` |
| Component → Symbol mapping | Map Route Core components to KiCad symbols |
| Schematic export (.kicad_sch) | Generate schematic from harness |
| Schematic import (.kicad_sch) | Parse schematic to partial harness |
| Symbol library export (.kicad_sym) | Export Route Core parts as KiCad symbol library |
| KiCad IPC client (Protocol Buffers) | NNG socket client with protobuf encoding |
| Live netlist sync | Push/pull netlists via IPC |
| Integration tests | Tests with KiCad file samples |

### Phase 4 — FreeCAD Integration (3 weeks)

| Task | Deliverable |
|---|---|
| FreeCAD IPC manager | `FreeCADIPC` subprocess spawner |
| Python script: `harness_to_3d.py` | Convert harness JSON to 3D FreeCAD model |
| Python script: `export_step.py` | Export assembled model as STEP |
| Python script: `import_enclosure.py` | Parse enclosure for routing constraints |
| Harness → 3D geometry mapper | `FreeCADMapper` position/routing translation |
| Physical validation script | Bend radius, clearance, bundle diameter checks |
| 3D preview mesh generation | Lightweight mesh for web viewer (Three.js ready) |
| Integration tests | Tests with FreeCADCmd headless |

### Phase 5 — Sync Engine & Polish (2 weeks)

| Task | Deliverable |
|---|---|
| Full sync coordinator | `SyncEngine.syncAll()` orchestration |
| Incremental delta sync | Track changes since last sync timestamp |
| Conflict resolution UI | Web UI panel for resolving sync conflicts |
| Middleware settings panel | Web UI for configuring adapter connections |
| Sync status dashboard | Real-time sync status in sidebar |
| End-to-end integration tests | Full pipeline: Route Core → all 3 systems |
| Documentation | API docs, user guide, setup instructions |

### Estimated Total: ~12 weeks

---

## Appendix: Data Mapping Tables

### A. Route Core → KiCad Netlist Mapping

| Route Core | KiCad Net | Notes |
|---|---|---|
| `Connection.id` | Net name | `NET_{connection.id}` |
| `Connection.signalLabel` | Net label | Displayed on schematic |
| `Connection.from.componentId` | Component reference | Mapped to refDes (J1, P2, etc.) |
| `Connection.from.pinId` | Pin number | Must match symbol pin numbering |
| `Connection.to.componentId` | Component reference | — |
| `Connection.to.pinId` | Pin number | — |
| `HarnessNode.label` | Reference designator | e.g., "J1", "P2" |
| `Component.partNumber` | MPN field | Manufacturer Part Number |

### B. Route Core → Dolibarr Product Type Mapping

| Route Core `ComponentCategory` | Dolibarr `type` | Dolibarr `fk_product_type` |
|---|---|---|
| `connector`, `terminal`, `switch`, `fuse`, `relay` | Product | 0 |
| `motor`, `sensor`, `controller`, `power_supply` | Product | 0 |
| `resistor`, `capacitor`, `diode`, `inductor` | Product | 0 |
| (Cable/Wire) | Product | 0 |
| (Assembly/Harness) | Service | 1 |

### C. Route Core → FreeCAD Object Mapping

| Route Core Entity | FreeCAD Object | FreeCAD Workbench |
|---|---|---|
| `HarnessNode` | `Part::Feature` (box or imported STEP) | Part |
| `Connection` (wire path) | `Part::BSplineCurve` (3D spline) | Part |
| `Cable` (physical cable) | `Part::Sweep` (circle profile along spline) | Part |
| `Cable.bendRadius` | Spline curvature constraint | Part |
| Harness bundle | `Part::Compound` | Part |
| Enclosure | Imported STEP solid | Import |
| Mounting points | `Part::Vertex` markers | Part |
| Cable clips / tie points | `Part::Feature` with constraints | Part |

### D. Wire Color Code Mapping (Universal)

| Route Core `colorCode` | KiCad Wire Color | Dolibarr Custom Field | FreeCAD Display Color |
|---|---|---|---|
| `red` | `rgb(255,0,0)` | `RC_WIRE_COLOR=RED` | `(1.0, 0.0, 0.0)` |
| `black` | `rgb(0,0,0)` | `RC_WIRE_COLOR=BLK` | `(0.0, 0.0, 0.0)` |
| `green` | `rgb(0,128,0)` | `RC_WIRE_COLOR=GRN` | `(0.0, 0.5, 0.0)` |
| `blue` | `rgb(0,0,255)` | `RC_WIRE_COLOR=BLU` | `(0.0, 0.0, 1.0)` |
| `white` | `rgb(255,255,255)` | `RC_WIRE_COLOR=WHT` | `(1.0, 1.0, 1.0)` |
| `yellow` | `rgb(255,255,0)` | `RC_WIRE_COLOR=YEL` | `(1.0, 1.0, 0.0)` |
| `orange` | `rgb(255,165,0)` | `RC_WIRE_COLOR=ORG` | `(1.0, 0.65, 0.0)` |
| `brown` | `rgb(139,69,19)` | `RC_WIRE_COLOR=BRN` | `(0.55, 0.27, 0.07)` |

---

*End of Architecture Document*
