``property`` — Property-Based Testing
======================================

.. contents:: On this page
   :local:
   :depth: 2

Overview
--------

QuickCheck-style random generation with deterministic seeding and automatic
failure shrinking. Generates random graphs and operation sequences, then checks
properties across many cases.

Configuration
-------------

.. code-block:: rust

   let config = PropertyTestConfig {
       seed: 42,         // Deterministic seed
       num_cases: 100,   // Cases to generate
       max_nodes: 50,    // Max nodes per graph
       max_edges: 100,   // Max edges per graph
       max_shrinks: 100, // Shrink attempts on failure
   };

Arbitrary Graph Generation
--------------------------

.. code-block:: rust

   // Generate a random valid graph
   let graph = ArbitraryGraph::generate(seed, max_nodes, max_edges);

   // Generate a random sequence of operations
   let ops = ArbitraryGraph::generate_operations(seed, num_ops);

Property Runner
---------------

.. code-block:: rust

   let runner = PropertyRunner::new(config);

   // Check a property on random graphs
   let results = runner.check_graph_property(|graph| {
       graph.check_invariants().map_err(|e| e.to_string())
   });

   // Check a property on random operation sequences
   let results = runner.check_operation_property(|ops, final_graph| {
       final_graph.check_invariants().map_err(|e| e.to_string())
   });

   // All results include seed for reproduction
   for r in &results {
       if !r.passed {
           println!("Failed at seed={}, shrunk={:?}", r.seed, r.shrunk_seed);
       }
   }

Shrinking
---------

When a property fails, the runner automatically tries to find a **smaller**
input that still fails. It generates progressively smaller graphs with related
seeds and reports the minimal reproduction.

Graph Operations
----------------

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Operation
     - Effect
   * - ``AddNode``
     - Inserts a node with generated ID, kind, position
   * - ``RemoveNode``
     - Removes a node (edges cascade-deleted)
   * - ``AddEdge``
     - Connects two existing nodes
   * - ``RemoveEdge``
     - Removes an edge
   * - ``MoveNode``
     - Repositions a node
