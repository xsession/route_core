//! Render validation — structural layout verification without pixel comparison.
//!
//! Validates bounding boxes, layout consistency, overlap detection,
//! and structural render tree correctness.

use crate::model::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ── Bounding Box ─────────────────────────────────────────────────────────────

/// Axis-aligned bounding box.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct BoundingBox {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl BoundingBox {
    pub fn new(x: f64, y: f64, width: f64, height: f64) -> Self {
        Self { x, y, width, height }
    }

    pub fn from_node(node: &Node) -> Self {
        Self {
            x: node.position.0,
            y: node.position.1,
            width: node.size.0,
            height: node.size.1,
        }
    }

    pub fn right(&self) -> f64 {
        self.x + self.width
    }

    pub fn bottom(&self) -> f64 {
        self.y + self.height
    }

    pub fn center(&self) -> (f64, f64) {
        (self.x + self.width / 2.0, self.y + self.height / 2.0)
    }

    pub fn area(&self) -> f64 {
        self.width * self.height
    }

    pub fn contains_point(&self, x: f64, y: f64) -> bool {
        x >= self.x && x <= self.right() && y >= self.y && y <= self.bottom()
    }

    pub fn intersects(&self, other: &BoundingBox) -> bool {
        self.x < other.right()
            && self.right() > other.x
            && self.y < other.bottom()
            && self.bottom() > other.y
    }

    /// Compute the union bounding box.
    pub fn union(&self, other: &BoundingBox) -> BoundingBox {
        let x = self.x.min(other.x);
        let y = self.y.min(other.y);
        let right = self.right().max(other.right());
        let bottom = self.bottom().max(other.bottom());
        BoundingBox::new(x, y, right - x, bottom - y)
    }

    /// Compute the intersection bounding box, if any.
    pub fn intersection(&self, other: &BoundingBox) -> Option<BoundingBox> {
        let x = self.x.max(other.x);
        let y = self.y.max(other.y);
        let right = self.right().min(other.right());
        let bottom = self.bottom().min(other.bottom());

        if right > x && bottom > y {
            Some(BoundingBox::new(x, y, right - x, bottom - y))
        } else {
            None
        }
    }

    /// Is this box valid (positive dimensions)?
    pub fn is_valid(&self) -> bool {
        self.width > 0.0 && self.height > 0.0
    }
}

// ── Render Tree ──────────────────────────────────────────────────────────────

/// A structural render tree node (not pixel-based).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenderNode {
    pub id: String,
    pub kind: String,
    pub bounds: BoundingBox,
    pub visible: bool,
    pub z_index: i32,
    pub children: Vec<RenderNode>,
    pub properties: HashMap<String, String>,
}

impl RenderNode {
    pub fn from_graph_node(node: &Node) -> Self {
        Self {
            id: node.id.0.to_string(),
            kind: node.kind.clone(),
            bounds: BoundingBox::from_node(node),
            visible: true,
            z_index: node.z_index,
            children: Vec::new(),
            properties: node
                .properties
                .iter()
                .map(|(k, v)| (k.clone(), v.to_string()))
                .collect(),
        }
    }

    /// Count total nodes in this subtree.
    pub fn total_count(&self) -> usize {
        1 + self.children.iter().map(|c| c.total_count()).sum::<usize>()
    }
}

/// The full render tree produced from a graph.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenderTree {
    pub root_nodes: Vec<RenderNode>,
    pub edges: Vec<RenderEdge>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenderEdge {
    pub id: String,
    pub source_bounds: BoundingBox,
    pub target_bounds: BoundingBox,
    pub waypoints: Vec<(f64, f64)>,
}

impl RenderTree {
    /// Build a render tree from a graph model.
    pub fn from_graph(graph: &Graph) -> Self {
        let mut root_nodes: Vec<RenderNode> = graph
            .nodes
            .values()
            .filter(|n| n.parent.is_none())
            .map(|n| {
                let mut rn = RenderNode::from_graph_node(n);
                // Attach children
                rn.children = graph
                    .children(n.id)
                    .iter()
                    .map(|c| RenderNode::from_graph_node(c))
                    .collect();
                rn
            })
            .collect();

        // Sort by z-index for determinism
        root_nodes.sort_by_key(|n| n.z_index);

        let edges = graph
            .edges
            .values()
            .filter_map(|e| {
                let src = graph.node(e.source)?;
                let tgt = graph.node(e.target)?;
                Some(RenderEdge {
                    id: e.id.0.to_string(),
                    source_bounds: BoundingBox::from_node(src),
                    target_bounds: BoundingBox::from_node(tgt),
                    waypoints: e.waypoints.clone(),
                })
            })
            .collect();

        RenderTree { root_nodes, edges }
    }

    /// Count all visible render nodes.
    pub fn visible_count(&self) -> usize {
        self.root_nodes
            .iter()
            .filter(|n| n.visible)
            .map(|n| n.total_count())
            .sum()
    }

    /// Compute the overall bounding box of the entire render tree.
    pub fn overall_bounds(&self) -> Option<BoundingBox> {
        let mut result: Option<BoundingBox> = None;
        for node in &self.root_nodes {
            result = Some(match result {
                Some(r) => r.union(&node.bounds),
                None => node.bounds,
            });
        }
        result
    }
}

// ── Layout Validator ─────────────────────────────────────────────────────────

/// Validates structural layout properties.
pub struct LayoutValidator;

impl LayoutValidator {
    /// Check that no two sibling nodes overlap (within tolerance).
    pub fn check_no_overlaps(tree: &RenderTree, tolerance: f64) -> Vec<(String, String)> {
        let mut overlaps = Vec::new();

        for i in 0..tree.root_nodes.len() {
            for j in (i + 1)..tree.root_nodes.len() {
                let a = &tree.root_nodes[i];
                let b = &tree.root_nodes[j];

                if let Some(intersection) = a.bounds.intersection(&b.bounds) {
                    if intersection.area() > tolerance {
                        overlaps.push((a.id.clone(), b.id.clone()));
                    }
                }
            }
        }

        overlaps
    }

    /// Check that all nodes have valid (positive) dimensions.
    pub fn check_valid_dimensions(tree: &RenderTree) -> Vec<String> {
        let mut invalid = Vec::new();
        for node in &tree.root_nodes {
            if !node.bounds.is_valid() {
                invalid.push(node.id.clone());
            }
            for child in &node.children {
                if !child.bounds.is_valid() {
                    invalid.push(child.id.clone());
                }
            }
        }
        invalid
    }

    /// Check that all children are within parent bounds (with tolerance).
    pub fn check_children_contained(tree: &RenderTree, tolerance: f64) -> Vec<(String, String)> {
        let mut violations = Vec::new();
        for parent in &tree.root_nodes {
            for child in &parent.children {
                let expanded_parent = BoundingBox::new(
                    parent.bounds.x - tolerance,
                    parent.bounds.y - tolerance,
                    parent.bounds.width + tolerance * 2.0,
                    parent.bounds.height + tolerance * 2.0,
                );

                let child_contained =
                    expanded_parent.contains_point(child.bounds.x, child.bounds.y)
                        && expanded_parent
                            .contains_point(child.bounds.right(), child.bounds.bottom());

                if !child_contained {
                    violations.push((parent.id.clone(), child.id.clone()));
                }
            }
        }
        violations
    }

    /// Check render tree node count matches graph node count.
    pub fn check_completeness(graph: &Graph, tree: &RenderTree) -> bool {
        let tree_count: usize = tree.root_nodes.iter().map(|n| n.total_count()).sum();
        tree_count == graph.node_count()
    }

    /// Check that edges connect to actual rendered nodes.
    pub fn check_edge_connectivity(tree: &RenderTree) -> bool {
        // Verify source/target bounds are non-zero
        tree.edges
            .iter()
            .all(|e| e.source_bounds.is_valid() && e.target_bounds.is_valid())
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_graph() -> Graph {
        let mut g = Graph::new();
        let a = g
            .add_node(
                Node::new("block")
                    .with_id(NodeId::from_seed(1))
                    .with_position(0.0, 0.0)
                    .with_size(100.0, 50.0),
            )
            .unwrap();
        let b = g
            .add_node(
                Node::new("block")
                    .with_id(NodeId::from_seed(2))
                    .with_position(200.0, 0.0)
                    .with_size(100.0, 50.0),
            )
            .unwrap();
        g.add_edge(Edge::new(a, b, "wire").with_id(EdgeId::from_seed(100)))
            .unwrap();
        g
    }

    #[test]
    fn render_tree_from_graph() {
        let g = sample_graph();
        let tree = RenderTree::from_graph(&g);
        assert_eq!(tree.root_nodes.len(), 2);
        assert_eq!(tree.edges.len(), 1);
    }

    #[test]
    fn no_overlaps_in_spaced_layout() {
        let g = sample_graph();
        let tree = RenderTree::from_graph(&g);
        let overlaps = LayoutValidator::check_no_overlaps(&tree, 0.0);
        assert!(overlaps.is_empty());
    }

    #[test]
    fn detect_overlaps() {
        let mut g = Graph::new();
        g.add_node(
            Node::new("a")
                .with_id(NodeId::from_seed(1))
                .with_position(0.0, 0.0)
                .with_size(100.0, 100.0),
        )
        .unwrap();
        g.add_node(
            Node::new("b")
                .with_id(NodeId::from_seed(2))
                .with_position(50.0, 50.0) // overlaps with first
                .with_size(100.0, 100.0),
        )
        .unwrap();

        let tree = RenderTree::from_graph(&g);
        let overlaps = LayoutValidator::check_no_overlaps(&tree, 0.0);
        assert_eq!(overlaps.len(), 1);
    }

    #[test]
    fn valid_dimensions() {
        let g = sample_graph();
        let tree = RenderTree::from_graph(&g);
        let invalid = LayoutValidator::check_valid_dimensions(&tree);
        assert!(invalid.is_empty());
    }

    #[test]
    fn completeness_check() {
        let g = sample_graph();
        let tree = RenderTree::from_graph(&g);
        assert!(LayoutValidator::check_completeness(&g, &tree));
    }

    #[test]
    fn bounding_box_operations() {
        let a = BoundingBox::new(0.0, 0.0, 100.0, 100.0);
        let b = BoundingBox::new(50.0, 50.0, 100.0, 100.0);

        assert!(a.intersects(&b));
        let u = a.union(&b);
        assert_eq!(u.x, 0.0);
        assert_eq!(u.y, 0.0);
        assert_eq!(u.right(), 150.0);
        assert_eq!(u.bottom(), 150.0);

        let i = a.intersection(&b).unwrap();
        assert_eq!(i.x, 50.0);
        assert_eq!(i.y, 50.0);
        assert_eq!(i.width, 50.0);
        assert_eq!(i.height, 50.0);
    }

    #[test]
    fn overall_bounds() {
        let g = sample_graph();
        let tree = RenderTree::from_graph(&g);
        let bounds = tree.overall_bounds().unwrap();
        assert_eq!(bounds.x, 0.0);
        assert_eq!(bounds.y, 0.0);
        assert_eq!(bounds.right(), 300.0); // 200 + 100
        assert_eq!(bounds.bottom(), 50.0);
    }
}
