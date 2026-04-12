``render`` — Layout & Render Validation
=======================================

.. contents:: On this page
   :local:
   :depth: 2

Overview
--------

Validates spatial correctness of rendered graphs: bounding-box containment,
overlap detection, and edge routing. Works with an abstract ``RenderTree``
that is independent of any concrete rendering backend.

Core Types
----------

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Type
     - Description
   * - ``BoundingBox``
     - Axis-aligned rectangle ``{ x, y, width, height }``
   * - ``RenderNode``
     - Rendered element with ``id``, ``label``, ``bbox``, ``children``
   * - ``RenderEdge``
     - Rendered connection with ``id``, ``from``, ``to``, ``path``
   * - ``RenderTree``
     - Complete render output: root nodes + edges

BoundingBox Utilities
---------------------

.. code-block:: rust

   let a = BoundingBox { x: 0.0, y: 0.0, width: 100.0, height: 50.0 };
   let b = BoundingBox { x: 80.0, y: 30.0, width: 100.0, height: 50.0 };

   assert!(a.overlaps(&b));
   assert!(a.contains_point(50.0, 25.0));

   let merged = a.merge(&b);   // minimal enclosing box

Layout Validator
----------------

.. code-block:: rust

   let validator = LayoutValidator::new(&render_tree);

   // All children must be inside parent bounds
   let containment = validator.check_containment();
   assert!(containment.violations.is_empty());

   // No two sibling nodes should overlap
   let overlaps = validator.check_overlaps();
   assert!(overlaps.violations.is_empty());

   // Edges must connect to existing nodes
   let edges = validator.check_edge_consistency();
   assert!(edges.violations.is_empty());

   // Convenience: run all checks at once
   let report = validator.validate_all();
   assert!(report.is_valid());

Building a Render Tree from a Graph
------------------------------------

.. code-block:: rust

   let graph = Graph::new();
   // ... populate graph ...
   let tree = RenderTree::from_graph(&graph, |node| {
       BoundingBox {
           x: node.x,
           y: node.y,
           width: 120.0,
           height: 60.0,
       }
   });
