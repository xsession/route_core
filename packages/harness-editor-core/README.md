# `@routecore/harness-editor-core`

A framework-neutral, dependency-free TypeScript engine for offline wiring-harness and node/edge CAD editors.

The package handles the parts that normally make visual engineering editors difficult:

- dynamic components whose body size follows titles, pin labels, pin functions, banks, hidden rows, rotation, mirroring, and manual-size policies;
- stable port identifiers and explicit policies for edits that remove connected ports;
- orthogonal routing with lead-ins, keep-outs, manual waypoints, corridor constraints, route stability, crossing costs, bend-radius clamping, and fan-out lanes;
- engineering wire paint patterns such as solid, stripe, tracer, dual-color, shield, and arbitrary stroke stacks;
- automatic, owner-relative, and world-pinned labels with candidate scoring, collision avoidance, leaders, and stable reflow;
- direct-manipulation interaction with preview transactions, smart alignment guides, window/crossing selection, route-segment editing, port-to-port connection previews, keyboard commands, and undo/redo;
- deterministic SVG output for the browser, export pipelines, testing, and print conversion;
- pure scene derivation and validation for workers, CLI tools, test runners, and headless document generation.

The core does not require React, Vue, Svelte, a canvas library, a database, a network connection, telemetry, web fonts, or a cloud account.

## Install

From the included package directory:

```bash
npm install
npm run build
npm test
```

Use the package from another workspace through a file dependency:

```json
{
  "dependencies": {
    "@routecore/harness-editor-core": "file:../harness-editor-core"
  }
}
```

## Minimal stateful editor

```ts
import {
  ComponentBuilder,
  EditorInteractionController,
  HarnessEditorEngine,
  createEmptyDocument,
  renderEditorSvg,
} from '@routecore/harness-editor-core';

const editorDocument = createEmptyDocument('project-1');

const connector = new ComponentBuilder('X1', 'X1')
  .at(80, 120)
  .withLabels({ title: 'X1', subtitle: 'CAN / POWER' })
  .addBank({
    id: 'X1:east',
    side: 'east',
    flow: 'forward',
    rowGap: 2,
    edgePadding: 12,
    collapseEmpty: false,
  })
  .addPort({
    id: 'X1:1',
    label: '1',
    function: 'CAN_H',
    side: 'east',
    bankId: 'X1:east',
    electricalClass: 'bidirectional',
  })
  .build();

editorDocument.components[connector.id] = connector;
editorDocument.componentOrder.push(connector.id);

const engine = new HarnessEditorEngine(editorDocument);

const svg = renderEditorSvg(engine.document, {
  geometries: engine.geometries,
  labelPlacements: [...engine.labelPlacements],
  selection: engine.selection,
});

window.document.querySelector('#canvas')!.innerHTML = svg;

const interaction = new EditorInteractionController(engine, {
  zoom: () => 1,
});
```

A complete browser host is provided in [`examples/browser`](./examples/browser/README.md).

Generated reference outputs are included in `examples/sample-output.svg`, `examples/sample-output.html`, and `examples/sample-output.png`. Regenerate the SVG/HTML deterministically with:

```bash
npm run render:sample
```

## Pure/headless pipeline

Use `deriveEditorScene` when a host does not need the stateful command engine:

```ts
import {
  createSampleDocument,
  deriveEditorScene,
  renderEditorSvg,
} from '@routecore/harness-editor-core';

const scene = deriveEditorScene(createSampleDocument(), {
  autoRoute: true,
  validate: true,
});

const svg = renderEditorSvg(scene.document, {
  geometries: scene.componentGeometries,
  labelPlacements: scene.labelPlacementList,
  options: { viewport: scene.contentBounds },
});
```

The source document is not mutated. The returned scene owns a detached document snapshot containing the derived wire routes.

## Architecture

```text
EditorDocument
    │
    ├─ buildComponentGeometry() ──> component bodies, rows, ports, hit areas
    │
    ├─ routeWire() ───────────────> orthogonal paths, segments, safe radii
    │
    ├─ placeLabels() ─────────────> positions, bounds, leaders, collisions
    │
    ├─ validateDocument() ────────> engineering and presentation issues
    │
    └─ renderEditorSvg() ─────────> deterministic visual output

HarnessEditorEngine
    ├─ snapshot command history
    ├─ preview/commit/cancel gesture transactions
    ├─ connection and component-mutation policy
    ├─ derived-state recomputation
    └─ typed events

EditorInteractionController
    ├─ hit testing and selection
    ├─ component/label/route dragging
    ├─ smart snapping and visual guides
    ├─ connection preview and validation
    ├─ pan requests and cursor requests
    └─ keyboard command mapping
```

## Dynamic component construction

A component separates semantic data from derived geometry:

- `ComponentNode` stores designator, labels, position, rotation, ports, banks, style, and layout rules.
- `PortSpec` stores a stable ID, visible label, function, side, ordering, electrical class, and connection policy.
- `PinBankSpec` controls row flow, spacing, empty-row collapse, and label columns.
- `buildComponentGeometry` measures content and returns body bounds, header/footer bounds, pin rows, port centers, normals, tangents, and hit areas.

Rotation and mirroring are transforms of the complete component coordinate frame. Port centers, outward normals, row bounds, hit bounds, title positions, and routing attachment directions transform together.

Collapsed pin banks intentionally omit unconnected rows. Ports that belong to a collapsed bank are never reintroduced by the fallback unbanked-port layout pass.

## Connected-port edit policies

Changing a component definition can remove a port that already owns one or more wire endpoints. The engine requires an explicit policy:

- `prevent`: reject the edit and preserve the model;
- `detach`: convert each affected endpoint to a free endpoint at the last resolved world position;
- `remap-by-label`: reconnect to a replacement port carrying the same visible label, otherwise detach.

Port IDs are the authoritative references. Visible labels may change without breaking connectivity.

## Routing

`routeWire` supports:

- direct and orthogonal patterns;
- horizontal-first and vertical-first elbows;
- horizontal and vertical doglegs;
- horizontal and vertical trunk patterns;
- manual waypoint routes;
- endpoint lead-ins based on port normals;
- hard/strong/soft route constraints;
- component, keep-out, label, and group obstacles;
- A* search on a sparse orthogonal visibility grid;
- penalties for bends, crossings, proximity, reverse motion, and route instability;
- deterministic fallback routes when the search budget is exhausted;
- route diagnostics and obstacle-violation IDs;
- safe rounded corners that cannot consume more than half of either adjacent segment;
- pin-bank fan-out lane generation;
- wire crossing detection and z-order bridge ownership.

`moveOrthogonalSegment` converts a dragged segment into a stable manual route. `createWaypointConstraint` creates serializable hard or soft control points.

## Wire paint and color semantics

Engineering color is not replaced by hover, selection, or validation state. `resolveWirePaint` returns independent stroke layers:

1. optional selection/hover halo;
2. optional warning/error stroke;
3. optional contrast outline;
4. engineering insulation layers.

Supported semantic patterns:

- `solid`;
- `stripe`;
- `tracer`;
- `dual`;
- `shield`;
- `custom` ordered stroke layers.

This allows the same model to render in SVG, Canvas2D, WebGL, PDF, or a native host without losing wire identification.

## Labels

Labels use an explicit anchor and placement mode:

- `auto`: select and score candidates around the owner;
- `owner-relative`: preserve an offset from the resolved owner anchor;
- `world-pinned`: preserve an absolute world position.

Candidate scoring includes component overlap, fixed obstacle overlap, other labels, wires, world bounds, intrinsic candidate preference, and distance from the previous placement. Previous placement bias prevents labels from jumping between equally valid sides after a small edit.

Dragging a label calls `pinLabelToWorld`. Resetting it calls `resetLabelToAutomatic`.

## Direct manipulation

`EditorInteractionController` is a host-independent pointer state machine. It emits host requests rather than accessing the DOM:

- `stateChanged`;
- `marqueeChanged`;
- `connectionPreview`;
- `snapGuidesChanged`;
- `panRequested`;
- `cursorRequested`;
- `contextMenuRequested`.

Component, label, and route drags use `HarnessEditorEngine.beginPreview`, `updatePreview`, and `commitPreview`. The document is recalculated during movement, but only one command enters history at pointer release. Pointer cancellation restores the exact pre-gesture snapshot.

Default modifier behavior:

- Shift while moving components: axis lock;
- Alt while moving components: bypass grid and smart snapping;
- Shift while moving labels: grid snap;
- Ctrl/Cmd/Shift click: additive selection;
- Alt marquee: subtractive selection;
- R: rotate selected components;
- Delete/Backspace: remove selected entities;
- Ctrl/Cmd+Z: undo;
- Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y: redo;
- Escape: cancel active gesture, otherwise clear selection.

## Selection and hit testing

`hitTestDocument` uses world-space geometry but converts pixel tolerance by zoom. Priority is deterministic:

1. explicit edit handles;
2. ports;
3. route waypoints;
4. route segments;
5. labels;
6. component header/body;
7. broad wire strokes.

`marqueeSelect` implements common CAD direction rules:

- drag left-to-right: window selection, complete containment required;
- drag right-to-left: crossing selection, intersection accepted.

## Smart snapping

`snapComponentDrag` returns an absolute gesture delta, correction, and visual guides. It can align:

- port centerlines;
- component centers;
- left/right/top/bottom edges;
- grid coordinates.

Candidates are prioritized and evaluated in screen-space tolerance, so snapping feels consistent at every zoom level. Because the result is relative to the gesture start, repeated preview frames do not accumulate rounding error.

## Rendering

`renderEditorSvg` produces deterministic, accessible SVG with separate layers for:

- background and grid;
- wires and wire-color strokes;
- crossing bridges;
- components, rows, pin dots, labels, and functions;
- annotation labels and leaders;
- selection and route handles;
- snap guides, marquee, and connection previews.

The renderer accepts a view box, theme, render flags, selection, and transient interaction overlay. All engineering geometry stays in world units. Visual strokes use `vector-effect="non-scaling-stroke"` where appropriate.

## Viewport helpers

The package includes reversible world/screen transforms, focal-point zoom, pan, zoom-to-fit, visible-world-rectangle calculation, and a small `ViewportController`.

## Validation

`validateDocument` detects, among other conditions:

- stale ordering references;
- duplicate port IDs;
- pin banks referencing absent ports;
- missing wire endpoint ports;
- port connection-limit violations;
- unrouted, fallback, or invalid routes;
- diagonal segments in orthogonal routes;
- segments shorter than the configured minimum;
- bend radii exceeding adjacent-segment limits;
- missing label owners;
- invalid label anchors;
- label collisions.

Validation issues carry stable IDs, severity, code, affected entity IDs, and optional suggested action.

## Serialization and offline operation

The editor document is JSON-compatible. `serializeDocument` sorts object keys for reproducible files and diffs. `parseDocument` validates the schema version and required collections.

No module code opens sockets, reads remote resources, checks for updates, loads fonts, or writes telemetry. Persistence belongs to the host and can be a local SQLite database, IndexedDB, a project file, Electron/Tauri filesystem APIs, or an embedded application store.

## Tests

The included 58-test Node suite covers component layout, collapse-empty behavior, rotation, explicit port offsets, routing around obstacles, manual waypoints, radius clamping, fan-out lanes, crossing bridges, label placement, engine preview/undo, connected-port mutation policies, scene purity, SVG output, overlays, smart snapping, viewport math, hit priority, marquee direction, component drag, and port-to-port connection.

```bash
npm test
```

## Deliberate boundaries

The package is the editor kernel, not a finished commercial application. The host remains responsible for:

- dock panels, menus, property forms, command palette, dialogs, and localization;
- persistent project/database integration;
- domain-specific BOM, cable, accessory, and manufacturing rules;
- file locking, collaboration, permissions, and merge policy;
- PDF/PNG conversion around the generated SVG;
- application-specific component libraries and symbol artwork.

See [`docs/HOST_INTEGRATION.md`](./docs/HOST_INTEGRATION.md) and [`docs/EDITOR_BEHAVIOR_MATRIX.md`](./docs/EDITOR_BEHAVIOR_MATRIX.md).

## License

MIT. The surrounding clean-room specification contains separate product and clean-room constraints.
