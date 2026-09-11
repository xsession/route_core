# Harness Tooling Deep Study: QElectroTech, RapidHarness, harness.design

**Research date:** 2026-09-10
**Scope:** Deep public-docs study of three electrical/harness authoring tools, focused on
(1) visuality concepts, (2) connection model, (3) documentation style.
**Use:** Design input for RouteCore's 3D cable editor. Public pages/docs/tutorials only;
authenticated apps and non-public implementations were not inspected. RouteCore keeps
independent code, visuals, terminology, and offline architecture.

Complements `UX_REFERENCE_STUDY.md` (2026-09-09, high-level) and `3D_CABLE_ROUTING_STUDY.md`.
This file goes deeper on data model, visualization, and doc conventions.

---

## 0. Key relationship

- **rapidharness.com now redirects to harness.design.** RapidHarness (Highlight Labs) and
  harness.design (the browser tool) appear to have merged/consolidated; the RapidHarness
  product page title now reads "harness.design | Wire Harness Design Software", and
  rapidharness.com's docs (version history, support) still resolve under the RapidHarness
  brand. So "RapidHarness" and "harness.design" share a documentation lineage, but the two
  product surfaces described below are distinct:
  - **RapidHarness** = desktop, Windows/.NET, enterprise, ribbon UI, drawing-template driven,
    Octopart integration, team/partner management.
  - **harness.design** = browser (plus desktop app), node-graph model, JSON file format,
    MCP/AI integration, formboard, embed/linked groups.
- **QElectroTech (QET)** = free, open-source (GPL), C++/Qt, general-purpose electrical
  *diagram* editor (not a harness-specific PDM). The conceptual ancestor of the "symbol
  library + canvas + project" pattern.

---

## 1. QElectroTech (QET)

### What it is
General-purpose open-source editor for complex industrial electrical, electronic, automation,
and control diagrams — but also usable for hydraulics, pneumatics, PID, plumbing, domotics.
8000+ standard symbols ("elements") in the bundled collection. C++ / Qt, GPL, Windows/Mac/Linux.

### Visuality concepts
- **Symbol-driven diagramming.** The core unit is an *element* (a symbol with connection
  terminals/pins). You drag an element from a categorized tree onto a gridded canvas and
  connect terminals with conductors (lines). This is classic schematic CAD, not a harness
  PDM — there is no "parts vs components" split and no manufacturing data model.
- **Two collections.** A read-only bundled *QET collection* plus an *imported/user*
  collection. When you drag a bundled element onto a page it is auto-duplicated into the
  imported collection, where the copy becomes editable. Library = the symbol source of truth.
- **Grid + title block.** Page is a bordered grid (cols/rows, colsize). A *title block* table
  holds schema metadata: title, author, date, filename, sheet number, sheet total.
- **Conductor routing.** Conductors can be multi-line (visual cable with N cores). A "cable"
  is a visual grouping of parallel conductors; you can drag a cord to re-route, which turns
  red with green handles for waypoint editing; "Restore route cables" re-automates routing.
- **Element editor.** A built-in editor to author new symbols (front-view + side-view,
  terminals). Symbols are stored in XML.

### Connection model
- Connection = a conductor between two element *terminals* (pins). There is no named
  "net" object; connectivity is implicit in the wiring lines. Cross-page connections are
  handled via *terminals/ports* with matching formulas (the diagram XML carries
  `<terminals>` with formula, and cross-sheet linking is by name/formula).
- No parts/gauge/material data — it is a drawing tool, so there is no BOM, no validation of
  electrical compatibility, no cut-list.

### Documentation style
- Sphinx-generated HTML manual ("a complete working guide"), version-pinned (0.4) and
  explicitly behind the stable release (0.100). Structure is a numbered TOC: Introduction →
  Installation → Drawing window walkthrough → Editing schema → Editing items → tutorial.
- **Tutorial-by-example**: e.g. "Creating a Globe Valve Element" walks building a symbol.
- Docs license is CC-BY 3.0; the project wiki is dokuWiki (currently French-primary) with an
  English manual under `/test/lang-en/`.
- Project metadata is *data-driven*: the `.qet` file is XML — `<project>` with `<properties>`
  (saveddate/author/locmach/plant), `<newdiagrams>` (grid border cols/rows/colsize),
  `<diagram>` (title, date, order, folio `"%id/%total"`, plant, author), plus
  `<element_autonums>` and `<folio_autonums>` for auto-numbering. **Lesson:** the title
  block and page number are template fields with a folio format string, and the whole
  document (including properties) is a transparent, human-readable XML file.
- Export: DXF (via a `Createdxf` class drawing blocks + entities), plus PDF/JPG/PNG; recent
  CLI export adds wiring-list / wire-number CSV.

### Takeaways for RouteCore
- The **symbol library is the onboarding asset**. QET's power is the 8000-symbol collection
  + a built-in symbol editor. RouteCore's Component/Cable Creator is the analog; keeping the
  library local, reusable, and immediately placeable (already adopted) matches this.
- **Transparent document format.** QET's `.qet` is plain XML with a visible `<properties>`
  block and folio format string — the title block is data, not pixels. RouteCore should treat
  drawing title blocks / page numbering as structured fields with a folio template.
- **Cable as a visual multi-line construct** with waypoint re-routing is a useful mental
  model for the 3D cable view (a cable is a group of parallel cores that can be re-routed
  as a unit, with per-core color coding).

---

## 2. RapidHarness (Highlight Labs)

### What it is
Full-lifecycle, *manufacturing-oriented* wiring-harness CAD. Desktop Windows/.NET. Enterprise
feature set: team library, partner organizations, version control, drawing templates, Octopart
(83M+ parts) integration. Positioned for aerospace/automotive/industrial/marine. The whole
product is built around: **define → auto-generate the drawings and manufacturing documents.**

### Visuality concepts
- **Top-Level drawing is the hero surface.** Unlike harness.design's node graph, RapidHarness
  centers on a *drawing* (Top Level) that is continuously auto-regenerated from the data model:
  connectors, devices, wires, cables, bundles, branch points, protective coverings, lengths.
  The drawing is a *view* of the model, not the source of truth.
- **Hierarchy: System > Harness > Device.** Design hierarchically; encapsulate complexity;
  manage signal propagation through harnesses and subsystems. A System aggregates multiple
  harnesses/devices with its own Aggregate BOM and Nets.
- **To-scale Formboards.** A signature feature: 1:1 physical-scale drawings ("formboard /
  nailboard / pegboard") that engineers assign real bundle lengths to, so the layout scales to
  real-world dimensions and can be printed and built directly on. The harness is a *physical
  object*, so the tool models physical length, not just topology.
- **Generic shapes, images, text** on the drawing canvas (Z-order, flip, arrowheads) — the
  Top Level is a real drawing surface with free annotation.
- **Design Assembly view** shows the recursive children/parent structure of a design (a
  connector = housing + contacts + backshell + boot + seals) — the "where used" tree.

### Connection model
- **Connection = from connector + from cavity → to connector + to cavity + conductor.**
  That 4-5-field selection is the atomic act of building a harness. (An early review noted
  this was slow to specify and wanted drag-drop; later versions improved the Connection
  Editor with Notes/Wire-Size columns, twisted-wire indicators, batch twist/untwist, and
  direct right-click conductor changes.)
- **Signal propagation & highlighting.** Selecting a wire/connection highlights the full net
  (the conductive path) or just direct connections; "Locate in Top Level" jumps from a design
  to its place on the drawing. Nets are first-class (Nets list, Nets table, system-level nets).
- **Bundle = group of wires sharing a physical route** with its own length, color, and
  coverings. "Show Connections within Bundle" inspects what runs through a segment. Bundle
  merging auto re-routes.
- **Coverings** are a first-class design type (tubing, sleeving, spiral wrap, taping) applied
  to bundles/wires.
- **Twisted wires, splices, resistors, diodes, pigtail connectors** (pre-wired connectors),
  N/C and Housing connection types, "Reuse Cavity", custom cavities.
- **Validation / Design Rule Checker** (since 2014): rule-based checking of the harness.

### Documentation / output style
- **Everything is auto-generated from the model** — the central product promise. Outputs:
  - Top-level harness drawing (PDF)
  - Bill of Materials (BOM) / Aggregate BOM
  - Wiring tables (with conductor colors)
  - Wire & cable **cut lists**
  - **Label tables** / label data (Excel)
  - **Electrical Interface** tables
  - **Notes table** (with flags/leader lines) and **Revision table**
  - **Nets table**
  - **Production Data** = one Excel document per harness/system combining the above
- **Table templates & drawing templates** with `$TEXT$` replacements (e.g. `$MANUFACTURER$`),
  per-column include/exclude, and re-ordering. Templates are reusable and versionable.
- **Version control built in**: versioned designs, multi-version dialog, "Force Version" to
  reclaim a drawing someone left editing, revision tracking, and a 30-day Recycle Bin.
- **Where-Used** is a first-class ribbon search (find all places a design is referenced).
- **Revision table** can be printed as a separate output to free space on the main drawing;
  each revision row has an include/exclude checkbox for printed/PDF output.
- Documentation: marketing site + a dated **Version History** changelog table (feature-level,
  every release 2012→2026), tutorials, and a support/FAQ section.

### Takeaways for RouteCore
- **The drawing is a derived view, always consistent with the model.** This is the single
  strongest RapidHarness lesson and the core of "auto-generated manufacturing docs." RouteCore
  should keep BOM / wire-schedule / cut-list / title block as *live projections* of the model,
  never hand-maintained — already the direction in `UX_REFERENCE_STUDY.md`.
- **Physical length is first-class.** Formboards prove that modeling real bundle length and
  rendering 1:1 is a differentiator for a cable/harness tool — highly relevant to RouteCore's
  3D routing, where length and bend radius are the whole point.
- **Template-driven, parameterized document output** (text replacements, per-column control,
  separate revision/notes tables) is a concrete, reusable pattern for RouteCore's exports.
- **Hierarchy + Where-Used** (System>Harness>Device, recursive design assembly, ribbon
  where-used search) is the collaboration/navigability model.
- **Version history / revision tables with include-exclude** is a clean documentation
  convention worth mirroring.

---

## 3. harness.design

### What it is
Browser-first (plus a desktop app) "wire harness design, reinvented." Node-graph model with a
transparent JSON file format, live validation, formboards, embed/linked sub-harnesses, team
collaboration, and **AI/MCP integration** (an assistant can edit the harness live via MCP, or
edit local `.harness` files on disk). Pricing: Free (unlimited harnesses, 100 connections
each), Pro $29/seat/mo (unlimited connections, revisions, teams).

### Visuality concepts — the two-canvas model (the key idea)
harness.design separates the harness into **two synchronized node-graph views** of one model:

1. **Schematic view** = *logical* electrical wiring diagram. Components are rectangular nodes;
   wires and cable cores are edges. Add Connector, Terminal, Splice, Diode, Resistor; connect
   with Wires / Twisted Wires / Cables. Nodes can be rotated 90°.
2. **Layout view** = *physical* routing diagram. Same components as nodes; **Bundles** (groups
   of wires following a physical path) are edges. Add Connector, Terminal, **Branch Point**;
   assign coverings. Positions approximate real physical placement.

Most components appear in both views; a few are view-exclusive (Cable/TwistedWires =
schematic-only; BranchPoint = layout-only). The two views are the same model seen two ways —
logic vs. physical. This is the cleanest expression of the "drawing is a projection of the
model" idea and is the strongest visuality concept in the whole study.

**Formboard mode** turns the Layout view into a **1:1 physical-scale** drawing: grid snapping
removed, bundles bend with a real corner radius, bundles can be set to their true length.
To-scale bundles are green; not-to-scale bundles are drawn as *yellow lines with black
dashes* (an at-a-glance "not to scale" warning). A "match" button, drag-to-preview (blue line
preview → green when to scale), and a "Set all bundle lengths to scale" button let the whole
harness snap to scale in one step. Panels are laid out as an ISO grid (A4–A1, rows×cols, 1–64)
and exported as one PDF page per panel to print and build on.

**Canvas conventions (from the JSON spec):** both views use a **30-unit grid**; positions are
multiples of 30. Node sizes are fixed formulas in grid units (Connector height = 30 + N×30
[+30 if shell]; Layout nodes are all 30×30). Recommended schematic layout: endpoint
components (Connectors/Terminals) around the **perimeter** of a rectangle, inline components
(Splice/Diode/Resistor/Cable/TwistedWires) in the **center** where wires pass through — keeps
connections in open space and minimizes crossings without waypoints.

### View toolbar pattern
Each canvas view has a **bottom-right toggle cluster** (a very consistent, learnable UI
convention): Fit to view, **Highlight nets**, Dash undefined/empty routes, **Show parts**,
**Show coverings**, **Show destinations**, **Show component IDs**, **Show warnings**.
Right-click on canvas = context menu to add components; right-click a component = assign part;
left-click-drag between connection handles = create a wire/bundle.

### Connection model (most explicit of the three — the reference model)
The atomic object is a **Wire**:
```
{ "id":"w1",
  "source": { "id":"J1", "handle":"cav_1" },   // element id + handle
  "target": { "id":"term_1", "handle":"Terminal" },
  "color":"Red", "stripeColor":"White",
  "identColors":["Blue"], "identLabel":"12V",
  "partId":"wp1", "coveringIds":["cov1"] }
```
- **ConnectionPoint = { id, handle }.** `id` = the element; `handle` names the specific
  endpoint, and its value depends on element type:
  | Target element | handle value |
  |---|---|
  | Connector cavity | the specific **Cavity's id** |
  | Connector shell | the shell cavity's id |
  | Terminal | `"Terminal"` |
  | Splice | `"Splice"` |
  | Diode / Resistor | `"Left"` or `"Right"` |
- **Global unique string IDs**, internal-only (never shown); displayed identity is the
  component label (`C1`, `W3`) or cavity signal.
- **Nets** are computed (transitive connectivity), not stored. A **signal** can be set on a
  cavity and *propagates* along the net (set once at the origin; others inherit; `propagate`
  to stop, `global` for harness-wide). "Highlight nets" shows the full conductive path or just
  direct neighbors of the selection, and a selection in *any* view carries through to all
  views. "Select wires on net" batch-assigns a part to an entire net.
- **Bundle** = the physical route edge in Layout: `{ sourceId, targetId, length:{value,unit},
  label, labelColor, coveringIds, layoutPoints[] }`. Wires are routed *through* bundles; wire
  length is auto-computed from the bundles they pass through. Unrouted wires show dashed and a
  `NO ROUTE` warning.
- **Branch Point** = where a bundle trunk physically splits (layout-only).
- **Mate** = a physical plug-in between two connectors, or terminals together, or terminal↔
  connector cavity (needs `targetCavityId`). Mated connectors map cavities 1:1 onto the same
  net. Validation: cavity counts must match; genders must oppose; terminal mates have a
  compatibility matrix (Ring↔Spade/Stud "checks size", Quick Connect male↔female max one, etc.).
- **Cable** = schematic-only node with `cores[]` (each core its own conductor with
  source/target, color, gauge inherited from the CablePart) and an optional `shield`.
  **TwistedWires** = schematic-only node of 2–8 twisted conductors.
- **Group / Embed** = a named box owning a set of components as an *embedded recursive
  document* (groups can nest). Member ids are group-local and qualified on load as
  `<groupId>-<localId>`. A **linked group** (blue ring) embeds another harness with a source
  link (cloud doc or relative local file path), is read-only, is refreshed wholesale, carries
  an isolated part library, and is excluded from the parent BOM. Designators are prefixed
  (`Rear.C1`). "Save as Linked Harness" is the natural way to *split* a design into
  sub-harnesses.

**Validation (live, warnings-on):** wire gauge vs contact capacity (sums multiple wires into a
contact by converting to mm², adding, converting back); connector cavity count vs part (suggests
matching parts); unassigned wires (`No Part`); unrouted wires (`NO ROUTE`); unused parts
(`Not Used`); connector/terminal mate compatibility. Warnings toggle in the view.

### Parts model (the Component/Part split — a defining pattern)
- **Component** = the abstract, placed element (a Connector with N cavities).
- **Part** = the concrete manufacturing item assigned to a component (part number,
  manufacturer, color, gauge, price, image). A component is validated *against* its part.
  You design with generic components, then assign real parts.
- 18 part arrays by type (wire, connector, terminal, splice, contact, cable, covering, diode,
  resistor, group, lock, dustCover, backshell, boot, cavitySeal, cavityPlug, mount).
- **ConnectorPart** has `numberOfCavities`, `gender`, `hasShell`, a
  `designationStrategy` (sequential / alphabetical-with-skips / custom labels / grid rows×cols),
  and **configurations** (named accessory bundles: lock, dust cover, backshell, mount, default
  contact, default cavity plug, boot — first configuration is the default).
- **Parts Library** = shared catalog keyed by part number; a harness part can sync in/out of
  it ("Synced with Parts Library" / "Synced with harness document"). **Internal Part Number**
  field (stores/ERP id) alongside the manufacturer part number. Real manufacturer parts can be
  searched from a **Parts Catalog** (press `K`). Parts carry prices (per-unit or
  price-per-length) → drives the **BOM** (Parts view is the BOM; CSV export; PDF page with
  chosen columns).

### Export / documentation style
From Main Menu → Export; **the export configuration is saved with the harness** so the next
export starts from the same setup:
- **PDF**: a Schematic page, a Layout page, and/or a Parts (BOM) page, in any combination, each
  with its own options (Show parts/coverings/accessories/component IDs, wire thickness, page
  size Fit/A4/A3/A2, limit to specific **nets**). Title block (Company/Title/Drawing number/
  Date/Drawn by, only filled fields render, defaults fall back, team logo) + free-text **Notes**
  bottom-left. A formboard harness renders the whole board on one 1:1 page, plus a **Formboard
  Panels** export = one to-scale page per panel of the grid.
- **Wiring table**: Excel `.xlsx` from the Connections view — one sheet listing all
  connections, then per-connector sheets.
- **BOM**: CSV of the Parts view.
- **Local file**: `.harness` (plain-text JSON) — the desktop app edits these in place.
- **Formboard Data**: JSON for a *digital* formboard (projection system): panel config,
  pixel-to-length scale, every component position/rotation/dimensions, every routed bundle/wire
  path, nets, coverings, notes, dimensions, part catalog — all geometry relative to the
  top-left of the panel grid.

**On-canvas documentation:** a **Wiring Table** is a *node placed next to a component* listing
its pin-out (one row per conductor ending on it), tethered to the component, kept live, and
drawn in the PDF. Columns: Cavity, Terminal, Signal, Destination, Wire, Color(+stripe), Part,
Gauge, Contact, Twisted with, Ident, Length. Editable in place (type a destination to connect,
click a part cell to reassign). Per-view (showing in Layout doesn't show in Schematic).
**Part images** can be tethered next to a component the same way.

### Documentation style (very strong — the model to emulate)
- Built with **Nextra** (React/MDX static docs). Clean IA: `Quick Start` (numbered 1–5:
  Schematic → Layout → Parts → Connections → Export) then per-topic pages grouped under
  `view/`, `component/`, `part/`, `feature/`, `feature/teams/`.
- **Consistent page template**: `# Title` → one-sentence "what is X" → screenshot → `##`
  sections, each starting with an action (`right-click`, `left-click-drag`, `left-double-click`,
  a key like `R`/`D`/`K`) in backticks, then the effect. Every section has a "Permalink for
  this section." Cross-links everywhere (nearly every noun is a link to its own page).
- **Terminology discipline:** bold **Components** vs *Parts* vs *Views* are introduced once and
  used consistently; backticks for UI labels, keys, and code identifiers.
- **A public JSON file-format reference (v0.9)** with defaults tables, ID conventions, node
  size tables, layout guidelines, and a full worked example document. This double duty is the
  best part: it documents the data model *and* is a machine interface for AI agents.
- **AI/MCP docs** explain connecting Claude/ChatGPT/custom MCP clients (server URL
  `https://app.harness.design/mcp`), that the assistant signs in as you and edits live (each
  change = one undoable history step), and give plain-English example prompts. Local `.harness`
  files can be edited directly by coding agents on disk — the docs explicitly support AI agents
  as first-class users.
- Every page shows a "Last updated on <date>" footer.

### Takeaways for RouteCore
- **Two synchronized views of one model (logical Schematic + physical Layout)** is the cleanest
  visuality architecture in the study. RouteCore's 3D product-fit projection is effectively a
  third view (physical, volumetric) of the same connectivity model — the harness.design model
  validates treating 2D-schematic, 2D-layout, and 3D as *projections*, not separate files.
- **ConnectionPoint {id, handle}** with type-dependent handle values is an elegant, minimal,
  extensible connection primitive — a strong candidate pattern for RouteCore's endpoint
  addressing (cavity/terminal/splice/diode-side).
- **Computed nets + propagating signals** (set once, inherit along the net) is a clean way to
  label connectivity without storing net objects.
- **Component vs Part split + validation-against-part** is the correct harness data model and
  the right basis for a live BOM.
- **On-canvas live tables (wiring table node, tethered part images)** that render into the PDF
  is a distinctive, high-value documentation pattern for a formboard/cable builder.
- **Transparent JSON format + MCP** is the modern documentation + AI strategy: one public spec
  serves human readers, export/import, and AI agents. Directly relevant to RouteCore's offline,
  local-file architecture (`.routecore`).
- **Nextra-style doc template** (one-sentence definition → screenshot → action-first sections,
  backticked UI labels/keys, per-section permalinks, dense cross-links, "last updated") is the
  documentation style to copy for RouteCore docs.

---

## 4. Cross-tool synthesis for RouteCore

**Visuality concepts**
1. Schematic (logical) / Layout (physical) / 3D (volumetric) are *three projections of one
   model* — never separate files. (harness.design; RapidHarness Top-Level-as-view; RouteCore's
   existing Layout/Schematic split + new 3D fit.)
2. **Physical length, bend radius, and 1:1 scale are first-class** — formboards (both tools)
   prove this is the differentiator for cable/harness work, and it is the core of 3D routing.
   Use explicit to-scale / not-to-scale visual states (green vs. yellow-dash).
3. Node sizes and a **grid** (30u) with documented size formulas make the canvas predictable
   and machine-placeable.
4. A consistent **view toggle cluster** (fit, highlight nets, show parts/coverings/IDs,
   show warnings) and **right-click = context action, drag = create** is a learnable,
   low-friction interaction grammar.
5. **Highlight nets** (full path vs direct neighbors) and cross-view selection carry-through is
   the single best navigation feature for a connectivity tool.

**Connection model**
1. Atomic connection = **{source, target}** where each endpoint is **{element id, handle}** and
   handle is type-dependent (cavity id / "Terminal" / "Splice" / "Left"/"Right"). Minimal and
   extensible.
2. **Nets computed, signals propagate** along the net (set at origin, inherit, `propagate`/
   `global` flags).
3. **Bundle** = physical route edge (source/target + length + coverings + waypoints); wire
   length derived from bundles; unrouted = warning.
4. **Mate** = physical plug-in with a compatibility matrix; mated connectors share a net 1:1.
5. **Group/Embed** = recursive embedded sub-document with qualified ids and optional external
   link (sub-harness reuse/splitting).
6. **Component vs Part** split; component validated against its part; drives the BOM.

**Documentation style**
1. **The drawing is a derived, auto-regenerated view** of the model (RapidHarness); outputs
   (drawing, BOM, wiring table, cut list, label table, nets table, notes table, revision table)
   are all live projections with **template + text-replacement** parameterization.
2. **On-canvas live tables** (wiring table node, tethered part images) that render into the PDF.
3. **Version/revision tables** with per-row include/exclude for printed output.
4. **A public, versioned data-format spec** (harness.design JSON v0.9) that doubles as an AI/
   agent interface (MCP + editable local file). RouteCore's `.routecore` should be a documented,
   versioned, human- and machine-readable format.
5. **Doc template** (Nextra/MDX): one-sentence definition → screenshot → action-first `##`
   sections with backticked UI labels/keys, per-section permalinks, dense cross-links, and a
   "last updated" footer. Quick Start as a numbered pipeline mirroring the real workflow.

## Sources
- QET: qelectrotech.org (home, features), `test/lang-en/manual.php` (Sphinx manual 0.4),
  `wiki_new` (roadmap), GitHub source mirror (README, ChangeLog, Createdxf doxygen),
  forum DXF project-XML walkthrough.
- RapidHarness: rapidharness.com (home, /support/software-overview/version-history full
  2012–2026 changelog), engineeringsoftwaretrials.com review, nathancheek.com 2019 review,
  circuitdiagrammaker.app comparison.
- harness.design: www.harness.design (pricing), docs.harness.design — Getting Started,
  Quick Start (schematic/layout/parts/connections), view (schematic/layout/connections/parts/
  parts library), component (component/connector/wire/bundle), part, feature (validation,
  nets, wiring-tables, destinations, formboard, export, mates, embed, local-files/json-format,
  teams/collaborating, mcp).

---

## 5. Project components, structures, and features for RouteCore

Synthesis of the three tools against RouteCore's current schema
(`database/0001_project.sql`, `0002_editor.sql`, `0003_application.sql`).

### 5.1 Project components — what a complete harness project must contain

Already modeled by RouteCore (tables exist): components with pins/cavities, conductors
with color/stripe/ident, cable instances with cores and core assignments, bundles with
route points and conductor-path bundles, branch points, splices, jumpers, wire groups,
mates with pin maps, signals and net intents, part specs with compatibility, BOM
assignments, layout documents/sheets, revisions, command log, validation issues with
waivers, export/import profiles, tags, notes, view placements, and editor view state.

Not yet modeled, but treated as core by all three tools:

- **Part configurations** — a named combination of accessories (default contact, cavity
  plug, backshell, boot, dust cover, lock, mount) applied automatically when the part is
  assigned to a component. Both harness.design and RapidHarness have this;
  `part_compatibility` gets at the edges but the named-configuration-with-defaults object
  is the missing piece.
- **Cavity designation strategy** — sequential / alphabetical (skipping I, O) / grid
  rows x cols / custom labels; drives how cavity positions are rendered on connectors.
- **Internal part number** alongside the manufacturer P/N (stores/ERP id), part price
  (per-unit or per-length), and a document-level currency.
- **Strip lengths** per terminal/splice/contact — the input that makes cut-list length
  math correct (RapidHarness added splice strip lengths in 2026).
- **Notes table output** with flags/leader lines (notes exist as data; the printed
  output object is not yet there).
- **Tools/fixtures table** — track the tools and fixtures needed to build the harness,
  shown on top-level output (newest RapidHarness feature).
- **Title block as structured fields** (company, title, drawing number, date, drawn by)
  plus a folio format string (`%id/%total`, QET's pattern) and template text replacements
  (`$MANUFACTURER$` style, RapidHarness) — confirm `layout_document`/`layout_sheet` carry
  these as fields, not pixels.

### 5.2 Useful structures — data patterns worth keeping/adopting

1. **One model, N projections.** Schematic (logical), Layout (physical), and 3D
   (volumetric) are all views of one graph. harness.design proves two views is the minimum;
   RouteCore's 3D product-fit projection is a third view of the same data. Never fork data
   per view; per-view placement lives in separate tables (RouteCore's
   `view_placement` / `editor_*_view_state` already do this correctly).
2. **ConnectionPoint = {elementId, handle}** with type-dependent handle values
   (cavity id / "Terminal" / "Splice" / "Left" | "Right"). Minimal, extensible,
   JSON-friendly. `conductor_endpoint` is the analog; keep endpoint identity this
   explicit and stable.
3. **Component vs Part split.** Design with abstract components; assign concrete parts
   later; validate the component against the part (gauge vs contact capacity summed in
   mm2, cavity count, mate compatibility matrix, opposing gender). Part assignment drives
   the BOM and the cut list. The single most important harness-data pattern in the study.
4. **Computed nets + propagated signals.** Derive connectivity; don't store net objects.
   Signal name set once at the origin, inherited along the net, with a `propagate=false`
   stop and a `global` flag.
5. **Recursive groups / embedded sub-harnesses.** A group is a named box containing an
   embedded document (groups nest); member ids qualify as `<group>-<local>`;
   boundary-crossing connections live in the parent. A *linked* group references an
   external source document (relative local file path), is read-only, refreshes
   wholesale, keeps its part library isolated, and is excluded from the parent BOM.
   Designators prefix (`Rear.C1`). "Save group as linked harness" is the way to split a
   design. For offline RouteCore, relative-path links make a project folder movable and
   check-in-able as a whole.
6. **Live on-canvas tables.** A wiring table is a node tethered next to a component,
   listing its pin-out (cavity, signal, destination, wire, color, part, gauge, contact,
   twisted-with, ident, length), editable in place and rendered into the PDF export. Part
   images use the same tether pattern. Highest-value documentation structure in the study.
7. **Transparent versioned file format as a public spec.** harness.design's JSON v0.9
   reference serves human readers, import/export, and AI agents (MCP server + plain-text
   files agents edit on disk). `.routecore` should be documented the same way: version
   field, defaults table, worked example.
8. **Export configuration persisted with the project** — which pages, columns, title
   block, and notes — so every export starts from the same setup.
9. **Formboard structure** — panel grid (ISO size, orientation, rows x cols) +
   pixel-to-length scale + default and per-bundle bend radius + per-bundle set length.
   Exports: one to-scale PDF page per panel, or a digital-formboard JSON (all geometry
   relative to the panel origin) for projection-based build systems.
10. **Validation with waivers.** RouteCore already has `validation_waiver`. The rule set
    to mirror: gauge-vs-contact (multi-wire sum in mm2), cavity count mismatch, mate
    compatibility, unrouted wire, unassigned wire/part, unused parts, N/C visibility.

### 5.3 Useful features, by perspective

**Industrial (aerospace / automotive / marine — the RapidHarness column):**

- Auto-generated manufacturing package: top-level drawing + BOM/aggregate BOM + wiring
  tables + cut lists + label tables + electrical interface tables + nets table + notes
  table + revision table, all derived from the model, one click to a production-data
  document.
- Template-driven output: drawing and table templates with text replacements,
  per-column include/exclude and re-order, table merging/splitting, separate
  revision/notes outputs with per-row include/exclude checkboxes.
- To-scale 1:1 formboards; build directly on the printed board.
- Hierarchy System > Harness > Device with system-level aggregate BOM, nets, and
  highlighting.
- Design rule checker / continuous validation; large-entity performance targets;
  where-used search; duplicate-part detection with reference-updating merge;
  resolve-missing-design wizard.
- Version-control depth: versioned designs, Force Version (reclaim a stuck drawing),
  recycle bin, ownership transfer, partner organizations with view/edit shares.
- Part ecosystem: external catalog search, part images, internal P/N, library sync
  state, price + currency, SAE/metric gauge units, MIL-spec sorting.
- ICD import, Excel import, label data export, datasheet links, revision stamped into
  exported production data.
- Tools/fixtures documentation table for the assembly floor.

**Hobbyist (motorsport / RC / 3D printing / robotics — the harness.design + QET column):**

- Zero-install: portable local app, no accounts, no cloud (RouteCore's existing posture).
- Short legible onboarding pipeline: schematic -> layout -> parts -> connections ->
  export, each step a numbered doc page with screenshots.
- **Destinations**: click a cavity, type a component/cavity name, Enter — connection
  created. The single best power feature for fast authoring; cheap to add on top of
  RouteCore's port-to-port wire creation.
- Live feedback everywhere: instant net highlight, part pills on nodes, gauge warnings
  as parts are assigned, BOM quantities updating on assignment.
- Wire color coding hobbyists actually use: color + stripe + multiple ident bands +
  ident label, plus standard color-sequence presets (IEC 3-letter codes).
- Jumper wires (loopback, zero length) for test setups.
- Embed/reuse of standard drops: a pigtail or sensor drop designed once, embedded in
  many harnesses, kept in sync.
- Wiring table printed next to each connector on a formboard; build by reading the board.
- Part images tethered next to components — match a connector to a photo.
- AI assistance via the documented file format: an LLM agent reads and edits the project
  file directly. Offline RouteCore should build the plain-file + documented-spec path.
- Starter templates (2/4/8/12-pin presets) as the onboarding device, in place of
  connection caps.

### 5.4 Gap list vs current schema (candidate next steps)

**Status (2026-09-11):** all ten items — including the per-panel formboard
PDF and revision-table row include/exclude — are implemented and shipped on
`main` (`918ed5f` data layer, `60ff279` front end, `22c533a` format spec,
`c5f3131` type-to-connect, plus the formboard-PDF and revision-visibility
follow-ups). Per item:

1. Part configurations + designation strategies — `app_part_configuration`
   (migration 0004), CRUD API + dialog; `app_part_configuration` extends the
   `part_spec`/BOM layer with reusable accessory recipes.
2. Live wiring-table nodes — `wire_schedule`, `cut_list`, `connection_table`,
   `continuity_table`, `revision_table`, and tools tables are query-backed
   `layout_element` rows re-populated on read, and are embedded in the SVG
   export via `drawingElements`.
3. Formboard — `getFormboard` derives per-wire routed/set length, bend count,
   and to-scale/not-to-scale state from the routed scene; panel grid, bend
   radius, and step are project settings; digital-formboard JSON export
   (`routecore-formboard/1`) **and a dependency-free per-panel PDF export**
   (`formboard-pdf`, one page per panel with 1:1 grid, to-scale wire
   geometry, schedule, and totals).
4. Destinations (type-to-connect) — re-target a wire endpoint from the
   Properties tab, the wire context menu, or Route → "Reconnect endpoint…";
   searches designator/pin/function/title, enforces port capacity, and can
   detach to a free end.
5. Cut list — enriched CSV with routed length, set length (stepped to the
   formboard config), bend count, and formboard state.
6. Revision table + notes — live `revision_table` drawing element with
   **per-row include/exclude** (`content.excludedRevisionIds`, edited via the
   Drawing inspector "Edit rows…"); leader notes remain `layout_element` rows
   of kind `note`.
7. Linked sub-projects — assemblies are generated projections with stable
   origin mappings and sync review; `designatorPrefix` now produces qualified
   sub-harness designators (e.g. `Rear-J1`).
8. Tools/fixtures table — `app_tool_fixture` with CRUD API, dialog, and a
   live drawing table mirrored in the tools CSV export.
9. Public versioned format spec — `docs/FILE_FORMAT_SPECIFICATION.md`
   (`routecore-project-interchange/1`, `routecore-formboard/1`,
   `routecore-netlist/1`, editor JSON schemaVersion 1), with versioning and
   conformance rules.
10. Where-used — live search across components, wires, and BOM items, seeded
    from the current selection.

No known outstanding sub-items remain in this list.

1. Part configurations + designation strategies (extend `part_spec`).
2. Live wiring-table node in Layout/3D rendered into exports.
3. Formboard: panel grid, bend radius, set-length-to-scale with the to-scale/
   not-to-scale visual state (solid vs yellow-dashed), per-panel PDF, digital-formboard
   JSON.
4. Destinations (type-to-connect).
5. Cut list output (strip lengths + bundle lengths + per-conductor); strip-length fields
   are the missing input.
6. Revision table with per-row include/exclude in exports; notes table with leader flags.
7. Embedded/linked sub-projects with qualified designators and isolated BOM.
8. Tools/fixtures table.
9. Public versioned `.routecore` format spec document (like the harness.design JSON v0.9
   reference) — doubles as the AI-agent interface.
10. Where-used search across components and parts.
