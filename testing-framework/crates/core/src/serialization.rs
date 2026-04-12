//! Serialization testing — round-trip validation, golden tests, schema evolution.

use crate::model::Graph;
use serde::{de::DeserializeOwned, Serialize};
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use thiserror::Error;

// ── Errors ───────────────────────────────────────────────────────────────────

#[derive(Debug, Error)]
pub enum SerializationError {
    #[error("Round-trip mismatch: serialized form differs after deserialize→serialize")]
    RoundTripMismatch { original: String, roundtripped: String },

    #[error("Golden file mismatch at {path}: expected hash {expected}, got {actual}")]
    GoldenMismatch {
        path: PathBuf,
        expected: String,
        actual: String,
    },

    #[error("Golden file not found: {0}")]
    GoldenNotFound(PathBuf),

    #[error("Schema version mismatch: expected {expected}, got {actual}")]
    SchemaVersionMismatch { expected: u32, actual: u32 },

    #[error("Deserialization failed: {0}")]
    DeserializeFailed(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
}

// ── Schema Version ───────────────────────────────────────────────────────────

/// Tracks schema versions for backward compatibility testing.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct SchemaVersion {
    pub major: u32,
    pub minor: u32,
}

impl SchemaVersion {
    pub fn new(major: u32, minor: u32) -> Self {
        Self { major, minor }
    }

    pub fn is_compatible_with(&self, other: &SchemaVersion) -> bool {
        self.major == other.major && self.minor >= other.minor
    }
}

impl std::fmt::Display for SchemaVersion {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}.{}", self.major, self.minor)
    }
}

/// Wrapper for versioned serialization.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Versioned<T> {
    pub schema_version: SchemaVersion,
    pub data: T,
}

// ── Round-Trip Testing ───────────────────────────────────────────────────────

/// Validates serialization round-trip invariants.
pub struct RoundTrip;

impl RoundTrip {
    /// Test JSON round-trip: serialize → deserialize → serialize must be identical.
    pub fn json<T>(value: &T) -> Result<(), SerializationError>
    where
        T: Serialize + DeserializeOwned + PartialEq + std::fmt::Debug,
    {
        let serialized = serde_json::to_string_pretty(value)?;
        let deserialized: T = serde_json::from_str(&serialized)?;
        let re_serialized = serde_json::to_string_pretty(&deserialized)?;

        if serialized != re_serialized {
            return Err(SerializationError::RoundTripMismatch {
                original: serialized,
                roundtripped: re_serialized,
            });
        }
        Ok(())
    }

    /// Test bincode round-trip.
    pub fn bincode<T>(value: &T) -> Result<(), SerializationError>
    where
        T: Serialize + DeserializeOwned + PartialEq + std::fmt::Debug,
    {
        let bytes = bincode::serialize(value)
            .map_err(|e| SerializationError::DeserializeFailed(e.to_string()))?;
        let deserialized: T = bincode::deserialize(&bytes)
            .map_err(|e| SerializationError::DeserializeFailed(e.to_string()))?;
        let re_bytes = bincode::serialize(&deserialized)
            .map_err(|e| SerializationError::DeserializeFailed(e.to_string()))?;

        if bytes != re_bytes {
            return Err(SerializationError::RoundTripMismatch {
                original: hex::encode(&bytes),
                roundtripped: hex::encode(&re_bytes),
            });
        }
        Ok(())
    }

    /// Test that a Graph survives JSON round-trip.
    ///
    /// We compare using `serde_json::Value` (structural equality) rather than
    /// raw JSON strings, because HashMap key ordering is non-deterministic
    /// across deserializations.
    pub fn graph_json(graph: &Graph) -> Result<(), SerializationError> {
        let json = serde_json::to_string(graph)?;
        let restored: Graph = serde_json::from_str(&json)?;
        let json2 = serde_json::to_string(&restored)?;

        // Compare structurally via serde_json::Value to ignore key ordering
        let v1: serde_json::Value = serde_json::from_str(&json)?;
        let v2: serde_json::Value = serde_json::from_str(&json2)?;

        if v1 != v2 {
            return Err(SerializationError::RoundTripMismatch {
                original: format!("(len={})", json.len()),
                roundtripped: format!("(len={})", json2.len()),
            });
        }

        // Structural sanity: same node/edge count
        if graph.node_count() != restored.node_count() || graph.edge_count() != restored.edge_count() {
            return Err(SerializationError::RoundTripMismatch {
                original: format!("{}N/{}E", graph.node_count(), graph.edge_count()),
                roundtripped: format!("{}N/{}E", restored.node_count(), restored.edge_count()),
            });
        }

        Ok(())
    }

    /// Test that a Graph survives bincode round-trip.
    pub fn graph_bincode(graph: &Graph) -> Result<(), SerializationError> {
        let original_hash = graph.content_hash();
        let bytes = bincode::serialize(graph)
            .map_err(|e| SerializationError::DeserializeFailed(e.to_string()))?;
        let restored: Graph = bincode::deserialize(&bytes)
            .map_err(|e| SerializationError::DeserializeFailed(e.to_string()))?;
        let restored_hash = restored.content_hash();

        if original_hash != restored_hash {
            return Err(SerializationError::RoundTripMismatch {
                original: original_hash,
                roundtripped: restored_hash,
            });
        }
        Ok(())
    }
}

// ── Golden Testing ───────────────────────────────────────────────────────────

/// Golden test manager — compares serialized output against known-good snapshots.
pub struct GoldenTest {
    golden_dir: PathBuf,
    update_mode: bool,
}

impl GoldenTest {
    pub fn new(golden_dir: impl Into<PathBuf>) -> Self {
        Self {
            golden_dir: golden_dir.into(),
            update_mode: std::env::var("UPDATE_GOLDEN").is_ok(),
        }
    }

    /// Force update mode (write golden files instead of comparing).
    pub fn with_update_mode(mut self, update: bool) -> Self {
        self.update_mode = update;
        self
    }

    /// Compare serialized value against a golden file.
    pub fn check<T: Serialize>(
        &self,
        name: &str,
        value: &T,
    ) -> Result<(), SerializationError> {
        let content = serde_json::to_string_pretty(value)?;
        self.check_raw(name, &content)
    }

    /// Compare raw string content against a golden file.
    pub fn check_raw(
        &self,
        name: &str,
        content: &str,
    ) -> Result<(), SerializationError> {
        let path = self.golden_dir.join(format!("{}.golden.json", name));
        let content_hash = sha256_hex(content.as_bytes());

        if self.update_mode {
            std::fs::create_dir_all(&self.golden_dir)?;
            std::fs::write(&path, content)?;
            return Ok(());
        }

        if !path.exists() {
            // Auto-create on first run
            std::fs::create_dir_all(&self.golden_dir)?;
            std::fs::write(&path, content)?;
            return Ok(());
        }

        let expected = std::fs::read_to_string(&path)?;
        let expected_hash = sha256_hex(expected.as_bytes());

        if content_hash != expected_hash {
            return Err(SerializationError::GoldenMismatch {
                path,
                expected: expected_hash,
                actual: content_hash,
            });
        }

        Ok(())
    }

    /// Check backward compatibility: deserialize old golden file with current code.
    pub fn check_backward_compat<T: DeserializeOwned>(
        &self,
        name: &str,
    ) -> Result<T, SerializationError> {
        let path = self.golden_dir.join(format!("{}.golden.json", name));
        if !path.exists() {
            return Err(SerializationError::GoldenNotFound(path));
        }
        let data = std::fs::read_to_string(&path)?;
        let value: T = serde_json::from_str(&data)?;
        Ok(value)
    }
}

fn sha256_hex(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hex::encode(hasher.finalize())
}

// ── Schema Evolution Testing ─────────────────────────────────────────────────

/// Helpers for testing schema migration paths.
pub struct SchemaEvolution;

impl SchemaEvolution {
    /// Test that data serialized at version `old` can be deserialized at version `new`.
    pub fn test_migration<Old, New>(
        old_json: &str,
        _old_version: SchemaVersion,
        _new_version: SchemaVersion,
    ) -> Result<New, SerializationError>
    where
        Old: DeserializeOwned,
        New: DeserializeOwned,
    {
        // First verify old format is valid
        let _old: Old = serde_json::from_str(old_json)
            .map_err(|e| SerializationError::DeserializeFailed(format!("Old format: {}", e)))?;

        // Then try to deserialize as new format (relies on serde defaults/aliases)
        let new: New = serde_json::from_str(old_json)
            .map_err(|e| SerializationError::DeserializeFailed(format!("New format: {}", e)))?;

        Ok(new)
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::*;

    #[test]
    fn json_roundtrip_graph() {
        let mut g = Graph::new();
        let a = g.add_node(Node::new("block").with_id(NodeId::from_seed(1))).unwrap();
        let b = g.add_node(Node::new("block").with_id(NodeId::from_seed(2))).unwrap();
        g.add_edge(Edge::new(a, b, "wire").with_id(EdgeId::from_seed(100))).unwrap();

        RoundTrip::graph_json(&g).unwrap();
    }

    #[test]
    fn bincode_roundtrip_graph() {
        let mut g = Graph::new();
        let a = g.add_node(Node::new("sensor").with_id(NodeId::from_seed(10))).unwrap();
        let b = g.add_node(Node::new("actuator").with_id(NodeId::from_seed(20))).unwrap();
        g.add_edge(Edge::new(a, b, "signal").with_id(EdgeId::from_seed(200))).unwrap();

        RoundTrip::graph_bincode(&g).unwrap();
    }

    #[test]
    fn golden_test_create_and_verify() {
        let dir = tempfile::tempdir().unwrap();
        let golden = GoldenTest::new(dir.path());

        let mut g = Graph::new();
        g.add_node(Node::new("x").with_id(NodeId::from_seed(1))).unwrap();

        // First run: creates golden file
        golden.check("test_graph", &g).unwrap();

        // Second run: should match
        golden.check("test_graph", &g).unwrap();
    }

    #[test]
    fn golden_test_detects_change() {
        let dir = tempfile::tempdir().unwrap();
        let golden = GoldenTest::new(dir.path());

        let mut g1 = Graph::new();
        g1.add_node(Node::new("x").with_id(NodeId::from_seed(1))).unwrap();
        golden.check("detect_change", &g1).unwrap();

        // Modify the graph
        let mut g2 = Graph::new();
        g2.add_node(Node::new("y").with_id(NodeId::from_seed(2))).unwrap();
        let result = golden.check("detect_change", &g2);
        assert!(result.is_err());
    }

    #[test]
    fn schema_version_compat() {
        let v1 = SchemaVersion::new(1, 0);
        let v1_1 = SchemaVersion::new(1, 1);
        let v2 = SchemaVersion::new(2, 0);

        assert!(v1_1.is_compatible_with(&v1));
        assert!(!v1.is_compatible_with(&v1_1));
        assert!(!v2.is_compatible_with(&v1));
    }
}
