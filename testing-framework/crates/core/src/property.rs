//! Property-based testing — QuickCheck/proptest-style random generation & shrinking.

use crate::model::*;
use rand::prelude::*;
use rand_chacha::ChaCha8Rng;
use std::collections::HashMap;

// ── Configuration ────────────────────────────────────────────────────────────

/// Configuration for property-based test generation.
#[derive(Debug, Clone)]
pub struct PropertyTestConfig {
    /// Random seed for reproducibility.
    pub seed: u64,
    /// Number of test cases to generate.
    pub num_cases: usize,
    /// Maximum number of nodes per graph.
    pub max_nodes: usize,
    /// Maximum number of edges per graph.
    pub max_edges: usize,
    /// Maximum shrink iterations on failure.
    pub max_shrinks: usize,
}

impl Default for PropertyTestConfig {
    fn default() -> Self {
        Self {
            seed: 42,
            num_cases: 100,
            max_nodes: 50,
            max_edges: 100,
            max_shrinks: 100,
        }
    }
}

// ── Arbitrary Graph Generator ────────────────────────────────────────────────

/// Generates random valid graphs for property-based testing.
pub struct ArbitraryGraph;

impl ArbitraryGraph {
    /// Generate a random graph from a deterministic seed.
    pub fn generate(seed: u64, max_nodes: usize, max_edges: usize) -> Graph {
        let mut rng = ChaCha8Rng::seed_from_u64(seed);
        let mut graph = Graph::new();

        let num_nodes = if max_nodes == 0 { 0 } else { rng.gen_range(1..=max_nodes) };
        let mut node_ids = Vec::new();

        let node_kinds = ["block", "sensor", "actuator", "processor", "connector", "label"];

        for i in 0..num_nodes {
            let kind = node_kinds[rng.gen_range(0..node_kinds.len())];
            let node = Node {
                id: NodeId::from_seed(i as u64 + seed * 1000),
                kind: kind.to_string(),
                position: (
                    rng.gen_range(-1000.0..1000.0),
                    rng.gen_range(-1000.0..1000.0),
                ),
                size: (
                    rng.gen_range(10.0..500.0),
                    rng.gen_range(10.0..500.0),
                ),
                properties: HashMap::new(),
                parent: None,
                z_index: rng.gen_range(0..100),
            };

            if let Ok(id) = graph.add_node(node) {
                node_ids.push(id);
            }
        }

        if node_ids.len() >= 2 {
            let num_edges = rng.gen_range(0..=max_edges.min(node_ids.len() * 2));
            for i in 0..num_edges {
                let src_idx = rng.gen_range(0..node_ids.len());
                let tgt_idx = rng.gen_range(0..node_ids.len());
                if src_idx != tgt_idx {
                    let edge = Edge::new(
                        node_ids[src_idx],
                        node_ids[tgt_idx],
                        "wire",
                    )
                    .with_id(EdgeId::from_seed(i as u64 + seed * 10000));

                    let _ = graph.add_edge(edge); // Ignore duplicate errors
                }
            }
        }

        graph
    }

    /// Generate a random sequence of graph operations.
    pub fn generate_operations(seed: u64, num_ops: usize) -> Vec<GraphOperation> {
        let mut rng = ChaCha8Rng::seed_from_u64(seed);
        let mut ops = Vec::new();
        let mut next_node_seed: u64 = 0;
        let mut next_edge_seed: u64 = 0;
        let mut active_nodes: Vec<NodeId> = Vec::new();
        let mut active_edges: Vec<EdgeId> = Vec::new();

        for _ in 0..num_ops {
            let choice: f64 = rng.gen();

            if active_nodes.is_empty() || choice < 0.3 {
                // Add node
                let id = NodeId::from_seed(next_node_seed);
                next_node_seed += 1;
                let x = rng.gen_range(-500.0..500.0);
                let y = rng.gen_range(-500.0..500.0);
                ops.push(GraphOperation::AddNode {
                    id,
                    kind: "block".into(),
                    x,
                    y,
                });
                active_nodes.push(id);
            } else if choice < 0.5 && active_nodes.len() >= 2 {
                // Add edge
                let src = active_nodes[rng.gen_range(0..active_nodes.len())];
                let tgt = active_nodes[rng.gen_range(0..active_nodes.len())];
                if src != tgt {
                    let id = EdgeId::from_seed(next_edge_seed);
                    next_edge_seed += 1;
                    ops.push(GraphOperation::AddEdge {
                        id,
                        source: src,
                        target: tgt,
                    });
                    active_edges.push(id);
                }
            } else if choice < 0.7 && !active_nodes.is_empty() {
                // Move node
                let idx = rng.gen_range(0..active_nodes.len());
                ops.push(GraphOperation::MoveNode {
                    id: active_nodes[idx],
                    x: rng.gen_range(-500.0..500.0),
                    y: rng.gen_range(-500.0..500.0),
                });
            } else if choice < 0.85 && !active_edges.is_empty() {
                // Remove edge
                let idx = rng.gen_range(0..active_edges.len());
                ops.push(GraphOperation::RemoveEdge {
                    id: active_edges.remove(idx),
                });
            } else if !active_nodes.is_empty() {
                // Remove node
                let idx = rng.gen_range(0..active_nodes.len());
                let id = active_nodes.remove(idx);
                active_edges.retain(|_| true); // edges may be cascade-removed
                ops.push(GraphOperation::RemoveNode { id });
            }
        }
        ops
    }
}

/// A single graph operation for sequence-based testing.
#[derive(Debug, Clone)]
pub enum GraphOperation {
    AddNode { id: NodeId, kind: String, x: f64, y: f64 },
    RemoveNode { id: NodeId },
    AddEdge { id: EdgeId, source: NodeId, target: NodeId },
    RemoveEdge { id: EdgeId },
    MoveNode { id: NodeId, x: f64, y: f64 },
}

impl GraphOperation {
    /// Apply this operation to a graph, ignoring errors.
    pub fn apply(&self, graph: &mut Graph) {
        match self {
            GraphOperation::AddNode { id, kind, x, y } => {
                let _ = graph.add_node(
                    Node::new(kind.as_str())
                        .with_id(*id)
                        .with_position(*x, *y),
                );
            }
            GraphOperation::RemoveNode { id } => {
                let _ = graph.remove_node(*id);
            }
            GraphOperation::AddEdge { id, source, target } => {
                let _ = graph.add_edge(
                    Edge::new(*source, *target, "wire").with_id(*id),
                );
            }
            GraphOperation::RemoveEdge { id } => {
                let _ = graph.remove_edge(*id);
            }
            GraphOperation::MoveNode { id, x, y } => {
                let _ = graph.move_node(*id, *x, *y);
            }
        }
    }
}

// ── Property Runner ──────────────────────────────────────────────────────────

/// Result of a single property test case.
#[derive(Debug)]
pub struct PropertyResult {
    pub seed: u64,
    pub passed: bool,
    pub error: Option<String>,
    pub shrunk_seed: Option<u64>,
}

/// Runs property-based tests with automatic shrinking.
pub struct PropertyRunner {
    pub config: PropertyTestConfig,
}

impl PropertyRunner {
    pub fn new(config: PropertyTestConfig) -> Self {
        Self { config }
    }

    /// Run a property check on randomly generated graphs.
    pub fn check_graph_property<F>(&self, property: F) -> Vec<PropertyResult>
    where
        F: Fn(&Graph) -> Result<(), String>,
    {
        let mut results = Vec::new();

        for i in 0..self.config.num_cases {
            let seed = self.config.seed.wrapping_add(i as u64);
            let graph = ArbitraryGraph::generate(seed, self.config.max_nodes, self.config.max_edges);

            match property(&graph) {
                Ok(()) => {
                    results.push(PropertyResult {
                        seed,
                        passed: true,
                        error: None,
                        shrunk_seed: None,
                    });
                }
                Err(e) => {
                    // Attempt shrinking: try smaller graphs with related seeds
                    let shrunk = self.shrink_graph(seed, &property);
                    results.push(PropertyResult {
                        seed,
                        passed: false,
                        error: Some(e),
                        shrunk_seed: shrunk,
                    });
                }
            }
        }

        results
    }

    /// Run a property check on random operation sequences.
    pub fn check_operation_property<F>(&self, property: F) -> Vec<PropertyResult>
    where
        F: Fn(&[GraphOperation], &Graph) -> Result<(), String>,
    {
        let mut results = Vec::new();

        for i in 0..self.config.num_cases {
            let seed = self.config.seed.wrapping_add(i as u64);
            let ops = ArbitraryGraph::generate_operations(seed, self.config.max_nodes);
            let mut graph = Graph::new();
            for op in &ops {
                op.apply(&mut graph);
            }

            match property(&ops, &graph) {
                Ok(()) => {
                    results.push(PropertyResult {
                        seed,
                        passed: true,
                        error: None,
                        shrunk_seed: None,
                    });
                }
                Err(e) => {
                    results.push(PropertyResult {
                        seed,
                        passed: false,
                        error: Some(e),
                        shrunk_seed: None,
                    });
                }
            }
        }

        results
    }

    /// Try to find a smaller graph that still fails the property.
    fn shrink_graph<F>(&self, original_seed: u64, property: &F) -> Option<u64>
    where
        F: Fn(&Graph) -> Result<(), String>,
    {
        let mut best_seed = None;
        let mut best_size = usize::MAX;

        for shrink_attempt in 0..self.config.max_shrinks as u64 {
            let shrink_seed = original_seed.wrapping_mul(31).wrapping_add(shrink_attempt);
            // Generate progressively smaller graphs
            let max_n = (self.config.max_nodes as u64)
                .saturating_sub(shrink_attempt)
                .max(1) as usize;
            let max_e = (self.config.max_edges as u64)
                .saturating_sub(shrink_attempt * 2)
                .max(0) as usize;

            let graph = ArbitraryGraph::generate(shrink_seed, max_n, max_e);
            let size = graph.node_count() + graph.edge_count();

            if property(&graph).is_err() && size < best_size {
                best_seed = Some(shrink_seed);
                best_size = size;
            }
        }

        best_seed
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generated_graphs_are_valid() {
        for seed in 0..100 {
            let graph = ArbitraryGraph::generate(seed, 20, 40);
            assert!(
                graph.check_invariants().is_ok(),
                "Invariant violation at seed {}",
                seed
            );
        }
    }

    #[test]
    fn deterministic_generation() {
        let g1 = ArbitraryGraph::generate(42, 10, 20);
        let g2 = ArbitraryGraph::generate(42, 10, 20);
        assert_eq!(g1.content_hash(), g2.content_hash());
    }

    #[test]
    fn operation_sequences_preserve_invariants() {
        for seed in 0..50 {
            let ops = ArbitraryGraph::generate_operations(seed, 30);
            let mut graph = Graph::new();
            for op in &ops {
                op.apply(&mut graph);
            }
            assert!(
                graph.check_invariants().is_ok(),
                "Invariant violation after ops at seed {}",
                seed
            );
        }
    }

    #[test]
    fn property_runner_finds_failures() {
        let config = PropertyTestConfig {
            seed: 0,
            num_cases: 50,
            max_nodes: 10,
            max_edges: 20,
            max_shrinks: 20,
        };

        let runner = PropertyRunner::new(config);

        // This property always passes: invariants hold on generated graphs
        let results = runner.check_graph_property(|g| {
            g.check_invariants().map_err(|e| e.to_string())
        });

        assert!(results.iter().all(|r| r.passed));
    }

    #[test]
    fn property_runner_detects_custom_failure() {
        let config = PropertyTestConfig {
            seed: 0,
            num_cases: 50,
            max_nodes: 10,
            max_edges: 20,
            max_shrinks: 10,
        };

        let runner = PropertyRunner::new(config);

        // Artificial property: graph must have fewer than 5 nodes
        let results = runner.check_graph_property(|g| {
            if g.node_count() >= 5 {
                Err(format!("Too many nodes: {}", g.node_count()))
            } else {
                Ok(())
            }
        });

        // Some should fail since we generate up to 10 nodes
        assert!(results.iter().any(|r| !r.passed));
    }
}
