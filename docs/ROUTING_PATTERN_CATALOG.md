# RouteCore Routing, Connection, Radius, and Wire-Pattern Catalog

**Document ID:** RouteCore-ROUTE-001  
**Revision:** 1.0  
**Status:** implementation reference  
**Companion code:** `packages/harness-editor-core/src/routing.ts`, `geometry.ts`, `colors.ts`, and `svg.ts`

## 1. Purpose

This catalog is the focused implementation reference for wire-to-component attachment, route pattern selection, orthogonal routing, manual constraints, fan-out, bend radii, crossings, and engineering color patterns. It is intentionally narrower than `EDITOR_INTERACTION_SPECIFICATION.md` and intended to stay open beside the routing code and visual-regression fixtures.

All algorithms and data contracts are independently designed. Public product documentation is used only as evidence that a harness CAD workflow needs component connections, conductor anchors, route editing, wire groups, colors, and related visible outcomes.

## 2. Route semantic model

A visible wire route is not the electrical source of truth. The authoritative fields are:

- stable wire or conductor identity;
- semantic source and target endpoints;
- route pattern intent;
- component-relative or world-relative constraints;
- lead-in, clearance, minimum segment, and requested radius;
- engineering wire appearance;
- locks and manual overrides.

The following are derived and may be regenerated:

- endpoint world coordinates;
- lead-in points;
- route polyline;
- safe per-corner radii;
- crossing bridge ownership;
- SVG path commands;
- label anchor points on the path;
- obstacle and route diagnostics.

The route shall never create electrical continuity merely because two paths touch or cross. Connectivity is created only by semantic endpoints, explicit junctions, splices, mates, bridges, or other domain entities.

## 3. Port attachment frame

Every component port resolves to a frame:

```text
                    outward normal n
                           ↑
                           │ lead-in
              ┌────────────●────────────┐
              │         port p          │
              │       component         │
              └─────────────────────────┘
                           → tangent t
```

For a component-local port point `p_local`, normal `n_local`, component transform `T`, and configured lead-in `L`:

```text
p_world = T(p_local)
n_world = normalize(T_vector(n_local))
t_world = normalize(T_vector(t_local))
lead     = p_world + n_world × max(L, clearance + minimumSegment)
```

Required behavior:

1. Rotation and mirroring transform point, normal, tangent, hit target, and row geometry together.
2. The first route segment from a component port follows the outward normal.
3. A route may not begin its first corner inside the component keep-out.
4. Port hit area is measured in screen pixels and converted to world units at current zoom.
5. A wire endpoint stores `componentId` and `portId`, not the current coordinates.
6. Moving, resizing, rotating, or rebuilding a component resolves the endpoint again from stable identity.
7. Invalid or missing ports produce an explicit unresolved endpoint; they are never silently attached to the component center.

## 4. Pattern-selection decision

Use this order when the user has not explicitly selected a pattern:

1. **Manual constraints present:** route through hard constraints with orthogonal automatic segments between them.
2. **Multiple ordered bank connections:** use fan-out plus a horizontal or vertical trunk.
3. **Source and target face one another:** use obstacle-aware orthogonal.
4. **Simple documentation wire with no keep-out requirement:** horizontal-first or vertical-first according to dominant axis.
5. **Shared bus corridor required:** trunk-horizontal or trunk-vertical.
6. **Unrouted/free annotation:** direct only when diagonal geometry is explicitly allowed.
7. **Otherwise:** obstacle-aware orthogonal.

Pattern selection changes route intent, not electrical identity or wire appearance.

## 5. Pattern cards

### 5.1 Direct

```text
A ●──────────────────────● B
```

**Use:** annotations, preliminary free leads, or a host that permits diagonal lines.  
**Geometry:** `[source, target]`.  
**Obstacle behavior:** normally no avoidance. A validation issue is emitted if direct path violates a hard keep-out.  
**Editing:** dragging the path converts it to a manual or dogleg pattern rather than storing an arbitrary hidden control point.  
**Do not use by default:** for production schematic conductors requiring orthogonal readability.

### 5.2 Horizontal-first

```text
A ●────────────┐
               │
               └────────● B
```

**Geometry:** source → `(target.x, source.y)` → target.  
**Use:** compact predictable diagrams, preview routes, and user-selected first-axis intent.  
**Obstacle behavior:** may fall back to obstacle-aware orthogonal when hard obstacles block the elbow. The UI must identify that the exact preferred pattern could not be maintained.  
**Stability:** deterministic for the same endpoints.

### 5.3 Vertical-first

```text
A ●
  │
  └─────────────────────● B
```

**Geometry:** source → `(source.x, target.y)` → target.  
**Use:** vertical pin banks or drawings organized into horizontal layers.  
**Behavior:** otherwise identical to horizontal-first.

### 5.4 Dogleg-horizontal

```text
A ●──┐
     │
     ├──────────────── trunk Y
     │
     └────────────────────● B
```

**Intent:** route both endpoints to a selected horizontal coordinate.  
**Constraint:** `doglegCoordinate = y`.  
**Use:** aligning a single wire with a visible row or avoiding a local region.  
**Interaction:** dragging the middle horizontal segment updates the dogleg coordinate, not independent endpoint pixels.  
**Persistence:** one serializable scalar plus endpoint semantics.

### 5.5 Dogleg-vertical

```text
A ●──────┐
         │ selected X
         │
         └───────────────● B
```

**Intent:** route both endpoints to a selected vertical coordinate.  
**Interaction and persistence:** equivalent to dogleg-horizontal.

### 5.6 Trunk-horizontal

```text
A1 ●──┐             ┌──● B1
A2 ●──┼═════════════┼──● B2
A3 ●──┘   trunk     └──● B3
```

**Use:** buses, connector-to-connector bank mapping, and grouped wire corridors.  
**Required parameters:** trunk Y, lane spacing, ordered source and target ports, optional reversal/interleave mapping.  
**Fan-out:** each wire obtains a deterministic lane. Adjacent wires may share the conceptual corridor but shall remain individually selectable and semantically distinct.  
**Move response:** if the trunk is world-owned it stays fixed; if source- or target-owned it moves with that owner.  
**Crossing control:** lane ordering should minimize crossings; a mapping change must show a staged diff.

### 5.7 Trunk-vertical

```text
        ● A1
        │
        ├══ trunk ══┐
        │           ● B1
        ● A2
```

The vertical equivalent of trunk-horizontal. Use for top/bottom pin banks and page columns.

### 5.8 Obstacle-aware orthogonal

```text
A ●──────┐       ┌────────● B
         │ ┌─────┴─────┐
         └─┤ obstacle  │
           └───────────┘
```

**Use:** default production route.  
**Inputs:** resolved lead points, inflated obstacles, hard/soft route constraints, previous route, existing routes, penalties, and deterministic search budget.  
**Output:** orthogonal polyline, status, diagnostics, obstacle IDs, bend count, crossing count, and route length.

The independent reference implementation constructs a sparse visibility grid from:

- endpoint coordinates;
- obstacle edges and safety channels;
- hard waypoint coordinates;
- route-corridor coordinates;
- outer escape coordinates.

Search state includes node and incoming axis. The cost is:

```text
cost = length
     + bendPenalty × bends
     + crossingPenalty × crossings
     + proximityPenalty × nearObstacleScore
     + reversePenalty × backwardMoves
     + stabilityPenalty × departureFromPreviousCorridor
     - sharedChannelReward
```

Tie-breaking shall be stable by coordinate, axis, and node identity. Search-budget exhaustion returns an explicit fallback or invalid result; it never reports an unchecked path as valid.

### 5.9 Manual constrained route

```text
A ●───◇────────◇───● B
      W1       W2
```

Manual editing stores constraints, not renderer path commands. Supported constraints include:

- waypoint;
- locked waypoint;
- locked segment;
- horizontal or vertical corridor;
- keep-out rectangle;
- preferred rectangle;
- source-relative, target-relative, or world-relative ownership.

Between constraints, the router may still generate orthogonal subroutes. Removing the final manual constraint returns the wire to its selected automatic pattern.

### 5.10 Fan-out

```text
1 ●──┐
2 ●──┼─── separated lanes ───
3 ●──┼─── preserve order  ───
4 ●──┘
```

Fan-out is a route preprocessor, not a new electrical entity. It shall:

1. sort ports by transformed tangent coordinate;
2. apply explicit mapping/reversal/interleave rules;
3. allocate lanes at configured spacing;
4. enforce straight port lead-ins;
5. avoid immediate elbow overlap;
6. keep lane identity stable after small owner motion;
7. report when the requested fan-out cannot fit the available corridor.

### 5.11 Bundle/sheath projection

A physical bundle or cable may be rendered behind individual conductors:

```text
╔════════════════════════════════╗  bundle/sheath
║ ─ wire A  ─ wire B  ─ wire C ║
╚════════════════════════════════╝
```

The sheath does not merge the conductors electrically. Selection of the sheath targets the bundle; selection of an inner lane targets the conductor. At reduced zoom, the host may simplify inner lanes but must provide a way to expand or inspect them.

### 5.12 Off-page route

```text
A ●──────────────▷ PAGE 4 / GRID B7
```

An off-page endpoint contains a stable reference and direction. It remains a semantic endpoint and participates in net tracing. Renaming or moving the target page updates the reference text without replacing the wire ID.

## 6. Obstacle and clearance policy

For a component body `R` and wire clearance `C`, route search uses `inflate(R, C)`. Label and user keep-out rectangles may use independent clearances.

Hard obstacles:

- component bodies;
- locked groups or sheet frames;
- explicit keep-out zones;
- route-prohibited manufacturing regions.

Soft obstacles:

- labels that may move;
- preferred empty whitespace;
- low-priority annotation regions;
- other wires when crossings are allowed but penalized.

Endpoint components are special: the semantic port-to-lead segment may cross that component's inflated keep-out along the outward normal. The remaining route may not re-enter it.

## 7. Minimum segment and route cleanup

After routing:

1. remove duplicate points;
2. remove collinear intermediate points;
3. reject zero-length segments;
4. merge segments shorter than `minimumSegment` when this does not break a hard constraint;
5. preserve endpoint lead-ins;
6. preserve explicitly locked points and segments;
7. recalculate length, bend count, and diagnostics;
8. compute safe radii only after topology is final.

Cleanup shall not reorder hard constraints.

## 8. Bend-radius rules

A route stores one requested radius but derives one effective radius per corner.

For corner `i` with incoming length `a`, outgoing length `b`, requested radius `r`, minimum reserved straight lengths `s_in` and `s_out`, and obstacle-limited radius `r_clear`:

```text
r_i = max(0, min(r, (a - s_in)/2, (b - s_out)/2, r_clear))
```

Required behavior:

- each corner clamps independently;
- radius never moves an endpoint or semantic waypoint;
- radius zero yields a sharp corner;
- negative, NaN, or infinite input is rejected before commit;
- the UI may show `requested 12, effective 6` for a constrained corner;
- changing radius changes rendering geometry only, not route topology or connectivity;
- the first rounded corner starts after the complete port lead-in;
- physical harness bend-radius constraints are separate engineering checks and may require a larger route or a warning, rather than visually drawing an impossible radius.

SVG construction for an orthogonal corner uses line-to the arc start, then a quarter-circle arc to the arc end. The router shall sample or bound the arc against hard obstacles; if an arc would enter a keep-out, reduce that corner's effective radius.

## 9. Segment and waypoint editing response

| Gesture | Live response | Stored intent | Endpoint rule |
|---|---|---|---|
| Drag middle horizontal segment vertically | segment follows pointer; adjacent vertical elbows update | locked or strong horizontal segment/corridor | unchanged |
| Drag middle vertical segment horizontally | vertical equivalent | vertical segment/corridor | unchanged |
| Drag first segment | endpoint stays; a dogleg is inserted after lead-in | endpoint-adjacent constraint | semantic port fixed |
| Drag waypoint | adjacent orthogonal segments repair | updated waypoint | unchanged |
| Double-click segment | waypoint inserted at snapped point | new waypoint | unchanged |
| Delete waypoint | neighboring route recalculates | constraint removed | unchanged |
| Reset route | old route may ghost during preview | manual constraints removed | semantic endpoints preserved |
| Move component | port and lead-in move; automatic region reroutes | component transform command | wire ID preserved |
| Rotate component | endpoint frame rotates; route exits along new normal | component transform command | wire ID preserved |
| Remove connected port | policy preview: prevent, detach, or remap | one component mutation command | never silently deleted |

A full drag is one preview transaction and one undo entry.

## 10. Crossings and non-junction semantics

When two unrelated orthogonal wires cross:

- no electrical junction is created;
- a deterministic over-wire is chosen by explicit z-order, route priority, then stable ID;
- the under-wire receives a visual gap or the over-wire receives a bridge arc;
- selection and hover do not change bridge ownership;
- crossing geometry is derived and need not be persisted;
- a true electrical junction uses a junction/splice marker and semantic entity.

At very dense crossings, the renderer may simplify bridges at low zoom but must preserve non-junction meaning in selection and export.

## 11. Engineering color and pattern catalog

Wire color is semantic engineering data. Selection, hover, and diagnostics are separate outer layers.

### 11.1 Solid

```text
[outline] [single engineering stroke]
```

Use the declared insulation color.

### 11.2 Stripe

```text
wide base stroke + narrower repeated stripe stroke
```

Parameters: base color, stripe color, stripe width, repeat. The stripe layer remains centered on the base. It must be visible at print scale or replaced by a documented alternate symbol in monochrome export.

### 11.3 Tracer

```text
wide base stroke + short periodic tracer marks
```

Parameters: base, tracer color, repeat, tracer length. Tracer marks use round caps unless the project standard overrides them.

### 11.4 Dual color

```text
wide secondary stroke + narrower primary stroke
```

The ratio declares visible width, not electrical priority.

### 11.5 Shield/sheath

```text
wide semi-opaque sheath + optional inner core stroke
```

Use for shield, conduit, or cable projections. The actual conductor/shield entity remains selectable.

### 11.6 Custom layered pattern

A custom pattern is an ordered list of stroke layers containing color, width, opacity, dash, dash offset, and cap. Hosts shall validate finite positive widths and bounded opacity.

### 11.7 Visual precedence

From outside to inside:

1. hover or selection halo;
2. error/warning diagnostic dash;
3. contrast outline;
4. engineering pattern layers.

This ensures a selected red/yellow striped wire remains red/yellow striped. A selection may never replace engineering color with a generic selection color.

### 11.8 Monochrome and accessibility

Color alone shall not be the only distinction. The host shall support one or more of:

- stripe/tracer/dash patterns;
- wire IDs and labels;
- legend entries;
- high-contrast outlines;
- explicit net highlighting;
- accessible names containing the color/pattern description.

## 12. Recommended deterministic defaults

| Parameter | Default | Notes |
|---|---:|---|
| grid | 8 logical units | route candidate quantization may be independent of UI grid |
| component clearance | 12 | inflate hard obstacles |
| port lead-in | 20 | at least clearance plus minimum segment |
| minimum segment | 6 | preserve explicit constraints even when shorter |
| bend penalty | 32 | discourages unnecessary corners |
| crossing penalty | 100 | increase for schematic mode |
| proximity penalty | 4 | discourages hugging obstacles |
| requested radius | 8 | per-corner clamp applies |
| bridge radius | 5 | renderer value, not route topology |
| lane spacing | 8–12 | based on stroke width and print scale |
| maximum search nodes | 20,000 | worker routing may use a larger budget |

Projects may override these values by profile. A profile change is a command and shall show its impact before rerouting a large document.

## 13. Pattern-selection examples

| Situation | Preferred pattern | Reason |
|---|---|---|
| Two facing connector banks with an obstacle | obstacle-aware orthogonal plus fan-out | preserves order and avoids body |
| Power bus shared by many branches | trunk-horizontal/vertical | stable shared corridor |
| One wire must align with a dimension row | dogleg | explicit corridor coordinate |
| User carefully adjusted route | manual constraints | preserves intent across owner movement |
| Temporary flying lead | direct or orthogonal depending drawing profile | minimal creation effort |
| Off-page connection | orthogonal to off-page endpoint | readable reference and net continuity |
| Cable with cores | bundle/sheath plus lane routes | physical grouping without electrical merging |

## 14. Required fixtures

A routing implementation shall include at least these deterministic fixtures:

1. facing east/west ports with no obstacle;
2. same-side ports requiring outward lead-ins and return path;
3. central hard obstacle;
4. nested obstacles with one valid corridor;
5. impossible hard-obstacle route;
6. search-budget exhaustion;
7. 20-wire ordered fan-out;
8. reversed and interleaved bank mapping;
9. manual world-, source-, and target-owned waypoints;
10. component rotation at all four orthogonal angles;
11. requested radius larger than every adjacent segment;
12. crossing bridge with stable over-wire;
13. solid, stripe, tracer, dual, shield, and custom paint;
14. monochrome export;
15. repeated solve proving identical points and diagnostics.

## 15. Module mapping

| Concern | TypeScript API |
|---|---|
| endpoint resolution | `resolveEndpoint` |
| automatic wire route | `routeWire` |
| route defaults | `DEFAULT_ROUTING_OPTIONS` |
| bank fan-out | `routePinBankFanout` |
| manual waypoint | `createWaypointConstraint` |
| segment movement | `moveOrthogonalSegment` |
| crossings | `findWireCrossings` |
| safe radii/path | `computeSafeCornerRadii`, `roundedOrthogonalPath` |
| paint layers | `resolveWirePaint`, `wirePaintLayers` |
| validation | `validateDocument`, `validateRouteClearance` |
| SVG reference output | `renderEditorSvg` |

The API is intentionally renderer-neutral except for the optional SVG reference renderer. A host may use Canvas2D, WebGL, native graphics, or PDF while preserving the same semantic and derived contracts.
