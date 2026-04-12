Extending the Framework
=======================

.. contents:: On this page
   :local:
   :depth: 2

Custom Invariants
-----------------

Add domain-specific invariants to the graph model:

.. code-block:: rust

   use industrial_test_core::model::{Graph, Node};

   fn no_self_loops(graph: &Graph) -> Result<(), String> {
       for edge in graph.edges() {
           if edge.from == edge.to {
               return Err(format!("Self-loop on {:?}", edge.from));
           }
       }
       Ok(())
   }

   fn max_degree(graph: &Graph, limit: usize) -> Result<(), String> {
       for node in graph.nodes() {
           let deg = graph.degree(node.id);
           if deg > limit {
               return Err(format!("{:?} has degree {}", node.id, deg));
           }
       }
       Ok(())
   }

Register invariants with the graph:

.. code-block:: rust

   let mut graph = Graph::new();
   graph.add_invariant("no_self_loops", no_self_loops);
   graph.add_invariant("max_degree_10", |g| max_degree(g, 10));

   // check_invariants() now runs your custom checks too
   graph.check_invariants()?;

Custom Test Cases
-----------------

Create domain-specific test cases by implementing the test-case closure:

.. code-block:: rust

   use industrial_test_core::runner::{TestCase, TestSuite};

   let case = TestCase::new("cable_harness_connectivity", |_ctx| {
       // Build a harness-specific graph
       let graph = build_harness_graph();
       // Check that every pin is reachable from the ECU
       assert!(check_full_connectivity(&graph));
   });

   let mut suite = TestSuite::new("harness-domain");
   suite.add(case);

Custom Generators
-----------------

Implement ``Arbitrary`` for your domain types to use them in generative tests:

.. code-block:: rust

   use industrial_test_core::generators::Arbitrary;

   struct WireSpec {
       gauge: u8,
       color: String,
       length_mm: u32,
   }

   impl Arbitrary for WireSpec {
       fn arbitrary(seed: u64, size: usize) -> Self {
           WireSpec {
               gauge: (seed % 24) as u8 + 8,   // AWG 8–32
               color: ["red", "black", "blue", "green"][(seed as usize / 3) % 4].into(),
               length_mm: ((seed.wrapping_mul(7)) % (size as u64 * 1000 + 1)) as u32,
           }
       }

       fn shrink(&self) -> Vec<Self> {
           let mut v = vec![];
           if self.length_mm > 0 {
               v.push(WireSpec { length_mm: self.length_mm / 2, ..self.clone() });
           }
           v
       }
   }

Python Orchestration
--------------------

Use the Python orchestration layer for complex multi-stage workflows:

.. code-block:: python

   from industrial_test import TestOrchestrator, Pipeline

   pipeline = Pipeline("nightly")
   pipeline.add_stage("unit", "cargo test --workspace")
   pipeline.add_stage("property", "industrial-test property --cases 10000")
   pipeline.add_stage("stress", "industrial-test stress --nodes 50000")
   pipeline.add_stage("web", "industrial-test web --trees 200 --depth 6")

   orchestrator = TestOrchestrator()
   results = orchestrator.run(pipeline, parallel_stages=False)
   orchestrator.generate_report(results, "nightly-report.html")

Custom Render Backend
---------------------

To validate layouts from a custom renderer, convert your output to
``RenderTree``:

.. code-block:: rust

   use industrial_test_core::render::{RenderTree, RenderNode, BoundingBox};

   fn from_my_renderer(output: &MyRenderOutput) -> RenderTree {
       let nodes = output.elements.iter().map(|el| {
           RenderNode {
               id: el.id.clone(),
               label: el.label.clone(),
               bbox: BoundingBox {
                   x: el.rect.x,
                   y: el.rect.y,
                   width: el.rect.w,
                   height: el.rect.h,
               },
               children: vec![], // flatten or recurse
           }
       }).collect();

       RenderTree { nodes, edges: vec![] }
   }

Then use ``LayoutValidator`` as normal.
