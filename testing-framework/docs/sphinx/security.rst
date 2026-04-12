Security Considerations
=======================

.. contents:: On this page
   :local:
   :depth: 2

Threat Model
------------

The framework is designed for **developer workstations and CI environments**.
It is not intended to be deployed as a network-facing service.

Input Validation
----------------

- **Event log replay**: JSON files are deserialized with ``serde_json`` which
  rejects malformed input. Maximum event counts and graph sizes should be
  bounded in production usage.

- **CLI arguments**: All CLI inputs are parsed by ``clap`` with type-checked
  arguments and default values.

- **Web string generators**: ``WebStrings::html_safe`` produces properly
  escaped strings that do not contain ``<script>`` or other injection vectors.

Deterministic Seeds
-------------------

All random generation is seeded and deterministic. A seed value **does not
constitute a secret** — anyone with the seed and framework version can
reproduce the exact same test run. Do not use the framework's RNG for
cryptographic purposes.

Dependency Auditing
-------------------

.. code-block:: bash

   cargo audit    # Check for known vulnerabilities in dependencies

The framework has a minimal dependency footprint:

- ``serde`` / ``serde_json`` — serialization
- ``clap`` — CLI parsing
- ``tracing`` / ``tracing-subscriber`` — structured logging

No ``unsafe`` code is used in the core crate.

File System Safety
------------------

- Output files are written only to the ``--output`` directory.
- The framework never deletes or modifies input files.
- Event log paths are validated before replay.

Supply-Chain Considerations
---------------------------

- Pin exact dependency versions in ``Cargo.lock`` (committed to the repo).
- Run ``cargo audit`` in CI.
- Review ``cargo deny`` for license and advisory checks.

Reporting Vulnerabilities
-------------------------

If you discover a security issue, please report it via email to the
maintainers listed in ``Cargo.toml``. Do not open a public GitHub issue for
security vulnerabilities.
