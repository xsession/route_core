// Anvil Test Framework — Technical Reference Manual
// Typst document — compile with: typst compile main.typ

#set document(
  title: "Anvil Test Framework — Technical Reference",
  author: "Anvil Test Framework Contributors",
  date: auto,
)

#set page(
  paper: "a4",
  margin: (top: 3cm, bottom: 3cm, left: 2.5cm, right: 2.5cm),
  header: context {
    if counter(page).get().first() > 1 [
      #set text(8pt, fill: luma(120))
      Anvil Test Framework
      #h(1fr)
      Technical Reference v0.1.0
    ]
  },
  footer: context {
    set text(8pt, fill: luma(120))
    h(1fr)
    counter(page).display("1 / 1", both: true)
    h(1fr)
  },
)

#set text(font: "New Computer Modern", size: 10.5pt)
#set par(justify: true, leading: 0.65em)
#set heading(numbering: "1.1.")
#show heading.where(level: 1): it => {
  pagebreak(weak: true)
  v(1em)
  text(16pt, weight: "bold", it)
  v(0.8em)
}
#show heading.where(level: 2): it => {
  v(0.8em)
  text(13pt, weight: "bold", it)
  v(0.4em)
}
#show heading.where(level: 3): it => {
  v(0.6em)
  text(11pt, weight: "bold", it)
  v(0.3em)
}
#show raw.where(block: true): it => {
  set text(9pt)
  block(
    fill: luma(245),
    inset: 10pt,
    radius: 3pt,
    width: 100%,
    it,
  )
}
#show link: it => text(fill: rgb("#1a5276"), it)

// ── Title Page ──────────────────────────────────────────────

#align(center)[
  #v(4cm)
  #text(28pt, weight: "bold")[Anvil Test Framework]
  #v(0.5cm)
  #text(14pt, fill: luma(80))[Technical Reference Manual]
  #v(0.3cm)
  #text(12pt)[Version 0.1.0]
  #v(2cm)
  #text(10pt, fill: luma(100))[
    Production-grade generative testing for \
    industrial and web GUI applications
  ]
  #v(3cm)
  #line(length: 60%, stroke: 0.5pt + luma(180))
  #v(0.5cm)
  #text(9pt, fill: luma(120))[
    Rust · 11 Modules · 97+ Tests · CLI + Python Orchestration
  ]
]

// ── Table of Contents ───────────────────────────────────────

#pagebreak()
#outline(title: "Contents", indent: auto, depth: 3)

// ═══════════════════════════════════════════════════════════
= Introduction
// ═══════════════════════════════════════════════════════════

The *Anvil Test Framework* is a Rust-native testing toolkit designed to
validate complex, stateful GUI applications at scale. It provides:

- *Graph-based model layer* with custom invariants
- *Event sourcing* with full undo/redo and time-travel replay
- *Property-based testing* with deterministic seeding and automatic shrinking
- *CRDT simulation* for multi-client convergence testing
- *Render validation* for layout correctness
- *Web GUI testing* with component-tree generation and accessibility checks
- *Performance benchmarking* with statistical aggregation
- *Structured logging* and Chrome trace export
- *CLI* with 8 subcommands for CI integration

== Prerequisites

- Rust 1.75+ (edition 2021)
- Python 3.10+ (optional, for orchestration)
- Typst 0.11+ (to compile this document)

== Installation

```bash
cargo add anvil-core
cargo install anvil-cli
```

// ═══════════════════════════════════════════════════════════
= Architecture
// ═══════════════════════════════════════════════════════════

The framework is organized as a Cargo workspace:

#table(
  columns: (1fr, 2fr),
  align: (left, left),
  stroke: 0.5pt + luma(200),
  inset: 8pt,
  [*Crate*], [*Purpose*],
  [`anvil-core`], [Library: all modules, types, validators],
  [`anvil-cli`], [Binary: CLI runner with 8 subcommands],
)

== Layer Diagram

#align(center)[
  #rect(inset: 12pt, radius: 4pt, stroke: 0.5pt + luma(150))[
    #set text(9pt)
    #grid(
      columns: (1fr,),
      gutter: 6pt,
      align(center)[CLI / Python Orchestration],
      align(center)[─────────────────────],
      align(center)[Runner · Generators · Web],
      align(center)[─────────────────────],
      align(center)[Property · CRDT · Render · Perf],
      align(center)[─────────────────────],
      align(center)[Model · Events · Serialization · Logging],
    )
  ]
]

Each higher layer depends only on layers below it. The _model_ layer has zero
external dependencies beyond `serde`.

== Design Principles

+ *Determinism* — Every random value is `f(seed, size)`. Tests are reproducible.
+ *Composability* — Combinators and traits, not monolithic test classes.
+ *Zero `unsafe`* — The core crate contains no unsafe code.
+ *Minimal dependencies* — Only `serde`, `clap`, `tracing`.
+ *CI-first* — JUnit XML, CSV export, deterministic seeds from run IDs.

// ═══════════════════════════════════════════════════════════
= Module Reference
// ═══════════════════════════════════════════════════════════

== Model

The `model` module provides the foundational data structures.

#table(
  columns: (1fr, 2.5fr),
  align: (left, left),
  stroke: 0.5pt + luma(200),
  inset: 8pt,
  [*Type*], [*Description*],
  [`NodeId(u64)`], [Unique node identifier],
  [`EdgeId(u64)`], [Unique edge identifier],
  [`Node`], [ID, kind, label, position `(x, y)`, metadata],
  [`Edge`], [ID, from/to node IDs, label, metadata],
  [`Graph`], [Node/edge collections, CRUD operations, invariant checks],
)

```rust
let mut graph = Graph::new();
let n1 = graph.add_node(Node {
    id: NodeId(1), kind: "ecu".into(),
    label: "ECU-A".into(), x: 0.0, y: 0.0,
    metadata: Default::default(),
});
graph.check_invariants()?;
```

=== Custom Invariants

```rust
graph.add_invariant("no_self_loops", |g| {
    for e in g.edges() {
        if e.from == e.to { return Err("self-loop".into()); }
    }
    Ok(())
});
```

== Events

Event sourcing with full undo/redo and deterministic replay.

=== Event Types

`AddNode`, `RemoveNode`, `AddEdge`, `RemoveEdge`, `MoveNode`,
`UpdateMetadata`, `BatchOperation`.

=== EventLog

```rust
let mut log = EventLog::new();
log.append(Event::AddNode { id: NodeId(1), .. });
log.undo();  // reverts last event
log.redo();  // re-applies
```

=== EventStore

```rust
let store = EventStore::new();
store.save(&log, "events.json")?;
let restored = store.load("events.json")?;
```

=== ReplayEngine

```rust
let engine = ReplayEngine::new(&log);
let state_at_5 = engine.replay_to(5);  // time-travel to event #5
```

== Serialization

Round-trip and golden-file testing with structural comparison.

```rust
let json = serde_json::to_string(&graph)?;
let restored: Graph = serde_json::from_str(&json)?;
// Compare via serde_json::Value to avoid key-ordering issues
assert_eq!(
    serde_json::to_value(&graph)?,
    serde_json::to_value(&restored)?,
);
```

== Property-Based Testing

QuickCheck-style random generation with deterministic seeds and automatic
shrinking.

```rust
let config = PropertyTestConfig {
    seed: 42, num_cases: 100,
    max_nodes: 50, max_edges: 100, max_shrinks: 100,
};
let runner = PropertyRunner::new(config);
let results = runner.check_graph_property(|graph| {
    graph.check_invariants().map_err(|e| e.to_string())
});
```

== CRDT Simulation

Multi-client concurrent editing with Lamport timestamps and convergence
verification.

```rust
let mut sim = CrdtSimulator::new(3);
sim.random_operations(42, 50);
let results = sim.check_convergence();
assert!(results.converged);
```

=== Convergence Checks

+ Node set equality across all clients
+ Edge set equality
+ Position convergence (last-writer-wins)
+ Per-client graph invariants

== Render Validation

Spatial correctness for rendered graphs.

=== BoundingBox

```rust
let a = BoundingBox { x: 0.0, y: 0.0, width: 100.0, height: 50.0 };
assert!(a.contains_point(50.0, 25.0));
```

=== LayoutValidator

```rust
let validator = LayoutValidator::new(&render_tree);
let report = validator.validate_all();
assert!(report.is_valid());
```

Checks: containment, overlap, edge consistency.

== Performance

=== Benchmarks

```rust
let mut suite = BenchmarkSuite::new("graph-ops");
suite.bench("add_1000_nodes", || { /* ... */ });
let report = suite.run(100);
report.export_csv("benchmarks.csv")?;
```

=== Stress Testing

```rust
let config = StressTestConfig {
    num_nodes: 10_000, num_edges: 50_000,
    num_operations: 100_000, seed: 42,
};
let result = stress_test_graph(config);
```

=== Memory Profiling

```rust
let profile = MemoryProfile::measure(|| build_large_graph(5000, 20000));
println!("Peak: {} bytes", profile.peak_bytes);
```

== Logging

Structured JSON logging with hierarchical spans.

```rust
let logger = StructuredLogger::new(LogLevel::Debug);
logger.info("test.start", json!({ "suite": "graph" }));
let child = logger.child("crdt");
child.warn("slow", json!({ "ms": 1200 }));
```

=== Trace Export

```rust
let exporter = TraceExporter::new();
exporter.start_span("suite");
// ...
let json = exporter.export_json(); // Chrome trace format
```

== Runner

Test discovery, execution, panic recovery, and JUnit XML output.

```rust
let case = TestCase::new("overlap_check", |ctx| { /* ... */ });
let mut suite = TestSuite::new("render");
suite.add(case);
let mut runner = TestRunner::new();
runner.add_suite(suite);
let report = runner.run();
report.export_junit("results.xml")?;
```

== Generators

Composable generative test engine with combinator DSL.

=== Combinators

```rust
Gen::constant(42)
Gen::range(0..100)
Gen::one_of(vec![a, b, c])
Gen::range(0..10).map(|n| n * 2)
Gen::range(1..5).flat_map(|len| Gen::vec(Gen::range(0..100), len))
```

=== Arbitrary Trait

```rust
impl Arbitrary for MyType {
    fn arbitrary(seed: u64, size: usize) -> Self { /* ... */ }
    fn shrink(&self) -> Vec<Self> { /* ... */ }
}
```

=== GenRunner

```rust
let runner = GenRunner::new(config);
let result = runner.run(gen, |value| { /* property */ Ok(()) });
```

== Web GUI Testing

Generative testing for web applications: component trees, accessibility, forms,
routing, responsive layout, state management.

=== Component Tree Generation

```rust
let tree = ComponentTree::generate(42, GenerateConfig {
    max_depth: 5, max_children: 4, viewport: (1920, 1080),
});
```

=== Validation

```rust
let report = WebValidator::new(&tree).validate_all();
// Checks: accessibility, overlaps, focus order
```

=== Event Simulation

```rust
let events = EventSimulator::generate_sequence(42, &tree, 20);
let mut state = AppState::default();
for event in &events { state.dispatch(event); }
```

=== Responsive Breakpoints

```rust
for (w, h) in [(320, 568), (768, 1024), (1920, 1080)] {
    let tree = ComponentTree::generate(42, GenerateConfig {
        viewport: (w, h), ..default
    });
    assert!(WebValidator::new(&tree).validate_all().is_valid());
}
```

// ═══════════════════════════════════════════════════════════
= CLI Reference
// ═══════════════════════════════════════════════════════════

#table(
  columns: (1fr, 2.5fr),
  align: (left, left),
  stroke: 0.5pt + luma(200),
  inset: 8pt,
  [*Command*], [*Purpose*],
  [`run`], [Execute test suites with filtering, tagging, parallel mode],
  [`stress`], [Large-scale stress testing with configurable node/edge counts],
  [`bench`], [Benchmark suite with statistical aggregation + CSV export],
  [`replay`], [Replay event logs with optional determinism verification],
  [`report`], [Convert results to JUnit XML, CSV, or JSON],
  [`property`], [Property-based testing with configurable cases and shrinking],
  [`crdt`], [CRDT convergence simulation with configurable clients],
  [`web`], [Web GUI testing: component trees, forms, accessibility],
)

=== Global Options

- `-v, --verbose` — Enable debug-level JSON logging
- `-o, --output <DIR>` — Output directory (default: `./test-output`)

=== Exit Codes

- `0` — All tests passed
- `1` — One or more tests failed
- `2` — CLI argument error or I/O error

// ═══════════════════════════════════════════════════════════
= CI/CD Integration
// ═══════════════════════════════════════════════════════════

== GitHub Actions

```yaml
- name: Tests
  run: |
    cargo test --workspace
    cargo run -- property --cases 5000 --seed ${{ github.run_id }}
    cargo run -- web --trees 100 --depth 5
```

== GitLab CI

```yaml
test:
  image: rust:latest
  script:
    - cargo test --workspace
    - cargo run -- property --cases 5000
    - cargo run -- crdt --clients 5 --ops 50
  artifacts:
    reports:
      junit: test-output/results.xml
```

== Deterministic Seeds

Use CI run IDs as seeds for unique-yet-reproducible coverage:

```bash
anvil property --seed $GITHUB_RUN_ID
anvil property --seed $CI_PIPELINE_ID
```

// ═══════════════════════════════════════════════════════════
= Security
// ═══════════════════════════════════════════════════════════

- *Threat model*: Developer workstations and CI. Not network-facing.
- *No `unsafe`*: Zero unsafe blocks in the core crate.
- *Input validation*: JSON deserialized via `serde_json`; CLI via `clap`.
- *Web generators*: `html_safe` produces escaped, injection-free strings.
- *Dependency auditing*: Run `cargo audit` in CI.
- *Seeds are not secrets*: Do not use framework RNG for cryptography.

// ═══════════════════════════════════════════════════════════
= Appendix
// ═══════════════════════════════════════════════════════════

== Dependency Table

#table(
  columns: (1fr, 1fr, 2fr),
  align: (left, left, left),
  stroke: 0.5pt + luma(200),
  inset: 8pt,
  [*Crate*], [*Version*], [*Purpose*],
  [`serde`], [1.x], [Serialization framework],
  [`serde_json`], [1.x], [JSON serialization],
  [`clap`], [4.x], [CLI argument parsing],
  [`tracing`], [0.1.x], [Structured logging spans],
  [`tracing-subscriber`], [0.3.x], [Log output formatting],
)

== License

MIT License. See `LICENSE` file.
