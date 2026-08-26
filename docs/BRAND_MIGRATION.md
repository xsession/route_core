# RouteCore Brand and Compatibility Migration

## Purpose

This document defines the rename from the former working name to **RouteCore** and the compatibility rules that prevent the rename from breaking existing offline projects, local libraries, user preferences, integrations, or automation.

## Identity mapping

| Previous working identifier | RouteCore identifier | Compatibility behavior |
|---|---|---|
| Application display name | `RouteCore Offline Studio` | Old display name is not shown in the active UI. |
| Root npm package | `routecore-offline-studio` | New release archives and scripts use the new name. |
| Editor-core package | `@routecore/harness-editor-core` | Source imports and documentation use the new namespace. |
| Project extension `.ohcad` | `.routecore` | `.ohcad` remains a supported legacy input extension. |
| `OHCAD_HOME` | `ROUTECORE_HOME` | Legacy variable remains a lower-priority fallback. |
| Legacy application home | `~/.routecore` | Existing home is reused when the new home has not yet been created. |
| Browser keys `ohcad.*` | `routecore.*` | Values migrate lazily on first access. |
| SVG `ohcad-*` identifiers | `routecore-*` identifiers | New renders use only RouteCore identifiers. |
| `data-ohcad-schema` | `data-routecore-schema` | New SVG exports use the RouteCore data attribute. |
| Old JSON schema identifiers | `routecore-project-interchange/1` and `routecore-netlist/1` | New exports use RouteCore identifiers. |

## Project-file behavior

A RouteCore project remains a single SQLite file. The extension is an operator-facing convention; project validity is determined by the required schema and migration tables.

New project creation appends `.routecore` when no supported extension is supplied. Opening a path ending in `.routecore` or `.ohcad` preserves the exact path. RouteCore does not silently copy, rename, or fork a legacy file.

The database constructor sets:

```sql
PRAGMA application_id = 1381253970; -- ASCII-derived RouteCore marker: RTCR
PRAGMA user_version = 3;
```

Engineering identities are not regenerated during the rename. Existing project UUIDs, model IDs, page IDs, component IDs, pin IDs, wire IDs, command history, recovery snapshots, revisions, BOM assignments, and assembly mappings remain unchanged.

## Local settings and libraries

The canonical application home is:

```text
~/.routecore
```

Portable launchers set `ROUTECORE_HOME` to the release-local `data` directory. Direct launches choose the home in this order:

1. `ROUTECORE_HOME`;
2. legacy `OHCAD_HOME`;
3. `~/.routecore`;
4. the legacy default home only when it already exists and `~/.routecore` does not.

This order lets an existing installation keep its reusable component library, cable library, recent-project list, and application preferences without cloud access or a separate migration utility.

## TypeScript integration

Use the new package namespace:

```ts
import {
  HarnessEditorEngine,
  createEmptyDocument,
  renderEditorSvg,
} from '@routecore/harness-editor-core';
```

The editor-document schema version remains `1`; the package rename does not change serialized component, port, wire, label, route, or viewport structures.

## SVG and host styling

New SVG output uses:

```text
data-routecore-schema="1"
routecore-grid-layer
routecore-wire-layer
routecore-component-layer
routecore-label-layer
routecore-interaction-layer
routecore-handle-layer
```

Host applications that styled the former internal SVG class names must update their selectors. Semantic `data-component-id`, `data-wire-id`, `data-label-id`, `data-route-handle`, roles, titles, and ARIA labels are unchanged.

## Release verification requirements

A RouteCore release shall fail validation when any of the following are true:

- the active application UI contains the former display name;
- the root or editor-core package exposes the former package namespace;
- a newly created project defaults to the legacy extension;
- a legacy `.ohcad` project cannot be opened;
- an SVG export lacks `data-routecore-schema="1"`;
- project or netlist JSON uses a non-RouteCore schema identifier;
- the portable launchers fail to use `ROUTECORE_HOME`;
- generated release filenames retain the former working name.
