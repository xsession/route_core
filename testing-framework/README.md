# Industrial Test Framework

Production-grade testing framework for professional industrial GUI applications.

## Quick Start

### Prerequisites

- Rust 1.75+ (`rustup install stable`)
- Python 3.10+ (for orchestration, optional)

### Build

```bash
cd testing-framework
cargo build --workspace --release
```

### Run All Tests

```bash
# Rust unit + integration tests
cargo test --workspace

# CLI-based test runner
cargo run -p industrial-test-cli -- run

# Property-based tests
cargo run -p industrial-test-cli -- property --cases 200

# CRDT simulation
cargo run -p industrial-test-cli -- crdt --clients 5 --ops 50

# Benchmarks
cargo bench --bench model_bench
cargo run -p industrial-test-cli -- bench --iterations 100 --csv

# Stress test
cargo run -p industrial-test-cli -- stress --nodes 10000 --edges 30000
```

### Python Orchestrator

```bash
cd python
pip install -e ".[dev]"

# Run all test categories via orchestrator
orch all --seed 42

# Run specific category
orch property --cases 500
orch stress --nodes 50000
```

## Architecture

See [docs/architecture.md](docs/architecture.md) for the full design.

```
MODEL → OPERATIONS → EVENTS → SERIALIZATION → RENDER → UI
```

Each layer is independently testable with dedicated test modules.

## Test Categories

| Category | Module | CLI Command | Purpose |
|----------|--------|-------------|---------|
| Model | `model.rs` | `run` | Deterministic graph invariants |
| Property | `property.rs` | `property` | Random generation + shrinking |
| Events | `events.rs` | `replay` | Event sourcing + undo/redo |
| Serialization | `serialization.rs` | `run` | Round-trip + golden tests |
| CRDT | `crdt.rs` | `crdt` | Distributed convergence |
| Render | `render.rs` | `run` | Structural layout validation |
| Performance | `perf.rs` | `stress` / `bench` | Stress tests + benchmarks |

## License

MIT
