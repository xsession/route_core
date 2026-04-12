``crdt`` — Conflict-Free Replicated Data Types
================================================

.. contents:: On this page
   :local:
   :depth: 2

Overview
--------

Simulates multi-client concurrent editing with conflict-free replicated data
types (CRDTs). Validates that **strong eventual consistency** holds: any two
clients that have received the same set of operations converge to the same
state, regardless of delivery order.

Core Types
----------

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Type
     - Description
   * - ``ClientId``
     - Unique identifier for a simulated client (``u64``)
   * - ``LamportTimestamp``
     - Logical clock ``(counter, client_id)`` with total ordering
   * - ``CrdtOperation``
     - Timestamped graph operation tagged with origin client
   * - ``SimulatedClient``
     - Client with local graph, clock, pending ops buffer
   * - ``NetworkSimulator``
     - Delivers operations between clients with configurable delays
   * - ``CrdtSimulator``
     - Orchestrates multi-client simulation and convergence checks

Simulated Client
----------------

.. code-block:: rust

   let mut client = SimulatedClient::new(1);
   client.add_node("n1", "connector", 10.0, 20.0);    // local op
   client.move_node("n1", 30.0, 40.0);                 // local op

   let pending = client.get_pending_operations();       // drain buffer
   client.apply_remote_operation(&remote_op);           // merge remote

Network Simulation
------------------

.. code-block:: rust

   let mut network = NetworkSimulator::new();
   network.enqueue(op, sender_id, receiver_ids);
   let delivered = network.deliver_pending();   // returns ops per client
   let messages = network.pending_count();

CrdtSimulator
-------------

.. code-block:: rust

   let mut sim = CrdtSimulator::new(3);  // 3 clients
   sim.random_operations(42, 50);        // 50 random ops from seed

   let results = sim.check_convergence();
   assert!(results.converged);
   assert_eq!(results.final_node_counts, vec![10, 10, 10]);

Convergence Checking
--------------------

After all operations have been delivered, the simulator verifies:

1. **Node set equality** — all clients have the same node IDs.
2. **Edge set equality** — all clients have the same edges.
3. **Position convergence** — node positions agree (last-writer-wins).
4. **Graph invariant** — each client's graph passes ``check_invariants()``.
