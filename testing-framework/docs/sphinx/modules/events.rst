``events`` — Event Sourcing & Replay
=====================================

.. contents:: On this page
   :local:
   :depth: 2

Overview
--------

The ``events`` module captures every graph mutation as an ``Event``, stored in
an ``EventLog`` with undo/redo support. The ``ReplayEngine`` can reconstruct
any historical state from the log.

Event Types
-----------

.. code-block:: rust

   pub enum Event {
       NodeAdded { node: Node },
       NodeRemoved { node: Node },
       NodeMoved { node_id: NodeId, from: (f64, f64), to: (f64, f64) },
       NodeResized { node_id: NodeId, from_size: (f64, f64), to_size: (f64, f64) },
       NodePropertyChanged { node_id: NodeId, key: String, old: Value, new: Value },
       EdgeAdded { edge: Edge },
       EdgeRemoved { edge: Edge },
       MetadataChanged { key: String, old: Value, new: Value },
       Batch { events: Vec<Event> },
   }

Event Log
---------

.. code-block:: rust

   let mut log = EventLog::new();
   log.push(EventEntry::new(Event::NodeAdded { node }));

   // Undo/redo
   log.undo();
   log.redo();

   // Cursor position
   assert_eq!(log.cursor(), 0);

Event Store (File Persistence)
------------------------------

.. code-block:: rust

   let mut store = EventStore::new("events.json");
   store.append(Event::NodeAdded { node });
   store.save().unwrap();

   // Later: reload
   let store = EventStore::open("events.json").unwrap();
   let graph = ReplayEngine::replay(store.log()).unwrap();

Replay Engine
-------------

.. code-block:: rust

   // Full replay
   let graph = ReplayEngine::replay(&log).unwrap();

   // Partial replay (time-travel to index 5)
   let graph = ReplayEngine::replay_to(&log, 5).unwrap();

   // Verify determinism (replay twice → same hash)
   assert!(ReplayEngine::verify_determinism(&log).unwrap());
