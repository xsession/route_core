CI / CD Integration
====================

.. contents:: On this page
   :local:
   :depth: 2

GitHub Actions
--------------

A complete workflow is provided in ``.github/workflows/ci.yml``:

.. code-block:: yaml

   name: CI
   on: [push, pull_request]

   jobs:
     test:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4

         - name: Install Rust
           uses: dtolnay/rust-toolchain@stable

         - name: Cache cargo
           uses: actions/cache@v4
           with:
             path: |
               ~/.cargo/registry
               target
             key: ${{ runner.os }}-cargo-${{ hashFiles('**/Cargo.lock') }}

         - name: Run unit & integration tests
           run: cargo test --workspace

         - name: Property tests (extended)
           run: cargo run -- property --cases 5000 --seed ${{ github.run_id }}

         - name: CRDT convergence
           run: cargo run -- crdt --clients 5 --ops 50

         - name: Web GUI tests
           run: cargo run -- web --trees 100 --depth 5

         - name: Benchmarks
           run: cargo run -- bench --iterations 50 --csv

         - name: Upload artifacts
           uses: actions/upload-artifact@v4
           with:
             name: test-output
             path: test-output/

GitLab CI
---------

Equivalent pipeline in ``.gitlab-ci.yml``:

.. code-block:: yaml

   stages:
     - test
     - report

   test:
     stage: test
     image: rust:latest
     script:
       - cargo test --workspace
       - cargo run -- property --cases 5000
       - cargo run -- crdt --clients 5 --ops 50
       - cargo run -- web --trees 100
     artifacts:
       paths:
         - test-output/
       reports:
         junit: test-output/results.xml

   report:
     stage: report
     image: python:3.12
     needs: [test]
     script:
       - pip install sphinx sphinx-rtd-theme sphinxcontrib-mermaid sphinx-copybutton
       - cd docs/sphinx && make html
     artifacts:
       paths:
         - docs/sphinx/_build/html/

Deterministic Seeds in CI
-------------------------

Use the CI run ID or commit SHA as a seed:

.. code-block:: bash

   # GitHub Actions
   anvil property --seed ${{ github.run_id }}

   # GitLab CI
   anvil property --seed $CI_PIPELINE_ID

This gives unique coverage per run while remaining fully reproducible.

JUnit Reports
-------------

Generate JUnit XML for CI dashboards:

.. code-block:: bash

   anvil run --format junit
   # → test-output/results.xml

This integrates with GitHub Actions test summaries, GitLab merge-request
widgets, and Jenkins test result reports.

Performance Regression Detection
---------------------------------

Export benchmarks as CSV and compare against a baseline:

.. code-block:: bash

   anvil bench --csv
   # → test-output/benchmarks.csv

Track the CSV in version control or a metrics service to detect regressions.
