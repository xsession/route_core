.. Industrial Test Framework documentation master file.

Industrial Test Framework
=========================

**Production-grade, universal testing framework for professional GUI applications.**

Built in Rust for determinism and performance. Suitable for industrial CAD/CAM,
web front-ends (React, Vue, Angular, Svelte), desktop applications, and
embedded diagnostics UIs.

.. note::

   Version |release| — Requires Rust 1.75+ and optionally Python 3.10+.

Key Capabilities
----------------

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Category
     - Description
   * - Deterministic Model Testing
     - Pure-logic graph model with strict invariants and SHA-256 content hashing
   * - Property-Based Testing
     - QuickCheck-style random generation with automatic shrinking
   * - Event Sourcing
     - Undo/redo, replay engine, time-travel debugging
   * - Serialization Testing
     - JSON/bincode round-trip, golden snapshots, schema evolution
   * - CRDT Simulation
     - Multi-client distributed editing with network partitions
   * - Render Validation
     - Structural layout checks (no pixel comparison)
   * - Web GUI Testing
     - Component trees, accessibility, forms, routing, responsive layout
   * - Generative Engine
     - Trait-based value generation with combinators and shrinking
   * - Performance Profiling
     - Benchmarks, stress tests, memory profiling, CSV export
   * - CI/CD Integration
     - JUnit XML, GitHub Actions, GitLab CI, sharded execution

.. toctree::
   :maxdepth: 2
   :caption: Contents

   getting-started
   architecture
   modules/index
   web-testing
   generators
   cli-reference
   ci-cd
   extending
   security
   changelog

Indices and Tables
==================

* :ref:`genindex`
* :ref:`search`
