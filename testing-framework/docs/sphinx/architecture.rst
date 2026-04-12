Architecture
============

Design Principles
-----------------

1. **Determinism** — Every random operation is seeded via ``ChaCha8Rng``. Given the
   same seed, the framework produces identical results across platforms.

2. **Layer Independence** — Each layer (model, events, serialization, render, UI)
   is independently testable. No layer depends on layers above it.

3. **Invariant-Driven** — The model enforces structural correctness at every mutation.
   Custom invariants are first-class citizens via the ``Invariant`` trait.

4. **Reproducibility** — All test failures include a seed. Replay any failure with
   ``--seed <N>`` to reconstruct the exact failing state.

5. **Zero UI Dependencies** — The core library has no GUI, DOM, or browser dependency.
   Render validation is structural (bounding boxes), not pixel-based.

Architecture Diagram
--------------------

.. mermaid::

   graph LR
       subgraph Core["Core Library"]
           M[Model] --> O[Operations]
           O --> E[Events]
           E --> S[Serialization]
           S --> R[Render]
       end
       subgraph Gen["Generative Layer"]
           G[Generators] --> P[Property Tests]
           G --> W[Web Components]
       end
       subgraph Infra["Infrastructure"]
           L[Logging] --> RN[Runner]
           RN --> CLI[CLI]
           CLI --> CI[CI/CD]
       end
       P --> M
       W --> R
       E --> CRDT[CRDT Simulation]
       S --> PERF[Performance]

Layer Details
-------------

Model Layer (``model.rs``)
^^^^^^^^^^^^^^^^^^^^^^^^^^

The ``Graph`` struct is the single source of truth. All mutations go through methods
that enforce invariants automatically.

.. code-block:: rust

   // Graph stores nodes and edges with automatic invariant enforcement
   pub struct Graph {
       pub nodes: HashMap<NodeId, Node>,
       pub edges: HashMap<EdgeId, Edge>,
       pub metadata: HashMap<String, serde_json::Value>,
       version: u64,  // Incremented on every mutation
   }

**Built-in invariants:**

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Invariant
     - Guarantee
   * - ``NoDanglingEdges``
     - All edge source/target nodes exist in the graph
   * - ``NoSelfLoops``
     - No edge connects a node to itself
   * - ``ValidParentRefs``
     - All parent references point to existing nodes
   * - ``UniqueIds``
     - HashMap keys match stored node/edge IDs

Content hashing uses **SHA-256** with deterministic field ordering (sorted by
UUID) to ensure the hash is independent of ``HashMap`` iteration order.

Event Layer (``events.rs``)
^^^^^^^^^^^^^^^^^^^^^^^^^^^

Every mutation is captured as a replayable event.

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Event Type
     - Fields
   * - ``NodeAdded``
     - Full ``Node`` snapshot
   * - ``NodeRemoved``
     - Full ``Node`` snapshot (for undo)
   * - ``NodeMoved``
     - ``node_id``, ``from``, ``to``
   * - ``NodeResized``
     - ``node_id``, ``from_size``, ``to_size``
   * - ``NodePropertyChanged``
     - ``node_id``, ``key``, ``old_value``, ``new_value``
   * - ``EdgeAdded`` / ``EdgeRemoved``
     - Full ``Edge`` snapshot
   * - ``MetadataChanged``
     - ``key``, ``old_value``, ``new_value``
   * - ``Batch``
     - ``Vec<Event>`` (atomic group)

The ``ReplayEngine`` can reconstruct any historical state by replaying events
up to a specific index (time-travel debugging).

Serialization Layer (``serialization.rs``)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

**Round-trip testing** ensures data survives serialization without loss:

- ``RoundTrip::json<T>()`` — serialize → deserialize → serialize must be identical
- ``RoundTrip::bincode<T>()`` — same for binary format
- ``RoundTrip::graph_json()`` — structural equality via ``serde_json::Value``
  (handles HashMap key ordering and f64 precision)

**Golden testing** compares serialized output against known-good snapshots:

- Auto-creates ``.golden`` files on first run
- Set ``UPDATE_GOLDEN=1`` to regenerate
- SHA-256 content comparison

**Schema evolution** tracks version compatibility:

.. code-block:: rust

   let v1 = SchemaVersion::new(1, 0);
   let v2 = SchemaVersion::new(1, 2);
   assert!(v2.is_compatible_with(&v1)); // Same major, higher minor

CRDT Layer (``crdt.rs``)
^^^^^^^^^^^^^^^^^^^^^^^^^

Simulates distributed editing with eventual consistency:

- **SimulatedClient** — Local graph + Lamport clock + outbox
- **NetworkSimulator** — Configurable delay, jitter, and partitions
- **CrdtSimulator** — Orchestrates multi-client scenarios

Validation:
  - Convergence (all clients reach same content hash)
  - Invariants hold on every client
  - Idempotent operation application
  - Partition tolerance → network healing

Render Layer (``render.rs``)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Structural validation without pixel comparison:

- ``BoundingBox`` — AABB with intersection, union, containment
- ``RenderTree`` — Structural tree built from graph
- ``LayoutValidator`` — No overlaps, valid dimensions, children contained,
  completeness, edge connectivity

Data Flow
---------

.. mermaid::

   sequenceDiagram
       participant User
       participant Model
       participant Events
       participant Serialization
       participant Runner

       User->>Model: add_node(), add_edge()
       Model->>Model: check_invariants()
       Model->>Events: record Event
       Events->>Events: append to EventLog
       Events->>Serialization: RoundTrip::graph_json()
       Serialization->>Serialization: verify structural equality
       Runner->>Model: PropertyRunner.check_graph_property()
       Runner->>Runner: shrink on failure
