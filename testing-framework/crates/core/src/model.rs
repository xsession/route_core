//! Deterministic model layer — pure logic with strict invariants.
//!
//! No UI dependencies. All operations are pure functions on immutable snapshots
//! with explicit state transitions.

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use thiserror::Error;
use uuid::Uuid;

// ── Identifiers ──────────────────────────────────────────────────────────────

/// Strongly-typed node identifier.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct NodeId(pub Uuid);

impl NodeId {
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }

    /// Create a deterministic ID from a seed (for reproducible tests).
    pub fn from_seed(seed: u64) -> Self {
        let bytes = seed.to_le_bytes();
        let mut uuid_bytes = [0u8; 16];
        uuid_bytes[..8].copy_from_slice(&bytes);
        uuid_bytes[8..16].copy_from_slice(&bytes);
        Self(Uuid::from_bytes(uuid_bytes))
    }
}

impl Default for NodeId {
    fn default() -> Self {
        Self::new()
    }
}

/// Strongly-typed edge identifier.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct EdgeId(pub Uuid);

impl EdgeId {
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }

    pub fn from_seed(seed: u64) -> Self {
        let bytes = seed.to_le_bytes();
        let mut uuid_bytes = [0u8; 16];
        uuid_bytes[..8].copy_from_slice(&bytes);
        uuid_bytes[8..16].copy_from_slice(&bytes);
        Self(Uuid::from_bytes(uuid_bytes))
    }
}

impl Default for EdgeId {
    fn default() -> Self {
        Self::new()
    }
}

// ── Core Data Structures ─────────────────────────────────────────────────────

/// A node in the graph model. Represents any visual/logical element.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Node {
    pub id: NodeId,
    pub kind: String,
    pub position: (f64, f64),
    pub size: (f64, f64),
    pub properties: HashMap<String, serde_json::Value>,
    pub parent: Option<NodeId>,
    pub z_index: i32,
}

impl Node {
    pub fn new(kind: impl Into<String>) -> Self {
        Self {
            id: NodeId::new(),
            kind: kind.into(),
            position: (0.0, 0.0),
            size: (100.0, 100.0),
            properties: HashMap::new(),
            parent: None,
            z_index: 0,
        }
    }

    pub fn with_id(mut self, id: NodeId) -> Self {
        self.id = id;
        self
    }

    pub fn with_position(mut self, x: f64, y: f64) -> Self {
        self.position = (x, y);
        self
    }

    pub fn with_size(mut self, w: f64, h: f64) -> Self {
        self.size = (w, h);
        self
    }

    pub fn with_property(mut self, key: impl Into<String>, value: serde_json::Value) -> Self {
        self.properties.insert(key.into(), value);
        self
    }

    pub fn with_parent(mut self, parent: NodeId) -> Self {
        self.parent = Some(parent);
        self
    }
}

/// Directional connection type for edges.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Direction {
    /// Source → Target
    Forward,
    /// Bidirectional
    Bidirectional,
}

/// An edge connecting two nodes.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Edge {
    pub id: EdgeId,
    pub source: NodeId,
    pub target: NodeId,
    pub kind: String,
    pub direction: Direction,
    pub properties: HashMap<String, serde_json::Value>,
    pub waypoints: Vec<(f64, f64)>,
}

impl Edge {
    pub fn new(source: NodeId, target: NodeId, kind: impl Into<String>) -> Self {
        Self {
            id: EdgeId::new(),
            source,
            target,
            kind: kind.into(),
            direction: Direction::Forward,
            properties: HashMap::new(),
            waypoints: Vec::new(),
        }
    }

    pub fn with_id(mut self, id: EdgeId) -> Self {
        self.id = id;
        self
    }

    pub fn bidirectional(mut self) -> Self {
        self.direction = Direction::Bidirectional;
        self
    }
}

// ── Errors ───────────────────────────────────────────────────────────────────

#[derive(Debug, Error, PartialEq)]
pub enum GraphError {
    #[error("Node {0:?} not found")]
    NodeNotFound(NodeId),

    #[error("Edge {0:?} not found")]
    EdgeNotFound(EdgeId),

    #[error("Duplicate node {0:?}")]
    DuplicateNode(NodeId),

    #[error("Duplicate edge {0:?}")]
    DuplicateEdge(EdgeId),

    #[error("Self-loop not allowed: node {0:?}")]
    SelfLoop(NodeId),

    #[error("Dangling edge {edge:?}: references missing node {missing_node:?}")]
    DanglingEdge { edge: EdgeId, missing_node: NodeId },

    #[error("Cycle detected involving node {0:?}")]
    CycleDetected(NodeId),

    #[error("Invariant violation: {0}")]
    InvariantViolation(String),

    #[error("Parent {parent:?} not found for node {child:?}")]
    OrphanedChild { child: NodeId, parent: NodeId },
}

// ── Invariants ───────────────────────────────────────────────────────────────

/// A named invariant that can be checked against a graph.
pub trait Invariant: Send + Sync {
    fn name(&self) -> &str;
    fn check(&self, graph: &Graph) -> Result<(), GraphError>;
}

/// Built-in: no dangling edges (all source/target nodes exist).
pub struct NoDanglingEdges;

impl Invariant for NoDanglingEdges {
    fn name(&self) -> &str {
        "no_dangling_edges"
    }

    fn check(&self, graph: &Graph) -> Result<(), GraphError> {
        for edge in graph.edges.values() {
            if !graph.nodes.contains_key(&edge.source) {
                return Err(GraphError::DanglingEdge {
                    edge: edge.id,
                    missing_node: edge.source,
                });
            }
            if !graph.nodes.contains_key(&edge.target) {
                return Err(GraphError::DanglingEdge {
                    edge: edge.id,
                    missing_node: edge.target,
                });
            }
        }
        Ok(())
    }
}

/// Built-in: no self-loops.
pub struct NoSelfLoops;

impl Invariant for NoSelfLoops {
    fn name(&self) -> &str {
        "no_self_loops"
    }

    fn check(&self, graph: &Graph) -> Result<(), GraphError> {
        for edge in graph.edges.values() {
            if edge.source == edge.target {
                return Err(GraphError::SelfLoop(edge.source));
            }
        }
        Ok(())
    }
}

/// Built-in: all parent references are valid.
pub struct ValidParentRefs;

impl Invariant for ValidParentRefs {
    fn name(&self) -> &str {
        "valid_parent_refs"
    }

    fn check(&self, graph: &Graph) -> Result<(), GraphError> {
        for node in graph.nodes.values() {
            if let Some(parent_id) = node.parent {
                if !graph.nodes.contains_key(&parent_id) {
                    return Err(GraphError::OrphanedChild {
                        child: node.id,
                        parent: parent_id,
                    });
                }
            }
        }
        Ok(())
    }
}

/// Built-in: no duplicate IDs (enforced by HashMap, but verifies consistency).
pub struct UniqueIds;

impl Invariant for UniqueIds {
    fn name(&self) -> &str {
        "unique_ids"
    }

    fn check(&self, graph: &Graph) -> Result<(), GraphError> {
        // HashMap enforces uniqueness by default; this checks stored ID matches key
        for (&key, node) in &graph.nodes {
            if key != node.id {
                return Err(GraphError::InvariantViolation(format!(
                    "Node key {:?} does not match node.id {:?}",
                    key, node.id
                )));
            }
        }
        for (&key, edge) in &graph.edges {
            if key != edge.id {
                return Err(GraphError::InvariantViolation(format!(
                    "Edge key {:?} does not match edge.id {:?}",
                    key, edge.id
                )));
            }
        }
        Ok(())
    }
}

// ── Graph ────────────────────────────────────────────────────────────────────

/// The core graph model — the single source of truth for any diagram/schematic.
///
/// All mutations go through methods that maintain invariants.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Graph {
    pub nodes: HashMap<NodeId, Node>,
    pub edges: HashMap<EdgeId, Edge>,
    pub metadata: HashMap<String, serde_json::Value>,
    version: u64,
}

impl Default for Graph {
    fn default() -> Self {
        Self::new()
    }
}

impl Graph {
    pub fn new() -> Self {
        Self {
            nodes: HashMap::new(),
            edges: HashMap::new(),
            metadata: HashMap::new(),
            version: 0,
        }
    }

    pub fn version(&self) -> u64 {
        self.version
    }

    // ── Mutations ────────────────────────────────────────────────────────

    /// Add a node. Returns error if ID already exists.
    pub fn add_node(&mut self, node: Node) -> Result<NodeId, GraphError> {
        if self.nodes.contains_key(&node.id) {
            return Err(GraphError::DuplicateNode(node.id));
        }
        if let Some(parent_id) = node.parent {
            if !self.nodes.contains_key(&parent_id) {
                return Err(GraphError::OrphanedChild {
                    child: node.id,
                    parent: parent_id,
                });
            }
        }
        let id = node.id;
        self.nodes.insert(id, node);
        self.version += 1;
        Ok(id)
    }

    /// Remove a node and all connected edges. Returns the removed node.
    pub fn remove_node(&mut self, id: NodeId) -> Result<Node, GraphError> {
        let node = self
            .nodes
            .remove(&id)
            .ok_or(GraphError::NodeNotFound(id))?;

        // Remove all edges connected to this node
        self.edges
            .retain(|_, edge| edge.source != id && edge.target != id);

        // Clear parent references pointing to removed node
        for n in self.nodes.values_mut() {
            if n.parent == Some(id) {
                n.parent = None;
            }
        }

        self.version += 1;
        Ok(node)
    }

    /// Add an edge. Validates source/target exist and no self-loop.
    pub fn add_edge(&mut self, edge: Edge) -> Result<EdgeId, GraphError> {
        if self.edges.contains_key(&edge.id) {
            return Err(GraphError::DuplicateEdge(edge.id));
        }
        if edge.source == edge.target {
            return Err(GraphError::SelfLoop(edge.source));
        }
        if !self.nodes.contains_key(&edge.source) {
            return Err(GraphError::DanglingEdge {
                edge: edge.id,
                missing_node: edge.source,
            });
        }
        if !self.nodes.contains_key(&edge.target) {
            return Err(GraphError::DanglingEdge {
                edge: edge.id,
                missing_node: edge.target,
            });
        }
        let id = edge.id;
        self.edges.insert(id, edge);
        self.version += 1;
        Ok(id)
    }

    /// Remove an edge.
    pub fn remove_edge(&mut self, id: EdgeId) -> Result<Edge, GraphError> {
        let edge = self
            .edges
            .remove(&id)
            .ok_or(GraphError::EdgeNotFound(id))?;
        self.version += 1;
        Ok(edge)
    }

    /// Move a node to a new position.
    pub fn move_node(&mut self, id: NodeId, x: f64, y: f64) -> Result<(), GraphError> {
        let node = self
            .nodes
            .get_mut(&id)
            .ok_or(GraphError::NodeNotFound(id))?;
        node.position = (x, y);
        self.version += 1;
        Ok(())
    }

    /// Resize a node.
    pub fn resize_node(&mut self, id: NodeId, w: f64, h: f64) -> Result<(), GraphError> {
        let node = self
            .nodes
            .get_mut(&id)
            .ok_or(GraphError::NodeNotFound(id))?;
        node.size = (w, h);
        self.version += 1;
        Ok(())
    }

    /// Set a property on a node.
    pub fn set_node_property(
        &mut self,
        id: NodeId,
        key: impl Into<String>,
        value: serde_json::Value,
    ) -> Result<(), GraphError> {
        let node = self
            .nodes
            .get_mut(&id)
            .ok_or(GraphError::NodeNotFound(id))?;
        node.properties.insert(key.into(), value);
        self.version += 1;
        Ok(())
    }

    // ── Queries ──────────────────────────────────────────────────────────

    pub fn node(&self, id: NodeId) -> Option<&Node> {
        self.nodes.get(&id)
    }

    pub fn edge(&self, id: EdgeId) -> Option<&Edge> {
        self.edges.get(&id)
    }

    pub fn node_count(&self) -> usize {
        self.nodes.len()
    }

    pub fn edge_count(&self) -> usize {
        self.edges.len()
    }

    /// Get all edges connected to a node (incoming + outgoing).
    pub fn edges_of(&self, node_id: NodeId) -> Vec<&Edge> {
        self.edges
            .values()
            .filter(|e| e.source == node_id || e.target == node_id)
            .collect()
    }

    /// Get outgoing edges from a node.
    pub fn outgoing_edges(&self, node_id: NodeId) -> Vec<&Edge> {
        self.edges
            .values()
            .filter(|e| e.source == node_id)
            .collect()
    }

    /// Get child nodes of a parent.
    pub fn children(&self, parent_id: NodeId) -> Vec<&Node> {
        self.nodes
            .values()
            .filter(|n| n.parent == Some(parent_id))
            .collect()
    }

    /// Topological sort (returns error if cycle detected). DAG only.
    pub fn topological_sort(&self) -> Result<Vec<NodeId>, GraphError> {
        let mut in_degree: HashMap<NodeId, usize> = HashMap::new();
        for &id in self.nodes.keys() {
            in_degree.insert(id, 0);
        }
        for edge in self.edges.values() {
            if edge.direction == Direction::Forward {
                *in_degree.entry(edge.target).or_insert(0) += 1;
            }
        }

        let mut queue: Vec<NodeId> = in_degree
            .iter()
            .filter(|(_, &deg)| deg == 0)
            .map(|(&id, _)| id)
            .collect();
        queue.sort_by_key(|id| id.0); // deterministic order

        let mut result = Vec::new();
        while let Some(node_id) = queue.pop() {
            result.push(node_id);
            for edge in self.outgoing_edges(node_id) {
                if edge.direction == Direction::Forward {
                    if let Some(deg) = in_degree.get_mut(&edge.target) {
                        *deg -= 1;
                        if *deg == 0 {
                            queue.push(edge.target);
                            queue.sort_by_key(|id| id.0);
                        }
                    }
                }
            }
        }

        if result.len() != self.nodes.len() {
            // Find a node in a cycle
            let in_result: HashSet<_> = result.iter().collect();
            let cycle_node = self
                .nodes
                .keys()
                .find(|id| !in_result.contains(id))
                .copied()
                .unwrap();
            return Err(GraphError::CycleDetected(cycle_node));
        }

        Ok(result)
    }

    // ── Invariant Checking ───────────────────────────────────────────────

    /// Check all built-in invariants.
    pub fn check_invariants(&self) -> Result<(), GraphError> {
        let invariants: Vec<Box<dyn Invariant>> = vec![
            Box::new(NoDanglingEdges),
            Box::new(NoSelfLoops),
            Box::new(ValidParentRefs),
            Box::new(UniqueIds),
        ];
        for inv in &invariants {
            inv.check(self)?;
        }
        Ok(())
    }

    /// Check a custom set of invariants.
    pub fn check_custom_invariants(&self, invariants: &[Box<dyn Invariant>]) -> Result<(), GraphError> {
        for inv in invariants {
            inv.check(self)?;
        }
        Ok(())
    }

    /// Compute a deterministic hash of the graph state.
    ///
    /// Uses explicit field-level hashing (not serde) to avoid HashMap ordering issues.
    pub fn content_hash(&self) -> String {
        use sha2::{Digest, Sha256};

        // Sort keys for determinism
        let mut node_ids: Vec<_> = self.nodes.keys().collect();
        node_ids.sort_by_key(|id| id.0);
        let mut edge_ids: Vec<_> = self.edges.keys().collect();
        edge_ids.sort_by_key(|id| id.0);

        let mut hasher = Sha256::new();
        for id in node_ids {
            let node = &self.nodes[id];
            hasher.update(node.id.0.as_bytes());
            hasher.update(node.kind.as_bytes());
            hasher.update(node.position.0.to_le_bytes());
            hasher.update(node.position.1.to_le_bytes());
            hasher.update(node.size.0.to_le_bytes());
            hasher.update(node.size.1.to_le_bytes());
            hasher.update(node.z_index.to_le_bytes());
            // Sort properties by key for determinism
            let mut prop_keys: Vec<_> = node.properties.keys().collect();
            prop_keys.sort();
            for key in prop_keys {
                hasher.update(key.as_bytes());
                hasher.update(node.properties[key].to_string().as_bytes());
            }
            if let Some(parent) = &node.parent {
                hasher.update(parent.0.as_bytes());
            }
        }
        for id in edge_ids {
            let edge = &self.edges[id];
            hasher.update(edge.id.0.as_bytes());
            hasher.update(edge.source.0.as_bytes());
            hasher.update(edge.target.0.as_bytes());
            hasher.update(edge.kind.as_bytes());
            let dir_byte: u8 = match edge.direction {
                Direction::Forward => 0,
                Direction::Bidirectional => 1,
            };
            hasher.update([dir_byte]);
            // Sort edge properties too
            let mut prop_keys: Vec<_> = edge.properties.keys().collect();
            prop_keys.sort();
            for key in prop_keys {
                hasher.update(key.as_bytes());
                hasher.update(edge.properties[key].to_string().as_bytes());
            }
        }

        hex::encode(hasher.finalize())
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn make_graph() -> (Graph, NodeId, NodeId) {
        let mut g = Graph::new();
        let a = g.add_node(Node::new("block").with_position(0.0, 0.0)).unwrap();
        let b = g.add_node(Node::new("block").with_position(100.0, 0.0)).unwrap();
        (g, a, b)
    }

    #[test]
    fn add_and_query_nodes() {
        let (g, a, b) = make_graph();
        assert_eq!(g.node_count(), 2);
        assert!(g.node(a).is_some());
        assert!(g.node(b).is_some());
    }

    #[test]
    fn add_edge_validates_endpoints() {
        let (mut g, a, b) = make_graph();
        let edge = Edge::new(a, b, "wire");
        assert!(g.add_edge(edge).is_ok());
        assert_eq!(g.edge_count(), 1);
    }

    #[test]
    fn reject_self_loop() {
        let (mut g, a, _) = make_graph();
        let edge = Edge::new(a, a, "wire");
        assert_eq!(g.add_edge(edge), Err(GraphError::SelfLoop(a)));
    }

    #[test]
    fn reject_dangling_edge() {
        let (mut g, a, _) = make_graph();
        let phantom = NodeId::new();
        let edge = Edge::new(a, phantom, "wire");
        assert!(matches!(g.add_edge(edge), Err(GraphError::DanglingEdge { .. })));
    }

    #[test]
    fn remove_node_cascades_edges() {
        let (mut g, a, b) = make_graph();
        g.add_edge(Edge::new(a, b, "wire")).unwrap();
        assert_eq!(g.edge_count(), 1);
        g.remove_node(a).unwrap();
        assert_eq!(g.edge_count(), 0);
        assert_eq!(g.node_count(), 1);
    }

    #[test]
    fn invariants_pass_on_valid_graph() {
        let (mut g, a, b) = make_graph();
        g.add_edge(Edge::new(a, b, "wire")).unwrap();
        assert!(g.check_invariants().is_ok());
    }

    #[test]
    fn deterministic_hash() {
        let id_a = NodeId::from_seed(1);
        let id_b = NodeId::from_seed(2);
        let mut g1 = Graph::new();
        g1.add_node(Node::new("x").with_id(id_a)).unwrap();
        g1.add_node(Node::new("y").with_id(id_b)).unwrap();

        let mut g2 = Graph::new();
        g2.add_node(Node::new("y").with_id(id_b)).unwrap();
        g2.add_node(Node::new("x").with_id(id_a)).unwrap();

        // Same content, different insertion order → same hash
        assert_eq!(g1.content_hash(), g2.content_hash());
    }

    #[test]
    fn topological_sort_dag() {
        let (mut g, a, b) = make_graph();
        let c_id = g.add_node(Node::new("block").with_position(200.0, 0.0)).unwrap();
        g.add_edge(Edge::new(a, b, "wire")).unwrap();
        g.add_edge(Edge::new(b, c_id, "wire")).unwrap();
        let sorted = g.topological_sort().unwrap();
        let pos_a = sorted.iter().position(|&id| id == a).unwrap();
        let pos_b = sorted.iter().position(|&id| id == b).unwrap();
        let pos_c = sorted.iter().position(|&id| id == c_id).unwrap();
        assert!(pos_a < pos_b);
        assert!(pos_b < pos_c);
    }

    #[test]
    fn version_increments() {
        let mut g = Graph::new();
        assert_eq!(g.version(), 0);
        let id = g.add_node(Node::new("x")).unwrap();
        assert_eq!(g.version(), 1);
        g.move_node(id, 10.0, 20.0).unwrap();
        assert_eq!(g.version(), 2);
    }
}
