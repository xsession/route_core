# Anvil Test Framework — Architecture

## Overview

A production-grade, universal testing framework for professional industrial GUI applications (CAD/CAM, embedded diagnostics, engineering visualization). Built in Rust for performance and determinism, with Python orchestration for CI/CD integration.

## Architecture Layers

```
MODEL → OPERATIONS → EVENTS → SERIALIZATION → RENDER → UI
  │         │           │           │            │       │
  │         │           │           │            │       └── UI tests (minimal, targeted)
  │         │           │           │            └── Structural render validation
  │         │           │           └── Round-trip, golden tests, schema evolution
  │         │           └── Event sourcing, replay, undo/redo
  │         └── Graph operations with invariant enforcement
  └── Pure deterministic graph model
```

Each layer is independently testable. No layer depends on layers above it.

## Module Map

```
testing-framework/
├── Cargo.toml                      # Workspace root
├── crates/
│   ├── core/                       # Core testing library
│   │   ├── src/
│   │   │   ├── lib.rs              # Public API
│   │   │   ├── model.rs            # Graph model + invariants
│   │   │   ├── events.rs           # Event sourcing + replay engine
│   │   │   ├── serialization.rs    # Round-trip + golden + schema evolution
│   │   │   ├── property.rs         # Property-based test generator + runner
│   │   │   ├── crdt.rs             # CRDT simulation (multi-client)
│   │   │   ├── render.rs           # Structural render validation
│   │   │   ├── perf.rs             # Benchmarks + stress tests + memory profiling
│   │   │   ├── logging.rs          # Structured logging + trace export
│   │   │   └── runner.rs           # Test suite/case/runner framework
│   │   ├── tests/
│   │   │   └── integration_tests.rs
│   │   └── benches/
│   │       └── model_bench.rs      # Criterion benchmarks
│   └── cli/                        # CLI test runner
│       └── src/main.rs
├── python/                         # Python orchestration layer
│   ├── pyproject.toml
│   ├── orchestrator/
│   │   ├── __init__.py
│   │   ├── runner.py               # Test orchestration + sharding
│   │   └── cli.py                  # Click-based CLI
│   └── tests/
│       └── test_orchestrator.py
└── ci/
    ├── github-actions.yml
    └── gitlab-ci.yml
```

## Testing Categories

### A. Deterministic Model Testing (`model.rs`)

Pure logic layer with zero UI dependencies. The `Graph` struct is the single source of truth.

**Invariants enforced:**
- No dangling edges (referential integrity)
- No self-loops
- Valid parent references
- Unique IDs
- Custom invariants via the `Invariant` trait

**Key features:**
- Deterministic content hashing (SHA-256, insertion-order independent)
- Topological sort with cycle detection
- Version tracking on every mutation

### B. Property-Based Testing (`property.rs`)

QuickCheck-style random generation with automatic shrinking.

**Capabilities:**
- `ArbitraryGraph::generate(seed, max_nodes, max_edges)` — deterministic random graphs
- `ArbitraryGraph::generate_operations(seed, num_ops)` — random operation sequences
- `PropertyRunner` — runs N cases, shrinks failures to minimal reproductions
- All generated graphs pass built-in invariants by construction

**Properties tested:**
- Invariants hold on all generated graphs
- JSON round-trip preserves content hash
- Content hash is deterministic
- Operation sequences preserve invariants

### C. Event Sourcing (`events.rs`)

All mutations captured as replayable events.

**Event types:** NodeAdded, NodeRemoved, NodeMoved, NodeResized, NodePropertyChanged, EdgeAdded, EdgeRemoved, MetadataChanged, Batch

**Features:**
- `EventLog` with undo/redo cursor
- `EventStore` for file-backed persistence
- `ReplayEngine` — reconstruct any state from events
- Determinism verification (replay twice → same hash)
- Partial replay to any point in history (time-travel debugging)

### D. Serialization / Golden Testing (`serialization.rs`)

**Round-trip guarantees:**
- `RoundTrip::json()` — serialize→deserialize→serialize identity
- `RoundTrip::bincode()` — binary format round-trip
- `RoundTrip::graph_json()` / `graph_bincode()` — content hash preservation

**Golden tests:**
- `GoldenTest` — compare output against known-good snapshots
- Auto-creates golden files on first run
- Set `UPDATE_GOLDEN=1` to regenerate
- SHA-256 content comparison

**Schema evolution:**
- `SchemaVersion` with major/minor compatibility
- `SchemaEvolution::test_migration()` — verify old→new deserialization

### E. CRDT Simulation (`crdt.rs`)

Full distributed editing simulation.

**Components:**
- `SimulatedClient` — local graph + Lamport clock + outbox
- `NetworkSimulator` — configurable delay, jitter, and partitions
- `CrdtSimulator` — orchestrates multi-client scenarios

**Validation:**
- Convergence check (all clients have same content hash)
- Invariant check across all clients
- Idempotent operation application
- Partition tolerance (operations dropped during partition)
- Network healing and eventual sync

### F. Render Validation (`render.rs`)

Structural layout validation (not pixel-based).

**Components:**
- `BoundingBox` — AABB with intersection/union/containment
- `RenderTree` — structural tree built from graph
- `LayoutValidator`:
  - No overlapping siblings
  - Valid dimensions
  - Children contained within parents
  - Completeness (render tree matches graph)
  - Edge connectivity

### G. Performance Testing (`perf.rs`)

**Benchmarks:**
- `BenchmarkSuite` — warmup + N iterations + statistics
- CSV export for CI tracking
- Criterion integration for detailed analysis

**Stress tests:**
- `StressTestConfig` — configurable node/edge count + timeout
- Measures: build time, invariant check, serialization, deserialization, hashing
- Memory profiling (JSON vs bincode size, compression ratio)

### H. Test Runner (`runner.rs`)

General-purpose test execution framework.

- `TestCase` — name, tags, timeout, seed, closure body
- `TestSuite` — named collection of cases
- `TestRunner` — parallel execution (via rayon), filtering by name/tag
- `RunReport` — aggregated results with JUnit XML export
- Panic catching (tests that panic get `Panicked` status)

## CLI Commands

```
anvil run    [--filter <pat>] [--tag <tag>] [--sequential] [--seed <n>] [--format json|text|junit]
anvil stress [--nodes <n>] [--edges <n>] [--seed <n>] [--timeout <s>]
anvil bench  [--iterations <n>] [--csv]
anvil replay <event-log.json> [--verify] [--to-index <n>]
anvil report <results.json> --format <junit|csv|json>
anvil property [--cases <n>] [--max-nodes <n>] [--seed <n>] [--max-shrinks <n>]
anvil crdt   [--clients <n>] [--ops <n>] [--seed <n>] [--partitions]
```

## Deterministic Seeding

Every random operation uses `ChaCha8Rng` with explicit seeds. To reproduce any failure:

1. Note the `seed` from the failure output
2. Re-run with `--seed <N>`
3. The exact same graph/operations will be generated

## CI/CD Integration

### GitHub Actions (`ci/github-actions.yml`)
- Cross-platform matrix (Linux, Windows, macOS)
- Rust stable + MSRV (1.75)
- Property test sharding (4 shards)
- Stress test tiers (1K, 10K, 50K nodes)
- Criterion benchmarks with artifact upload
- CRDT convergence (with and without partitions)
- Python orchestrator tests

### GitLab CI (`ci/gitlab-ci.yml`)
- Same coverage, GitLab-native syntax
- JUnit report integration
- Artifact retention (14 days tests, 30 days benchmarks)
- High-memory tags for large stress tests

## Extensibility

### Custom Invariants

```rust
use anvil_core::model::{Invariant, Graph, GraphError};

struct MaxDegree(usize);

impl Invariant for MaxDegree {
    fn name(&self) -> &str { "max_degree" }
    fn check(&self, graph: &Graph) -> Result<(), GraphError> {
        for &node_id in graph.nodes.keys() {
            if graph.edges_of(node_id).len() > self.0 {
                return Err(GraphError::InvariantViolation(
                    format!("Node {:?} exceeds max degree {}", node_id, self.0)
                ));
            }
        }
        Ok(())
    }
}
```

### Custom Test Cases

```rust
use anvil_core::runner::{TestSuite, TestCase};

let mut suite = TestSuite::new("my_domain");
suite.add(
    TestCase::new("my_domain::custom_check", || {
        // Your domain-specific validation
        Ok(())
    })
    .with_tag("domain")
    .with_seed(42)
);
```

### Python Orchestration

```python
from orchestrator.runner import TestOrchestrator, RunConfig

config = RunConfig(
    rust_binary="./target/release/anvil",
    seed=42,
    parallel=True,
)
orch = TestOrchestrator(config)
reports = orch.run_all()
```

## Design Principles

1. **Determinism first** — Every operation is seed-controlled and reproducible
2. **Layer independence** — Each layer testable without layers above
3. **Minimal UI testing** — Focus on model/logic; UI tests only for critical paths
4. **Shrink to minimal** — Property test failures auto-shrink to smallest reproducing case
5. **Structured output** — JSON, CSV, JUnit XML for CI integration
6. **Cross-platform** — Runs identically on Linux, Windows, macOS
7. **Scale-ready** — Tested from 10-node toy graphs to 50K+ node industrial models
