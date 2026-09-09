# RouteCore Authoring UX Reference Study

**Research date:** 2026-09-09

**Scope:** Project Builder, Assembly Builder, Component Creator, and Cable Creator

**Use:** Public-behavior and interaction research only; RouteCore retains independent code, visuals, terminology, and offline architecture.

## Reference boundary

The requested `xsession/editor-core` repository is the `references/editor-core` Git submodule. After the capability review it became RouteCore's authoritative reusable engine: its TypeScript source is compiled and its runtime is synchronized into the RouteCore compatibility package and browser vendor directory.

The shared engine owns mutation-impact derivation, obstacle/topology/environment revision counters, dependency-scoped rerouting, persistent routing sessions during drag, scalable render backends, and large-scene benchmarks. Product UI, persistence, libraries, branded samples, and workflow orchestration remain in RouteCore.

Splice CAD was studied only through public product pages, documentation, tutorials, and screenshots. The authenticated application and non-public implementation were not inspected.

Requested public application entry point: [Splice CAD harness project](https://splice-cad.com/app/#/harness/project).

## Findings by authoring surface

### Project Builder

Public Splice documentation distinguishes a compact Layout projection for topology work from a pin-expanded Schematic projection for connectivity work. It also makes assembly generation a selection-first workflow and keeps project structure, properties, and the canvas visible together.

RouteCore response:

- Keep Layout and Schematic as synchronized projections of one model.
- State each projection's purpose directly in the view tab: `topology` or `pin-level`.
- Keep model navigation, Explorer, local Library, BOM, Properties, validation, and history available without leaving the editor.
- Make assembly generation show a live component/conductor impact summary before committing.

Sources: [Splice Canvas & Navigation](https://splice-cad.com/docs/plan/canvas-and-navigation/), [Splice Terminology](https://splice-cad.com/docs/plan/terminology/), [Splice Assembly Generation & Sync](https://splice-cad.com/docs/plan/assembly-generation/).

### Assembly Builder

The public Splice workflow treats Schematic as the electrical authoring surface and Layout as the manufacturing-document surface. The latter emphasizes assembly views, BOM and wire-schedule tables, dimensions, notes, title blocks, sheets, and export.

RouteCore response:

- Identify the active assembly surface explicitly and distinguish `pin-level` Schematic from `drawing` Layout.
- Preserve direct access to BOM, connectivity, revisions, diagnostics, and eight offline exports.
- Keep generated assemblies as independent models with stable mappings rather than hiding them inside a transient export dialog.

Sources: [Splice Assembly Builder — Schematic](https://splice-cad.com/tutorial/harness-schematic/), [Splice Assembly Builder — Layout](https://splice-cad.com/tutorial/harness-layout/), [Splice PDF Export](https://splice-cad.com/docs/harness/pdf-export/).

### Component Creator

The public Splice creator combines properties, visual feedback, pin editing, and multiple physical views. The strongest general UX lesson is immediate feedback: identity and pin changes should be visible before the reusable definition is saved.

RouteCore response:

- Retain the two-pane definition/pin matrix plus live geometry preview.
- Add common 2-, 4-, 8-, and 12-pin starting presets.
- Show the current pin and populated-bank count continuously.
- Preserve local-library save and immediate placement as one uninterrupted flow.

Source: [Splice Component Creator tutorial](https://splice-cad.com/tutorial/component-creator/).

### Cable Creator

Across the compared tools, cable definitions are clearest when identity, construction, conductor count, gauge, and color coding are visible together. Text-based WireViz is especially effective at compactly expressing repeated cores and standard color schemes.

RouteCore response:

- Retain construction fields and per-core editing beside a live swatch preview.
- Add common 2-, 4-, 8-, and 12-core starting presets and a live core count.
- Keep cable definitions reusable and local, then expose them through the same Library panel used during harness authoring.

Sources: [Splice Cable Creator overview](https://splice-cad.com/), [WireViz](https://github.com/wireviz/WireViz), [WireViz tutorial](https://github.com/wireviz/WireViz/blob/master/tutorial/readme.md).

## Additional products reviewed

### harness.design

Its public workflow is a short, legible progression: schematic, physical layout, parts, connection review, then export. Its export configuration reinforces that schematic and layout are different deliverables and that manufacturing output should remain tied to the design data.

Adopted lesson: make view purpose and downstream manufacturing intent visible, while retaining RouteCore's denser desktop shell.

Sources: [harness.design Quick Start](https://docs.harness.design/quick-start), [harness.design Export](https://docs.harness.design/feature/export).

### RapidHarness

RapidHarness publicly emphasizes automatic drawing, live consistency, integrated BOM/cut-list/wiring outputs, reusable parts, rule checking, and hierarchy. Its tutorial order follows real work from connector placement through connections, bundles, rule checking, and manufacturing output.

Adopted lesson: keep validation and derived manufacturing data continuously adjacent to authoring rather than postponing them to export.

Sources: [RapidHarness documentation and support](https://rapidharness.com/support), [RapidHarness tutorials](https://rapidharness.com/harness-software-tutorials), [RapidHarness product overview](https://rapidharness.com/).

### QElectroTech

QElectroTech is a broad open-source electrical-diagram editor with a large element collection and a conventional project/canvas/properties mental model.

Adopted lesson: familiar CAD panel placement and a reusable symbol library reduce onboarding cost; RouteCore should specialize those conventions for harness data rather than inventing novel navigation.

Sources: [QElectroTech](https://qelectrotech.org/), [QElectroTech documentation](https://qelectrotech.github.io/qelectrotech-doc/).

## Implemented in this iteration

1. A persistent four-surface switcher in the application header.
2. Surface-aware breadcrumbs and explicit view-purpose labels.
3. One-click pin-count presets plus live pin/bank feedback in Component Creator.
4. One-click core-count presets plus live core feedback in Cable Creator.
5. Select-all, clear, and live topology-impact feedback in assembly generation.
6. Static coverage that checks the four surfaces and guided controls remain exposed.

## Next independent priorities

1. Add assembly drawing primitives: linked dimensions, leader notes, title blocks, and live BOM/wire-schedule tables.
2. Add Component Creator mate-side/wire-side mechanical footprints without coupling them to the logical schematic symbol.
3. Add cable shield/drain and standard color-sequence presets with explicit electrical validation.
4. Add an assembly synchronization diff that explains added, changed, detached, and conflicted entities before applying updates.
5. Benchmark RouteCore's own engine at 1k, 10k, and 50k entities and introduce dependency-scoped rerouting only where profiling justifies it.
