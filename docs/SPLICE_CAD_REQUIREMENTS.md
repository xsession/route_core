# Splice CAD Feature Requirements for Route Core

> Extracted from [splice-cad.com](https://splice-cad.com) - docs, tutorial, harness builder, connector creator, and cable creator pages.
> This document serves as the implementation blueprint for Route Core.

---

## Table of Contents

1. [Application Layout](#1-application-layout)
2. [Harness Builder](#2-harness-builder)
3. [Component System](#3-component-system)
4. [Wire System](#4-wire-system)
5. [Cable System](#5-cable-system)
6. [Connection Management](#6-connection-management)
7. [Component Creator](#7-component-creator)
8. [Cable Creator](#8-cable-creator)
9. [Export & Documentation](#9-export--documentation)
10. [Settings & Preferences](#10-settings--preferences)
11. [Bulk Operations](#11-bulk-operations)
12. [Keyboard Shortcuts](#12-keyboard-shortcuts)
13. [UI Styling & Design System](#13-ui-styling--design-system)
14. [Data Schema & File Formats](#14-data-schema--file-formats)

---

## 1. Application Layout

### 5-Panel Layout

```
+--------------------------------------------------------------------+
|                        TOP TOOLBAR                                  |
| [New] [Edit] [Open] [Save] [SaveAs] [Undo/Redo] [BulkConnect]     |
| [Share] [Labels] [Export] [BoxSelect] [FitView] [ViewMode] [Settings]|
+----------+--------------------------------------+------------------+
|          |                                      |                  |
| LEFT     |         CENTER CANVAS                | RIGHT            |
| SIDEBAR  |                                      | TOOLBAR          |
|          |    Interactive SVG Canvas             |                  |
| - BOM    |    Drag-drop components               | - Component      |
| - Summary|    Route wires                        |   Library        |
|          |    Cable blocks                       | - Wire Library   |
|          |    Wire bundle blocks                 | - Cable Library  |
|          |                                       | - PDF Pages      |
|          |                                       |                  |
+----------+--------------------------------------+------------------+
|                     BOTTOM TOOLBAR                                  |
|  Wire properties | Swap status | Context-specific details          |
+--------------------------------------------------------------------+
```

### Left Sidebar (BOM & Summary)
- Harness name and description
- Bill of Materials table with part counts
- Component summary (grouped by category)
- Wire summary (grouped by bundle)
- Cable summary

### Center Canvas
- SVG-based interactive canvas
- Grid with configurable spacing and snap
- Zoom (scroll wheel) and pan (middle click or pan tool)
- Component blocks, wire bundles, cable blocks
- Box select for multi-component operations

### Right Toolbar (Libraries)
- **Component Library**: Searchable by category/shape, filterable by pin count/voltage/series
- **Wire Library**: Wire type selection for connections
- **Cable Library**: Multi-core cable selection
- **PDF Pages**: Configure multi-page export layout

### Top Toolbar (Actions)
- New, Edit, Open, Save, Save As
- Undo/Redo with hover previews
- Bulk Connect tool
- Share via public link
- Toggle labels visibility
- Export menu (PDF, SVG, PNG, WireViz, JSON, Cut List)
- Box Select tool
- Fit to View
- View Mode toggle (Schematic ↔ Layout)
- Settings

### Bottom Toolbar (Properties)
- Shows wire properties when a wire is selected
- Shows swap status during connection management
- Context-sensitive detail panel

---

## 2. Harness Builder

### Canvas Features
- Interactive SVG rendering
- Grid overlay with configurable spacing
- Snap-to-grid for precise placement
- Zoom controls (scroll wheel)
- Pan (middle mouse / pan tool)
- Box select for multi-item selection
- Fit-to-view button

### Component Placement
- Drag from library onto canvas
- Snap to grid when enabled
- Component blocks with header, pins, and connection circles
- Auto-generated designator IDs

### Wire Routing
- Auto-route between connected pins
- Vertical jog between endpoints (calculated automatically)
- Manual waypoint adjustment by dragging wire path
- Fix waypoints to lock jog positions
- Move all wires on a block side (shift buttons)

### View Modes
- **Schematic View**: Standard wiring diagram
- **Layout View** (BETA): Physical harness layout with branch points

---

## 3. Component System

### Component Block Structure

```
+----------------------------------+
|  [Designator]  [MPN]  [Type]    |  ← Header
+----------------------------------+
|  1 ○  Signal_Name               |  ← Pin row
|  2 ○  Signal_Name               |
|  3 ○  Signal_Name               |
|  4 ○  Signal_Name               |
+----------------------------------+
```

### Designator Prefixes

| Prefix | Category           | Example |
|--------|--------------------|---------|
| `CB`   | Circuit Breakers   | CB1     |
| `F`    | Fuses              | F1      |
| `S`    | Push Buttons       | S1      |
| `SW`   | Switches           | SW1     |
| `K`    | Relays             | K1      |
| `KM`   | Contactors         | KM1     |
| `KT`   | Timers             | KT1     |
| `PS`   | Power Supplies     | PS1     |
| `M`    | Motors             | M1      |
| `FAN`  | Fans               | FAN1    |
| `PCB`  | PCBs               | PCB1    |
| `R`    | Resistors          | R1      |
| `C`    | Capacitors         | C1      |
| `D`    | Diodes             | D1      |
| `L`    | Inductors          | L1      |
| `T`    | Transformers       | T1      |
| `INV`  | Inverters          | INV1    |
| `BAT`  | Batteries          | BAT1    |
| `PV`   | Solar Cells        | PV1     |
| `SP`   | Splices            | SP1     |
| `X`    | Connectors         | X1      |

### Component Categories

| Category          | Description                       |
|-------------------|-----------------------------------|
| Circuit Breakers  | Overcurrent protection            |
| Fuses             | One-time overcurrent protection   |
| Push Buttons      | Momentary and latching controls   |
| Switches          | Manual control elements           |
| Relays            | Electromechanical switching        |
| Contactors        | Heavy-duty power switching        |
| Timers            | Time-delay control relays         |
| Power Supplies    | Voltage conversion modules        |
| Motors            | Electric motor components         |
| Fans              | Cooling and ventilation           |
| PCBs              | Printed circuit boards            |
| Resistors         | Fixed and variable resistors      |
| Capacitors        | Energy storage components         |
| Diodes            | Rectifiers and semiconductor      |
| Inductors         | Coils and chokes                  |
| Transformers      | Voltage transformers              |
| Inverters         | DC-to-AC conversion               |
| Splices           | Wire joining and connections      |
| Batteries         | Power cells and packs             |
| Solar Cells       | Photovoltaic modules              |
| Connectors        | Default connector category        |

### Component Shapes

| Shape             | Description                       |
|-------------------|-----------------------------------|
| Circular          | Round multi-pin connectors        |
| USB               | Universal Serial Bus connectors   |
| D-Sub             | D-subminiature connectors         |
| Rectangular       | Rectangular connectors            |
| Ferrule           | Wire-end sleeve terminals         |
| Quick Disconnect  | Spade and blade terminals         |
| Ring Terminal     | Ring and lug terminals            |
| Terminal Block    | Barrier strip connectors          |

### Component Operations
- Drag to move (click header to drag)
- Multi-select (box select or Ctrl+Click)
- Group move (drag any selected item)
- Group delete (Delete key)
- Copy/Paste (Ctrl+C / Ctrl+V to clone)
- Collapse/Expand to hide unused pins
- Right-click context menu

---

## 4. Wire System

### Wire Bundle Block Structure

```
+----------------------------------+
|  Bundle X1|X2    Length: 500mm   |  ← Bundle Header
+----------------------------------+
|  X1.1 | TX | 22AWG | 7/30 | BL | X2.1  ← Wire info
|  X1.2 | RX | 22AWG | 7/30 | GN | X2.2
|  X1.3 | GND| 20AWG | 7/28 | BK | X2.3
+----------------------------------+
```

### Wire Information Format
- **Format**: `From | Signal | Gauge | Stranding | Color | To`
- **Example**: `X1.1 | TX | 22 AWG | 7/30 | blue | X2.1`

### Wire Properties
- Wire gauge (AWG or mm²)
- Stranding (e.g., 7/30, 19/36)
- Color (individual wire color)
- Signal name (e.g., PWR_12V, GND, CAN_H)
- Length

### Wire Bundle Controls
- Bundle header with connected endpoints display
- Auto-route button
- Fix Waypoints button
- Minimize/Expand bundle blocks
- Compact View toggle
- Bundle visibility controls

### Wire Colors (Standard)
- VCC/+V: Red (#dc2626)
- GND: Black (#1f2937)
- SDA: Blue (#2563eb)
- SCL: Purple (#7c3aed)
- TX: Green (#059669)
- RX: Orange (#d97706)

---

## 5. Cable System

### Cable Block Structure

```
+----------------------------------+
|  C1  [Manufacturer]  [MPN]      |  ← Cable Header
|       Length: 1000mm             |
|  [Shld.] [Jacket: Black]        |  ← Shield & jacket indicators
+----------------------------------+
|  1 ●─── Core 1 (Red)            |  ← Core rows
|  2 ●─── Core 2 (Black)          |
|  3 ●─── Core 3 (Green)          |
|  4 ●─── Core 4 (White)          |
|  S ●─── Shield                   |  ← Shield connection
+----------------------------------+
```

### Cable Properties
- Cable ID (auto-numbered: C1, C2, etc.)
- Manufacturer and Part Number
- Length
- Shield indicator (yellow "Shld." badge)
- Jacket color (visual indicator)
- Core count and individual core colors
- Shield connection (separate row)

---

## 6. Connection Management

### Basic Connection Process
1. Click Wire Library button on right toolbar
2. Select a wire type from the library
3. Click the first pin to connect
4. Click the second pin to complete
5. Wire auto-routes between pins

### Move Connection
1. Click occupied pin → Connection Management dialog
2. Select wire in Move/Swap/Twist list
3. Click target pin to move wire
4. If target occupied, choose "Move Here"

### Swap Connection
1. Click occupied pin → Connection Management dialog
2. Select wire in Move/Swap/Twist list
3. Click another occupied pin
4. Select "Swap" to complete

### Bulk Connect Tool
- Select two components (or component + cable)
- Connection patterns:
  - **Straight-Through**: 1→1, 2→2, 3→3...
  - **Crossover**: 1→N, 2→N-1, 3→N-2...
  - **Custom**: Define own pin mapping
- Set wire properties for all connections
- Preview before applying

---

## 7. Component Creator

### Basic Information
| Field          | Description                    | Required |
|----------------|--------------------------------|----------|
| MPN            | Manufacturer Part Number       | Yes      |
| Manufacturer   | Component manufacturer name    | No       |
| Description    | Brief description              | No       |
| Positions      | Number of pins/contacts        | Yes      |
| Datasheet URL  | Link to documentation          | No       |
| Image URL      | Link to product image          | No       |

### Component Specifications
| Field            | Options / Description                              |
|------------------|----------------------------------------------------|
| Category         | Connector, Circuit Breaker, Fuse, Relay, etc.      |
| Contact Gender   | Male, Female, Hermaphroditic                       |
| Shape            | Circular, USB, D-Sub, Rectangular, Ferrule, etc.   |
| Rows             | Number of pin rows (1, 2, 3+)                      |
| Pitch            | Pin spacing in mm                                  |
| Series           | Manufacturer series name                           |
| Mounting         | Free Hanging, Panel, PCB, DIN Rail, etc.           |
| Fastening        | Screw, Latch, Push-Pull, Bayonet, etc.             |
| Termination      | Crimp, Solder, IDC, Spring, Wire-Wrap              |
| Color            | Housing color                                      |
| Min/Max AWG      | Wire gauge range                                   |
| Keying Code      | Keying/polarization code                           |

### Visual Template Editor
- Grid of visual templates per category
- Upload custom SVG graphics
- Tabs: Pins, Layers, Element
- Preview tabs: Mate (Front), Wire (Rear), Preview

### Auto-Populate Feature
- Click magic wand icon next to MPN field
- Auto-fetch from DigiKey: manufacturer, description, datasheet URL, image, specs

### Options
- "Make public" checkbox to share component
- Create button adds to harness

---

## 8. Cable Creator

### Basic Information
| Field          | Description                    | Required |
|----------------|--------------------------------|----------|
| Part Number    | Cable part number              | Yes      |
| Manufacturer   | Cable manufacturer             | No       |
| Description    | Cable description              | No       |
| Datasheet URL  | Link to documentation          | No       |
| Image URL      | Link to product image          | No       |

### Cable Specifications
| Field             | Options / Description                           |
|-------------------|-------------------------------------------------|
| Number of Cores   | Total conductor count                           |
| Outer Diameter    | Cable outer diameter (mm)                       |
| Voltage Rating    | Maximum voltage rating                          |
| Default Length    | Default cable length (mm)                       |
| Temperature       | Operating temperature range                     |
| Jacket Material   | PVC, TPE, PUR, Silicone, Rubber, Neoprene, LSZH |
| Jacket Color      | Outer jacket color (color picker)               |
| Flexibility       | Rigid, Flexible, Highly Flexible                |

### Shielding Configuration
| Field          | Options                                  |
|----------------|------------------------------------------|
| Shielded       | Toggle yes/no                            |
| Shield Type    | Foil, Braid, Spiral                      |

### Core Configuration

#### Bulk Edit All Cores
- Color (dropdown)
- Stripe color (dropdown)
- AWG gauge
- Stranding
- Type (Stranded, Solid)

#### Individual Core Config
| Column   | Description                     |
|----------|---------------------------------|
| #        | Core number (sequential)        |
| Name     | Core designation                |
| Color    | Individual core color           |
| Stripe   | Stripe color (optional)         |
| AWG      | Wire gauge                      |
| Stranding| Strand count/size               |
| Type     | Stranded or Solid               |

### Cable Cross-Section Preview
- Live SVG preview of cable cross-section
- Shows cores with color coding
- Shows shield layer if shielded
- Shows jacket color

### Options
- "Save as custom cable to library" checkbox
- Cable length set when added to harness

---

## 9. Export & Documentation

### Available Export Formats

| Format              | Description                                      | Extension    |
|---------------------|--------------------------------------------------|-------------|
| PDF                 | Multi-page engineering drawings with BOM          | .pdf         |
| SVG                 | Scalable vector graphics for print or web         | .svg         |
| PNG                 | High-resolution raster images                     | .png         |
| WireViz YAML        | WireViz visualization tool format                 | .yml         |
| JSON                | Machine-readable project data                     | .json        |
| Cut List (CSV)      | Wire requirements in CSV                          | .csv         |
| Cut List (XLSX)     | Wire requirements in Excel                        | .xlsx        |
| Cut List (PDF)      | Wire requirements in PDF                          | .pdf         |
| Connection Table    | Wire-by-wire connection details                   | .pdf         |
| Wire Labels         | Labels for label printers (Brady, Brother)        | .csv         |

### PDF Multi-Page Export
- Add multiple pages with custom sizes (A2, A3, A4, Letter, custom)
- Position and scale page frames over design
- Multi-page engineering drawings with:
  - Diagram pages
  - BOM page(s)
  - Connection Table
  - Cut List

### BOM Placement Options
- "BOM on separate page" toggle
- When enabled (default): BOM on dedicated pages after diagram
- When disabled: BOM overlays on each diagram page corner

### Connection Table
- Detailed wire-by-wire info grouped by bundle
- Shows from/to pins, signal labels, wire color, AWG, length
- Included in multi-page PDF exports

### Cut List
- Consolidated wire requirements with total length calculations
- Groups wires by MPN and manufacturer
- Shows length distribution (e.g., "3 x 200mm, 2 x 350mm")

---

## 10. Settings & Preferences

### Grid Settings
- Toggle grid visibility
- Adjust grid spacing
- Enable/disable snap-to-grid

### Unit Preferences
- Wire diameter units: AWG or mm²
- Length units: Imperial (inches) or Metric (mm)
- Units auto-update throughout BOM and exports

### Display Settings
- Label visibility toggle
- Pin number visibility toggle
- Wire info display mode

### Persistence
- Settings saved per user
- Apply to all projects

---

## 11. Bulk Operations

### Bulk Connect
- Select two components
- Choose pattern: Straight-Through, Crossover, Custom
- Set wire properties for all connections
- Preview before applying

### Bulk Property Editor
- Spreadsheet-like interface
- **Components Tab**: Edit instance IDs, descriptions, renumber sequentially
- **Wires Tab**: Edit color, AWG, length, toggle bundle visibility
- **Cables Tab**: Edit cable properties and lengths
- Full undo/redo support

### Collapse/Expand
- Collapse All: Hide all unused pins and cable cores
- Expand All: Show all pins and cores
- Individual collapse/expand via right-click menu

### Bundle Visibility
- Minimize Bundle / Expand Bundle
- Minimize All / Expand All from canvas context menu
- When minimized: wire paths remain visible, bundle block hidden
- Compact View toggle for condensed display

### Bundle Labels
- Add visual labels to connectors
- Label properties: text, background color, text color, width (mm)
- Wire association for label-to-bundle mapping
- Export labels as CSV for label printers (Brady, Brother)

---

## 12. Keyboard Shortcuts

| Shortcut      | Action                    |
|---------------|---------------------------|
| V             | Select tool               |
| C             | Connect tool              |
| H             | Pan tool                  |
| E             | Open Bulk Editor          |
| Ctrl+C        | Copy selected             |
| Ctrl+V        | Paste / clone             |
| Ctrl+Z        | Undo                      |
| Ctrl+Shift+Z  | Redo                      |
| Ctrl+S        | Save                      |
| Delete        | Delete selected items     |
| Escape        | Deselect / cancel         |

---

## 13. UI Styling & Design System

### Color Palette

```css
/* Background & Surface */
--bg-primary: #1e1e2e;          /* Dark background */
--bg-secondary: #2a2a3e;        /* Panel background */
--bg-canvas: #fafafa;           /* Canvas background (light) */
--surface: #ffffff;             /* Card/panel surface */

/* Borders */
--border: #e5e7eb;
--border-focus: #3b82f6;

/* Text */
--text-primary: #1f2937;
--text-secondary: #6b7280;
--text-muted: #9ca3af;

/* Accent Colors */
--primary: #3b82f6;             /* Blue - primary actions */
--primary-hover: #2563eb;
--success: #059669;             /* Green - success states */
--warning: #d97706;             /* Amber - warnings */
--danger: #dc2626;              /* Red - errors/destructive */

/* Component Block Colors */
--block-bg: #f9fafb;
--block-header: #f3f4f6;
--block-border: #d1d5db;
--block-selected: #dbeafe;
--block-selected-border: #3b82f6;

/* Wire Colors */
--wire-default: #6b7280;
--wire-power: #dc2626;
--wire-ground: #1f2937;
--wire-data: #2563eb;
--wire-signal: #059669;
```

### Typography
- **Font Family**: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif
- **Monospace**: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace
- **Base Size**: 14px
- **Header**: 18px bold
- **Labels**: 12px medium
- **Pin Numbers**: 8px monospace
- **Signal Names**: 9px

### Spacing System
- **xs**: 4px
- **sm**: 8px
- **md**: 12px
- **lg**: 16px
- **xl**: 24px
- **xxl**: 32px

### Component Block Styling
- Rounded corners: 4px
- Border: 1.5px solid
- Header area: darker background with designator + MPN + type
- Pin rows: alternating subtle background
- Connection circles: 3px radius
- Selected state: blue border (2px) + light blue fill
- Hover state: border color change

### Toolbar Styling
- Height: 40px
- Icons + text labels
- Grouped with separators
- Active state: blue background + white text
- Hover state: lighter background
- Disabled state: 50% opacity

### Modal/Dialog Styling
- Centered overlay with backdrop blur
- Rounded corners: 8px
- Shadow: lg
- Header with title and close button
- Footer with action buttons (Cancel + Primary action)

---

## 14. Data Schema & File Formats

### Harness JSON Schema

```json
{
  "id": "string",
  "name": "string",
  "description": "string",
  "version": "number",
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601",
  "author": "string",
  "nodes": [
    {
      "id": "string",
      "componentId": "string",
      "component": { /* Component snapshot */ },
      "position": { "x": "number", "y": "number" },
      "rotation": "number",
      "label": "string (designator)",
      "locked": "boolean"
    }
  ],
  "connections": [
    {
      "id": "string",
      "from": { "componentId": "string", "pinId": "string" },
      "to": { "componentId": "string", "pinId": "string" },
      "signalLabel": "string",
      "wireId": "string",
      "cableId": "string",
      "coreIndex": "number"
    }
  ],
  "cables": [
    {
      "id": "string",
      "name": "string",
      "manufacturer": "string",
      "partNumber": "string",
      "cores": [
        {
          "index": "number",
          "name": "string",
          "color": "string",
          "stripe": "string",
          "gauge": "number",
          "stranding": "string",
          "type": "stranded|solid"
        }
      ],
      "shielded": "boolean",
      "shieldType": "foil|braid|spiral",
      "jacketColor": "string",
      "jacketMaterial": "string",
      "length": "number",
      "outerDiameter": "number"
    }
  ],
  "wires": [
    {
      "id": "string",
      "gauge": "number",
      "color": "string",
      "stranding": "string",
      "material": "string",
      "insulation": "string",
      "length": "number"
    }
  ],
  "canvas": {
    "width": "number",
    "height": "number",
    "zoom": "number",
    "gridSize": "number",
    "snapToGrid": "boolean",
    "showLabels": "boolean",
    "showPinNumbers": "boolean",
    "units": "awg|mm2",
    "lengthUnits": "imperial|metric"
  }
}
```

### WireViz YAML Format

```yaml
connectors:
  X1:
    type: DB-9
    subtype: male
    pinlabels: [TX, RX, GND, DTR, DSR, RTS, CTS, RI, DCD]
  X2:
    type: DB-9
    subtype: female
    pinlabels: [TX, RX, GND, DTR, DSR, RTS, CTS, RI, DCD]

cables:
  W1:
    wirecount: 3
    gauge: 22 AWG
    colors: [BL, GN, BK]

connections:
  - [X1.1, W1.1, X2.1]
  - [X1.2, W1.2, X2.2]
  - [X1.3, W1.3, X2.3]
```

### Cut List CSV Format

```csv
MPN,Manufacturer,AWG,Color,Length,Qty,Total Length
"22AWG-BL","Generic","22","Blue","200mm",3,"600mm"
"22AWG-GN","Generic","22","Green","200mm",2,"400mm"
```

---

## Implementation Priority for Route Core

### Phase 1 - Core UI Layout (This Implementation)
1. ✅ Redesign AppShell with 5-panel layout
2. ✅ Professional top toolbar with all actions
3. ✅ Right-side library panels (Component, Wire, Cable)
4. ✅ Left-side BOM sidebar
5. ✅ Bottom property bar
6. ✅ Enhanced component blocks with designators
7. ✅ Wire bundle blocks
8. ✅ Cable blocks
9. ✅ Component Creator dialog with categories & shapes
10. ✅ Cable Creator dialog with core configuration
11. ✅ Wire Library for connections
12. ✅ Bulk Connect tool
13. ✅ Updated CSS design system

### Phase 2 - Advanced Features (Future)
- PDF multi-page export
- WireViz YAML export
- Cut List export (CSV/XLSX/PDF)
- Connection Table export
- Layout View mode
- Bundle labels with label printer export
- Bulk Property Editor (spreadsheet UI)
- Version control / revision history UI
- Share via public link
- Auto-populate from DigiKey
- Custom SVG footprint upload
