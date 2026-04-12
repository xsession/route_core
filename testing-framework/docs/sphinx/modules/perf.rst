``perf`` — Benchmarking & Stress Testing
=========================================

.. contents:: On this page
   :local:
   :depth: 2

Overview
--------

Automated performance testing: benchmark suites with statistical aggregation,
stress tests with configurable scale, memory-usage profiling, and CSV report
export.

Benchmark Suite
---------------

.. code-block:: rust

   let mut suite = BenchmarkSuite::new("graph-ops");

   suite.bench("add_1000_nodes", || {
       let mut g = Graph::new();
       for i in 0..1000 {
           g.add_node(Node { id: NodeId(i), .. });
       }
   });

   suite.bench("add_5000_edges", || {
       // ...
   });

   let report = suite.run(100);   // 100 iterations each
   println!("{}", report.summary());

Each result contains ``min``, ``max``, ``mean``, ``median``, ``p95``, ``p99``
in nanoseconds.

Stress Testing
--------------

.. code-block:: rust

   let config = StressTestConfig {
       num_nodes: 10_000,
       num_edges: 50_000,
       num_operations: 100_000,
       seed: 42,
   };

   let result = stress_test_graph(config);

   assert!(result.duration.as_secs() < 30);
   assert!(result.operations_per_second > 100_000.0);

Memory Profiling
----------------

.. code-block:: rust

   let profile = MemoryProfile::measure(|| {
       build_large_graph(5000, 20000)
   });

   println!("Peak: {} bytes", profile.peak_bytes);
   println!("Final: {} bytes", profile.final_bytes);
   println!("Allocations: {}", profile.allocation_count);

.. note::

   Memory profiling relies on Rust's global allocator tracking. It measures
   *requested* bytes, not OS-level RSS.

CSV Export
----------

.. code-block:: rust

   let report = suite.run(100);
   report.export_csv("benchmarks/graph-ops.csv")?;

   // CSV columns: name, min_ns, max_ns, mean_ns, median_ns, p95_ns, p99_ns

Output integrates directly with CI pipelines for regression detection.
