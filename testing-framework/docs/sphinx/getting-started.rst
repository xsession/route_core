Getting Started
===============

Prerequisites
-------------

.. list-table::
   :widths: 20 80

   * - **Rust**
     - 1.75 or later (``rustup update stable``)
   * - **Python**
     - 3.10+ (optional, for orchestration layer)
   * - **OS**
     - Linux, macOS, Windows (fully cross-platform)

Installation
------------

Clone and build:

.. code-block:: bash

   git clone https://github.com/your-org/industrial-test-framework.git
   cd industrial-test-framework
   cargo build --workspace

Run the full test suite:

.. code-block:: bash

   cargo test --workspace

Quick Start — Your First Test
------------------------------

Create a test that validates a graph model:

.. code-block:: rust

   use industrial_test_core::*;

   fn main() {
       // 1. Build a model
       let mut graph = Graph::new();
       let a = graph.add_node(
           model::Node::new("sensor").with_position(0.0, 0.0)
       ).unwrap();
       let b = graph.add_node(
           model::Node::new("actuator").with_position(100.0, 0.0)
       ).unwrap();
       graph.add_edge(model::Edge::new(a, b, "wire")).unwrap();

       // 2. Verify invariants
       graph.check_invariants().unwrap();

       // 3. Round-trip through JSON
       RoundTrip::graph_json(&graph).unwrap();

       // 4. Serialize deterministic hash
       let hash = graph.content_hash();
       println!("Graph OK — hash: {}", &hash[..16]);
   }

Quick Start — Web GUI Testing
-------------------------------

Generate and validate web component trees:

.. code-block:: rust

   use industrial_test_core::*;

   fn main() {
       // Generate a random form with 5 fields
       let form = ArbitraryComponent::generate_form(42, 5);
       let tree = ComponentTree::new("Registration", "/register", form);

       // Validate accessibility
       let a11y_issues = WebValidator::check_accessibility_labels(&tree);
       println!("Accessibility issues: {}", a11y_issues.len());

       // Validate form has submit button
       let submit_issues = WebValidator::check_form_submit_buttons(&tree);
       assert!(submit_issues.is_empty(), "Form missing submit button");

       // Check responsive at all breakpoints
       let responsive_issues = WebValidator::check_responsive(&tree);
       println!("Responsive violations: {:?}", responsive_issues);
   }

Quick Start — Generative Testing
----------------------------------

Use the generic generator engine for any type:

.. code-block:: rust

   use industrial_test_core::generators::*;

   fn main() {
       let config = GenPropertyConfig {
           seed: 42,
           num_cases: 100,
           size: 50,
           max_shrinks: 50,
       };
       let runner = GenRunner::new(config);

       // Test a property on randomly generated strings
       let results = runner.check::<String, _>(|s| {
           if s.len() > 200 {
               Err("String too long".into())
           } else {
               Ok(())
           }
       });

       let passed = results.iter().filter(|r| r.passed).count();
       println!("{}/{} cases passed", passed, results.len());
   }

Project Structure
-----------------

.. code-block:: text

   testing-framework/
   ├── Cargo.toml                  # Workspace root
   ├── crates/
   │   ├── core/                   # Core testing library
   │   │   ├── src/
   │   │   │   ├── lib.rs          # Public API re-exports
   │   │   │   ├── model.rs        # Graph model + invariants
   │   │   │   ├── events.rs       # Event sourcing + replay
   │   │   │   ├── serialization.rs# Round-trip + golden tests
   │   │   │   ├── property.rs     # Property-based generation
   │   │   │   ├── crdt.rs         # CRDT simulation
   │   │   │   ├── render.rs       # Structural render validation
   │   │   │   ├── perf.rs         # Benchmarks + stress tests
   │   │   │   ├── logging.rs      # Structured logging + traces
   │   │   │   ├── runner.rs       # Test suite/case/runner
   │   │   │   ├── generators.rs   # Generic generative engine
   │   │   │   └── web.rs          # Web GUI testing primitives
   │   │   ├── tests/
   │   │   │   └── integration_tests.rs
   │   │   └── benches/
   │   │       └── model_bench.rs
   │   └── cli/                    # CLI test runner
   │       └── src/main.rs
   ├── python/                     # Python orchestration
   └── docs/
       ├── sphinx/                 # This documentation
       └── typst/                  # Typst technical manual
