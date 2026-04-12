//! Event sourcing — all mutations as replayable events.
//!
//! Every user action is captured as an `Event`. The `EventStore` records them,
//! and the `ReplayEngine` can reconstruct any state by replaying events.

use crate::model::*;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// ── Event Types ──────────────────────────────────────────────────────────────

/// All possible mutations expressed as events.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum Event {
    NodeAdded {
        node: Node,
    },
    NodeRemoved {
        node_id: NodeId,
        /// Snapshot of the removed node for undo.
        snapshot: Option<Node>,
    },
    NodeMoved {
        node_id: NodeId,
        from: (f64, f64),
        to: (f64, f64),
    },
    NodeResized {
        node_id: NodeId,
        from: (f64, f64),
        to: (f64, f64),
    },
    NodePropertyChanged {
        node_id: NodeId,
        key: String,
        old_value: Option<serde_json::Value>,
        new_value: serde_json::Value,
    },
    EdgeAdded {
        edge: Edge,
    },
    EdgeRemoved {
        edge_id: EdgeId,
        snapshot: Option<Edge>,
    },
    MetadataChanged {
        key: String,
        old_value: Option<serde_json::Value>,
        new_value: serde_json::Value,
    },
    /// Composite event grouping multiple sub-events (for transactions).
    Batch {
        events: Vec<Event>,
    },
}

/// A timestamped, identified event entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventEntry {
    pub id: Uuid,
    pub timestamp: DateTime<Utc>,
    pub event: Event,
    /// Optional: schema version for forward/backward compat.
    pub schema_version: u32,
    /// Optional originating client for multi-user scenarios.
    pub client_id: Option<String>,
}

impl EventEntry {
    pub fn new(event: Event) -> Self {
        Self {
            id: Uuid::new_v4(),
            timestamp: Utc::now(),
            event,
            schema_version: 1,
            client_id: None,
        }
    }

    pub fn with_client(mut self, client: impl Into<String>) -> Self {
        self.client_id = Some(client.into());
        self
    }
}

// ── Event Log ────────────────────────────────────────────────────────────────

/// In-memory event log with undo/redo support.
#[derive(Debug, Clone)]
pub struct EventLog {
    entries: Vec<EventEntry>,
    /// Position in the log (for undo/redo). Points to next event to apply.
    cursor: usize,
}

impl Default for EventLog {
    fn default() -> Self {
        Self::new()
    }
}

impl EventLog {
    pub fn new() -> Self {
        Self {
            entries: Vec::new(),
            cursor: 0,
        }
    }

    pub fn push(&mut self, entry: EventEntry) {
        // Truncate any redo history when a new event arrives
        self.entries.truncate(self.cursor);
        self.entries.push(entry);
        self.cursor = self.entries.len();
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    pub fn cursor(&self) -> usize {
        self.cursor
    }

    pub fn can_undo(&self) -> bool {
        self.cursor > 0
    }

    pub fn can_redo(&self) -> bool {
        self.cursor < self.entries.len()
    }

    /// Move cursor back (undo). Returns the event to reverse.
    pub fn undo(&mut self) -> Option<&EventEntry> {
        if self.can_undo() {
            self.cursor -= 1;
            Some(&self.entries[self.cursor])
        } else {
            None
        }
    }

    /// Move cursor forward (redo). Returns the event to re-apply.
    pub fn redo(&mut self) -> Option<&EventEntry> {
        if self.can_redo() {
            let entry = &self.entries[self.cursor];
            self.cursor += 1;
            Some(entry)
        } else {
            None
        }
    }

    /// Get all active entries (up to cursor).
    pub fn active_entries(&self) -> &[EventEntry] {
        &self.entries[..self.cursor]
    }

    /// Get all entries including redo buffer.
    pub fn all_entries(&self) -> &[EventEntry] {
        &self.entries
    }

    /// Export the log as JSON.
    pub fn export_json(&self) -> serde_json::Value {
        serde_json::to_value(&self.entries).unwrap_or(serde_json::Value::Null)
    }

    /// Import from JSON.
    pub fn import_json(value: &serde_json::Value) -> Result<Self, serde_json::Error> {
        let entries: Vec<EventEntry> = serde_json::from_value(value.clone())?;
        let cursor = entries.len();
        Ok(Self { entries, cursor })
    }
}

// ── Event Store (Persistent) ─────────────────────────────────────────────────

/// File-backed event store for persistence and audit trails.
pub struct EventStore {
    path: std::path::PathBuf,
    log: EventLog,
}

impl EventStore {
    pub fn new(path: impl Into<std::path::PathBuf>) -> Self {
        Self {
            path: path.into(),
            log: EventLog::new(),
        }
    }

    pub fn open(path: impl Into<std::path::PathBuf>) -> Result<Self, std::io::Error> {
        let path = path.into();
        if path.exists() {
            let data = std::fs::read_to_string(&path)?;
            let value: serde_json::Value =
                serde_json::from_str(&data).map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
            let log = EventLog::import_json(&value)
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
            Ok(Self { path, log })
        } else {
            Ok(Self::new(path))
        }
    }

    pub fn append(&mut self, event: Event) {
        self.log.push(EventEntry::new(event));
    }

    pub fn save(&self) -> Result<(), std::io::Error> {
        let json = serde_json::to_string_pretty(&self.log.all_entries())
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
        std::fs::write(&self.path, json)
    }

    pub fn log(&self) -> &EventLog {
        &self.log
    }

    pub fn log_mut(&mut self) -> &mut EventLog {
        &mut self.log
    }
}

// ── Replay Engine ────────────────────────────────────────────────────────────

/// Reconstructs graph state by replaying events from scratch.
pub struct ReplayEngine;

impl ReplayEngine {
    /// Apply a single event to a graph. Returns Ok or an error.
    pub fn apply(graph: &mut Graph, event: &Event) -> Result<(), GraphError> {
        match event {
            Event::NodeAdded { node } => {
                graph.add_node(node.clone())?;
            }
            Event::NodeRemoved { node_id, .. } => {
                graph.remove_node(*node_id)?;
            }
            Event::NodeMoved { node_id, to, .. } => {
                graph.move_node(*node_id, to.0, to.1)?;
            }
            Event::NodeResized { node_id, to, .. } => {
                graph.resize_node(*node_id, to.0, to.1)?;
            }
            Event::NodePropertyChanged {
                node_id,
                key,
                new_value,
                ..
            } => {
                graph.set_node_property(*node_id, key.clone(), new_value.clone())?;
            }
            Event::EdgeAdded { edge } => {
                graph.add_edge(edge.clone())?;
            }
            Event::EdgeRemoved { edge_id, .. } => {
                graph.remove_edge(*edge_id)?;
            }
            Event::MetadataChanged { key, new_value, .. } => {
                graph.metadata.insert(key.clone(), new_value.clone());
            }
            Event::Batch { events } => {
                for e in events {
                    Self::apply(graph, e)?;
                }
            }
        }
        Ok(())
    }

    /// Reverse (undo) a single event.
    pub fn reverse(graph: &mut Graph, event: &Event) -> Result<(), GraphError> {
        match event {
            Event::NodeAdded { node } => {
                graph.remove_node(node.id)?;
            }
            Event::NodeRemoved { snapshot, .. } => {
                if let Some(node) = snapshot {
                    graph.add_node(node.clone())?;
                }
            }
            Event::NodeMoved { node_id, from, .. } => {
                graph.move_node(*node_id, from.0, from.1)?;
            }
            Event::NodeResized { node_id, from, .. } => {
                graph.resize_node(*node_id, from.0, from.1)?;
            }
            Event::NodePropertyChanged {
                node_id,
                key,
                old_value,
                ..
            } => {
                if let Some(old) = old_value {
                    graph.set_node_property(*node_id, key.clone(), old.clone())?;
                } else {
                    let node = graph
                        .nodes
                        .get_mut(node_id)
                        .ok_or(GraphError::NodeNotFound(*node_id))?;
                    node.properties.remove(key);
                }
            }
            Event::EdgeAdded { edge } => {
                graph.remove_edge(edge.id)?;
            }
            Event::EdgeRemoved { snapshot, .. } => {
                if let Some(edge) = snapshot {
                    graph.add_edge(edge.clone())?;
                }
            }
            Event::MetadataChanged { key, old_value, .. } => {
                if let Some(old) = old_value {
                    graph.metadata.insert(key.clone(), old.clone());
                } else {
                    graph.metadata.remove(key);
                }
            }
            Event::Batch { events } => {
                // Reverse in reverse order
                for e in events.iter().rev() {
                    Self::reverse(graph, e)?;
                }
            }
        }
        Ok(())
    }

    /// Replay all active entries in a log onto a fresh graph.
    pub fn replay(log: &EventLog) -> Result<Graph, GraphError> {
        let mut graph = Graph::new();
        for entry in log.active_entries() {
            Self::apply(&mut graph, &entry.event)?;
        }
        Ok(graph)
    }

    /// Replay up to a specific index (exclusive).
    pub fn replay_to(log: &EventLog, index: usize) -> Result<Graph, GraphError> {
        let mut graph = Graph::new();
        let entries = log.all_entries();
        let end = index.min(entries.len());
        for entry in &entries[..end] {
            Self::apply(&mut graph, &entry.event)?;
        }
        Ok(graph)
    }

    /// Verify replay determinism: replaying the same log twice yields the same hash.
    pub fn verify_determinism(log: &EventLog) -> Result<bool, GraphError> {
        let g1 = Self::replay(log)?;
        let g2 = Self::replay(log)?;
        Ok(g1.content_hash() == g2.content_hash())
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_events() -> Vec<Event> {
        let node_a = Node::new("block").with_id(NodeId::from_seed(1)).with_position(0.0, 0.0);
        let node_b = Node::new("block").with_id(NodeId::from_seed(2)).with_position(100.0, 0.0);
        let edge = Edge::new(NodeId::from_seed(1), NodeId::from_seed(2), "wire")
            .with_id(EdgeId::from_seed(100));

        vec![
            Event::NodeAdded { node: node_a },
            Event::NodeAdded { node: node_b },
            Event::EdgeAdded { edge },
            Event::NodeMoved {
                node_id: NodeId::from_seed(1),
                from: (0.0, 0.0),
                to: (50.0, 50.0),
            },
        ]
    }

    #[test]
    fn replay_produces_correct_state() {
        let mut log = EventLog::new();
        for e in sample_events() {
            log.push(EventEntry::new(e));
        }
        let graph = ReplayEngine::replay(&log).unwrap();
        assert_eq!(graph.node_count(), 2);
        assert_eq!(graph.edge_count(), 1);
        assert_eq!(
            graph.node(NodeId::from_seed(1)).unwrap().position,
            (50.0, 50.0)
        );
    }

    #[test]
    fn replay_determinism() {
        let mut log = EventLog::new();
        for e in sample_events() {
            log.push(EventEntry::new(e));
        }
        assert!(ReplayEngine::verify_determinism(&log).unwrap());
    }

    #[test]
    fn undo_redo_cycle() {
        let mut log = EventLog::new();
        let node = Node::new("x").with_id(NodeId::from_seed(1));
        log.push(EventEntry::new(Event::NodeAdded {
            node: node.clone(),
        }));
        log.push(EventEntry::new(Event::NodeMoved {
            node_id: NodeId::from_seed(1),
            from: (0.0, 0.0),
            to: (10.0, 10.0),
        }));

        // Full state
        let g_full = ReplayEngine::replay(&log).unwrap();
        assert_eq!(g_full.node(NodeId::from_seed(1)).unwrap().position, (10.0, 10.0));

        // Undo last
        log.undo();
        let g_undo = ReplayEngine::replay(&log).unwrap();
        assert_eq!(g_undo.node(NodeId::from_seed(1)).unwrap().position, (0.0, 0.0));

        // Redo
        log.redo();
        let g_redo = ReplayEngine::replay(&log).unwrap();
        assert_eq!(g_redo.node(NodeId::from_seed(1)).unwrap().position, (10.0, 10.0));
    }

    #[test]
    fn event_log_serialization_roundtrip() {
        let mut log = EventLog::new();
        for e in sample_events() {
            log.push(EventEntry::new(e));
        }
        let json = log.export_json();
        let restored = EventLog::import_json(&json).unwrap();
        assert_eq!(restored.len(), log.len());

        let g1 = ReplayEngine::replay(&log).unwrap();
        let g2 = ReplayEngine::replay(&restored).unwrap();
        assert_eq!(g1.content_hash(), g2.content_hash());
    }

    #[test]
    fn replay_to_specific_point() {
        let mut log = EventLog::new();
        for e in sample_events() {
            log.push(EventEntry::new(e));
        }
        // Replay only first 2 events (two node additions)
        let graph = ReplayEngine::replay_to(&log, 2).unwrap();
        assert_eq!(graph.node_count(), 2);
        assert_eq!(graph.edge_count(), 0); // Edge not yet added
    }

    #[test]
    fn batch_event_replay() {
        let node_a = Node::new("block").with_id(NodeId::from_seed(10));
        let node_b = Node::new("block").with_id(NodeId::from_seed(20));

        let batch = Event::Batch {
            events: vec![
                Event::NodeAdded { node: node_a },
                Event::NodeAdded { node: node_b },
            ],
        };

        let mut log = EventLog::new();
        log.push(EventEntry::new(batch));
        let graph = ReplayEngine::replay(&log).unwrap();
        assert_eq!(graph.node_count(), 2);
    }
}
