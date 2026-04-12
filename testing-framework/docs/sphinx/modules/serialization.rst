``serialization`` — Round-Trip & Golden Tests
==============================================

.. contents:: On this page
   :local:
   :depth: 2

Overview
--------

Validates that data survives serialization without loss. Supports JSON, bincode,
golden snapshot testing, and schema version evolution.

Round-Trip Testing
------------------

.. code-block:: rust

   // Generic: any Serialize + DeserializeOwned + PartialEq
   RoundTrip::json(&my_value)?;
   RoundTrip::bincode(&my_value)?;

   // Graph-specific (handles HashMap ordering + f64 precision)
   RoundTrip::graph_json(&graph)?;
   RoundTrip::graph_bincode(&graph)?;

.. note::

   ``graph_json()`` uses ``serde_json::Value`` structural comparison instead of
   raw string comparison. This handles HashMap key ordering non-determinism and
   f64 precision differences in IEEE 754 representation.

Golden Testing
--------------

.. code-block:: rust

   let golden = GoldenTest::new("tests/golden");
   golden.check("my_snapshot", &graph)?;

   // First run: creates the .golden file
   // Subsequent runs: compares against the snapshot
   // To update: set UPDATE_GOLDEN=1 environment variable

Schema Evolution
----------------

.. code-block:: rust

   let v1 = SchemaVersion::new(1, 0);
   let v2 = SchemaVersion::new(1, 2);
   let v3 = SchemaVersion::new(2, 0);

   assert!(v2.is_compatible_with(&v1));  // Same major
   assert!(!v3.is_compatible_with(&v1)); // Different major
