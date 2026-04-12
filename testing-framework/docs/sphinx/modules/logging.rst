``logging`` — Structured Logging & Tracing
==========================================

.. contents:: On this page
   :local:
   :depth: 2

Overview
--------

Structured, hierarchical logging with JSON output and trace-level span
tracking. Designed for post-mortem analysis of test runs.

Log Levels
----------

``Trace`` → ``Debug`` → ``Info`` → ``Warn`` → ``Error``

StructuredLogger
----------------

.. code-block:: rust

   let logger = StructuredLogger::new(LogLevel::Debug);

   logger.info("test.start", json!({ "suite": "graph", "cases": 42 }));
   logger.warn("test.slow", json!({ "case": "stress", "ms": 1200 }));
   logger.error("test.fail", json!({ "case": "overlap", "details": "..." }));

   // Retrieve all log entries
   let entries = logger.entries();

Each entry is a ``LogEntry``:

.. code-block:: rust

   pub struct LogEntry {
       pub timestamp: Instant,
       pub level: LogLevel,
       pub target: String,       // e.g. "test.start"
       pub data: serde_json::Value,
   }

Child Loggers
-------------

.. code-block:: rust

   let child = logger.child("crdt-sim");
   child.info("round", json!({ "n": 1, "ops": 150 }));
   // target becomes "crdt-sim.round"

Trace Exporter
--------------

.. code-block:: rust

   let exporter = TraceExporter::new();
   exporter.start_span("test_suite");
   exporter.start_span("test_case_1");
   // ... test runs ...
   exporter.end_span("test_case_1");
   exporter.end_span("test_suite");

   let json = exporter.export_json();
   // Chrome trace-event format, loadable in chrome://tracing

JSON Output
-----------

All log entries serialize to newline-delimited JSON (NDJSON):

.. code-block:: json

   {"ts":1234567890,"level":"INFO","target":"test.start","data":{"suite":"graph"}}
   {"ts":1234567891,"level":"WARN","target":"test.slow","data":{"case":"stress","ms":1200}}

This format is directly ingestible by ELK, Loki, Datadog, and similar
observability platforms.
