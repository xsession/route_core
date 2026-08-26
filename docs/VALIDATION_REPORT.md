# RouteCore Offline Studio 0.4.0 — Validation Report

Validation date: 2026-08-26  
Runtime used: Node.js 22.16.0  
Editor-core package: `@routecore/harness-editor-core` 0.3.0  
Primary project extension: `.routecore`

## Result summary

| Validation gate | Result |
|---|---:|
| RouteCore identity and package namespace | Passed |
| Canonical `.routecore` project creation | Passed |
| Legacy `.ohcad` project opening without conversion | Passed |
| RouteCore SVG/export namespaces | Passed |
| RouteCore SQLite `application_id` | Passed |
| Strict TypeScript editor-core build | Passed |
| Strict TypeScript application frontend build | Passed |
| Server and packaging-script syntax checks | Passed |
| Integrated application/API/database/security/migration tests | **8 passed, 0 failed** |
| Editor-engine tests | **63 passed, 0 failed** |
| Total automated tests | **71 passed, 0 failed** |
| Mixed-side component geometry regression | Passed |
| Dark-theme label contrast regression | Passed |
| Database command-history checkout | Passed |
| HTTP command-history checkout | Passed |
| Runtime remote dependency findings | **0** |
| External runtime packages required by packaged app | **0** |
| SQLite project integrity and foreign-key checks | Passed |
| Project save/load round trip | Passed |
| Revision create/list/restore | Passed |
| BOM persistence | Passed |
| Assembly generation | Passed |
| Export formats exercised | **8 of 8** |
| Static path-traversal rejection | Passed |
| Loopback-only bind enforcement | Passed |
| Deterministic editor sample rendering | Passed |
| Release archive CRC verification | Passed during final packaging |
| Fresh npm-package install and ESM import | Passed during final packaging |

## RouteCore rename and compatibility coverage

The branding/migration suite verifies that:

- the product identity is `RouteCore` and the application title is `RouteCore Offline Studio`;
- the root package is `routecore-offline-studio`;
- the reusable editor package is `@routecore/harness-editor-core`;
- new paths receive the `.routecore` extension;
- `.routecore` and legacy `.ohcad` paths are both recognized;
- opening a legacy `.ohcad` project does not rename, copy, or convert it;
- new project-interchange exports use `routecore-project-interchange/1`;
- new connectivity exports use `routecore-netlist/1`;
- new SVG output uses `data-routecore-schema="1"` and `routecore-*` layer identifiers;
- the SQLite application marker is `1381253970` (`0x52544352`, `RTCR`);
- the active browser shell shows RouteCore branding and does not show the former working display name;
- `ROUTECORE_HOME` is the canonical application-home override;
- the legacy home variable and legacy browser settings remain migration-only fallbacks.

Legacy-name occurrences retained in the source tree are restricted to compatibility code, migration documentation, and regression tests. They are not active product branding.

## Editor regression coverage retained in 0.4.0

### Mixed-side pin geometry

A component is generated with pin labels and long functions distributed across north, south, east, and west sides. The tests compare generated label/function bounds and verify that their interiors do not overlap. North-side text is also checked against the title/header bounds.

The geometry engine now provides:

- a dedicated north pin band above the title strip;
- a dedicated south pin band below the normal body rows;
- independent east and west text columns;
- content-measured component growth;
- deterministic placement for multiple banks on one side;
- correct rebuilding when a pin is reassigned to another side.

Reference output: `examples/mixed-side-pin-layout-0.4.0.png`.

### Label contrast

The SVG regression renders a label with no explicit foreground in the dark editor theme. It verifies a light default label card and a derived dark foreground. Explicit user-selected foreground colors remain unchanged.

### Command-history checkout

The persistence suite saves multiple distinct editor states, restores an earlier command snapshot, and verifies that:

- the requested recovery snapshot exists;
- model, page, view, and editor document return to the selected state;
- checkout creates a new non-destructive history entry;
- newer history is retained;
- snapshot availability is reported through the command log.

The loopback HTTP suite repeats the same operation through the public local API.

## Existing integrated coverage

The application suite also validates secure loopback startup, content-security headers, static-path protection, bootstrap/settings behavior, local project persistence, normalized projections, revisions, BOM data, generated assemblies, database integrity, all eight exports, and absence of external runtime assets.

The editor-core suite covers dynamic components, pin-bank collapse, rotation, explicit port placement, connected-port mutation policies, preview transactions, direct manipulation, connection validation, undo/redo, automatic labels, routing patterns, obstacle avoidance, fan-out, bend radii, crossings, deterministic serialization, SVG semantic layers, wire appearances, snapping, hit testing, CAD marquee semantics, viewport transforms, and spatial indexing.

## Offline-runtime verification

The build scans all runtime HTML, CSS, JavaScript, and server modules for external HTTP references. Only the SVG namespace and loopback address forms are permitted. The final scan reported zero remote runtime dependencies.

The packaged application requires Node.js but no `npm install` operation and no third-party runtime package. Application data, reusable local libraries, history, revisions, and project content remain local unless the operator explicitly exports or copies them.

## Browser-test note

The earlier application baseline was smoke-tested in a fresh Chromium target. During this maintenance run, the available Chromium installation was governed by a machine `URLBlocklist: ["*"]`, which blocks loopback navigation with `ERR_BLOCKED_BY_ADMINISTRATOR`. The RouteCore frontend was therefore qualified through strict compilation, static runtime inspection, loopback HTTP integration tests, and deterministic SVG rendering rather than by claiming a browser session that the environment did not permit.

## Qualification boundary

These results validate the supplied clean-room reference release and its implemented behavior. They do not constitute regulatory, automotive, aerospace, medical, functional-safety, cybersecurity-certification, or manufacturing-process certification.
