# Route Core — Cable Harness Designer

A full-stack cable harness design and management platform. Design cable assemblies, manage a parts library, create custom components and cables, generate BOMs, and export schematics.

## Architecture

```
packages/
├── core/       # Data models, business logic, export engine (TypeScript)
├── server/     # REST API with SQLite persistence (Express)
└── web/        # Interactive design UI (React + Vite)
```

## Modules

| Module | Description |
|--------|-------------|
| **Harness Builder** | Drag-and-drop canvas for placing components and routing wires with SVG rendering |
| **Parts Library** | Searchable database of connectors, terminals, relays, motors, and more |
| **Component Creator** | Create custom components from templates or fully custom pin layouts |
| **Cable Creator** | Define multi-conductor cables with conductor specs, shielding, and jacket properties |
| **BOM Generator** | Automatic bill of materials with CSV export |
| **Export Engine** | SVG schematic export, JSON save/load, netlist generation |
| **Validator** | Design rule checking for unconnected pins, current ratings, duplicate labels |
| **Wire Router** | Smart Manhattan routing for wire paths between component pins |
| **Version Control** | Built-in revision snapshots with rollback support |

## Quick Start

```bash
# Install dependencies
npm install

# Start the API server (port 3001)
npm run dev:server

# Start the frontend dev server (port 5173)
npm run dev
```

Open http://localhost:5173 in your browser.

## Tech Stack

- **Core**: TypeScript (ES2022, strict mode)
- **Frontend**: React 18, Zustand (state), Vite
- **Backend**: Express, better-sqlite3
- **Canvas**: SVG-based rendering with interactive pan/zoom

## Seed Data

The parts library ships with pre-loaded components:
- JST PH/XH connectors
- Molex Micro-Fit 3.0
- DB9 D-Sub connectors
- M12 industrial circular connectors
- Phoenix Contact terminal blocks
- Relays, fuses, circuit breakers
- DIN rail power supplies
- Motors and switches

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/harnesses` | List all harness designs |
| POST | `/api/harnesses` | Create new harness |
| GET | `/api/harnesses/:id` | Get harness by ID |
| PUT | `/api/harnesses/:id` | Update harness |
| DELETE | `/api/harnesses/:id` | Delete harness |
| GET | `/api/parts?q=&category=` | Search parts library |
| POST | `/api/parts` | Add custom component |
| GET | `/api/cables` | List cables |
| POST | `/api/cables` | Create cable |
| POST | `/api/export/validate` | Validate harness design |
| POST | `/api/export/bom` | Generate BOM |
| POST | `/api/export/svg` | Export SVG schematic |
| POST | `/api/export/netlist` | Export netlist |

## License

See [LICENSE](./LICENSE)
