CLI Reference
=============

.. contents:: On this page
   :local:
   :depth: 2

Synopsis
--------

.. code-block:: text

   anvil [OPTIONS] <COMMAND>

Global Options
--------------

.. option:: -v, --verbose

   Enable debug-level structured JSON logging.

.. option:: -o, --output <DIR>

   Output directory for artifacts. Default: ``./test-output``.

Commands
--------

``run`` — Execute Test Suites
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

.. code-block:: bash

   anvil run [OPTIONS]

.. option:: -f, --filter <PATTERN>

   Run only tests whose name contains this substring.

.. option:: -t, --tag <TAG>

   Run only tests tagged with this label.

.. option:: --sequential

   Disable parallel execution (default is parallel).

.. option:: -s, --seed <N>

   Deterministic seed for reproducible runs.

.. option:: --format <text|json|junit>

   Output format. Default: ``text``.

``stress`` — Stress Testing
^^^^^^^^^^^^^^^^^^^^^^^^^^^^

.. code-block:: bash

   anvil stress [OPTIONS]

.. option:: -n, --nodes <N>

   Number of nodes to generate. Default: ``10000``.

.. option:: -e, --edges <N>

   Number of edges to generate. Default: ``50000``.

.. option:: -s, --seed <N>

   Deterministic seed. Default: ``42``.

.. option:: -t, --timeout <SECONDS>

   Timeout in seconds. Default: ``120``.

``bench`` — Benchmarking
^^^^^^^^^^^^^^^^^^^^^^^^^

.. code-block:: bash

   anvil bench [OPTIONS]

.. option:: -i, --iterations <N>

   Iterations per benchmark. Default: ``100``.

.. option:: --csv

   Export results as CSV to the output directory.

``replay`` — Event Log Replay
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

.. code-block:: bash

   anvil replay <PATH> [OPTIONS]

.. option:: --verify

   Replay twice and assert both runs produce identical state.

.. option:: --to-index <N>

   Stop replay at event index ``N`` (time-travel debugging).

``report`` — Format Conversion
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

.. code-block:: bash

   anvil report <PATH> --format <junit|csv|json>

Reads a JSON results file and converts it to the specified format.

``property`` — Property-Based Testing
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

.. code-block:: bash

   anvil property [OPTIONS]

.. option:: -p, --cases <N>

   Number of random test cases. Default: ``100``.

.. option:: --max-nodes <N>

   Max nodes per generated graph. Default: ``50``.

.. option:: --max-edges <N>

   Max edges per generated graph. Default: ``100``.

.. option:: -s, --seed <N>

   Deterministic seed. Default: ``42``.

.. option:: --max-shrinks <N>

   Max shrink attempts on failure. Default: ``100``.

``crdt`` — CRDT Simulation
^^^^^^^^^^^^^^^^^^^^^^^^^^^^

.. code-block:: bash

   anvil crdt [OPTIONS]

.. option:: -c, --clients <N>

   Number of simulated clients. Default: ``3``.

.. option:: -o, --ops <N>

   Operations per client. Default: ``20``.

.. option:: -s, --seed <N>

   Network seed. Default: ``42``.

.. option:: --partitions

   Simulate random network partitions.

``web`` — Web GUI Testing
^^^^^^^^^^^^^^^^^^^^^^^^^^^

.. code-block:: bash

   anvil web [OPTIONS]

.. option:: -t, --trees <N>

   Component trees to generate. Default: ``20``.

.. option:: -d, --depth <N>

   Maximum tree depth. Default: ``4``.

.. option:: -c, --max-children <N>

   Maximum children per node. Default: ``5``.

.. option:: -s, --seed <N>

   Deterministic seed. Default: ``42``.

.. option:: --form-fields <N>

   Number of form fields to generate. Default: ``5``.

Exit Codes
----------

.. list-table::
   :header-rows: 1
   :widths: 15 85

   * - Code
     - Meaning
   * - ``0``
     - All tests passed
   * - ``1``
     - One or more tests failed
   * - ``2``
     - CLI argument error or I/O error
