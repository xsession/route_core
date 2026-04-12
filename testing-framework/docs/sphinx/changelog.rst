Changelog
=========

All notable changes to this project are documented here.

The format follows `Keep a Changelog <https://keepachangelog.com/>`_.

v0.1.0 — Initial Release
-------------------------

Added
^^^^^

- **Model layer**: ``Graph``, ``Node``, ``Edge`` with custom invariants.
- **Event sourcing**: ``EventLog`` with append, undo, redo; ``EventStore``
  persistence; ``ReplayEngine`` with time-travel.
- **Serialization**: Round-trip testing, golden-file testing, schema evolution
  validation (structural ``serde_json::Value`` comparison).
- **Property-based testing**: ``PropertyRunner`` with arbitrary graph
  generation, configurable shrinking.
- **CRDT simulation**: Multi-client ``CrdtSimulator`` with Lamport timestamps,
  ``NetworkSimulator`` with configurable delivery, convergence checking.
- **Render validation**: ``LayoutValidator`` for containment, overlap, and
  edge consistency checks on ``RenderTree``.
- **Performance**: ``BenchmarkSuite`` with statistical aggregation,
  ``StressTestConfig``, ``MemoryProfile``, CSV export.
- **Structured logging**: ``StructuredLogger`` with child loggers,
  ``TraceExporter`` for Chrome trace format.
- **Test runner**: ``TestRunner`` with panic recovery, ``TestSuite``
  composition, JUnit XML export.
- **Generative engine**: ``Gen`` combinator DSL, ``Arbitrary`` trait with
  built-in implementations, ``GenRunner`` with automated shrinking.
- **Web GUI testing**: ``ComponentTree`` generation, ``WebValidator``
  (accessibility, overlaps, focus order), ``EventSimulator``, ``AppState``
  reducer with undo/redo, ``Router`` generation, responsive breakpoint testing.
- **CLI**: 8 subcommands (``run``, ``stress``, ``bench``, ``replay``,
  ``report``, ``property``, ``crdt``, ``web``).
- **Python orchestration**: ``TestOrchestrator``, ``Pipeline``, HTML reporting.
- **CI/CD**: GitHub Actions and GitLab CI pipeline configurations.
