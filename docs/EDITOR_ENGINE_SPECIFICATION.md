# RouteCore Visual Editor Engine Specification

**Document ID:** RouteCore-EDITOR-002  
**Revision:** 2.0  
**Status:** clean-room implementation specification  
**Default deployment:** fully offline  
**Companion implementation:** `packages/harness-editor-core`

## 0. Purpose and normative language

This document defines the visual-editor subsystem for an offline cable, wiring-harness, and electrical interconnect CAD application. It expands the product-level clean-room specification into implementation-level rules for dynamic component construction, pin banks, labels, conductor and bundle geometry, routing, bend radii, connection handling, interaction feedback, selection, snapping, undo, rendering, persistence, accessibility, performance, and host integration.

The editor is intended to provide workflow outcomes comparable to publicly observable harness-CAD behavior without reproducing private source, private algorithms, protected assets, branding, screenshots, or undocumented internals. Every algorithm and data contract below is an independent design.

The words **shall**, **must**, and **required** denote release requirements. **Should** denotes a strongly recommended default that may be changed only with a recorded design reason. **May** denotes an optional capability.

## 1. Clean-room evidence boundary

### 1.1 Publicly observed behavior

Public Splice CAD documentation establishes that its canvases include synchronized plan/layout and schematic contexts, components and pins, connection creation, route anchors, branch and bundle operations, box selection and group repositioning, shared zoom/pan behavior, configurable grids, and component/cable creator editors. Those public behaviors are legitimate requirements evidence.

The public desktop repository describes desktop and offline-related behavior while also indicating that production implementation source is private. The implementation in this package therefore does not claim or infer Splice CAD's private architecture, backend, database schema, route solver, geometry representation, command model, or renderer.

### 1.2 Independent design decisions

The following are RouteCore designs, not observations of private implementation:

- sparse orthogonal visibility-grid routing with A* search;
- explicit route penalty function;
- component blueprint and pin-bank geometry contracts;
- label candidate scoring and hysteresis;
- immutable preview transaction semantics;
- layered wire-paint representation;
- SQLite editor extension schema;
- TypeScript package API and source organization;
- SVG scene layering and crossing-bridge rendering;
- route and label cache invalidation hashes;
- worker protocol and performance budgets.

### 1.3 Visual differentiation

The application shall use original colors, dimensions, typography, iconography, motion, panel arrangement, component glyphs, handle forms, and branding. Public screenshots may be used only to understand workflow categories, not as pixel references. The implementation shall be reviewed against a differentiation checklist before release.

## 2. Editor design goals

The editor shall optimize for the following, in priority order:

1. **Engineering truth preservation.** Visual edits must never silently change or destroy electrical connectivity.
2. **Predictable direct manipulation.** The object under the pointer must respond immediately and remain attached to dependent geometry.
3. **Stable diagrams.** Small edits should produce small visual changes; routes and labels should not jump without need.
4. **Dense readability.** Components, labels, and wires should remain distinguishable at engineering-document density.
5. **Recoverability.** Every committed gesture is one undo step; cancelled gestures restore the exact prior state.
6. **Offline determinism.** Identical input and editor version should produce identical geometry without network access.
7. **Framework independence.** The core should work with SVG, Canvas2D, WebGL, PDF, native renderers, workers, test runners, and CLI tools.
8. **Scalability.** The same model should support tens of entities interactively and thousands through incremental derivation and viewport culling.
9. **Accessible alternatives.** Every pointer operation must have a keyboard and inspector-based path.
10. **Clean persistence.** Semantic intent and manual constraints are authoritative; rebuildable geometry is cache data.

## 3. Architectural decomposition

### 3.1 Required layers

```text
Application shell
  ├── project tree / tabs / inspectors / dialogs / command palette
  ├── persistence adapter and local SQLite transaction boundary
  └── optional domain synchronization
          │
Domain adapter
  ├── maps components, pins, conductors, bundles, notes, pages
  ├── preserves stable IDs and engineering invariants
  └── converts editor commands to domain commands
          │
Visual editor kernel
  ├── editor document
  ├── component geometry builder
  ├── routing engine
  ├── label placement engine
  ├── validation
  ├── command history and preview transactions
  ├── hit testing, snapping, selection, interaction state machine
  └── scene derivation
          │
Renderer adapter
  ├── SVG reference renderer
  ├── optional Canvas/WebGL renderer
  ├── print/PDF adapter
  └── accessibility semantic tree
```

The domain/database layer must not depend on browser DOM types. The editor kernel must not depend on the application shell, a network client, or a UI framework. The renderer may depend on the editor kernel but shall not mutate it.

### 3.2 Authoritative and derived state

Authoritative editor state includes:

- component identity and semantic properties;
- view placement, rotation, mirroring, manual size policy;
- stable port identity and pin-bank membership;
- wire endpoints and route intent;
- explicit route constraints and locks;
- wire appearance semantics;
- label text, anchor, mode, offset, and manual position;
- page/view settings that affect appearance;
- command revision.

Derived state includes:

- component body and row rectangles;
- transformed port centers, normals, tangents, and hit bounds;
- routed polyline points and safe corner radii;
- wire crossing ownership;
- automatic label positions and collision scores;
- spatial indexes;
- rendering paths;
- validation results that can be recomputed;
- content bounds.

A cache may store derived state for first-paint performance, but cache records shall include a content hash and algorithm version. Stale cache data must never override semantic input.

### 3.3 Pure and stateful APIs

The module shall provide both:

- a pure `deriveEditorScene(document, options)` pipeline for workers, exporters, tests, and stateless hosts;
- a stateful `HarnessEditorEngine` with history, preview transactions, selection, events, and mutation policies.

The same geometry, routing, placement, and validation functions shall power both paths.

## 4. Coordinate systems and precision

### 4.1 Coordinate spaces

The editor uses four explicit spaces:

1. **Document space:** persistent logical units for component placements, waypoints, and manual labels.
2. **Component-local space:** origin at the unrotated component body's upper-left; used during dynamic construction.
3. **Viewport/screen space:** CSS pixels used for pointer input and constant-size handles.
4. **Engineering space:** millimetres, inches, or another project unit used by domain measurements and export.

No API may accept an ambiguous `x`/`y` pair without documenting its space. Public types use `Point`, `Rect`, and names such as `screenPoint`, `worldPosition`, or `x_lu` in persistence.

### 4.2 Component position convention

A `ComponentNode.position` is the world-space center of its unrotated body. This makes orthogonal rotation stable because rotation does not change the semantic anchor. The builder transforms local points around the body center.

### 4.3 Numeric policy

The TypeScript reference uses finite JavaScript numbers for document geometry. A production database stores persistent coordinates as signed 64-bit integer logical units. The adapter shall reject NaN, infinity, negative dimensions, and values outside the project coordinate range.

Geometry comparisons use a named epsilon. Screen tolerances convert to world units as:

```text
worldTolerance = screenTolerancePx / max(zoom, epsilon)
```

This preserves a constant perceived hit area at different zoom levels.

### 4.4 Viewport transform

For viewport pan `P`, zoom `z`, and world point `W`:

```text
screen = (world - pan) * zoom
world  = screen / zoom + pan
```

Focal-point zoom shall preserve the world point under the pointer. Given old viewport `V`, screen focal point `F`, and zoom factor `k`:

1. calculate `worldBefore = screenToWorld(F, V)`;
2. set `newZoom = clamp(V.zoom * k)`;
3. solve `newPan` so `worldToScreen(worldBefore, newViewport) == F`.

## 5. Scene graph and visual layers

### 5.1 Required layer order

The reference scene shall render in this order:

1. background;
2. minor and major grid;
3. visual groups and keep-out regions;
4. bundle sheaths and route corridors;
5. wires/conductors;
6. wire crossing bridges;
7. components and branch points;
8. labels and notes;
9. selection outlines;
10. route and resize handles;
11. transient overlays: marquee, guides, connection preview, tooltips, diagnostics.

Layer order shall be explicit. A wire z-order may change relative to another wire, but engineering wires shall not render above edit handles or transient feedback.

### 5.2 Semantic versus transient elements

Semantic elements belong to the document or domain model. Transient elements belong to interaction state. A marquee rectangle, hover halo, snap guide, drag ghost, or target preview must not be serialized into project data.

### 5.3 Screen-constant elements

Port hit targets, selection handles, and diagnostic badges should remain approximately constant in screen pixels. SVG may use `vector-effect="non-scaling-stroke"` for strokes, while a Canvas/WebGL renderer explicitly scales geometry. The visible port dot may be smaller than the interactive hit target.

### 5.4 Low-detail levels

The renderer shall support semantic zoom levels:

- **far:** component silhouette, designator, major bundles only;
- **overview:** body, title, connection sides, major wire colors;
- **normal:** pin labels, functions, wire labels, route corners;
- **detail:** pin rows, secondary text, handles, dimensions, diagnostics.

Hiding details due to zoom must not modify semantic visibility or persistence.

## 6. Dynamic component model

### 6.1 Component composition

A component is a composition of:

- body rectangle and style;
- header and optional footer;
- title and optional subtitle;
- zero or more pin banks;
- stable ports/pins;
- optional internal rows, badges, status marks, or custom adornments;
- routing keep-out padding;
- selection and edit handles.

The body is not a fixed image. Its geometry is generated from content, layout rules, view overrides, and connection-dependent visibility.

### 6.2 Component categories

The core supports connector, terminal point, termination, generic device, inline device, passive/protection device, branch point, and custom categories. Categories select defaults only; they do not create separate rendering engines.

### 6.3 Stable identity

A component has a stable UUID or namespaced ID. Each port has its own stable ID. Designators such as `J1`, visible pin labels such as `A2`, and array positions are mutable presentation values and must never be used as persistent foreign keys.

### 6.4 Component layout rules

Each component has:

- minimum and optional maximum size;
- body padding;
- header and footer height;
- base row height and gap;
- gap between pin banks;
- auto-width and auto-height flags;
- manual-size preservation policy;
- port lead-in distance;
- routing obstacle padding;
- component-label gap;
- optional category-specific style.

The engine shall expose these as data, not hard-coded renderer constants.

### 6.5 Pin bank model

A pin bank defines:

- stable bank key;
- side: north, east, south, or west;
- ordered port IDs;
- flow: forward, reverse, or center-out;
- row/column gap;
- edge padding;
- optional fixed label and function column widths;
- collapsed state;
- `collapseEmpty` state;
- optional bank header;
- style overrides.

A port may belong to at most one bank in a view. Ports not assigned to a bank may be laid out by a deterministic fallback grouped by side.

### 6.6 Port model

A port stores:

- stable ID;
- visible label, function, and detail;
- semantic electrical class;
- side and order;
- connection policy;
- optional normalized side fraction;
- tangential and outward-normal offsets;
- visibility and minimum row height;
- optional metadata.

Derived port geometry contains world center, outward normal, tangent, side after transform, row bounds, text bounds, and a minimum hit rectangle.

### 6.7 Connection policy

The policy can constrain:

- maximum connection count;
- whether two ports on the same component may connect;
- allowed wire kinds;
- compatible electrical classes;
- required mate group;
- domain-specific termination rules.

Invalid targets remain visible but use an invalid-target state and a concise reason. The user should not discover rejection only after pointer release.

## 7. Dynamic component construction algorithm

### 7.1 Inputs

The builder consumes:

- `ComponentNode`;
- connected-port set for collapse rules;
- text measurer;
- view density and minimum hit size;
- font/style tokens;
- optional definition snapshot.

The text measurer is injectable. The reference implementation includes a deterministic approximate measurer for headless/offline use. A browser host may provide actual font metrics but shall bundle the required fonts or use stable system-font rules.

### 7.2 Visible port resolution

For every bank:

1. resolve IDs to existing ports;
2. omit ports whose semantic `visible` flag is false;
3. if the bank is collapsed, omit all bank rows;
4. if `collapseEmpty` is true, retain only connected, warned, or explicitly forced ports according to view policy;
5. apply bank flow ordering;
6. preserve stable IDs throughout.

Ports intentionally omitted by a collapsed bank must not be reintroduced by the fallback unbanked-port pass.

### 7.3 Content measurement

For each visible port, measure primary label and optional function/detail. Determine:

```text
rowHeight_i = max(baseRowHeight,
                  primaryTextHeight,
                  secondaryTextHeight,
                  port.minimumRowHeight)
```

For vertical banks, determine maximum label and function column widths. For horizontal banks, determine per-port cell width.

### 7.4 Auto-size calculation

A recommended independent calculation is:

```text
requiredTitleWidth = max(titleWidth, subtitleWidth) + leftPadding + rightPadding + badgeReserve

verticalBankHeight = headerHeight + footerHeight
                   + topPadding + bottomPadding
                   + sum(rowHeight_i)
                   + sum(rowGap_i)

verticalBankWidth = labelColumnWidth + functionColumnWidth
                  + leftPadding + rightPadding + portGlyphReserve

horizontalBankWidth = leftPadding + rightPadding
                    + sum(cellWidth_i)
                    + sum(cellGap_i)

W_auto = max(minWidth, requiredTitleWidth,
             all vertical-bank width requirements,
             all horizontal-bank width requirements)

H_auto = max(minHeight,
             all vertical-bank height requirements,
             header/footer and horizontal-bank requirements)
```

If opposing banks need independent columns, the builder reserves both sides and a center content region. If manual size is preserved, final dimensions are the greater of required auto size and manual size unless an explicit fixed-size policy is active.

Maximum dimensions do not justify text overlap. When content exceeds a hard maximum, the builder shall emit an overflow diagnostic and use one of: scroll/virtualization in a detail editor, multiple banks, elision with tooltip, or expanded component mode.

### 7.5 Port distribution

For an east/west bank, ports distribute along the usable vertical interval between header/footer and edge padding. For a north/south bank, ports distribute along the usable horizontal interval. With `n` ports and no explicit side fraction:

```text
fraction_i = 0.5                         when n == 1
fraction_i = i / (n - 1)                 otherwise
```

The local center is shifted by the port's tangential and normal offsets. The complete local point, normal, tangent, row rectangle, and text anchors transform with rotation and mirroring.

### 7.6 Rotation and mirroring

Rotation is limited to 0, 90, 180, or 270 degrees in the reference module. A host may add arbitrary rotation only if the route engine and text rules support it.

The transform order is:

1. translate local point to body-center coordinates;
2. apply mirror X/Y;
3. apply rotation;
4. translate to world center.

Normals and tangents use the vector form of the same transform. Port side is rotated consistently.

Title and subtitle behavior shall be deliberate. For quarter-turn symbols, the reference SVG rotates header text with the transformed header strip to prevent title/subtitle collision. A host may keep text upright only if it recomputes a sufficiently large upright label region.

### 7.7 Component geometry output

The builder returns:

- unrotated local body;
- transformed world body and total bounds;
- header/footer bounds;
- port geometry map;
- row bounds;
- title/subtitle anchor points;
- rotation metadata.

The result contains no DOM nodes and may be structured-cloned to a worker.

## 8. Component edit response model

### 8.1 Universal edit sequence

Every component edit follows this sequence:

1. validate the requested semantic change;
2. open a preview transaction for a direct gesture or a form transaction for an inspector edit;
3. apply the change to a draft snapshot;
4. rebuild component geometry;
5. determine moved, added, removed, and hidden ports;
6. update attached endpoint positions;
7. reroute affected wires using preview quality;
8. reproject wire-attached labels and reflow automatic component labels;
9. update hit index and validation;
10. render feedback;
11. on commit, run exact route/placement as configured and write one command;
12. on cancel/error, restore the exact pre-edit snapshot.

The editor shall expose an impact report listing changed components, changed ports, rerouted or invalidated wires, detached wires, moved or overlapping labels, and warnings.

### 8.2 Move

During component drag:

- body, header, rows, ports, labels, and attached wire endpoints move in the same frame;
- attached wires use a local rubber-band or fast orthogonal preview;
- locked world waypoints remain fixed;
- source-relative constraints move with the source; target-relative constraints move with the target;
- automatic labels reflow only when needed; manual labels preserve their selected anchoring mode;
- snap guides appear without modifying the semantic component until preview state is applied;
- pointer release commits one move command regardless of frame count.

A group drag preserves relative placement. Locked components remain fixed; the host must either exclude them with a message or block the group gesture, not move them partially without explanation.

### 8.3 Resize

Manual resize handles operate in component-local axes. The preview shall show whether the size is:

- above content minimum;
- clamped to minimum/maximum;
- fixed and causing overflow;
- auto-sized and therefore not manually editable.

When a body edge moves, ports attached to that side move with it. Routes reattach from the transformed centers and normals. Internal row spacing follows the component's distribution policy.

### 8.4 Rotate

Rotation transforms body, rows, ports, normals, tangents, and connection lead-ins together. The route solver must not keep the old endpoint exit direction. Automatic labels choose new candidates; owner-relative labels rotate with or without their offset according to an explicit label policy. World-pinned labels do not move.

The rotation preview should retain the component center. If the rotated body collides with another component, show a warning and permit or reject according to project settings. Collision does not silently move other components.

### 8.5 Mirror

Mirroring changes port ordering and outward vectors. The editor shall preview designator orientation and bank flow. Engineering pin identity does not change merely because the symbol is mirrored.

### 8.6 Edit title, subtitle, pin label, or function

Text edits stage in the inspector or inline editor. As text changes:

- measure the staged value;
- expand body or columns according to auto-size policy;
- shift only geometry that must move;
- preserve component center by default;
- reroute attached wires only when port centers changed;
- update automatic labels and overflow diagnostics;
- merge rapid keystrokes into one history entry using a merge key and timeout.

Invalid or incomplete form text may remain staged in the form but shall not enter the committed model until valid.

### 8.7 Add pin

Adding a pin creates a stable ID before rendering. The new row appears at the declared bank/order. Auto-size may expand the body. Existing port IDs and connections remain unchanged. If expansion moves existing ports, only affected wires reroute. The new port becomes a valid target immediately in preview.

### 8.8 Reorder pins

Reordering changes presentation order, not identity. Attached wires follow their ports. A bulk reorder preview should animate or ghost old-to-new positions when reduced-motion is off. Route lane ordering should use the new port order only after commit unless the user explicitly requests live lane reordering.

### 8.9 Remove unused pin

An unused pin may be removed as one command. The body may shrink. Nearby routes and labels reflow. The operation must preserve all unrelated port IDs.

### 8.10 Remove connected pin

The command requires one explicit policy:

- **prevent:** reject before mutation, focus the affected wires, and explain how many connections block removal;
- **detach:** convert each endpoint to a free endpoint at its last resolved world position, mark it unrouted or draft, and report detached wires;
- **remap by label:** connect to a replacement port with the same explicit visible label or mapping key, then detach any unmatched endpoint.

Index-based remapping is prohibited. Silent wire deletion is prohibited.

### 8.11 Collapse pin bank

Collapse is a view operation. It hides rows and may reduce body size but does not delete pins or connections. Attached wires connect to a bank-summary attachment policy chosen by the view, or the bank remains expanded when connected-port visibility is mandatory. The default engineering view keeps connected ports visible even when empty pins collapse.

### 8.12 Change component definition

Replacing a definition produces a diff containing retained, added, removed, and modified ports, bank changes, symbol changes, and part metadata changes. The user selects the connected-port policy before commit. The preview must show expected reroutes, detached endpoints, label movement, and BOM/domain effects supplied by the host.

## 9. Port attachment and wire-to-component geometry

### 9.1 Port frame

Every port provides:

- center `C`;
- outward unit normal `N`;
- tangent `T`;
- component ID and port ID;
- transformed side;
- hit bounds;
- optional preferred lead-in length and connection zone.

The initial wire segment is:

```text
leadPoint = C + N * max(leadIn, clearance + minimumSegment)
```

This segment is allowed to cross the owning component's inflated keep-out because it is the intended exit channel. The remaining route shall treat component bodies and keep-outs as obstacles.

### 9.2 Connection magnetism

A port target has three nested zones measured in screen pixels:

- **discovery zone:** target is highlighted and status text appears;
- **magnetic zone:** preview endpoint snaps to the port center;
- **commit zone:** pointer release commits if validation succeeds.

The visible pin dot may be 4–6 px in radius while the target zone is at least the configured accessible target size. When ports overlap at low zoom, a target chooser or temporary magnifier shall replace ambiguous automatic selection.

### 9.3 Valid target feedback

A valid target displays:

- positive halo independent of wire color;
- snapped endpoint preview;
- future route;
- generated wire name/signal defaults when available;
- connection count change;
- optional concise status such as `Connect W17 to J2.4`.

An invalid target displays a negative halo and a reason such as connection limit, incompatible class, forbidden self-connection, missing mate, or locked/read-only state. The preview must retain the source until cancel.

### 9.4 Occupied targets

When a target permits only one connection and is occupied, the default is reject. Configurable alternatives are:

- move existing connection;
- swap endpoints;
- insert an explicit splice/junction;
- open a choice menu;
- increase policy only through a separate explicit edit.

Proximity alone never creates electrical continuity.

### 9.5 Reconnection

Dragging an existing endpoint starts from the current connection but does not remove it from the committed model. During preview, the old target can show a ghost. Invalid release restores the old endpoint. Valid release commits one reconnect command and reroutes the wire.

## 10. Label system

### 10.1 Label classes

The editor supports:

- component designator/title/subtitle;
- pin label, function, and detail;
- wire ID, signal, gauge, color, and length;
- bundle name, covering, and branch label;
- splice and mate labels;
- off-page references;
- free notes and custom labels.

Built-in component-internal text may be generated by the component renderer, while external labels use the common label model.

### 10.2 Label anchor

A label anchor identifies owner kind, owner ID, optional port ID, optional wire fraction or segment index, explicit point, and preferred candidates. The anchor is semantic; the automatic placement result is derived.

Wire fraction is normalized over route length, not point-array index. When a route changes, the label reprojects to the same path fraction unless a segment lock is explicit.

### 10.3 Placement modes

- **auto:** the solver chooses a candidate.
- **owner-relative:** an offset from the resolved anchor is authoritative.
- **world-pinned:** an absolute world position is authoritative.

Dragging an automatic label defaults to `world-pinned`. A modifier or inspector command may choose `owner-relative`. `Reset automatic position` clears the manual position but preserves text/style.

### 10.4 Component candidates

Default candidates are north, north-east, east, south-east, south, south-west, west, north-west, inside header, and inside body. Candidate order may be overridden per label role. Designators usually prefer north or inside header; long manufacturing notes prefer east/west with leaders.

### 10.5 Wire candidates

Wire labels use path fractions and candidate offsets on both normals of the selected segment. Additional candidates may move to neighboring long segments. Text remains horizontal by default. `follow-segment` is permitted only when readability orientation is normalized so text is not upside-down.

### 10.6 Label bounds

The placer measures primary and secondary text, padding, border, and line height. Bounds are axis-aligned after final text orientation for collision purposes. The host shall use the same bundled font metrics for placement and rendering where exact export fidelity matters.

### 10.7 Candidate scoring

A recommended score is:

```text
score = intrinsicCandidateCost
      + anchorDistance * distanceWeight
      + componentOverlapArea * componentAreaWeight
      + componentCollisionCount * componentFixedPenalty
      + labelOverlapArea * labelAreaWeight
      + labelCollisionCount * labelFixedPenalty
      + wireIntersectionCount * wirePenalty
      + viewportOverflowPenalty
      + leaderLengthPenalty
      + orientationPenalty
      + previousPositionDistance * hysteresisWeight
```

Hard forbidden zones reject a candidate. Soft zones add cost. Labels place in deterministic priority order, then stable ID order. High-priority designators place before secondary wire details.

### 10.8 Hysteresis and stability

The solver shall bias the previous valid candidate and position. A candidate changes only when the new score improves by a threshold or the previous position becomes invalid. This prevents labels from alternating sides after a one-pixel edit.

### 10.9 Collision response

When no collision-free candidate exists:

1. use the lowest-score candidate;
2. mark placement `overlap`;
3. show a warning outline only when diagnostics are enabled;
4. list colliding IDs;
5. offer fixes: move owner, pin label, shorten text, change priority, allow leader, suppress secondary text, or rerun page placement.

The solver must not silently hide a required engineering label.

### 10.10 Component edit behavior

After a component edit:

- internal row text rebuilds with component geometry;
- auto external labels re-solve;
- owner-relative labels follow the transformed anchor and preserve offset according to world/local policy;
- world-pinned labels remain fixed and may gain a leader;
- labels attached to removed ports enter invalid-anchor state or follow an explicit remap;
- wire labels reproject after reroute;
- one gesture still produces one history entry.

### 10.11 Leader lines

A leader appears when distance exceeds a role-specific threshold or when a manual label no longer touches its owner region. Leaders use a neutral style, remain below label text, and do not create electrical-looking junctions. The endpoint closest to the label should terminate at the label boundary rather than its center in production renderers.

## 11. Wire and route data model

### 11.1 Visual edge versus engineering conductor

The editor represents visual edges between two endpoints. A multi-endpoint conductor or net is rendered as a graph of edges and junctions referencing the same engineering identity. This avoids ambiguous polyline trees while preserving domain-level multi-endpoint semantics.

### 11.2 Endpoint kinds

- component port;
- free/flying endpoint;
- off-page endpoint;
- explicit junction/branch/splice endpoint.

A wire endpoint resolves to a point and optional outward normal. Missing references make the route invalid; they do not default to `(0,0)` silently.

### 11.3 Routing options

Each edge stores route pattern, clearance, grid/channel spacing, lead-in, requested corner radius, minimum segment, penalty weights, search budget, crossing policy, channel preference, route constraints, and optional dogleg/trunk coordinate.

### 11.4 Route result

The result contains:

- ordered points;
- derived segments and axes;
- per-corner safe radii;
- length and bend count;
- crossing count;
- obstacle violation IDs;
- status: valid, fallback, or invalid;
- diagnostics;
- optional source revision.

The route result is cacheable but not authoritative.

## 12. Routing pattern semantics

### 12.1 Direct

One straight segment between endpoints. Use for annotations, short non-engineering links, or views where diagonal wires are explicitly permitted. Direct routes do not imply obstacle avoidance unless a separate direct-visibility check is enabled.

### 12.2 Orthogonal obstacle-aware

Horizontal/vertical segments found by the router. This is the default schematic pattern. The cost balances length, bends, crossings, proximity, route stability, and constraints.

### 12.3 Horizontal-first

Source to `(target.x, source.y)` to target. If already aligned, use one segment. It is deterministic and useful for previews or simple layouts, but it may intersect obstacles and should therefore produce diagnostics.

### 12.4 Vertical-first

Source to `(source.x, target.y)` to target. Same constraints as horizontal-first.

### 12.5 Horizontal dogleg

Route through a horizontal corridor `y = c`:

```text
source -> (source.x, c) -> (target.x, c) -> target
```

The coordinate is explicit or defaults to the midpoint. Useful for shared horizontal channels and service loops.

### 12.6 Vertical dogleg

Route through `x = c` with the analogous geometry.

### 12.7 Horizontal/vertical trunk

A trunk route is a dogleg whose shared coordinate has semantic importance across multiple edges. The trunk coordinate may be persisted and lane offsets assigned around it. Trunk and tap routing should preserve branch ordering to reduce crossings.

### 12.8 Manual

Manual routing connects endpoints through ordered constraints. The router orthogonalizes between constraints while respecting locked points and segments. A manually edited route is still validated against obstacles and minimum segment/radius rules.

### 12.9 Fan-out

Fan-out maps ordered source/target port pairs into separated lanes. Lane order derives from port order or explicit mapping. The algorithm must preserve pair identity and avoid introducing crossings merely due to parallel separation.

### 12.10 Bundle and cable display

A bundle may render as:

- one sheath stroke with a label;
- a sheath behind child conductor lanes;
- a collapsed trunk with endpoint fan-out;
- an expanded set of conductor routes;
- a physical layout path distinct from schematic conductor paths.

The user can switch display mode without changing electrical connectivity.

## 13. Independent orthogonal routing algorithm

### 13.1 Obstacle generation

Component body rectangles, keep-out zones, selected label bounds, group boundaries, and optional route corridors become obstacles. Component rectangles inflate by wire clearance plus half effective stroke width. Source and target components retain an exit channel through their port lead-in.

### 13.2 Sparse visibility grid

The reference router constructs candidate x/y coordinates from:

- source and target lead points;
- hard waypoint coordinates;
- obstacle left/right/top/bottom boundaries;
- channel coordinates just outside obstacle boundaries;
- outer escape coordinates;
- explicit corridor/trunk coordinates.

Candidate intersections inside hard obstacles are removed. Adjacent visible points in each row/column form graph edges when the segment does not cross an obstacle interior.

### 13.3 Search state

A search state includes graph node and incoming direction. Direction is required because bend cost depends on transition. A priority queue performs A* search.

### 13.4 Cost function

A recommended edge transition cost is:

```text
cost = segmentLength
     + (directionChanged ? bendPenalty : 0)
     + crossingCount * crossingPenalty
     + proximityPenalty(segment, obstacles)
     + reverseDirectionPenalty
     + instabilityPenalty(segment, previousRoute)
     - preferredChannelReward
```

The heuristic is Manhattan distance to target and must not overestimate the unpenalized remaining distance. Deterministic tie-breaking uses coordinate and stable IDs.

### 13.5 Constraints

Constraint kinds include waypoint, locked waypoint, locked segment, horizontal/vertical corridor, avoid rectangle, preferred rectangle, exit side, and trunk coordinate. Strength is soft, strong, or hard. Owner frame is world, source-relative, or target-relative.

Hard waypoints divide the route into stages. Hard avoid zones are obstacles. Soft preferences adjust cost. Locked segments survive auto-route unless the user explicitly clears them.

### 13.6 Search budget and fallback

The router has a node-expansion budget. If exhausted:

1. attempt deterministic horizontal-first and vertical-first alternatives;
2. choose the route with fewer violations, then shorter length, then stable tie-break;
3. mark status `fallback` or `invalid`;
4. retain diagnostics;
5. never claim obstacle-free validity without checking.

The host may offer a higher-quality worker solve after pointer release.

### 13.7 Route stability

When endpoints move slightly, prefer channels near the previous route. Locked/manual constraints always dominate. The router should not reorder parallel lanes unless required to restore validity. Stability is a weighted preference, not permission to cross obstacles.

### 13.8 Crossing ownership

After routes derive, detect interior horizontal/vertical crossings. Shared endpoints are junctions, not crossings. The edge with greater z-order owns the visual bridge. Equal z-order resolves by stable ID. Crossing bridges affect rendering only and do not create connectivity.

## 14. Bend radius and corner handling

### 14.1 Requested and effective radius

Each wire has a requested radius. Each corner gets an effective radius:

```text
r_effective <= r_requested
r_effective <= previousSegmentLength / 2
r_effective <= nextSegmentLength / 2
r_effective <= obstacle-safe radius
```

The first and last points have radius zero. Collinear points are removed before radius calculation.

### 14.2 Obstacle-safe radius

Rounding cuts inside a right-angle corner and can enter an obstacle even when the original polyline clears it. The reference implementation samples the quarter arc and performs a bounded binary search to reduce radius until samples remain outside hard obstacles. A production implementation may use exact arc/rectangle intersection.

### 14.3 Minimum segment diagnostics

If a segment is shorter than the configured minimum, the route remains visible but receives a warning. The editor may offer `straighten`, `merge bends`, or `reduce radius`. It must not silently delete a user-locked waypoint to fix the warning.

### 14.4 Rendering path

For an orthogonal corner `P`, with incoming/outgoing unit vectors, the renderer computes tangent points `P - incoming*r` and `P + outgoing*r`, draws a line to the first, then an SVG circular arc to the second. The sweep flag follows turn orientation.

### 14.5 Radius editing interaction

A radius field or handle updates all affected corners live. The inspector displays requested radius and, when clamped, the minimum effective radius with the limiting reason. Rapid field changes merge into one history command.

## 15. Wire color and line-pattern system

### 15.1 Engineering color is semantic

Wire insulation color, stripe, tracer, shield, or bundle sheath carries engineering meaning. Selection, hover, and validation shall not replace it. Those states render as independent outer channels.

### 15.2 Stroke precedence

From outermost to innermost:

1. selection/hover halo;
2. warning/error diagnostic dash;
3. contrast outline;
4. engineering color layers.

This preserves identification of a selected red/white-striped wire.

### 15.3 Solid pattern

One engineering stroke in the base color.

### 15.4 Stripe pattern

A full-width base stroke plus a narrower dashed overlay in stripe color. Repeat and stripe width are explicit. The overlay should use butt caps to resemble longitudinal/periodic marking rather than dots.

### 15.5 Tracer pattern

A base stroke plus a narrow repeating tracer with configurable tracer length and repeat. Rounded caps may be used.

### 15.6 Dual-color pattern

A secondary full-width stroke plus a narrower primary stroke according to a ratio. This is a visual convention; export metadata still records exact engineering color semantics.

### 15.7 Shield pattern

A wider, lower-opacity sheath plus optional core stroke. Additional drain or shield indicators may use markers, not ambiguous electrical junction symbols.

### 15.8 Custom pattern

An ordered list of stroke layers with color, width, opacity, dash, offset, and cap. Imported custom layers are validated and bounded. Raw CSS or SVG event attributes are not accepted.

### 15.9 Theme independence and contrast

The renderer may add a neutral outline when the engineering color has poor contrast against the canvas. It shall not modify the recorded color. Selection and validation tokens must remain distinguishable in light and dark themes and by more than hue alone.

### 15.10 Color descriptions

The accessibility tree and inspector expose text descriptions such as `red with white stripe`, not only swatches. The module includes contrast helpers using the WCAG relative-luminance calculation.

## 16. Route editing interactions

### 16.1 Segment hover and selection

A wire has a broad invisible hit stroke. Hover highlights the nearest segment. Selection reveals internal waypoint and optional segment handles while preserving engineering paint.

### 16.2 Segment drag

Dragging a horizontal segment changes its y coordinate; dragging a vertical segment changes x. Adjacent elbows update. When an endpoint segment is dragged, the anchored endpoint remains fixed and a dogleg is inserted. The preview writes no command. Release serializes manual constraints as one command.

### 16.3 Waypoint drag

A waypoint drag preserves orthogonality by moving adjacent segments or inserting necessary elbows. Shift may constrain one axis. Alt may temporarily bypass snapping. Locked waypoints require an explicit unlock action or modifier.

### 16.4 Add waypoint

Double-clicking or using `Add waypoint` inserts at the closest route fraction. The point snaps according to route settings and becomes a strong or hard constraint. The route recomputes immediately.

### 16.5 Remove waypoint

Removal previews the simplified route and any resulting obstacle violation. Locked waypoint removal requires confirmation. If the route becomes straight, redundant collinear points are removed.

### 16.6 Straighten

`Straighten segment` removes local unnecessary bends while preserving hard constraints. `Reset route` clears unlocked manual constraints and runs auto-route. `Reset all constraints` is a separate destructive action.

### 16.7 Corridor and trunk editing

A trunk handle translates the persisted trunk coordinate and all participating route taps. Lane order remains stable. If a lane becomes invalid, show it individually rather than moving the entire trunk without explanation.

### 16.8 Parallel lane spacing

Lane spacing is measured center-to-center and must account for effective stroke widths and selection outlines only for interaction, not persistence. Reordering lanes should minimize crossings at fan-in/fan-out. Users may lock lane order.

## 17. Snapping and guides

### 17.1 Candidate classes

Component drag snapping may use:

- grid coordinates;
- component left/right/top/bottom edges;
- component centers;
- port centerlines;
- guide lines;
- page margins and title block anchors.

Route edits additionally use existing route channels, port lead axes, and trunk coordinates.

### 17.2 Screen-space threshold

Candidate acceptance uses screen pixels so behavior remains stable across zoom. World threshold is `px / zoom`.

### 17.3 Absolute gesture delta

Snapping shall calculate an absolute delta from the gesture-start snapshot, not repeatedly modify the previous preview frame. This prevents cumulative rounding drift.

### 17.4 Priority

A recommended priority is exact port alignment, explicit guide, component alignment, route channel, then grid. When candidates are nearly equal, retain the previous active snap until hysteresis is exceeded.

### 17.5 Guides

Guides show source feature, target feature, coordinate, and optional spacing. They are transient and disappear on cancel/release. A guide should not obscure the object being aligned.

### 17.6 Modifiers

Default behavior:

- Shift: dominant-axis lock for component move;
- Alt: temporarily disable grid/smart snap;
- Ctrl/Cmd: optional duplicate-drag in hosts that implement cloning;
- configurable alternatives for platform conventions.

## 18. Hit testing and selection

### 18.1 Hit order

Recommended priority:

1. resize/rotate handles;
2. ports and connection targets;
3. route waypoints;
4. route segments;
5. labels;
6. component header/body;
7. broad wire stroke;
8. background.

Within a class, choose greater z-order, then smaller distance, then stable ID. Alt-click cycles overlapping hits.

### 18.2 Spatial index

The reference package includes a deterministic uniform-grid index. Hosts may replace it with an R-tree while preserving query semantics. Index bounds include effective hit tolerance.

### 18.3 Window and crossing marquee

- left-to-right: select entities fully contained in the rectangle;
- right-to-left: select entities intersecting it.

The host may allow a preference to disable direction semantics, but the current mode must be visible during drag.

### 18.4 Selection model

Selection stores typed references and a primary item. Multi-selection inspector shows the intersection of editable properties and mixed-value states. Selection is local UI state and normally not part of the engineering revision.

### 18.5 Group manipulation

Group move/rotate preserves relative coordinates. Alignment commands support left, center, right, top, middle, bottom, distribute, and equalize. The primary or selection bounds can be the reference.

## 19. Interaction state machine

### 19.1 Core states

The controller supports:

- idle/hover;
- marquee selection;
- component drag;
- component resize/rotate in an extended host;
- label drag;
- route segment drag;
- waypoint drag in an extended host;
- connection creation;
- endpoint reconnection;
- pan;
- inline text edit managed by host focus.

Only one primary pointer gesture owns a state. Additional touch pointers may be delegated to viewport pinch behavior.

### 19.2 Pointer normalization

The host converts browser/native input to a normalized event containing pointer ID, world point, screen point, button/buttons, pointer type, pressure, modifiers, and timestamp. Pointer capture shall be used by DOM hosts so a drag continues outside the initial element.

### 19.3 Coalesced events

A high-frequency host may consume coalesced pointer events for smoother pen/mouse input, but model derivation should use the newest event per animation frame. Predicted events may draw a visual-only ghost and must never enter history or persistence.

### 19.4 Drag threshold

Click and drag are distinguished by a screen-pixel threshold. Touch uses a larger threshold and may delay component drag to avoid accidental pan. The threshold is configurable.

### 19.5 Preview transactions

`beginPreview` captures the exact document. Every `updatePreview` rebuilds from that base snapshot plus absolute gesture input. `commitPreview` records before/after as one history entry. `cancelPreview` restores the base. This guarantees deterministic cancellation and avoids accumulating approximations.

### 19.6 Keyboard commands

Minimum keyboard support:

- Escape: cancel active gesture; otherwise clear selection;
- R / Shift+R: rotate clockwise/counter-clockwise;
- Delete/Backspace: remove with policy handling;
- Ctrl/Cmd+Z: undo;
- Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y: redo;
- arrows: nudge selected entities;
- Shift+arrows: larger nudge;
- Enter: open primary editor or commit inline edit;
- F: fit selection;
- Home: fit design;
- Space+drag: pan;
- accessible command palette for all other actions.

## 20. Feedback and error behavior

### 20.1 Feedback channels

Use independent channels:

- cursor shape;
- hover/selection outline;
- target halo;
- route preview;
- snap guides;
- status bar message;
- non-blocking toast for completed action;
- inline inspector validation;
- persistent DRC issue list;
- accessible live announcement.

Color alone is insufficient.

### 20.2 Timing classes

- pointer transform and target halo: same animation frame;
- local route/label preview: preferably under 16 ms, acceptable under 33 ms for typical scenes;
- global exact route/DRC: worker or debounced;
- persistence: after commit, never in the pointer-move critical path.

### 20.3 Failure atomicity

If a command fails validation, no partial semantic mutation remains. Preview state either stays active with an explanation or cancels to the original. Database persistence is one transaction with the command envelope and affected records.

### 20.4 Read-only and locked state

Locked entities remain selectable and inspectable. Handles are hidden or disabled. Attempted edits announce the lock reason. Read-only project state blocks semantic commands but still permits pan, zoom, selection, search, and export where policy allows.

## 21. Undo, redo, autosave, and revisions

### 21.1 Gesture granularity

One pointer gesture equals one command regardless of move-event count. Inline typing merges by field and timeout. Bulk operations and multi-selection transforms are one transaction.

### 21.2 Snapshot reference implementation

The TypeScript module uses detached before/after snapshots for clarity and deterministic tests. A production host may store fine-grained inverse patches, but externally visible behavior must match.

### 21.3 Derived recomputation

Undo/redo restores semantic state, then recomputes geometry, routes, labels, validation, and indexes. Cached route points can accelerate but not alter the result.

### 21.4 Persistence boundary

Autosave occurs after a command commits. Pointer previews are never autosaved as normal project revisions. A crash-recovery journal may record preview state separately only if it is clearly marked as an uncommitted recovered draft.

## 22. Rendering requirements

### 22.1 Reference SVG renderer

The package provides deterministic SVG with separate layer groups, escaped text, semantic roles/titles, non-scaling strokes, rounded paths, wire paint layers, component rows, labels, selection, handles, and crossing bridges.

### 22.2 Text safety

All imported/user text is escaped. Raw SVG, CSS URLs, event attributes, scripts, `foreignObject`, external images, and remote fonts are rejected by default. A custom-symbol feature requires an allowlist sanitizer and local asset policy.

### 22.3 Crossing bridges

At a non-junction crossing, the renderer masks a small region of the lower edge and redraws a short arc for the upper edge. The bridge radius is view configuration. It must not resemble a splice dot.

### 22.4 Export fidelity

Screen and print renderers share scene geometry. Print may adjust minimum stroke width, font embedding, page clipping, and black/white patterns but must retain engineering labels and color descriptions. Export metadata includes algorithm/version information where reproducibility matters.

### 22.5 Alternative renderers

Canvas/WebGL adapters consume the same component geometries, routes, label placements, paint layers, and selection state. They shall preserve hit-test semantics and print through a vector or high-resolution path.

## 23. Performance and concurrency

### 23.1 Recommended budgets

At normal zoom on a current desktop:

- hit test: under 2 ms typical;
- component geometry rebuild for one component: under 1 ms typical;
- affected-route preview: under 8–16 ms typical;
- label update for affected labels: under 4 ms typical;
- render scheduling: one update per animation frame;
- full page validation/routing: worker/debounced when over budget.

Budgets are measured with representative dense documents, not empty demos.

### 23.2 Incremental invalidation

A component edit invalidates:

- its geometry;
- wires attached to moved/changed ports;
- labels anchored to the component or affected wires;
- nearby automatic labels whose collision region intersects changed bounds;
- relevant spatial cells;
- DRC rules depending on those entities.

It does not require rerouting unrelated pages or rebuilding the entire library.

### 23.3 Worker protocol

Worker requests include request ID, document revision, detached document/affected subset, options, and algorithm versions. Responses include request ID, source revision, routes/placements/issues, and timings. Results older than the active revision are discarded.

### 23.4 Degraded preview

When exact routing exceeds frame budget, use a fast local rubber-band preview and show a subtle `routing…` state. Pointer release triggers exact routing. The committed command must include the semantic move even if exact derived geometry arrives asynchronously; persistence stores command intent and later cache result separately.

### 23.5 Large-scene rendering

Use viewport culling, semantic zoom, spatial indexes, virtualized inspectors, route batching, and optional Canvas/WebGL. Do not remove off-screen engineering entities from the document.

## 24. Accessibility

### 24.1 Target size

Interactive targets should meet or exceed the configured accessible screen size. Dense CAD exceptions require an equivalent enlarged invisible hit target, zoom support, keyboard access, or a target chooser. Port discovery and commit zones are larger than visible dots.

### 24.2 Semantic tree

The host supplies a parallel focusable tree/list grouped by page and entity type. Each component exposes designator, category, position count, warnings, and connection count. Each wire exposes endpoints, signal, color pattern, route status, and warnings.

SVG may use graphics-document/object/symbol roles and accessible names, but SVG roles alone are not a complete keyboard editor.

### 24.3 Keyboard editing

Inspector forms allow exact position, size, rotation, port order, route pattern, radius, color pattern, label mode, and connection changes. Route constraints are editable in a list/table for users who cannot drag handles.

### 24.4 Announcements

Examples:

- `J1 moved to x 120, y 340`;
- `Valid target J2 pin 4, CAN low`;
- `Connection rejected: pin already has one connection`;
- `Wire W17 route has two bends and one warning`;
- `Automatic label moved east of component`.

Announcements are concise and throttled during continuous movement.

### 24.5 Reduced motion and non-color cues

Reduced-motion mode disables animated transitions and route morphing. Selection uses shape/outline; warnings use dash/badge; wire patterns have text names; focus is never indicated by color alone.

## 25. Persistence mapping

### 25.1 Version-1 compatibility

The base schema already stores `view_placement`, `route_point`, components, pins, bundles, conductors, notes, and display JSON. `EDITOR_SCHEMA_MIGRATION_0002.sql` adds normalized editor detail while preserving the base model.

### 25.2 New normalized records

The migration adds:

- component view state;
- pin bank view state;
- per-port view overrides;
- external labels;
- wire appearance;
- route constraints;
- keep-out zones;
- per-actor view preferences;
- rebuildable route and label placement caches.

### 25.3 Command contract

`EDITOR_COMMANDS.schema.json` defines envelopes for transforms, rebuilds, pin mutations, connection/reconnection, wire styles, auto-route, constraints, segment movement, labels, and arrangement. Commands carry base revision and optional transaction/merge keys.

### 25.4 Cache invalidation hash

A route cache hash should include:

- endpoint identities and resolved geometry;
- component/keep-out obstacle hashes;
- routing options and constraints;
- wire effective width and clearance;
- relevant existing-route channel/crossing context;
- router version.

A label cache hash includes label semantic data, owner geometry/route hash, collision obstacle hashes, text metrics version, theme typography tokens, and placer version.

### 25.5 Offline guarantee

No editor operation requires authentication, remote fonts, remote symbols, cloud routing, telemetry, or a remote database. Optional synchronization consumes committed commands after local persistence and never becomes the source of truth for an open offline project.

## 26. Reusable TypeScript module contract

### 26.1 Package

`@routecore/harness-editor-core` is an ESM TypeScript package with no runtime dependencies. It exports generated JavaScript and declarations and is marked suitable for browser, Node.js, workers, Electron, and Tauri webviews.

### 26.2 Major API groups

- model types and defaults;
- component builder and geometry;
- routing patterns, constraints, fan-out, crossings, radii;
- labels and placement modes;
- wire paint and contrast;
- scene derivation and validation;
- stateful engine and history;
- interaction controller;
- hit testing, spatial index, snapping, viewport;
- SVG renderer;
- serialization and sample document.

### 26.3 Host responsibilities

The host supplies:

- domain-to-editor adapter;
- local persistence transaction;
- viewport and DOM/native coordinate conversion;
- pointer capture and focus management;
- inspector and command UI;
- optional worker scheduling;
- project-specific electrical DRC;
- packaging and local assets.

### 26.4 Extension points

Injectable or replaceable components should include text measurer, ID factory, router, label placer, renderer, spatial index, domain validator, theme, command persistence, and worker transport. Extensions receive validated data and may not bypass stable-ID or atomic-command rules.

## 27. Verification strategy

### 27.1 Unit tests

Required unit areas:

- component sizing, bank collapse, rotation, mirroring, port normals;
- connected-port removal policies;
- all route patterns and obstacle avoidance;
- endpoint lead-ins;
- corner radius clamp and obstacle safety;
- fan-out and crossing ownership;
- label modes, collision order, and stability;
- color layers and contrast;
- hit priority and marquee semantics;
- snapping and viewport transforms;
- preview commit/cancel and history;
- serialization determinism;
- SVG layers, accessibility metadata, and escaping;
- validation diagnostics.

### 27.2 Property and fuzz tests

Generate random components, orthogonal obstacles, endpoints, and constraints. Assert finite geometry, endpoint preservation, no unreported obstacle crossing, radius bounds, stable serialization, no duplicate IDs, and cancellation equality.

### 27.3 Visual regression

Render deterministic fixture scenes at light/dark themes, zoom levels, rotations, pin counts, route patterns, wire colors, selected/invalid states, and label collisions. Compare rasterized output with tolerances and also inspect semantic SVG structure.

### 27.4 Interaction tests

Replay normalized pointer sequences for click, component drag, group drag, port connection, invalid release, segment drag, label drag, pan, marquee, cancel, undo, and keyboard commands. Assert one-command gesture granularity.

### 27.5 Performance tests

Fixtures include 100, 1,000, and 10,000 visual edges with realistic obstacles and labels. Record geometry, route, placement, hit-test, and render timings. Release gates use target hardware profiles and allow renderer substitution at high scale.

## 28. Public references

The following public sources informed observable behavior or standards. They are evidence references, not implementation source:

- Splice CAD Project Workflow: `https://splice-cad.com/docs/plan/`
- Splice CAD Zoom & Pan: `https://splice-cad.com/docs/harness/zoom-and-pan/`
- Splice CAD public documentation sections for components, connections, bundle operations, custom graphics, and selection/navigation.
- Splice CAD public desktop repository: `https://github.com/splice-cad/splice-cad-desktop`
- W3C Pointer Events: `https://www.w3.org/TR/pointerevents3/`
- W3C SVG 2 paths and painting: `https://www.w3.org/TR/SVG2/paths.html`, `https://www.w3.org/TR/SVG2/painting.html`
- WCAG 2.2: `https://www.w3.org/TR/WCAG22/`
- WAI-ARIA Graphics Module: `https://www.w3.org/TR/graphics-aria-1.0/`
- Wybrow, Marriott, Stuckey, *Orthogonal Connector Routing* and *Seeing Around Corners: Fast Orthogonal Connector Routing* as algorithmic background. The RouteCore implementation remains independently written.

## 29. Release definition

The visual editor subsystem is release-ready when:

- all mandatory interactions in `EDITOR_INTERACTION_MATRIX.md` pass;
- all editor acceptance tests pass on Windows, Linux, and the supported desktop shell;
- the app launches and edits with networking disabled;
- no component or route edit silently loses connectivity;
- the TypeScript package builds without runtime dependencies;
- test suite and schema validation pass;
- visual fixtures show no unwaived overlaps at default density;
- accessibility keyboard paths and announcements are verified;
- the clean-room evidence and differentiation review is signed off.
