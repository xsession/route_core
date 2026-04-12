``runner`` — Test Runner & Reporting
====================================

.. contents:: On this page
   :local:
   :depth: 2

Overview
--------

Composable test runner that discovers, executes, and reports on test cases.
Supports custom assertions, timeout enforcement, panic recovery, and JUnit XML
output for CI integration.

Test Case
---------

.. code-block:: rust

   let case = TestCase::new("overlap_check", |ctx| {
       let graph = ctx.graph();
       let tree = RenderTree::from_graph(&graph, default_layout);
       let report = LayoutValidator::new(&tree).check_overlaps();
       assert!(report.violations.is_empty(), "Overlaps: {:?}", report);
   });

Test Suite
----------

.. code-block:: rust

   let mut suite = TestSuite::new("render-validation");
   suite.add(case_overlap);
   suite.add(case_containment);
   suite.add(case_edges);

Test Runner
-----------

.. code-block:: rust

   let mut runner = TestRunner::new();
   runner.add_suite(suite);

   let report: RunReport = runner.run();

   println!("Passed: {}", report.passed);
   println!("Failed: {}", report.failed);
   println!("Skipped: {}", report.skipped);
   println!("Duration: {:?}", report.duration);

   for failure in &report.failures {
       eprintln!("{}: {}", failure.name, failure.message);
   }

RunReport
---------

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Field
     - Description
   * - ``passed``
     - Number of passing test cases
   * - ``failed``
     - Number of failing test cases
   * - ``skipped``
     - Number of skipped test cases
   * - ``duration``
     - Total wall-clock time
   * - ``results``
     - Per-case ``TestResult`` with name, status, duration, message

JUnit XML Export
----------------

.. code-block:: rust

   report.export_junit("reports/results.xml")?;

The generated XML conforms to the `JUnit XML schema`_ and is compatible
with Jenkins, GitHub Actions, GitLab CI, and Azure DevOps.

.. _JUnit XML schema: https://github.com/testmoapp/junitxml

Panic Recovery
--------------

Each test case runs inside ``std::panic::catch_unwind``, so a panicking test
does **not** abort the entire suite. The panic message is captured in the
corresponding ``TestResult``.
