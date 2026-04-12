``model`` — Deterministic Graph Model
======================================

.. contents:: On this page
   :local:
   :depth: 2

Overview
--------

The ``model`` module provides the core data structures: ``Graph``, ``Node``,
``Edge``, and the ``Invariant`` trait. Every mutation increments the graph
version and validates structural integrity.

Types
-----

``NodeId`` / ``EdgeId``
^^^^^^^^^^^^^^^^^^^^^^^

Strongly-typed UUID wrappers with deterministic seeding:

.. code-block:: rust

   let id = NodeId::new();           // Random UUID v4
   let id = NodeId::from_seed(42);   // Deterministic — same seed → same ID

``Node``
^^^^^^^^

.. code-block:: rust

   pub struct Node {
       pub id: NodeId,
       pub kind: String,
       pub position: (f64, f64),
       pub size: (f64, f64),
       pub properties: HashMap<String, serde_json::Value>,
       pub parent: Option<NodeId>,
       pub z_index: i32,
   }

Builder pattern:

.. code-block:: rust

   let node = Node::new("sensor")
       .with_id(NodeId::from_seed(1))
       .with_position(100.0, 200.0)
       .with_size(50.0, 30.0)
       .with_property("label", json!("Temperature"))
       .with_parent(parent_id);

``Edge``
^^^^^^^^

.. code-block:: rust

   pub struct Edge {
       pub id: EdgeId,
       pub source: NodeId,
       pub target: NodeId,
       pub kind: String,
       pub direction: Direction,
       pub properties: HashMap<String, serde_json::Value>,
       pub waypoints: Vec<(f64, f64)>,
   }

``Graph``
^^^^^^^^^

Core mutations:

.. list-table::
   :header-rows: 1
   :widths: 40 60

   * - Method
     - Description
   * - ``add_node(node)``
     - Insert node, validates parent reference
   * - ``remove_node(id)``
     - Remove node + cascade-delete connected edges
   * - ``add_edge(edge)``
     - Insert edge, validates source/target exist, rejects self-loops
   * - ``remove_edge(id)``
     - Remove edge
   * - ``move_node(id, x, y)``
     - Update position
   * - ``resize_node(id, w, h)``
     - Update size
   * - ``set_node_property(id, key, value)``
     - Update a property
   * - ``check_invariants()``
     - Run all built-in invariants
   * - ``content_hash()``
     - SHA-256 deterministic hash

Custom Invariants
^^^^^^^^^^^^^^^^^

Implement the ``Invariant`` trait for domain-specific rules:

.. code-block:: rust

   struct MaxChildCount(usize);

   impl Invariant for MaxChildCount {
       fn name(&self) -> &str { "max_child_count" }
       fn check(&self, graph: &Graph) -> Result<(), GraphError> {
           for &id in graph.nodes.keys() {
               if graph.children(id).len() > self.0 {
                   return Err(GraphError::InvariantViolation(
                       format!("Node {:?} has too many children", id)
                   ));
               }
           }
           Ok(())
       }
   }

   // Usage
   graph.check_custom_invariants(&[Box::new(MaxChildCount(10))])?;
