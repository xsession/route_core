# RouteCore Project Format Specification

**Document ID:** RouteCore-FFS-001
**Status:** Public, versioned interchange specification
**Revision:** 1.0
**Date:** 2026-09-11
**Application version:** 0.4.0
**Primary objective:** Define the on-disk and interchange formats that RouteCore reads and writes, so that third parties can build importers, exporters, verification tools, and archives for RouteCore harness data without relying on the application binary. This document is the public contract for the `.routecore` project file, its editor-document JSON projection, and its manufacturing output formats.

> **How to read this document.** RouteCore is offline-first: a project is a single self-contained file. Everything a project knows lives in that file. This spec describes (a) the container, (b) the canonical SQLite schema, (c) the lossless editor-document JSON projection, and (d) the derived manufacturing outputs. Field names are normative; wording such as "should" and "may" is non-normative.

## Table of contents

- [1. Scope and design goals](#1-scope-and-design-goals)
- [2. The `.routecore` container](#2-the-routecore-container)
- [3. Canonical database schema](#3-canonical-database-schema)
- [4. The editor document projection (editor JSON)](#4-the-editor-document-projection-editor-json)
- [5. The complete project interchange (project JSON)](#5-the-complete-project-interchange-project-json)
- [6. Manufacturing output formats](#6-manufacturing-output-formats)
- [7. Versioning and forward compatibility](#7-versioning-and-forward-compatibility)
- [8. Conformance requirements](#8-conformance-requirements)
- [9. Worked example](#9-worked-example)

---

## 1. Scope and design goals

RouteCore models a wiring harness as **one electrical model projected into many views** (Plan, Layout, Schematic, and generated assemblies). A single file must round-trip the entire design — components, conductors, routing, labels, parts, bill of materials, manufacturing tables, tooling, revisions, and undo history.

Design goals, in priority order:

1. **Single-file, portable.** A project is one file that opens identically on any machine with the same Node.js 22 runtime, with no network and no external dependencies.
2. **Lossless projection.** The in-memory editor document must be recoverable bit-for-bit from the file, and the file must be recoverable from a full interchange export.
3. **Forward compatible.** Newer applications must open older files and ignore unknown data; a file must carry a version that readers can use to gate behavior.
4. **Inspectable.** The formats are plain, well-known containers (SQLite + JSON) so that non-RouteCore tools can read them.

Out of scope: binary wire-protocol, multi-user real-time collaboration, and encryption (none exist in 0.4.0).

---

## 2. The `.routecore` container

A project is a **single SQLite 3 database file** with the extension `.routecore`. Legacy files use the extension `.ohcad` and the identical schema; RouteCore opens both.

- The file is an ordinary SQLite database. There is no custom header, no zip wrapper, and no additional sidecar. SQLite's own `user_version` PRAGMA carries the schema version.
- RouteCore uses the standard SQLite file format with **WAL** journaling. A live project may therefore have `-wal` and `-shm` sidecar files; these are transient and are not part of the portable file. A portable `.routecore` should be checkpointed (WAL merged) before distribution so that it is a single self-contained file.
- All text is UTF-8. All timestamps are ISO-8601 UTC strings in `YYYY-MM-DDTHH:MM:SS.sssZ` form. All monetary-adjacent length values are stored as integer micrometers (`_um` columns) or, in the JSON projection, as floating-point millimeters — see §4.

The database is opened with:

- `PRAGMA foreign_keys = ON;`
- `PRAGMA trusted_schema = OFF;`

### 2.1 Schema versioning

The integer `PRAGMA user_version` is the authoritative schema revision. As of this specification:

| user_version | Migration file | Adds |
|---|---|---|
| 1 | `database/0001_project.sql` | Initial clean-room schema |
| 2 | `database/0002_editor.sql` | Visual editor state |
| 3 | `database/0003_application.sql` | Offline-studio application state (parts, compatibility, BOM) |
| 4 | `database/0004_manufacturing.sql` | Manufacturing detail (part configurations, tools, settings) |

Migrations are **additive**: each migration only adds tables, columns, indexes, or constraints. A reader that knows only up to version *N* must treat any table or column introduced after *N* as optional.

---

## 3. Canonical database schema

This section is a normative summary of the tables and their roles. Authoritative column definitions live in the SQL migrations; the names below are the stable public surface.

### 3.1 Project identity

| Table | Purpose |
|---|---|
| `project` | One row per project: `id`, `project_uuid`, `name`, `description`, `organization`, `created_by_app_semver`, `created_at`, `modified_at`. |
| `actor` | The local author identity. |
| `project_setting` | Free-form key/value JSON settings: `key`, `value_json`. Manufacturing keys: `formboard`, `designation`, `manufacturing`. |

`project.project_uuid` is a stable identifier that survives re-saving and is the value consumers key archives on.

### 3.2 Design models and canvas pages

A **design model** is a named, versioned projection of the harness. A **canvas page** is one sheet of one model in one view.

| Table | Purpose |
|---|---|
| `design_model` | `id`, `kind` (`plan` \| `assembly` \| …), `name`, `designator`, `lifecycle_state`, `extra_json` (for assemblies: source model, origin mapping). |
| `canvas_page` | `id`, `model_id`, `view_kind` (`layout` \| `schematic` \| …), `name`, `width_um`, `height_um`, `orientation`, `is_archived`, `page_order`. |
| `editor_state` | Per-page persisted editor document JSON (the editor-document projection, §4) plus a content hash. |

The **Plan** is the single source of truth for electrical identity and connectivity. **Assemblies** are generated, independent projections that keep a stable origin mapping back to the Plan (see §5 and the assembly sync model).

### 3.3 Editor entities (logical)

The concrete editor geometry is stored as the editor-document JSON (next section) rather than as normalized rows, so that the editor can evolve its geometry independently of the schema. The normalized relational rows below capture the **engineering identity** that outlives any one document layout.

| Table | Purpose |
|---|---|
| `conductor` | A wire's engineering identity: `id`, label, signal, kind, and manufacturing fields `explicit_length_um`, `strip_allowance_um`, `service_loop_um`. |
| `cable` | A grouped bundle of conductors. |
| `signal` / `net` | Computed electrical grouping. |

### 3.4 Manufacturing and application state

| Table | Purpose |
|---|---|
| `layout_document` / `layout_sheet` / `layout_element` | The on-canvas manufacturing drawing. `layout_element.element_kind` is one of `dimension`, `note`, `title_block`, `bom_table`, `wire_schedule`, `cut_list`, `connection_table`, `continuity_table`, `revision_table`, `custom`. Table elements are **query-backed**: they store a small `query_json` descriptor and are re-populated from live project data on read. |
| `app_part_configuration` | A named accessory/defaults recipe for a component or cable, with a `designation_strategy` (`custom` \| `sequential` \| `alphabetical` \| `grid` \| `source`), grid dimensions, and a properties bag. One configuration per (model, entity) is flagged `is_default`. |
| `app_tool_fixture` | Manufacturing tooling: `tool_key`, `name`, `kind` (`tool` \| `fixture` \| `equipment` \| `consumable`), `part_number`, `quantity`, `location_note`, `properties_json`. |
| `app_bom_item` / `part_spec` / `part_compatibility` / `bom_assignment` | Bill of materials, part library, and compatibility rules. |
| `revision` / `snapshot` | Versioned checkpoints with a content hash and the command sequence that produced them. |
| `command` / `command_batch` | The undo/redo command log. |

---

## 4. The editor document projection (editor JSON)

The **editor document** is the canonical, self-describing JSON representation of one canvas page. It is what the editor loads and saves, what the `editor-json` export emits, and what the interchange embeds per page. It is stable and versioned independently of the database schema.

Top-level shape (normative field names):

```jsonc
{
  "schemaVersion": 1,          // integer; currently 1
  "id": "assembly-document-<uuid>",
  "revision": 12,               // monotonic edit counter for this document
  "settings": { /* grid, snap, default routing, theme */ },
  "components": { "<id>": ComponentNode },   // keyed by id
  "wires":      { "<id>": WireEdge },        // keyed by id
  "labels":     { "<id>": LabelNode },       // keyed by id
  "componentOrder": ["<id>", …],             // stable draw/insertion order
  "wireOrder":      ["<id>", …],
  "labelOrder":     ["<id>", …],
  "metadata": { /* arbitrary, opaque */ }
}
```

Ordering is significant: `componentOrder`, `wireOrder`, and `labelOrder` define iteration and z-ordering. The maps are the source of truth for values; the order arrays are the source of truth for sequence. A conforming writer must keep them consistent (every id in a map appears exactly once in its order array, and vice versa).

### 4.1 Entities

All entity ids are `"<prefix>-<uuid>"` strings (see §4.4). Coordinates are in the document's logical unit (millimeters); the database stores lengths in micrometers.

**ComponentNode** (a placed component instance):

```jsonc
{
  "id": "component-<uuid>",
  "definitionId": "…",            // link to a parts-library definition, if any
  "kind": "connector",            // connector | component | device | …
  "designator": "J1",
  "labels": { "title": "…", "manufacturer": "…", "partNumber": "…" },
  "position": { "x": 0, "y": 0 },
  "size": { "width": 40, "height": 24 },
  "rotation": 0,                   // orthogonal rotation (0 | 90 | 180 | 270)
  "mirrorX": false,
  "mirrorY": false,
  "ports": [ { "id": "…", "label": "1", "function": "VCC", "side": "east", "electricalClass": "power", "maximumConnections": 1 } ],
  "pinBanks": [ { "id": "…", "side": "east", "portIds": ["…"], "rowGap": 2, "edgePadding": 12 } ],
  "layout": { /* layout rules */ },
  "locked": false,
  "hidden": false,
  "zIndex": 0,
  "metadata": {}
}
```

**WireEdge** (a conductor):

```jsonc
{
  "id": "wire-<uuid>",
  "label": "W1",
  "signal": "VBAT",
  "kind": "discrete",             // discrete | cable-core | shield | drain | bundle | mate | annotation
  "source": { "kind": "port", "componentId": "…", "portId": "…" },
  "target": { "kind": "port", "componentId": "…", "portId": "…" },
  "route": { "points": [ { "x": 0, "y": 0 }, … ], "length": 152.2, "bends": 2 },
  "routing": { "pattern": "orthogonal", "clearance": 6, "grid": 1, "requestedRadius": 12, "constraints": [] },
  "style": { "width": 2, "pattern": { "kind": "solid", "color": "#123456" }, "opacity": 1 },
  "locked": false,
  "hidden": false
}
```

Endpoint kinds are `port` | `free` | `off-page` | `junction`. `port` endpoints carry `componentId` + `portId`; `off-page` carries a `reference`; `free` and `junction` carry a `point`.

**LabelNode** (a text annotation): `id`, `text`, `secondaryText`, `mode`, `orientation`, `position`, `style`, `priority`, and layout-avoidance flags.

### 4.2 Routing

`routing.pattern` is one of `direct | orthogonal | horizontal-first | vertical-first | dogleg-horizontal | dogleg-vertical | trunk-horizontal | trunk-vertical | manual`. `route.points` is the resolved polyline; `route.length` and `route.bends` are the derived metrics the manufacturing tables and formboard consume.

### 4.3 Settings

`settings` carries page-level editor configuration: `grid.visible`, `grid.snap`, `defaultRouting.pattern`, theme, and content padding. These are presentation and solver defaults, not engineering identity.

### 4.4 Identifiers

Every id is `"prefix-<uuid>"` where `prefix` is a short lowercase tag (`component`, `wire`, `label`, `port`, `bank`, `drawing`, `snapshot`, `revision`, `command`, `assembly`, `page-layout`, …) and the suffix is a v4 UUID. Prefixes are for human readability; **parsers must not rely on the prefix** — the tag is informational. Uniqueness is guaranteed by the UUID.

---

## 5. The complete project interchange (project JSON)

The **project interchange** is the lossless whole-project export (format id `project-json`, file `*.routecore.json`). It is the recommended interchange for archival, migration, and tooling. It is self-describing: the first field is a schema tag.

```jsonc
{
  "schema": "routecore-project-interchange/1",
  "exportedAt": "2026-09-11T07:00:00.000Z",
  "meta": { "project_uuid": "…", "name": "…", "description": "…", "organization": "…", "status": "active", "defaultLengthUnit": "mm" },
  "modelsAndPages": [ /* design models and their canvas pages */ ],
  "documents": [
    { "modelId": "…", "viewKind": "layout", "pageId": "…", "document": { /* §4 editor document */ } }
  ],
  "bom": [ { "id": "…", "entityKind": "…", "entityId": "…", "partNumber": "…", "description": "…", "quantity": 1, "unit": "ea" } ],
  "partConfigurations": [ { /* §3.4 app_part_configuration rows, camelCase */ } ],
  "toolFixtures": [ { /* §3.4 app_tool_fixture rows, camelCase */ } ],
  "formboard": { "config": { "rows": 1, "columns": 1, "panelWidthMm": 1000, "panelHeightMm": 1500, "bendRadiusMm": 12, "setLengthStepMm": 10, "tolerancePpm": 50000 } },
  "projectSettings": [
    { "key": "formboard", "value": { /* … */ } },
    { "key": "designation", "value": null },
    { "key": "manufacturing", "value": null }
  ],
  "revisions": [ /* revision summaries */ ],
  "commandLog": [ /* up to 250 recent commands for undo history */ ]
}
```

Conformance rules:

- `schema` is required and is the first member. Readers that do not recognize the major version (the integer after `/`) **must not** assume compatibility and should report an explicit error.
- `documents` must contain one entry per canvas page, each carrying the full §4 editor document for that page. This is what makes the interchange lossless for the editable geometry.
- All database-derived collections use **camelCase** field names in JSON, matching the SQLite rows with underscores removed.
- `projectSettings` is a list of `{ key, value }` pairs so that adding new setting keys does not break readers.

### 5.1 Assembly and origin mapping

An assembly model's `extra_json` (and the `assembly_origin_mapping` table) record, for each generated component/conductor, the corresponding **Plan** entity id and the content hash at the time of generation/sync. This is what lets RouteCore review and apply "changes from the Plan" without losing assembly-local edits. A conforming importer of an assembly must preserve `origin_model_id` and the per-entity `assembly_entity_id` ↔ `origin_entity_id` mapping.

---

## 6. Manufacturing output formats

These are **derived** outputs computed from the project. They are not the source of truth and are regenerated on demand. Each JSON output is self-describing via a `schema` tag.

### 6.1 Digital formboard — `routecore-formboard/1`

A to-scale, per-wire fabrication view. Top level:

```jsonc
{
  "schema": "routecore-formboard/1",
  "modelId": "…",
  "config": { /* formboard config, same as §5 */ },
  "panel": { "rows": 1, "columns": 1, "widthMm": 1000, "heightMm": 1500 },
  "totals": { "wireCount": 6, "routedLengthMm": 1331.2, "setLengthMm": 1400, "bendCount": 12, "toScale": 5 },
  "wires": [
    {
      "wireId": "…", "label": "W1", "signal": "VBAT",
      "from": "J1.1", "to": "J2.1",
      "routedLengthMm": 152.2,   // measured from the routed polyline
      "setLengthMm": 160,         // rounded up to the setLengthStepMm
      "bendCount": 2,
      "minimumBendRadiusMm": 12,
      "points": [ { "x": 0, "y": 0 }, … ],   // panel-local route
      "status": "to-scale"          // to-scale | not-to-scale | unrouted
    }
  ]
}
```

`setLengthMm = ceil(routedLengthMm / setLengthStepMm) * setLengthStepMm`. A wire is `to-scale` when the relative delta between set and routed length is within `tolerancePpm`; `unrouted` when there is no routed length.

### 6.2 Netlist — `routecore-netlist/1`

The computed connectivity (nets and their member endpoints), for verification tooling.

### 6.3 CSV outputs

Plain RFC-4180 CSV (UTF-8). Normative headers:

- **Cut list** (`cut-list-csv`): `# , Wire, Label, Signal, Kind, From, To, Length mm, Cut/set length mm, Bends, Formboard state` — per conductor, with the set length from §6.1.
- **BOM** (`bom-csv`): part, description, quantity, unit.
- **Pinout** (`pinout-csv`): per component pin.
- **Continuity** (`continuity-csv`): test number, signal, point A, point B, expected, result.
- **Connection table** (`connection-table-csv`): component, pin, function, destination, wire.
- **Tools** (`tools-csv`): name, kind, part number, quantity, location.

CSV cells containing commas are double-quoted. Numeric lengths are in millimeters with up to two decimals.

### 6.4 SVG

The `svg` export is a vector drawing of the active page, **with the query-backed manufacturing tables embedded** as rendered table elements. It is intended for documentation, not for re-import.

---

## 7. Versioning and forward compatibility

Three independent version axes coexist:

| Axis | Where | Meaning |
|---|---|---|
| Database schema | `PRAGMA user_version` | Which migrations are applied. |
| Editor document | `EditorDocument.schemaVersion` | Geometry/interaction revision. |
| Interchange/output | leading `schema` string, `routecore-<name>/<major>` | Public interchange revision. |

Rules:

1. **Readers gate on major version.** `routecore-<name>/1` and `…/2` are different contracts. A reader must fail loudly on an unrecognized major and must not silently mis-interpret the data.
2. **Additive within a major.** Adding optional fields, new table rows, or new setting keys is a minor, non-breaking change. Readers must ignore fields they do not understand.
3. **Unknown data is preserved on re-save.** When RouteCore opens an interchange and re-exports it, it must not drop `metadata`, unknown `projectSettings` entries, or unknown element kinds.
4. **The database is the source of truth for identity; the editor document is the source of truth for geometry.** A reader that can only do one should prefer the database for engineering identity and the editor document for layout.

---

## 8. Conformance requirements

A conforming **writer** must:

- emit a single `.routecore` SQLite file with a correct `user_version` and all migrations applied;
- keep editor-document maps and their `*Order` arrays consistent;
- tag every interchange/output with the correct leading `schema`;
- use camelCase for all JSON fields derived from the database;
- checkpoint the WAL before declaring a file portable.

A conforming **reader** must:

- read `user_version`, `EditorDocument.schemaVersion`, and interchange `schema` before interpreting any data;
- fail explicitly (no silent mis-parse) on an unrecognized major version;
- ignore unknown fields, columns, and tables;
- resolve assembly entities through their origin mapping;
- not depend on id prefixes, on id ordering within maps, or on file size or row order.

---

## 9. Worked example

A minimal two-connector harness, as it appears in the project interchange:

```jsonc
{
  "schema": "routecore-project-interchange/1",
  "exportedAt": "2026-09-11T07:00:00.000Z",
  "meta": { "project_uuid": "project-11111111-2222-4333-8444-555555555555", "name": "Demo", "organization": "", "status": "active", "defaultLengthUnit": "mm" },
  "modelsAndPages": [
    { "modelId": "plan-11111111-2222-4333-8444-555555555555", "kind": "plan", "pages": [
      { "pageId": "page-layout-aaaa", "viewKind": "layout" },
      { "pageId": "page-schematic-bbbb", "viewKind": "schematic" }
    ] }
  ],
  "documents": [
    {
      "modelId": "plan-11111111-2222-4333-8444-555555555555",
      "viewKind": "layout",
      "pageId": "page-layout-aaaa",
      "document": {
        "schemaVersion": 1,
        "id": "assembly-document-cccc",
        "revision": 1,
        "settings": { "grid": { "visible": true, "snap": true }, "defaultRouting": { "pattern": "orthogonal" } },
        "components": {
          "component-d1": { "id": "component-d1", "kind": "connector", "designator": "J1", "labels": { "title": "Power" }, "position": { "x": 0, "y": 0 }, "rotation": 0, "mirrorX": false, "mirrorY": false, "ports": [ { "id": "port-d1-1", "label": "1", "function": "VCC", "side": "east" } ], "pinBanks": [ { "id": "bank-d1", "side": "east", "portIds": ["port-d1-1"] } ], "layout": {}, "locked": false, "hidden": false, "zIndex": 0 }
        },
        "wires": {
          "wire-e1": { "id": "wire-e1", "label": "W1", "signal": "VBAT", "kind": "discrete",
            "source": { "kind": "port", "componentId": "component-d1", "portId": "port-d1-1" },
            "target": { "kind": "port", "componentId": "component-d2", "portId": "port-d2-1" },
            "route": { "points": [ { "x": 0, "y": 0 }, { "x": 152.2, "y": 0 } ], "length": 152.2, "bends": 0 },
            "routing": { "pattern": "orthogonal", "requestedRadius": 12 },
            "style": { "width": 2, "pattern": { "kind": "solid", "color": "#123456" } },
            "locked": false, "hidden": false }
        },
        "labels": {},
        "componentOrder": ["component-d1", "component-d2"],
        "wireOrder": ["wire-e1"],
        "labelOrder": []
      }
    }
  ],
  "bom": [ { "id": "bom-1", "entityKind": "component", "entityId": "component-d1", "partNumber": "CONN-01", "description": "2-pin power", "quantity": 2, "unit": "ea" } ],
  "partConfigurations": [],
  "toolFixtures": [ { "id": "tool-1", "toolKey": "crimp", "name": "Crimp tool", "kind": "tool", "partNumber": "", "quantity": 1, "locationNote": "Kit A" } ],
  "formboard": { "config": { "rows": 1, "columns": 1, "panelWidthMm": 1000, "panelHeightMm": 1500, "bendRadiusMm": 12, "setLengthStepMm": 10, "tolerancePpm": 50000 } },
  "projectSettings": [ { "key": "formboard", "value": { "rows": 1, "columns": 1 } }, { "key": "designation", "value": null }, { "key": "manufacturing", "value": null } ],
  "revisions": [],
  "commandLog": []
}
```

A reader consuming this must: read `schema` and gate on major `1`; iterate `componentOrder` (not the object keys) to establish draw order; resolve `wire-e1` endpoints through `components` to obtain designators `J1`/`J2`; and, for the cut list, compute `setLengthMm = ceil(152.2 / 10) * 10 = 160`.

---

*This specification is maintained in `docs/FILE_FORMAT_SPECIFICATION.md` and is versioned with the application. When a change would break a rule in §7 or §8, the interchange major version in §5/§6 is incremented and this document is revised.*
