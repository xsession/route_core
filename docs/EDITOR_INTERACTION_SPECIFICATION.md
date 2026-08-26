# RouteCore Visual Editor and Interaction Specification

**Document ID:** RouteCore-ED-001  
**Status:** Implementation-ready normative extension  
**Revision:** 1.0  
**Date:** 2026-08-26  
**Applies to:** Plan editor, schematic editor, layout editor, quick-assembly editor, component creator, cable creator, documentation-sheet editor, and reusable TypeScript editor kernel  
**Companion implementation:** `packages/harness-editor-core`  

## 0. Purpose and normative language

This document defines the visual-editing behavior of RouteCore in sufficient detail to implement and test a professional cable, harness, schematic, and node/edge editor. It expands `CLEAN_ROOM_SPECIFICATION.md` by concentrating on the difficult editor mechanics: dynamic component construction, direct manipulation, labels, wire endpoints, orthogonal routing, route patterns, bend radii, crossing treatment, engineering color patterns, snapping, hit testing, preview transactions, error feedback, undo/redo, and host integration.

The words **shall**, **must**, and **required** are normative. **Should** indicates a strong default that may be changed only by a documented product decision. **May** indicates an optional extension.

This is a clean-room design. Public Splice CAD documentation is used only to identify externally observable outcomes such as a tree/canvas/inspector workflow, component and pin editing, wire anchors, route controls, labels, rotation, bulk connection, wire groups, cable-core mappings, signal/net visualization, and bulk property editing. This document does not describe or infer private source code, database tables, rendering implementation, or routing algorithms. All algorithms, data contracts, event ordering, persistence boundaries, and implementation details below are independent RouteCore designs.

Primary public references used by the behavior team:

- `https://splice-cad.com/docs/plan/canvas-and-navigation`
- `https://splice-cad.com/docs/plan/components-and-pins`
- `https://splice-cad.com/docs/plan/connections-and-conductors`
- `https://splice-cad.com/docs/plan/wire-groups-and-cables`
- `https://splice-cad.com/docs/plan/signals-nets-and-bom`
- `https://splice-cad.com/docs/plan/parts-and-bom`
- `https://splice-cad.com/tutorial/component-creator/`
- `https://splice-cad.com/blog/splice-updates-component-creator-enhancements/`

## 1. Core editor decisions

1. The engineering model is authoritative; the drawing is a projection of that model.
2. Every visible object has a stable semantic identity independent of its current label, position, or visual representation.
3. Every direct manipulation gesture is a preview transaction followed by exactly one commit or a complete rollback.
4. Pointer movement must never write to persistent storage directly.
5. Routing and label placement are deterministic for the same document, settings, and geometry metrics.
6. Engineering color remains visible during selection, hover, warning, and error states.
7. Hit targets are specified in screen pixels and converted to world units at the current zoom.
8. Component geometry is derived from semantic content and layout rules rather than stored as unrelated drawing primitives.
9. Wires connect to semantic ports, not to body-edge coordinates. Coordinates are derived from the port frame.
10. Manual route edits are represented as serializable constraints, not as fragile pixel offsets.
11. The default product works with no network connection, no remote font, no remote icon, no remote parts lookup, and no cloud session.
12. The reusable TypeScript core remains framework-neutral and contains no DOM, React, Vue, Svelte, database, filesystem, or network dependency.

## 2. Editor family and shared interaction contract

RouteCore contains several editors, but they shall share the same interaction primitives and command semantics.

| Editor | Primary purpose | Shared primitives | Special behavior |
|---|---|---|---|
| Plan editor | System-level physical/electrical topology | Components, ports, bundles, conductors, branch points, labels, groups | Layout and schematic projections, pages, assembly generation |
| Schematic editor | Logical connectivity documentation | Components, ports, wires, nets, labels, off-page references | Orthogonal routing, signal/net emphasis, compact components |
| Layout editor | Physical harness arrangement | Components, branches, bundles, dimensions, annotations | Physical distances, branch geometry, manufacturing overlays |
| Quick Assembly editor | Direct single-assembly creation | Components, wires, cables, labels, BOM properties | Reduced project hierarchy and faster creation workflow |
| Component creator | Reusable symbol and pin definition | Body, visual regions, pins, banks, anchors, metadata | Pin-table editing, symbol preview, validation, revision publication |
| Cable creator | Reusable cable/core definition | Sheath, cores, groups, shields, labels | Cross-section preview, core ordering, pair/group mapping |
| Documentation editor | Drawing sheets and model-backed views | View frames, tables, labels, title blocks, notes | Page coordinates, print constraints, table overflow, revision fields |

A user moving from one editor to another shall encounter the same selection rules, modifier conventions, undo semantics, validation channels, inspector staging behavior, and keyboard navigation unless a mode-specific exception is visible in the UI.

## 3. Architectural separation

### 3.1 Layers

```text
Host application shell
  menus · panels · inspector · dialogs · localization · persistence
                     │
                     ▼
Interaction controller
  pointer state machine · hit testing · selection · gestures · snapping
                     │
                     ▼
Stateful editor engine
  commands · preview transactions · history · mutation policies · events
                     │
                     ▼
Pure derived-state pipeline
  component geometry · wire routes · labels · crossings · validation · scene
                     │
                     ▼
Renderer adapters
  SVG · Canvas/WebGL optional · export SVG · print/PDF pipeline
                     │
                     ▼
Serializable document model
  components · ports · wires · labels · settings · stable IDs
```

### 3.2 Responsibilities

The **host** owns menus, docking, persistence, file locks, collaboration, property forms, localization, and application-specific domain data.

The **interaction controller** owns transient pointer and keyboard state. It converts input events into preview updates or editor commands. It must not mutate the document directly.

The **engine** owns the current document snapshot, command history, selection, derived geometry caches, validation results, and typed events.

The **pure pipeline** accepts serializable input and returns derived output without modifying the input. It may execute in a worker.

The **renderer** consumes derived state. Rendering shall not contain hidden business logic that changes connectivity or route ownership.

### 3.3 Data-flow ordering after a model edit

For a committed command, the engine shall process these stages in order:

1. Validate command preconditions.
2. Clone or transactionally stage the current document.
3. Apply semantic mutation.
4. Increment document revision.
5. Rebuild geometry for affected components.
6. Resolve affected endpoints.
7. Reroute affected automatic wires according to policy.
8. Preserve or re-evaluate manual constraints.
9. Recompute affected crossings and bridges.
10. Reflow affected automatic labels.
11. Run incremental validation.
12. Commit one history entry.
13. Emit `documentChanged`, `validationChanged`, and `historyChanged`.
14. Schedule persistence outside the pointer loop.

A preview gesture uses the same derived stages but does not increment the permanent revision or append history until commit.

## 4. Coordinate systems and numerical rules

### 4.1 Coordinate spaces

The editor shall distinguish at least four spaces:

- **Document/world space:** stable logical coordinates used by the model and routing engine.
- **Component-local space:** component layout coordinates before rotation and mirroring.
- **Viewport/screen space:** CSS pixel coordinates used for pointer input and screen-space tolerances.
- **Sheet/print space:** page units, margins, and scale used by documentation output.

World geometry shall not depend on the current zoom. A 10-unit route clearance remains 10 world units at every zoom.

### 4.2 Transform chain

For a component-local point `p`, the world point is:

```text
p_world = translate(position)
        · rotate(rotation)
        · mirror(mirrorX, mirrorY)
        · p_local
```

The implementation may apply mirror before rotation or rotation before mirror only if the convention is fixed, documented, and round-trip tested. RouteCore uses local mirror followed by orthogonal rotation followed by translation.

Normals and tangents shall be transformed by the linear portion of the transform and renormalized. Translation shall never affect direction vectors.

### 4.3 Precision

- Geometry calculations use finite IEEE-754 numbers in the TypeScript core.
- The production domain layer should store canonical engineering dimensions as integers in a declared unit, such as micrometres or 0.01 mm.
- Screen transforms may use floating point.
- Equality for geometry uses a configurable epsilon; IDs and semantic values use exact equality.
- A command containing `NaN`, `Infinity`, negative width, negative height, or invalid radius shall be rejected before mutation.
- Serialization shall produce deterministic numeric formatting appropriate to the persistence format.

### 4.4 Screen-space tolerance conversion

Any hit or snap tolerance specified in pixels shall be converted as:

```text
worldTolerance = pixelTolerance / viewportZoom
```

This prevents ports from becoming impossible to click when zoomed out and prevents giant hit regions when zoomed in.

## 5. Rendering scene and visual layers

### 5.1 Required layer order

The renderer shall use deterministic layers. A default order is:

1. background;
2. minor and major grid;
3. page boundaries and keep-out fills;
4. groups, regions, and bundle corridors;
5. wire underlays and engineering wire strokes;
6. wire crossing bridges;
7. component bodies and internal regions;
8. ports, pin rows, and component-local text;
9. free labels and leaders;
10. diagnostics;
11. selection outlines and handles;
12. snap guides and alignment indicators;
13. marquee rectangle;
14. connection/routing preview;
15. contextual overlays such as measurement callouts.

The exact DOM or GPU layer implementation is independent, but the visual precedence is normative.

### 5.2 Non-scaling visual elements

Selection halos, hit handles, port targets, diagnostic markers, and guide lines should retain a stable screen thickness. In SVG this is achieved with `vector-effect="non-scaling-stroke"` or equivalent scaling compensation. Engineering wire width may be world-scaled or screen-stable depending on view type, but the policy must be explicit.

### 5.3 Semantic accessibility

When SVG is used interactively or exported with accessibility enabled:

- the root shall include a title and description;
- entities shall have stable `data-*` identifiers;
- user text shall be escaped;
- components and wires shall have understandable names;
- purely decorative grid and halos shall be hidden from assistive technology;
- focusable entity groups shall expose role, selected state, invalid state, and descriptive labels where the host supports keyboard traversal.

## 6. Component semantic model

### 6.1 Separation of definition and instance

A reusable component definition contains symbol structure, default metadata, pin definitions, pin banks, anchor rules, visual style defaults, and revision identity. A project component instance contains stable instance ID, definition reference, designator, field overrides, position, rotation, mirror state, manual-size state, visibility, lock state, and project-specific pin overrides.

The reusable TypeScript kernel uses a flattened `ComponentNode` for portability, but a production host may map normalized database records into that structure.

### 6.2 Stable identity rules

- `component.id` is stable across moves, rotations, label edits, and part assignment changes.
- `port.id` is stable across visible-label and function changes.
- A visible label such as `1`, `A3`, or `CAN_H` is not an identity.
- Duplicating a component shall create a new component ID and new port IDs while preserving semantic metadata.
- Definition revisions shall never silently replace the IDs of existing project ports.
- Imported data shall use explicit ID mapping or stable external IDs rather than matching solely by display text.

### 6.3 Component kinds

The editor kernel supports connector, terminal point, termination, device, inline device, passive, branch point, and custom components. The host may introduce additional domain kinds while mapping them to the common geometry contract.

### 6.4 Component regions

A rendered component may include:

- rounded or square body;
- header band;
- optional subtitle/manufacturer/part-number region;
- one or more pin-bank regions;
- row separators and alternating fills;
- footer/status region;
- icon or symbol artwork supplied by the host;
- warning/revision badge;
- hidden-pin or collapsed-bank indicator;
- mate-group and cavity-group markings;
- selection and validation outlines.

The core geometry contract shall expose bounds for every interactive region that affects hit testing or collision avoidance.

## 7. Dynamic component build-up algorithm

### 7.1 Inputs

The component geometry builder receives:

- component labels and style;
- ports and pin banks;
- optional explicit size;
- minimum and maximum size;
- padding, row height, gaps, header/footer dimensions;
- text measurer;
- connection state when empty-bank collapse is enabled;
- rotation and mirror state.

### 7.2 Text measurement

Production UI should measure the exact bundled font. Headless builds shall use deterministic approximate metrics. The same text-measurement provider must be used for layout and rendering within a given export operation.

For each text field, the measurer returns width, height, ascent, descent, and line height. Multi-line fields shall be measured line-by-line. Text wrapping shall be deterministic and based on explicit maximum width rather than browser-dependent automatic wrapping.

### 7.3 Port ordering

For each bank:

1. Resolve `portIds` to ports.
2. Remove missing references and report validation issues.
3. Filter invisible ports.
4. When `collapseEmpty` is enabled, retain only ports that are connected or explicitly forced visible by the host.
5. Sort according to bank flow:
   - `forward`: ascending order then stable ID;
   - `reverse`: descending order then stable ID;
   - `center-out`: alternate from the center according to a deterministic rule.
6. Preserve row identity by port ID.

A port assigned to a declared bank shall never be reintroduced by the unbanked-port fallback pass when that bank collapses it. This rule is covered by regression tests.

### 7.4 Row metrics

For each visible port row:

```text
rowHeight = max(
  layout.rowHeight,
  port.minimumRowHeight or 0,
  measured(port.label).height + verticalTextPadding,
  measured(port.function).height + verticalTextPadding
)
```

The row width contribution is the sum of:

- pin-dot and edge clearance;
- label column width;
- inter-column gap;
- function column width;
- optional detail/icon column;
- internal horizontal padding.

An explicit bank `labelColumnWidth` or `functionColumnWidth` is a minimum, not a clipping command. If the host intentionally clips text, it shall show ellipsis and a tooltip while preserving the full semantic value.

### 7.5 Body width

A default auto-width calculation is:

```text
contentWidth = max(
  measuredHeaderWidth,
  northBankWidth,
  southBankWidth,
  westInteriorDemand + eastInteriorDemand + centralMinimum,
  footerWidth
)

autoWidth = contentWidth + padding.left + padding.right
resolvedWidth = clamp(autoWidth, minimumWidth, maximumWidth)
```

When `autoWidth` is false, use the manual size subject to minimum and maximum constraints. When `preserveManualSize` is true, automatic measurement may expand a manual size to avoid data loss but shall not shrink it without an explicit “fit to content” action.

### 7.6 Body height

A default auto-height calculation is:

```text
verticalBankDemand = max(
  westBankHeight,
  eastBankHeight,
  centralContentHeight
)

autoHeight = padding.top
           + headerHeight
           + bankHeaderAndGap
           + verticalBankDemand
           + footerHeight
           + padding.bottom

resolvedHeight = clamp(autoHeight, minimumHeight, maximumHeight)
```

North and south banks contribute to top/bottom external or internal demand according to the chosen symbol style. Banks on opposing sides shall align rows only when their row-alignment group requests it; unrelated banks shall not be forced into equal counts.

### 7.7 Local placement

The builder lays out the unrotated, unmirrored component in local space. Each port receives:

- center point;
- side;
- outward normal;
- tangent;
- row bounds;
- label and function bounds;
- enlarged hit bounds.

A port with `sideFraction` uses a normalized position on its side. `tangentOffset` shifts along the edge. `normalOffset` shifts outward or inward along the normal. Automatic rows and explicitly positioned ports may coexist, but collisions shall be reported.

### 7.8 Transform of complete geometry

Rotation and mirroring apply to body, header, footer, row rectangles, text anchor points, port centers, hit rectangles, normals, and tangents as one coherent frame. It is invalid to rotate only the body while leaving port directions or label anchors unchanged.

### 7.9 Geometry result

The builder returns a `ComponentGeometry` containing local body, world body, full world bounds, header/footer bounds, port geometry map, row bounds, title/subtitle positions, and rotation. A host may extend it with additional visual regions while preserving the common contract.

## 8. Component Creator interaction model

### 8.1 Editing surfaces

The component creator should present four synchronized regions:

1. component metadata and visual rules;
2. tabular pin editor;
3. bank/side assignment editor;
4. live symbol preview.

Selecting a pin row shall highlight its preview port. Selecting a preview port shall scroll and select the corresponding table row. The same stable port ID links both views.

### 8.2 Pin-table operations

Required operations:

- add one or many pins;
- paste tabular pin data;
- insert before/after selection;
- duplicate pins with new IDs;
- delete unused pins;
- delete or remap connected pins when editing an instance;
- reorder within a bank;
- move to another bank or side;
- edit label, function, detail, electrical class, visibility, connection limit, and metadata;
- apply values to selected rows;
- validate duplicate IDs, duplicate labels where disallowed, invalid side assignment, missing bank, and unsupported connection policy.

Bulk paste shall stage all rows, show row-level errors, and commit atomically. It shall not partially create the first valid rows and then stop at the first error.

### 8.3 Dynamic preview response

While editing title, pin text, row count, bank assignment, padding, or style, the preview shall remeasure and reflow immediately. The UI should preserve the preview’s focal point rather than jumping back to fit-to-screen after every keystroke.

Changes typed into a text field may use a short local debounce, typically 50–150 ms, but the committed model operation remains one coalesced edit when focus leaves the field or the user presses Enter.

### 8.4 Connected-port mutation policy

Removing or replacing ports from a project instance requires one explicit policy:

- `prevent`: reject the mutation and list affected wires;
- `detach`: preserve each affected wire endpoint as a free endpoint at its last resolved world position;
- `remap-by-label`: reconnect to a replacement port with the same visible label, otherwise detach.

The preview shall show the impact before commit: number of ports removed, wires rerouted, wires detached, labels moved, and new validation findings.

### 8.5 Resize handles

Manual component resizing shall expose edge and corner handles only when the component’s layout rules permit manual size. During resize:

- minimum/maximum size applies continuously;
- auto-layout remains active within the available interior;
- text does not silently overlap ports;
- insufficient space produces an explicit overflow indicator;
- Shift may preserve aspect ratio for artwork-based custom symbols;
- Alt may resize around the component center;
- release commits one command;
- Escape restores the exact original size.

### 8.6 Rotation and mirror

Rotation is restricted to 0, 90, 180, and 270 degrees in the core contract. A host may add arbitrary-angle annotation symbols, but electrical components should remain orthogonal unless the domain explicitly requires otherwise.

When rotating or mirroring:

- ports remain attached to their semantic sides after transform;
- lead-in directions update;
- attached automatic wires reroute;
- manual endpoint segments remain attached and are repaired locally;
- owner-relative labels rotate or retain page orientation according to label policy;
- world-pinned labels do not move;
- selection handles and hit regions update in the same frame.

## 9. Component direct manipulation

### 9.1 Hover

Hovering a component body shall:

- change the cursor to move when movable;
- show a subtle hover outline without replacing engineering fill or diagnostic stroke;
- optionally prehighlight attached wires and ports;
- update the status area with designator and type;
- avoid history and persistence changes.

### 9.2 Selection

A plain click selects the component as primary and clears the previous selection. Ctrl/Cmd/Shift click toggles or adds according to host convention. Clicking an already selected component must not clear other selected items before a group drag begins.

The primary selection drives the inspector. The selection order is deterministic and preserved for keyboard operations.

### 9.3 Drag start threshold

Pointer down does not immediately create a move command. The controller records the candidate hit and origin. A drag begins only after the pointer exceeds a screen-space threshold, typically 3–5 px, or after a pen/touch long-press policy. Before threshold crossing, release is treated as a click.

### 9.4 Live drag response

During component drag:

- all selected movable components translate by one common delta;
- locked components remain fixed and are reported;
- attached endpoints resolve against preview geometry;
- affected automatic wires reroute or use a fast preview route;
- manual routes repair their endpoint approach while preserving locked constraints;
- automatic labels reflow according to performance policy;
- world-pinned labels stay fixed;
- snap guides and delta readouts update;
- validation may show transient warnings, but persistent DRC is not written until commit.

The preview delta is always calculated from the gesture start, not accumulated from the previous pointer frame. This avoids rounding drift and snap oscillation.

### 9.5 Modifier behavior

Default component-drag modifiers:

- Shift: lock to dominant axis after a small hysteresis threshold;
- Alt: bypass grid and smart snapping;
- Ctrl/Cmd: host-reserved, commonly duplicate-drag when explicitly enabled;
- Space: temporarily pan instead of moving the component before drag commitment.

### 9.6 Commit and cancellation

Pointer release commits one `Move components` history entry. Pointer cancel, Escape, loss of capture, or a rejected constraint restores the complete pre-gesture snapshot, including routes, label placements, selection, and validation cache.

## 10. Ports and wire-to-component connection geometry

### 10.1 Port frame

Every port exposes:

- center `C`;
- outward unit normal `N`;
- tangent `T`;
- semantic side;
- hit bounds;
- optional row bounds.

The endpoint attachment is `C`, not the visible edge of the pin dot. The first routing lead-in point is:

```text
L = C + N * leadIn
```

The wire segment from `C` to `L` shall be aligned with `N`. This prevents wires from grazing along a component edge or entering through the body.

### 10.2 Component keep-out

The router shall treat the component body as an obstacle expanded by:

```text
expandedClearance = component.layout.obstaclePadding
                  + wire.routing.clearance
                  + halfEffectiveWireWidth
```

The source and target lead-in corridors are temporarily opened so the wire can exit its own component without being classified as an obstacle violation.

### 10.3 Port target display

Connection targets shall have a minimum screen-space target size. The visual dot may be small, but the interactive target shall remain usable. At low zoom, the host may aggregate densely packed ports and require zoom-in or display a magnified port picker rather than allowing ambiguous connections.

### 10.4 Connection compatibility

Before a port is shown as valid, evaluate:

1. source and target are not the same port unless self-connection is allowed;
2. target connection count is below `maximumConnections`;
3. wire kind is allowed by both endpoint policies;
4. electrical classes are compatible under host rules;
5. required mate group matches;
6. target is not hidden, locked against connection, or on an inactive page unless cross-page connection is supported;
7. a duplicate connection is not created unless explicitly allowed.

The UI shall distinguish:

- valid target;
- invalid target with reason;
- valid but warning-producing target;
- currently saturated port;
- source port.

### 10.5 Port connection response

When dragging from a port:

- the source port receives a source halo;
- the closest candidate target within screen-space radius is highlighted;
- a temporary orthogonal preview follows the pointer;
- validity is recalculated as the pointer moves;
- status text announces the candidate and reason;
- release on valid target creates one wire command;
- release on blank space may create a free endpoint only when that tool mode allows it;
- release on invalid target creates nothing and leaves the document unchanged;
- Escape cancels without history.

## 11. Wire semantic model

A wire is a semantic edge with source and target endpoints, wire kind, label/signal metadata, routing options, engineering style, lock/visibility state, and optional derived route.

Supported endpoint kinds:

- component port;
- free endpoint;
- off-page reference;
- junction endpoint.

Supported wire kinds include discrete wire, cable core, shield, drain, bundle, mate, and annotation. The host may render these differently, but all use the common route and hit-test infrastructure where applicable.

The stored route is derived or constrained presentation data. Electrical connectivity is determined by endpoints and domain topology, not by whether two strokes visually cross.

## 12. Wire creation and reconnection

### 12.1 Creation tools

The editor should provide:

- click-drag port-to-port;
- click source, click target;
- freehand waypoint sequence with orthogonal preview;
- bulk matrix connection;
- pattern-based bank-to-bank connection;
- creation from imported schedule;
- cable-core mapping and wire-group generation.

All methods produce the same semantic `WireEdge` structure and command history.

### 12.2 Reconnecting an endpoint

Dragging an existing endpoint begins a reconnect preview. The old endpoint remains part of the committed model until a valid target is released. During preview, the wire is rendered from the opposite committed endpoint to the pointer or candidate target.

On cancellation or invalid release, the old endpoint is restored exactly. Reconnecting shall be one command and one undo step.

### 12.3 Free endpoints and flying leads

A free endpoint stores a world point, optional preferred direction, and optional termination. It shall display a distinct endpoint marker and be targetable. Moving it updates route geometry but not component geometry.

A free endpoint may be converted to a port endpoint by reconnecting it. A port endpoint may be detached into a free endpoint while preserving its last world position.

### 12.4 Off-page references

An off-page endpoint stores a reference and world anchor. The renderer shall display reference text and direction. The reference must resolve through the host’s page/topology layer. An unresolved reference produces a validation error but remains editable.

## 13. Routing pattern catalogue

The core supports the following patterns.

### 13.1 Direct

A single segment from source to target. Use only for annotation, physical-layout views where diagonal lines are allowed, or an explicitly selected direct style. Direct routes must not be presented as orthogonal electrical routes.

### 13.2 Orthogonal automatic

The router finds a Manhattan path around obstacles using endpoint normals, lead-ins, clearances, penalties, and constraints. It is the default for schematic-style editing.

### 13.3 Horizontal-first

After lead-in, travel horizontally toward the target region, then vertically, then approach the target. When this simple elbow intersects obstacles, the router may add detours while preserving horizontal-first preference.

### 13.4 Vertical-first

Equivalent to horizontal-first with axes exchanged.

### 13.5 Dogleg-horizontal

Use a user-specified or automatically chosen vertical dogleg line at `x = doglegCoordinate`. The route generally takes the form horizontal–vertical–horizontal after lead-ins.

### 13.6 Dogleg-vertical

Use a horizontal dogleg line at `y = doglegCoordinate`.

### 13.7 Trunk-horizontal

Route multiple wires toward a shared horizontal trunk corridor while preserving distinct lanes and endpoint fan-out. Electrical wires remain independent even when visually grouped.

### 13.8 Trunk-vertical

Axis-swapped trunk behavior.

### 13.9 Manual

A manual route passes through ordered hard waypoints and/or locked segments. The router repairs local orthogonal connections between constraints but must not silently discard them.

## 14. Independent orthogonal routing algorithm

### 14.1 Inputs

- resolved source and target points and normals;
- component and keep-out rectangles;
- optional label/group obstacles;
- previous route;
- grid and clearance settings;
- constraints;
- pattern preference;
- search-node budget;
- whether crossings are allowed;
- existing wire segments for crossing/proximity costs.

### 14.2 Preprocessing

1. Resolve endpoint frames.
2. Generate lead-in points.
3. Inflate obstacles by clearance and effective stroke radius.
4. Remove or notch source/target escape corridors.
5. Normalize and sort constraints.
6. Build candidate x/y coordinates from endpoint points, obstacle edges plus clearance, waypoints, trunk/dogleg coordinates, and previous route coordinates.
7. Deduplicate coordinates using epsilon.
8. Create a sparse orthogonal visibility graph or bounded grid.

### 14.3 Search cost

A candidate transition cost should be:

```text
cost = manhattanDistance
     + bendPenalty * newBendCount
     + crossingPenalty * crossingCount
     + proximityPenalty * proximityMeasure
     + reversePenalty * reverseMotionCount
     + previousRouteStability * deviationFromPreviousRoute
     + constraintPenalty
```

Hard constraint violations are forbidden. Strong and soft constraints add different penalties. Tie-breaking shall be deterministic, for example by lower total cost, fewer bends, shorter length, lexicographic coordinate, then stable node ID.

### 14.4 Search result

The router returns:

- points;
- classified segments;
- safe corner radii;
- total length;
- bend count;
- crossing count;
- obstacle-violation IDs;
- status `valid`, `fallback`, or `invalid`;
- diagnostics.

A fallback route is allowed only when it is explicitly marked and validation can surface it. The editor shall never silently label an obstacle-crossing fallback as valid.

### 14.5 Route stability

Small component movements should not cause unrelated route topology to flip. Stability is encouraged by:

- including previous route coordinates in the candidate grid;
- penalizing deviation from previous segments;
- preserving valid manual constraints;
- deterministic tie-breaking;
- hysteresis before changing equivalent corridors;
- rerouting only affected wires.

### 14.6 Search budget

When `maxSearchNodes` is reached:

- return the best known route if valid;
- otherwise return a deterministic fallback with diagnostics;
- keep the UI responsive;
- optionally schedule an exact worker solve after the gesture;
- never block the pointer thread indefinitely.

## 15. Manual route manipulation

### 15.1 Handles

Selecting a wire may expose:

- endpoint handles;
- waypoint handles;
- segment drag handles;
- bend-radius handles when supported;
- route-reset control;
- lock/unlock indicator.

Handle size is screen-stable. Handles shall not obscure adjacent ports at normal zoom.

### 15.2 Segment drag

Dragging a horizontal segment changes its y-coordinate; dragging a vertical segment changes its x-coordinate. Adjacent segments are extended or shortened to remain connected. If the moved segment is at an endpoint, the port lead-in remains anchored and a dogleg is inserted as necessary.

The operation produces serializable constraints, such as a locked segment or waypoint pair. It shall not merely replace the route with a list of arbitrary pixels without ownership semantics.

### 15.3 Waypoint insertion

Double-clicking or invoking “Add waypoint” on a segment inserts a waypoint at the projected point. For an orthogonal route, the point is snapped to the segment and grid according to current modifiers. A hard waypoint must be traversed; a soft waypoint influences but does not force the solver.

### 15.4 Waypoint deletion

Deleting a waypoint removes its constraint and reroutes the adjacent region. If removing it would make a locked segment impossible, the editor shall explain the conflict rather than corrupting the route.

### 15.5 Route reset

“Reset route” removes editable route constraints, restores the selected automatic pattern, and reroutes. It shall preview affected bends and labels before commit when the impact is large.

### 15.6 Component movement with manual routes

When an attached component moves:

- the port center and lead-in move with the component;
- owner-frame constraints attached to `source` or `target` move in that endpoint frame;
- world-frame waypoints remain fixed;
- locked world segments remain fixed when feasible;
- local connector segments are repaired;
- an impossible constraint marks the route invalid and identifies the constraint.

## 16. Bend radius and corner construction

### 16.1 Requested versus effective radius

A wire stores `requestedRadius`. Each corner receives an independently clamped effective radius.

For adjacent segment lengths `a` and `b`:

```text
r_effective = min(
  requestedRadius,
  a / 2,
  b / 2,
  max(0, a - minimumSegment),
  max(0, b - minimumSegment)
)
```

The exact minimum-segment term may be adjusted, but the radius must never consume or reverse an adjacent segment.

### 16.2 Zero and invalid radius

- zero radius produces a sharp orthogonal corner;
- negative radius is rejected;
- non-finite radius is rejected;
- an overlarge value is accepted as a request but clamped per corner and may show an informational diagnostic;
- changing radius shall not change electrical connectivity.

### 16.3 Rounded path construction

For each corner:

1. Compute incoming and outgoing unit directions.
2. Offset from the corner along each segment by `r_effective`.
3. Draw line to the incoming tangent point.
4. Draw a quarter-circle arc or quadratic curve to the outgoing tangent point.
5. Continue to the next corner.

The visual path and hit-test polyline must share the same route geometry. The hit test may approximate the arc with a widened stroke but shall not select a distant adjacent wire incorrectly.

### 16.4 Component connection radius

No rounding is applied between the port center and the first lead-in point. The first rounded corner occurs after the lead-in so the wire visibly leaves normal to the component edge.

### 16.5 Physical bend constraints

In layout/manufacturing views, the host may derive minimum bend radius from cable diameter, construction, or part rules. A route below the required physical radius produces a DRC finding even if it is geometrically renderable.

## 17. Fan-out, trunks, bundles, pairs, and cable patterns

### 17.1 Pin-bank fan-out

Parallel wires leaving adjacent ports shall receive deterministic lanes. The lane assignment is based on port order, preferred trunk direction, lane spacing, and stable wire ID. It must avoid lane swapping after small edits.

A default fan-out process:

1. Sort endpoints by tangent coordinate.
2. Allocate lane indices around a centerline.
3. Generate staggered lead-in extensions to prevent overlapping elbows.
4. Join the trunk or independent routes after the fan-out region.
5. Preserve the same lane identity on reroute where feasible.

### 17.2 Visual bundle versus electrical connection

A bundle or shared trunk is a physical/visual grouping and does not imply electrical continuity. A splice or explicit junction is required for electrical connection. Crossing strokes do not connect.

### 17.3 Twisted pairs and grouped wires

A twisted pair may be rendered as:

- two parallel colored routes with periodic crossing glyphs;
- a shared center route with pair badge and individual fan-outs;
- separate wires inside a translucent group corridor.

The host shall preserve individual wire IDs, endpoints, lengths, colors, and BOM properties. Pair display is a projection.

### 17.4 Cable cores

Cable-core wires may share a sheath route. At breakouts, cores fan out to ports. Core ordering shall be deterministic and follow cable definition order unless manually overridden. Shield and drain conductors use distinct patterns and termination markers.

### 17.5 Crossing bridges

When two non-connected wires cross, the renderer shall make the non-connection unambiguous. The default is a bridge/gap on the over-wire chosen by z-order, route priority, or explicit user override. The bridge radius is screen-consistent or world-consistent according to the view profile.

Crossing bridge ownership must be deterministic. Changing selection shall not change which wire visually passes over.

## 18. Engineering wire colors and patterns

### 18.1 Purpose

Wire color is engineering data, not decoration. Selection and diagnostics shall not replace it with a generic state color.

### 18.2 Supported patterns

The core supports:

- solid;
- longitudinal or dashed stripe approximation;
- tracer;
- dual-color;
- shield/sheath with optional core;
- custom ordered paint layers.

A production host may add IEC, automotive, aerospace, or company-specific color codes through metadata and style adapters.

### 18.3 Paint-layer model

A wire pattern resolves to one or more ordered strokes. Each layer has color, width, opacity, dash, dash offset, and line cap. Rendering from outermost to innermost allows outlines, sheath, base color, stripe, and tracer effects.

### 18.4 Visual precedence

From outermost to innermost:

1. hover/selection halo;
2. warning/error diagnostic stroke;
3. contrast outline;
4. engineering paint layers.

This preserves the wire’s actual color identity in every state.

### 18.5 Pattern defaults

Suggested independent defaults:

| Pattern | Construction |
|---|---|
| Solid | one engineering stroke plus optional contrast outline |
| Stripe | base stroke plus narrower dashed stripe stroke |
| Tracer | base stroke plus short periodic tracer dashes |
| Dual | wider secondary stroke under narrower primary stroke, ratio-controlled |
| Shield | sheath stroke under a narrower core stroke or shield hatch |
| Custom | validated list of paint layers, maximum count set by host |

### 18.6 Contrast and color blindness

- A monochrome mode shall distinguish wires by labels and line patterns.
- Automatic text color shall meet the host’s contrast threshold against label backgrounds.
- Red/green alone shall not be the only valid/invalid distinction; shape, icon, pattern, and text must reinforce it.
- Export profiles shall support grayscale-safe output.
- User-entered colors shall be validated and normalized.

### 18.7 Selection behavior

Selecting a striped red/white wire shall show a halo around the red/white pattern. It shall not recolor the engineering stroke blue. Multiple selected wires retain their individual patterns.

## 19. Labels: semantic model

A label stores stable ID, text, optional secondary text, anchor, placement mode, orientation, offset, optional world position, priority, collision policies, leader permission, visibility, lock state, and text style.

Owner kinds include component, port, wire, free point, and group.

Placement modes:

- `auto`: solver chooses a candidate;
- `owner-relative`: stored offset is resolved in owner frame;
- `world-pinned`: world position remains fixed while the owner moves.

Orientations:

- horizontal;
- follow route segment;
- vertical.

## 20. Label anchor resolution

### 20.1 Component labels

Component labels may anchor to body center, header, a side, or an explicit point. Candidate positions include north, north-east, east, south-east, south, south-west, west, north-west, inside header, and inside body.

### 20.2 Port labels

Port labels anchor to port center and use port normal/tangent to determine default offset and text alignment. Labels should not sit directly on the wire attachment point.

### 20.3 Wire labels

A wire label may anchor by route fraction, segment index plus fraction, or explicit route point. `follow-segment` orientation uses the local segment direction but should flip 180 degrees when necessary to keep text readable left-to-right or bottom-to-top according to locale conventions.

### 20.4 Free labels

A free label anchors to an explicit point and has no owner dependency. It still participates in collision detection and page bounds.

### 20.5 Invalid anchors

Missing owner, missing port, absent segment, or out-of-range fraction yields `invalid-anchor`. The label remains in the document for repair and appears in validation; it is not silently deleted.

## 21. Automatic label placement solver

### 21.1 Candidate generation

For each automatic label:

1. Resolve owner anchor point and owner bounds.
2. Generate candidates in preferred order.
3. Measure text and create candidate bounds.
4. Apply owner gap and requested offset.
5. Generate leader candidate when direct placement exceeds leader threshold and leaders are allowed.
6. Reject impossible page-bound placements or retain them with high penalty depending on policy.

### 21.2 Scoring

A candidate score may be:

```text
score = intrinsicCandidateCost
      + componentOverlapArea * componentWeight
      + labelOverlapArea * labelWeight
      + wireOverlapLength * wireWeight
      + pageOverflowArea * pageWeight
      + leaderLength * leaderWeight
      + distanceFromAnchor * distanceWeight
      + distanceFromPreviousPlacement * stabilityWeight
      + orientationPenalty
```

Lower score is better. Hard exclusions may be used for locked obstacles or page margins.

### 21.3 Placement order

Place labels by descending priority, then stable ID. Fixed and world-pinned labels become obstacles before automatic labels. This makes results deterministic.

### 21.4 Stability

The previous accepted placement contributes a stability term. Small edits should not make a label jump from east to west when both remain valid. A candidate change should require a meaningful score improvement or the old candidate becoming invalid.

### 21.5 Collision outcome

If no collision-free candidate exists, choose the lowest-score candidate, mark status `overlap`, record collision IDs, and display a validation warning. The solver shall never drop the label silently.

### 21.6 Global versus incremental solve

During pointer drag, reflow only labels affected by moved owners, changed wires, or nearby obstacles. After commit, a worker may run a wider exact solve. Existing placements remain visible until replacements are ready.

## 22. Label user interactions

### 22.1 Hover and select

Hover shows label bounds or a subtle border and uses a move cursor when unlocked. Click selects the label and opens its inspector. Double click may enter inline text editing if the host supports it.

### 22.2 Dragging an automatic label

Dragging an automatic label converts it to `world-pinned` by default. The preview follows the pointer, may snap to grid/guides, and shows a leader if separated from the anchor. Release commits one label command. Escape restores automatic placement.

A host may offer Alt-drag for owner-relative placement instead.

### 22.3 Reset to automatic

“Auto-place” clears world position, returns mode to `auto`, and runs the solver. Undo restores the manual placement.

### 22.4 Inline editing

Inline edit shall preserve position while text is being typed. The label is remeasured live, and nearby collisions may be previewed. Enter commits; Escape restores the prior text. Multi-line behavior must be explicit.

### 22.5 Leader manipulation

When leaders are enabled, the label box is draggable while the anchor remains semantic. A leader endpoint at the owner may not be dragged independently unless the anchor model supports an explicit owner-relative attachment point.

## 23. Hit testing and spatial indexing

### 23.1 Priority

Default hit priority:

1. explicit edit handles;
2. ports;
3. route waypoints;
4. route segments;
5. labels;
6. component header/body;
7. broad wire stroke;
8. background/group region.

Within a priority class, choose the nearest hit, then highest z-index, then stable ID.

### 23.2 Geometry

- components use body/header/row/handle rectangles;
- ports use enlarged screen-space circular or rectangular targets;
- wires use distance to polyline or rounded path with widened tolerance;
- labels use measured bounds;
- waypoints use screen-space handles;
- crossings do not imply junction hits unless an explicit junction entity exists.

### 23.3 Spatial index

A uniform grid, R-tree, or equivalent shall index component bounds, label bounds, wire segment bounds, and handles. The index is updated incrementally after geometry changes. Hit testing shall query a local region rather than scanning the complete document for normal operation.

### 23.4 Ambiguous hits

Repeated click or a host “select other” menu may cycle through overlapping hits. The list shall be stable and identify object kind and name. The editor must not choose randomly between overlapping ports.

## 24. Selection model

### 24.1 Selection references

Selection uses semantic references with kind, ID, and optional sub-ID/segment index. A primary item drives the inspector; secondary items support multi-edit.

### 24.2 Window and crossing marquee

CAD direction convention:

- left-to-right: window selection, entity must be fully contained;
- right-to-left: crossing selection, intersection is sufficient.

The two rectangles shall look different, for example solid versus dashed border and distinct fill opacity. Alt may subtract; Shift/Ctrl/Cmd may add or toggle.

### 24.3 Group selection and drag

Group drag preserves relative positions. Components, free labels, and free endpoints may move together according to selection. Attached semantic endpoints are not duplicated as independent movement unless explicitly selected in an endpoint-edit mode.

One group drag produces one command and one history entry.

### 24.4 Locked and hidden entities

Hidden entities are not hit-testable unless a dedicated reveal mode is active. Locked entities may be selected and inspected but not moved; attempted manipulation produces a non-destructive explanation.

## 25. Snapping and alignment guides

### 25.1 Snap candidates

Component movement may snap to:

- grid intersections;
- component left/right/top/bottom edges;
- horizontal and vertical centers;
- port centerlines;
- user guides;
- page margins;
- group/trunk corridors.

Route handles may snap to grid, existing route coordinates, port centerlines, and trunk lines. Labels may snap to grid, owner centers, component edges, and other label baselines.

### 25.2 Candidate evaluation

Convert the configured screen tolerance to world units. Compute the correction for every candidate. Rank by:

1. explicit user guide;
2. port alignment;
3. selected primary edge/center intent;
4. component edge/center;
5. grid;
6. distance;
7. stable candidate ID.

The host may adjust priority but must avoid nondeterministic snapping.

### 25.3 Absolute gesture delta

The snap solver returns an absolute corrected delta from the gesture origin. It shall never add correction to the already corrected previous frame.

### 25.4 Hysteresis

Once snapped, retain that snap until the pointer moves beyond a release threshold slightly larger than the acquisition threshold. This prevents flicker between nearby edges.

### 25.5 Guide display

Guides show the aligned feature, not merely a generic line. Optional text may show distance, equal spacing, or port identifier. Guides are transient and excluded from exports.

## 26. Viewport navigation

### 26.1 Pan

Supported pan inputs should include middle-button drag, Space+drag, touch pan, trackpad, and scrollbar where present. Pan does not modify the document or history.

### 26.2 Zoom

Wheel/pinch zoom shall preserve the world point under the pointer or gesture focal point:

```text
worldBefore = screenToWorld(focal)
applyZoom(newZoom)
setPanSo(screenToWorld(focal) == worldBefore)
```

Zoom is clamped to a host-defined range. At extreme zoom levels, detail levels may change but semantic positions remain stable.

### 26.3 Fit and focus

Provide fit all, fit selection, focus entity, previous view, and actual scale where meaningful. Fit shall include padding and avoid covering content with docked overlays when the host supplies viewport insets.

### 26.4 Navigation continuity

Editing a field shall not automatically reset pan or zoom. Switching between schematic and layout may preserve per-view viewport state. Navigating from tree to entity shall animate only when reduced-motion is not requested.

## 27. Interaction state machine

A controller should use explicit states, not loosely coupled booleans.

```text
idle
 ├─ pressed-candidate
 │   ├─ dragging-components
 │   ├─ dragging-label
 │   ├─ dragging-route-segment
 │   ├─ dragging-waypoint
 │   ├─ reconnecting-endpoint
 │   ├─ connecting-port
 │   ├─ resizing-component
 │   ├─ rotating-component
 │   ├─ marquee-selecting
 │   └─ panning
 ├─ inline-editing
 └─ context-menu
```

Every active state defines accepted pointer IDs, capture ownership, cursor, transient overlay, cancel behavior, commit behavior, and allowed keyboard commands. Starting a second incompatible gesture shall cancel or reject the first deterministically.

## 28. Preview transactions and command history

### 28.1 Preview lifecycle

```text
beginPreview(label)
  capture exact document + selection snapshot
  initialize gesture context

updatePreview(mutator)
  restore preview base
  apply current absolute gesture state
  recompute affected derived state
  render; no history append

commitPreview()
  compare with base
  append one command/history entry when changed
  increment revision
  emit events

cancelPreview()
  restore exact base snapshot
  emit interaction/selection updates
```

### 28.2 Command granularity

Examples of one logical history entry:

- move one or 100 selected components;
- drag one route segment through many pointer frames;
- paste 100 pins;
- apply a bulk property edit;
- connect a bank pattern;
- accept an assembly synchronization preview.

Inspector typing may coalesce consecutive compatible edits within a time window and while focus remains in the same field.

### 28.3 History labels

History entries shall have user-readable labels such as `Move 3 components`, `Route W17`, `Add 24 pins`, `Connect J1 to A2`, or `Auto-place 12 labels`.

### 28.4 Persistence

Persistent project storage records only committed state/commands. Autosave is scheduled after commit. Preview frames shall never generate hundreds of database transactions.

## 29. User feedback and response rules

### 29.1 Feedback channels

- cursor;
- hover/selection/target halo;
- snap and route guides;
- inline field validation;
- status bar message;
- non-blocking toast;
- persistent validation panel;
- screen-reader announcement;
- blocked-operation dialog only when the user must choose a policy.

### 29.2 Response matrix

| User action | Immediate visual response | Model result on release/accept | Cancel or invalid result |
|---|---|---|---|
| Hover component | hover outline, move/default cursor | none | clears |
| Click component | primary selection, inspector | selection only | none |
| Drag component | body, ports, wires, labels, guides move | one move command | exact rollback |
| Rotate component | transformed preview, routes reattach | one rotate command | rollback/reject when locked |
| Edit title/function | live measure and reflow | one coalesced edit | staged value discarded |
| Add pin | row and port appear, body may expand | one edit command | no partial add |
| Remove connected pin, prevent | affected wires highlighted, reason shown | no mutation | unchanged |
| Remove connected pin, detach | endpoint/free-point preview | one mutation command | rollback |
| Remove connected pin, remap | candidate replacement shown | one mutation command | fallback per selected policy |
| Drag source port | connection preview, valid/invalid target | create wire | no wire |
| Reconnect endpoint | temporary route to candidate | one reconnect command | old endpoint restored |
| Select wire | halo outside engineering pattern | selection only | none |
| Drag segment | orthogonal segment and elbows move | constraints stored in one command | original route restored |
| Add waypoint | route passes through preview point | one constraint command | preview removed |
| Auto-route | route preview/working indicator | one route command | old route retained on failure |
| Change radius | corners update and clamp | one wire edit | invalid input rejected |
| Change pattern | layered color updates | one wire edit | staged style reverted |
| Drag auto label | label follows pointer, leader appears | world-pinned label command | auto placement restored |
| Reset label | best candidate preview | one label command | none |
| Window marquee | contained items highlighted | selection update | rectangle clears |
| Crossing marquee | intersected items highlighted | selection update | rectangle clears |
| Escape gesture | preview disappears | no command | base restored |
| Undo | previous document and derived scene | history pointer moves | no-op when empty |

### 29.3 Blocked edits

A blocked edit shall explain the reason and offer only valid choices. Example: removing a connected pin shows affected wires and buttons for Cancel, Detach endpoints, or Remap by label. It shall not fail silently.

### 29.4 Diagnostics do not steal data colors

Errors and warnings are separate visual channels. An invalid green/yellow striped wire remains green/yellow striped with an outer diagnostic dash or badge.

## 30. Performance and scheduling

### 30.1 Response classes

| Class | Target | Examples |
|---|---:|---|
| Pointer feedback | same animation frame | cursor, drag transform, marquee, target halo |
| Fast derived preview | 16–33 ms typical | local reroute, snap guides, nearby label reflow |
| Deferred exact solve | worker/debounced | full reroute, global label solve, full DRC |
| Persistence | after commit | SQLite transaction, journal, autosave |

### 30.2 Incremental invalidation

A component move invalidates:

- its geometry;
- attached wires;
- wires whose obstacle corridor intersects old/new bounds;
- labels owned by or colliding with affected objects;
- nearby crossing records;
- local spatial index cells.

It shall not require a full-document rebuild for every pointer frame.

### 30.3 Large scenes

For large documents:

- cull rendering outside viewport plus margin;
- keep spatial indexes for hit testing and obstacle queries;
- cache text metrics;
- use simplified preview routes during drag;
- move exact auto-routing and label solving to workers;
- batch DOM/SVG updates or use Canvas/WebGL for dense wire layers;
- preserve a deterministic SVG export path even if the interactive renderer is accelerated.

### 30.4 Graceful degradation

When exact preview exceeds budget, keep component movement smooth, show a temporary direct/orthogonal approximation, and mark it as preview. Run exact route on release. Do not freeze the whole application.

## 31. Validation and DRC for editor geometry

The editor-level validator shall detect at least:

- missing/stale ordering references;
- duplicate port IDs;
- bank references to absent ports;
- port assigned to multiple incompatible banks;
- overlapping explicit ports;
- component content overflow;
- missing endpoint component or port;
- connection-limit violation;
- disallowed electrical class or wire kind;
- unresolved off-page reference;
- unrouted wire;
- fallback or invalid route;
- diagonal segment in an orthogonal route;
- segment below minimum length;
- route obstacle violation;
- effective radius exceeding geometric limits;
- impossible hard constraint;
- missing label owner;
- invalid label anchor;
- label collisions and page overflow;
- ambiguous crossing or accidental junction;
- inaccessible color contrast where measurable.

Issues carry stable ID, severity, code, message, affected entity IDs, and optional suggested action. Selecting an issue focuses the affected geometry without changing engineering data.

## 32. Accessibility and alternate input

### 32.1 Keyboard editing

At minimum:

- Tab/Shift+Tab traverse shell controls;
- a dedicated mode traverses canvas entities;
- arrow keys nudge selected movable objects;
- Shift+arrow uses a larger step;
- Enter opens inspector or starts connection depending on context;
- Delete removes selected items through the same mutation policy as pointer actions;
- R rotates selected components;
- Ctrl/Cmd+Z undo;
- Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y redo;
- Escape cancels active gesture or clears selection.

### 32.2 Announcements

Screen-reader announcements should include selection, blocked edit reason, valid/invalid target, connection created, label overlap, undo/redo result, and validation count changes. Pointer-only hover information must also be available through focus or inspector.

### 32.3 Touch and pen

Touch uses larger target radii, explicit pan mode, and long-press or handle-based route editing to avoid accidental moves. Pen pressure must not alter engineering wire width unless a non-engineering annotation tool explicitly uses it.

### 32.4 Reduced motion

When reduced motion is enabled, omit animated route morphing, viewport fly-to, and pulsing diagnostics. State changes remain immediate and clear.

## 33. Offline-first persistence and database integration

### 33.1 Core package boundary

The TypeScript module performs no network access, telemetry, update checks, remote font loading, or filesystem writes. It operates on in-memory serializable documents.

### 33.2 Host persistence mapping

A host may persist the editor document in:

- the project SQLite schema;
- IndexedDB for a browser-only offline application;
- Electron/Tauri filesystem storage;
- a JSON project fragment;
- an embedded application database.

The production RouteCore project database remains authoritative. The editor document is mapped to normalized entities and presentation records within one transaction.

### 33.3 Commit transaction

On editor commit, the host should:

1. receive command and resulting impact;
2. validate project preconditions;
3. write semantic changes and presentation constraints in one SQLite transaction;
4. append command/audit record;
5. update project revision/hash;
6. checkpoint/autosave according to policy;
7. notify optional local adapters.

A persistence failure shall leave the in-memory editor in a clearly recoverable dirty state and provide retry/save-as options. It shall not silently discard the committed user action.

### 33.4 Offline assets

Fonts, icons, symbol artwork, help, templates, starter libraries, and schemas shall be packaged locally. External image URLs in imported SVG or component data shall be removed or embedded after explicit user approval.

## 34. Reusable TypeScript module specification

### 34.1 Package

Package name: `@routecore/harness-editor-core`  
Module format: ESM  
Language: strict TypeScript  
Runtime dependencies: none  
Framework dependencies: none  
License: MIT for the module code  

### 34.2 Public subsystems

| Subsystem | Public responsibility |
|---|---|
| `types` | Serializable document, geometry, event, render, validation, and interaction contracts |
| `component` | Builder helpers and dynamic component geometry |
| `geometry` | Vector, rectangle, transform, polyline, intersections, rounded path math |
| `routing` | Endpoint resolution, route patterns, obstacle search, segment edits, fan-out, crossings |
| `labels` | Anchor resolution, candidate scoring, pin/reset helpers |
| `colors` / `paint` | Color normalization, contrast, wire pattern resolution, diagnostic/selection layering |
| `commands` / `history` | Command objects, snapshots, undo/redo |
| `engine` | Stateful commands, previews, mutation policy, derived caches, events |
| `interaction` | Pointer/keyboard state machine and host-neutral events |
| `spatial` | Spatial index, hit testing, marquee selection |
| `snapping` | Grid/edge/center/port snapping and guide generation |
| `viewport` | World/screen transform, pan, focal zoom, fit |
| `scene` | Pure derivation pipeline |
| `svg` | Deterministic accessible SVG renderer |
| `serialization` | Deterministic serialization and parsing |
| `validation` | Editor-model and geometry validation |
| `sample` | Deterministic sample document and demo engine |

### 34.3 Minimal stateful integration

```ts
import {
  EditorInteractionController,
  HarnessEditorEngine,
  createSampleDocument,
  renderEditorSvg,
} from '@routecore/harness-editor-core';

const engine = new HarnessEditorEngine(createSampleDocument(), {
  autoRoute: true,
  validateOnChange: true,
});

const interaction = new EditorInteractionController(engine, {
  zoom: () => viewport.zoom,
});

engine.on('documentChanged', () => render());
interaction.on('snapGuidesChanged', ({ guides }) => {
  overlay.snapGuides = guides;
  render();
});

function render() {
  host.innerHTML = renderEditorSvg(engine.document, {
    geometries: engine.geometries,
    labelPlacements: [...engine.labelPlacements],
    selection: engine.selection,
    overlay,
  });
}
```

### 34.4 Headless derivation

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

### 34.5 Host adapter requirements

The host provides:

- bundled text measurer when exact metrics are required;
- viewport state and pointer coordinate conversion;
- DOM or native event wiring;
- inspector forms and dialogs;
- persistence;
- domain validation beyond generic editor checks;
- component/cable libraries;
- application theme and localization;
- worker scheduling when desired.

### 34.6 Extension points

A host should be able to add:

- custom component renderers while retaining common hit geometry;
- route obstacle providers;
- connection compatibility rules;
- new wire-pattern resolvers;
- custom labels and badges;
- domain DRC providers;
- command interceptors and authorization;
- alternative renderer adapters;
- selection filters and tool modes.

Extensions shall not mutate internal caches directly. They operate through declared inputs, commands, and events.

## 35. Module invariants

1. Source documents passed to the pure scene function are not mutated.
2. All entity references use stable IDs.
3. Component geometry contains every visible targetable port exactly once.
4. A port hidden by a collapsed bank is not reintroduced by fallback layout.
5. Orthogonal routes contain only horizontal/vertical segments except `direct` mode.
6. Corner radius never exceeds adjacent-segment capacity.
7. Port lead-in leaves along the outward normal.
8. Invalid connection release creates no wire.
9. Preview cancellation restores the exact base state.
10. One gesture creates at most one history entry.
11. Engineering wire paint remains present under selection and diagnostics.
12. Serialization is deterministic for equivalent documents.
13. No code path opens a socket or retrieves a remote asset.

## 36. Acceptance criteria for editor release

### 36.1 Dynamic component acceptance

- A 2-pin, 20-pin, and 200-pin component build with deterministic row order.
- Long designator, part number, pin label, and function expand or overflow according to declared rules without silent overlap.
- Four rotations and mirror combinations transform ports, normals, rows, labels, and hit regions consistently.
- Collapsed empty banks omit unconnected ports and retain connected ports.
- Removing a connected port correctly exercises prevent, detach, and remap policies.
- Group moving rotated components preserves attached endpoint geometry.

### 36.2 Wire acceptance

- Every route pattern produces deterministic output for a fixture.
- Automatic route avoids inflated component and keep-out obstacles.
- Lead-ins leave both ports along outward normals.
- Segment dragging creates stable orthogonal doglegs and serializable constraints.
- Radius clamps independently at short corners.
- Crossing bridge ownership is stable and independent of selection.
- Fan-out lanes do not overlap and retain order after small moves.
- Selection/error visualization preserves engineering color pattern.

### 36.3 Label acceptance

- Component, port, wire, free, and group anchors resolve correctly.
- Automatic labels avoid components and other labels where space exists.
- Previous placement prevents unnecessary side jumping.
- Dragging automatic label makes it world-pinned; reset restores automatic mode.
- Missing owner produces a repairable invalid-anchor finding.
- Monochrome export remains understandable from labels and patterns.

### 36.4 Interaction acceptance

- Hit priority selects port before body and route handle before wire.
- Pixel hit tolerance remains stable across zoom levels.
- Window and crossing marquee follow their different containment rules.
- Shift axis lock, Alt snap bypass, Escape cancel, undo, and redo work.
- Pointer cancel or capture loss restores the exact pre-gesture snapshot.
- Large drag remains responsive using preview degradation when required.

### 36.5 Offline acceptance

With all network interfaces disabled:

- package builds and tests;
- browser demo loads from a local static server;
- sample document routes and renders;
- SVG export completes;
- no request is attempted for fonts, scripts, icons, telemetry, or parts data.

## 37. Test strategy

### 37.1 Unit tests

- transforms and vector math;
- rectangle inflation/intersection;
- text measurement fallback;
- port ordering and bank collapse;
- body measurement;
- endpoint resolution;
- each route pattern;
- obstacle avoidance;
- constraint handling;
- radius clamp;
- crossing detection;
- paint-layer resolution;
- label candidate scoring;
- snapping and viewport math;
- deterministic serialization.

### 37.2 Interaction tests

Feed synthetic pointer events to the framework-neutral controller and assert state, preview document, events, commit count, history labels, and rollback. Avoid relying only on browser screenshot tests for semantic correctness.

### 37.3 Property-based tests

Recommended properties:

- transform inverse round trips points;
- route points remain finite;
- orthogonal segments remain orthogonal;
- effective radii are nonnegative and within bounds;
- moving by delta then negative delta restores geometry within epsilon;
- serialization parse/serialize round trip preserves semantics;
- hit test never returns hidden entities;
- preview cancel restores deep equality.

### 37.4 Visual regression tests

Render deterministic SVG fixtures for:

- dense connector banks;
- four rotations and mirrors;
- all wire patterns;
- crossings and bridges;
- route handles and snap guides;
- labels with leaders and collisions;
- light, dark, high-contrast, and monochrome themes;
- print view without editor chrome.

Pixel diff is useful but shall be paired with semantic SVG assertions so harmless font rasterization differences do not hide model defects.

### 37.5 Performance fixtures

Maintain small, typical, large, and stress fixtures. Measure component geometry build, route solve, label solve, hit query, SVG generation, and interaction preview. Record percentile timing, not only average.

## 38. Default independent editor profile

| Setting | Suggested default |
|---|---:|
| Grid spacing | 10 world units |
| Major grid interval | 5 minor cells |
| Hit tolerance | 6 px |
| Port target diameter | 14 px minimum |
| Component handle size | 10 px |
| Drag threshold | 4 px |
| Snap acquisition | 7 px |
| Snap release | 10 px |
| Wire clearance | 12–16 world units |
| Port lead-in | 20–28 world units |
| Minimum segment | 6–10 world units |
| Requested schematic radius | 8–12 world units |
| Wire bridge radius | 4–6 px or profile equivalent |
| Label gap | 6–10 world units |
| Local label stability weight | greater than ordinary distance weight |
| Typical exact route preview budget | 16–33 ms |
| Search-node budget | host/fixture dependent, bounded |

These are original RouteCore defaults and should be tuned through usability testing rather than copied from another product.

## 39. Implementation sequence

### Phase E0 — Geometry foundation

- common types and IDs;
- coordinate transforms;
- component measurement;
- port frames and hit regions;
- deterministic sample fixtures;
- unit tests.

### Phase E1 — Stateful manipulation

- engine, command history, preview transaction;
- selection and hit testing;
- component drag, rotate, resize;
- snapping and viewport;
- basic SVG rendering.

### Phase E2 — Wiring

- connection validation;
- endpoint creation/reconnection;
- route patterns and obstacle solver;
- manual segment and waypoint editing;
- radius and crossings;
- fan-out and trunk patterns.

### Phase E3 — Labels and visual semantics

- anchors and automatic solver;
- manual/world-pinned labels;
- leaders;
- engineering paint patterns;
- diagnostics and accessibility.

### Phase E4 — Host and persistence integration

- React/Tauri host adapter;
- inspector and component creator;
- SQLite command transaction mapping;
- workers and incremental invalidation;
- export profiles;
- full offline test.

### Phase E5 — Advanced harness projections

- bundles, pairs, cable sheaths, breakouts;
- layout-specific physical constraints;
- documentation sheets;
- bulk connection matrix;
- assembly synchronization overlays;
- performance acceleration.

## 40. Non-goals of the reusable core

The module delivered with this specification is an editor kernel, not a complete commercial application. It intentionally does not include:

- project database implementation;
- React component library or docking shell;
- proprietary or scraped parts catalogs;
- BOM and manufacturing calculation rules;
- user accounts, cloud collaboration, or licensing;
- PDF rasterization engine;
- domain-specific electrical compatibility database;
- final brand assets;
- pixel-for-pixel reproduction of any competitor interface.

Those are host-product responsibilities described in the wider clean-room package.

## Appendix A. Detailed mutation-impact contract

A committed component edit should return an impact summary containing:

- changed component IDs;
- changed/removed/added port IDs;
- rerouted wire IDs;
- invalidated wire IDs;
- detached wire IDs;
- moved label IDs;
- overlapping label IDs;
- warnings and policy decisions.

The host uses this data for a pre-commit impact dialog, status message, audit log, tests, and optional synchronization.

## Appendix B. Example route constraint ownership

| Constraint | World owner | Source owner | Target owner |
|---|---|---|---|
| Waypoint | remains fixed on component move | moves with source frame | moves with target frame |
| Corridor | fixed page/trunk corridor | source-relative breakout | target-relative breakout |
| Locked segment | fixed manufacturing/document route | source-local segment | target-local segment |
| Avoid rectangle | page keep-out | source accessory keep-out | target accessory keep-out |

## Appendix C. Example visual state stack

```text
wire selected + warning + striped engineering color

outer 8 px translucent selection halo
outer 6 px warning dash
outer 5 px contrast outline
base 4 px red stroke
inner 1.5 px white dashed stripe
```

The same principle applies to components: selection and diagnostics wrap the body rather than replacing fill, header color, pin state, or component-specific markings.

## Appendix D. Clean-room review checklist for editor work

- Requirement links to public behavior evidence or is marked independent.
- No copied screenshot, icon, logo, CSS, source bundle, text, or proprietary catalog data enters production.
- Visual tokens and compositions are original.
- Algorithm and tests were authored from this specification and general engineering knowledge.
- Stable IDs and transaction behavior are tested.
- Default operation is fully offline.
- Every major direct-manipulation path has commit, cancel, undo, validation, and accessibility behavior.
