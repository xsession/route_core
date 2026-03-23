# Core Library Reference

> `@route-core/core` — TypeScript API documentation

## Table of Contents

- [Models](#models)
- [HarnessBuilder](#harnessbuilder)
- [HarnessValidator](#harnessvalidator)
- [WireRouter](#wirerouter)
- [BomGenerator](#bomgenerator)
- [CableCreator](#cablecreator)
- [ComponentCreator](#componentcreator)
- [ExportManager](#exportmanager)
- [SvgExporter](#svgexporter)
- [PartsDatabase](#partsdatabase)
- [Search Utilities](#search-utilities)
- [Utility Functions](#utility-functions)

---

## Models

### `Harness`

The root data model representing a complete cable harness design.

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
  createdAt: string;   // ISO 8601
  updatedAt: string;   // ISO 8601
}
```

#### Factory: `createHarness(name: string, options?: Partial<Harness>): Harness`

Creates a new harness with generated ID and default canvas settings.

---

### `Component`

Represents a physical component (connector, relay, motor, etc.) placed on the canvas.

```typescript
interface Component {
  id: string;
  name: string;
  category: ComponentCategory;
  partNumber?: string;
  manufacturer?: string;
  description?: string;
  pins: Pin[];
  position: { x: number; y: number };
  rotation: number;         // degrees (0, 90, 180, 270)
  label: string;            // auto-generated or custom (e.g., "J1", "M2")
  properties: Record<string, string>;
  tags?: string[];
}

type ComponentCategory =
  | 'connector'
  | 'relay'
  | 'motor'
  | 'fuse'
  | 'switch'
  | 'sensor'
  | 'terminal_block'
  | 'power_supply'
  | 'circuit_breaker'
  | 'led'
  | 'resistor'
  | 'ecu'
  | 'generic';
```

---

### `Pin`

Represents a single electrical pin on a component.

```typescript
interface Pin {
  id: string;
  name: string;
  type: 'male' | 'female' | 'terminal' | 'wire';
  signal?: string;
  maxCurrent?: number;   // amps
  connected: boolean;    // updated by HarnessBuilder
}
```

---

### `Wire`

Represents a single conductor with physical properties.

```typescript
interface Wire {
  id: string;
  gauge: string;          // e.g., "18 AWG"
  color: string;
  length?: number;        // meters
  material?: string;
  insulation?: string;
  properties: Record<string, string>;
}
```

#### `AWG_SPECS`

Constant lookup table for AWG wire gauges:

```typescript
const AWG_SPECS: Record<string, {
  diameter_mm: number;
  maxCurrent: number;     // amps
  resistance_per_m: number; // ohms/meter
}>;
// Gauges: "4 AWG" through "30 AWG"
```

---

### `Cable`

Multi-conductor cable definition.

```typescript
interface Cable {
  id: string;
  name: string;
  partNumber?: string;
  conductorCount: number;
  conductors: CableConductor[];
  shielded: boolean;
  shieldType?: string;
  jacketColor?: string;
  jacketMaterial?: string;
  outerDiameter?: number;  // mm
  properties: Record<string, string>;
}

interface CableConductor {
  id: string;
  label: string;
  color: string;
  gauge: string;
}
```

---

### `Connection`

Represents an electrical connection between two pins.

```typescript
interface Connection {
  id: string;
  sourceComponentId: string;
  sourcePinId: string;
  targetComponentId: string;
  targetPinId: string;
  wireId?: string;
  splicePoints: SplicePoint[];
}

interface SplicePoint {
  id: string;
  position: { x: number; y: number };
  label: string;
}
```

---

### `CanvasState`

Canvas viewport and grid configuration.

```typescript
interface CanvasState {
  zoom: number;
  panX: number;
  panY: number;
  gridSize: number;
  snapToGrid: boolean;
  showGrid: boolean;
}
```

#### Factory: `createDefaultCanvas(): CanvasState`

Returns `{ zoom: 1, panX: 0, panY: 0, gridSize: 20, snapToGrid: true, showGrid: true }`.

---

### `Revision`

Snapshot for version control.

```typescript
interface Revision {
  timestamp: string;
  author: string;
  description: string;
  data: string;   // JSON-serialized Harness snapshot
}
```

---

## HarnessBuilder

**Import**: `import { HarnessBuilder } from '@route-core/core'`

Imperative API for constructing and modifying harness designs.

### Constructor

```typescript
new HarnessBuilder()
```

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `createNew(name: string)` | `Harness` | Create a new empty harness |
| `addNode(harness, input)` | `Component` | Add a component to the harness; auto-generates label |
| `removeNode(harness, componentId)` | `void` | Remove a component and its connections |
| `moveNode(harness, componentId, x, y)` | `void` | Update component position |
| `rotateNode(harness, componentId, degrees)` | `void` | Set component rotation |
| `connect(harness, srcCompId, srcPinId, tgtCompId, tgtPinId)` | `Connection` | Create a connection between two pins |
| `disconnect(harness, connectionId)` | `void` | Remove a connection |
| `addSplice(harness, connectionId, position, label)` | `SplicePoint` | Add a splice point to a connection |
| `addWire(harness, wireInput)` | `Wire` | Add a wire definition |
| `removeWire(harness, wireId)` | `void` | Remove a wire |
| `addCable(harness, cableInput)` | `Cable` | Add a cable definition |
| `removeCable(harness, cableId)` | `void` | Remove a cable |
| `saveRevision(harness, description, author?)` | `void` | Save a revision snapshot |
| `restoreRevision(harness, index)` | `Harness` | Restore a previous revision |

### Auto-Labeling

Components are automatically labeled with category-specific prefixes:

| Category | Prefix | Example |
|----------|--------|---------|
| connector | J | J1, J2, J3 |
| motor | M | M1, M2 |
| relay | K | K1, K2 |
| fuse | F | F1, F2 |
| switch | SW | SW1, SW2 |
| terminal_block | TB | TB1, TB2 |
| power_supply | PS | PS1 |
| circuit_breaker | CB | CB1 |
| sensor | S | S1, S2 |
| led | LED | LED1 |
| resistor | R | R1, R2 |
| ecu | ECU | ECU1 |
| generic | U | U1, U2 |

---

## HarnessValidator

**Import**: `import { HarnessValidator } from '@route-core/core'`

Design rule checker that returns a list of validation issues.

### Constructor

```typescript
new HarnessValidator()
```

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `validate(harness)` | `ValidationIssue[]` | Run all validation checks |

### `ValidationIssue`

```typescript
interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  message: string;
  componentId?: string;
  pinId?: string;
}
```

### Validation Rules

| Rule | Severity | Trigger |
|------|----------|---------|
| Unconnected pins | `warning` | Pin.connected is false |
| Duplicate labels | `error` | Two or more components share the same label |
| Current rating exceeded | `error` | Connected wire gauge maxCurrent < pin maxCurrent |
| Overlapping nodes | `warning` | Two components at the same (x, y) position |
| Self-connections | `error` | Connection sourceComponentId === targetComponentId |

---

## WireRouter

**Import**: `import { WireRouter } from '@route-core/core'`

Manhattan (orthogonal) wire routing engine.

### Constructor

```typescript
new WireRouter()
```

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `route(harness)` | `RoutedWire[]` | Compute routed paths for all connections |

### `RoutedWire`

```typescript
interface RoutedWire {
  connectionId: string;
  path: Array<{ x: number; y: number }>;
}
```

The path consists of waypoints forming right-angle (Manhattan) routes with 20 px minimum clearance from component boundaries.

---

## BomGenerator

**Import**: `import { BomGenerator } from '@route-core/core'`

Generates bills of materials from harness designs.

### Constructor

```typescript
new BomGenerator()
```

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `generate(harness)` | `BomResult` | Generate consolidated BOM |
| `toCSV(bom)` | `string` | Format BOM as CSV |
| `toTextTable(bom)` | `string` | Format BOM as aligned text table |

### `BomResult`

```typescript
interface BomResult {
  items: BomItem[];
  totalItems: number;
  totalUniqueItems: number;
}

interface BomItem {
  partNumber: string;
  description: string;
  manufacturer: string;
  quantity: number;
  category: string;
}
```

Items are consolidated by `partNumber` — multiple instances of the same part are aggregated into a single line item with increased quantity.

---

## CableCreator

**Import**: `import { CableCreator } from '@route-core/core'`

Factory for creating cable definitions with standard color codes.

### Constructor

```typescript
new CableCreator()
```

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `create(spec)` | `Cable` | Create a cable from a specification object |
| `createPowerCable(conductorCount, gauge)` | `Cable` | Power cable with DC color sequence |
| `createSignalCable(conductorCount, gauge)` | `Cable` | Signal cable with standard color sequence |
| `createEthernetCable()` | `Cable` | Pre-configured Ethernet cable (8 conductors, 24 AWG) |

### Color Sequences

| Sequence | Colors |
|----------|--------|
| `standard` | black, red, blue, green, yellow, orange, brown, white, violet, gray |
| `iec` | brown, blue, green/yellow, black, gray, orange, red, white, violet, pink |
| `power_dc` | red, black, blue, green, yellow, white, orange, brown |
| `power_ac` | brown, blue, green/yellow, black, gray, orange |
| `ethernet` | white/orange, orange, white/green, blue, white/blue, green, white/brown, brown |

---

## ComponentCreator

**Import**: `import { ComponentCreator, COMPONENT_TEMPLATES } from '@route-core/core'`

Factory for creating components from templates or custom specifications.

### Constructor

```typescript
new ComponentCreator()
```

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `fromTemplate(templateName, overrides?)` | `Component` | Create from a built-in template |
| `createCustom(spec)` | `Component` | Create a fully custom component |
| `clone(component, newLabel?)` | `Component` | Deep clone a component with a new ID |
| `addPins(component, pins)` | `Component` | Add pins to an existing component |

### `COMPONENT_TEMPLATES`

23 built-in templates including:

`connector-2pin`, `connector-4pin`, `connector-6pin`, `connector-8pin`, `connector-12pin`, `db9`, `db25`, `m12-4pin`, `m12-8pin`, `relay-spdt`, `relay-dpdt`, `fuse-holder`, `circuit-breaker`, `motor-dc`, `motor-stepper`, `motor-servo`, `switch-spst`, `switch-dpdt`, `terminal-block-2`, `terminal-block-4`, `terminal-block-8`, `power-supply-24v`, `led-indicator`

---

## ExportManager

**Import**: `import { ExportManager } from '@route-core/core'`

Coordinates all export formats.

### Constructor

```typescript
new ExportManager()
```

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `exportSvg(harness, options?)` | `ExportResult` | Export SVG schematic |
| `exportBomCsv(harness)` | `ExportResult` | Export BOM as CSV |
| `exportBomText(harness)` | `ExportResult` | Export BOM as text table |
| `exportJson(harness)` | `ExportResult` | Export harness as JSON |
| `exportNetlist(harness)` | `ExportResult` | Export connection netlist |

### `ExportResult`

```typescript
interface ExportResult {
  content: string;
  mimeType: string;
  filename: string;
}
```

---

## SvgExporter

**Import**: `import { SvgExporter } from '@route-core/core'`

Renders harness designs as SVG strings.

### Constructor

```typescript
new SvgExporter()
```

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `export(harness, options?)` | `string` | Generate SVG markup |

### SVG Export Options

```typescript
interface SvgExportOptions {
  showGrid?: boolean;     // default: true
  showLabels?: boolean;   // default: true
  showPinNames?: boolean; // default: true
  width?: number;         // default: 1200
  height?: number;        // default: 800
}
```

The exported SVG includes:
- Embedded CSS styles for consistent rendering
- Optional grid background
- Component rectangles with labels and category names
- Pin indicators with names
- Wire paths (Manhattan routed)
- Splice point markers

---

## PartsDatabase

**Import**: `import { PartsDatabase } from '@route-core/core'`

In-memory parts catalog with CRUD operations.

### Constructor

```typescript
new PartsDatabase()
```

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `add(component)` | `void` | Add a component to the database |
| `get(id)` | `Component \| undefined` | Retrieve by ID |
| `update(id, updates)` | `boolean` | Update a component |
| `remove(id)` | `boolean` | Remove a component |
| `getAll()` | `Component[]` | List all components |
| `search(query, options?)` | `Component[]` | Fuzzy search across all fields |
| `getCategories()` | `string[]` | List unique categories |
| `getManufacturers()` | `string[]` | List unique manufacturers |
| `serialize()` | `string` | Export database to JSON |
| `deserialize(json)` | `void` | Import database from JSON |
| `clear()` | `void` | Remove all components |
| `count` | `number` | Number of components in the database |

---

## Search Utilities

**Import**: `import { fuzzyScore, searchComponents } from '@route-core/core'`

### `fuzzyScore(query: string, target: string): number`

Computes a similarity score between two strings using bigram (Dice coefficient) analysis. Returns a value between 0 (no match) and 1 (perfect match).

### `searchComponents(components: Component[], query: string): Component[]`

Searches across `name`, `partNumber`, `manufacturer`, `description`, and `tags` fields. Returns components sorted by relevance score.

---

## Utility Functions

### `generateId(): string`

Generates a unique identifier. Uses `crypto.randomUUID()` when available, falls back to timestamp-based generation.

### `createDefaultCanvas(): CanvasState`

Returns the default canvas state:

```typescript
{
  zoom: 1,
  panX: 0,
  panY: 0,
  gridSize: 20,
  snapToGrid: true,
  showGrid: true
}
```
