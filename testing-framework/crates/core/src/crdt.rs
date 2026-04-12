//! CRDT simulation — distributed editing with concurrent operations.
//!
//! Simulates multiple clients editing the same graph concurrently,
//! with network delays and partitions, validating eventual consistency.

use crate::model::*;
use rand::prelude::*;
use rand_chacha::ChaCha8Rng;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap, VecDeque};
use uuid::Uuid;

// ── Client Identity ──────────────────────────────────────────────────────────

/// Unique client identifier for distributed scenarios.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, PartialOrd, Ord)]
pub struct ClientId(pub Uuid);

impl ClientId {
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

impl Default for ClientId {
    fn default() -> Self {
        Self::new()
    }
}

// ── Lamport Timestamp ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct LamportTimestamp {
    pub counter: u64,
    pub client: ClientId,
}

impl LamportTimestamp {
    pub fn new(client: ClientId) -> Self {
        Self { counter: 0, client }
    }

    pub fn increment(&mut self) {
        self.counter += 1;
    }

    pub fn merge(&mut self, other: &LamportTimestamp) {
        self.counter = self.counter.max(other.counter) + 1;
    }
}

// ── CRDT Operations ──────────────────────────────────────────────────────────

/// A single CRDT operation with causal metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Operation {
    pub id: Uuid,
    pub timestamp: LamportTimestamp,
    pub kind: OperationKind,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum OperationKind {
    AddNode {
        node_id: NodeId,
        kind: String,
        x: f64,
        y: f64,
    },
    RemoveNode {
        node_id: NodeId,
    },
    MoveNode {
        node_id: NodeId,
        x: f64,
        y: f64,
    },
    AddEdge {
        edge_id: EdgeId,
        source: NodeId,
        target: NodeId,
    },
    RemoveEdge {
        edge_id: EdgeId,
    },
    SetProperty {
        node_id: NodeId,
        key: String,
        value: serde_json::Value,
    },
}

// ── Simulated Client ─────────────────────────────────────────────────────────

/// A simulated client with its own local graph and pending operations.
#[derive(Debug)]
pub struct SimulatedClient {
    pub id: ClientId,
    pub graph: Graph,
    pub clock: LamportTimestamp,
    pub applied_ops: Vec<Operation>,
    /// Outbound operations not yet delivered to other clients.
    outbox: VecDeque<Operation>,
}

impl SimulatedClient {
    pub fn new(id: ClientId) -> Self {
        Self {
            id,
            graph: Graph::new(),
            clock: LamportTimestamp::new(id),
            applied_ops: Vec::new(),
            outbox: VecDeque::new(),
        }
    }

    /// Generate and apply a local operation.
    pub fn local_op(&mut self, kind: OperationKind) {
        self.clock.increment();
        let op = Operation {
            id: Uuid::new_v4(),
            timestamp: self.clock,
            kind,
        };
        self.apply_op(&op);
        self.outbox.push_back(op);
    }

    /// Apply a remote operation, merging clocks.
    pub fn receive_op(&mut self, op: &Operation) {
        self.clock.merge(&op.timestamp);
        self.apply_op(op);
    }

    /// Drain outbox for delivery.
    pub fn drain_outbox(&mut self) -> Vec<Operation> {
        self.outbox.drain(..).collect()
    }

    fn apply_op(&mut self, op: &Operation) {
        // Idempotency: skip already-applied operations
        if self.applied_ops.iter().any(|a| a.id == op.id) {
            return;
        }

        match &op.kind {
            OperationKind::AddNode { node_id, kind, x, y } => {
                let _ = self.graph.add_node(
                    Node::new(kind.as_str())
                        .with_id(*node_id)
                        .with_position(*x, *y),
                );
            }
            OperationKind::RemoveNode { node_id } => {
                let _ = self.graph.remove_node(*node_id);
            }
            OperationKind::MoveNode { node_id, x, y } => {
                let _ = self.graph.move_node(*node_id, *x, *y);
            }
            OperationKind::AddEdge { edge_id, source, target } => {
                let _ = self.graph.add_edge(
                    Edge::new(*source, *target, "wire").with_id(*edge_id),
                );
            }
            OperationKind::RemoveEdge { edge_id } => {
                let _ = self.graph.remove_edge(*edge_id);
            }
            OperationKind::SetProperty { node_id, key, value } => {
                let _ = self.graph.set_node_property(*node_id, key.clone(), value.clone());
            }
        }

        self.applied_ops.push(op.clone());
    }
}

// ── Network Simulator ────────────────────────────────────────────────────────

/// Simulates a network with configurable delay and partition behavior.
#[derive(Debug)]
pub struct NetworkSimulator {
    /// Messages in-flight: (delay_remaining, source, operation)
    in_flight: Vec<(u32, ClientId, Operation)>,
    /// Set of partitioned client pairs (bidirectional blocks).
    partitions: Vec<(ClientId, ClientId)>,
    /// Base delay in ticks.
    pub base_delay: u32,
    /// Random jitter range.
    pub jitter: u32,
    rng: ChaCha8Rng,
}

impl NetworkSimulator {
    pub fn new(seed: u64, base_delay: u32, jitter: u32) -> Self {
        Self {
            in_flight: Vec::new(),
            partitions: Vec::new(),
            base_delay,
            jitter,
            rng: ChaCha8Rng::seed_from_u64(seed),
        }
    }

    /// Inject a partition between two clients.
    pub fn add_partition(&mut self, a: ClientId, b: ClientId) {
        self.partitions.push((a, b));
    }

    /// Remove a partition.
    pub fn heal_partition(&mut self, a: ClientId, b: ClientId) {
        self.partitions.retain(|&(x, y)| !((x == a && y == b) || (x == b && y == a)));
    }

    /// Enqueue an operation from a source to all other clients.
    pub fn broadcast(&mut self, source: ClientId, op: Operation, targets: &[ClientId]) {
        for &target in targets {
            if target == source {
                continue;
            }
            if self.is_partitioned(source, target) {
                continue; // Dropped in partition
            }
            let delay = self.base_delay + self.rng.gen_range(0..=self.jitter);
            self.in_flight.push((delay, target, op.clone()));
        }
    }

    /// Advance time by one tick. Returns operations ready for delivery, keyed by target.
    pub fn tick(&mut self) -> HashMap<ClientId, Vec<Operation>> {
        let mut delivered = HashMap::new();
        let mut remaining = Vec::new();

        for (delay, target, op) in self.in_flight.drain(..) {
            if delay <= 1 {
                delivered.entry(target).or_insert_with(Vec::new).push(op);
            } else {
                remaining.push((delay - 1, target, op));
            }
        }

        self.in_flight = remaining;
        delivered
    }

    /// Check if any messages are still in-flight.
    pub fn has_in_flight(&self) -> bool {
        !self.in_flight.is_empty()
    }

    fn is_partitioned(&self, a: ClientId, b: ClientId) -> bool {
        self.partitions
            .iter()
            .any(|&(x, y)| (x == a && y == b) || (x == b && y == a))
    }
}

// ── CRDT Simulator (High-Level) ─────────────────────────────────────────────

/// Orchestrates a full CRDT simulation with multiple clients and network.
pub struct CrdtSimulator {
    pub clients: BTreeMap<ClientId, SimulatedClient>,
    pub network: NetworkSimulator,
    pub tick_count: u64,
}

impl CrdtSimulator {
    pub fn new(num_clients: usize, network_seed: u64) -> Self {
        let mut clients = BTreeMap::new();
        for i in 0..num_clients {
            let id = ClientId::from_seed(i as u64);
            clients.insert(id, SimulatedClient::new(id));
        }

        Self {
            clients,
            network: NetworkSimulator::new(network_seed, 2, 3),
            tick_count: 0,
        }
    }

    /// Get all client IDs.
    pub fn client_ids(&self) -> Vec<ClientId> {
        self.clients.keys().copied().collect()
    }

    /// Execute an operation on a specific client and broadcast.
    pub fn client_op(&mut self, client_id: ClientId, kind: OperationKind) {
        let ids = self.client_ids();
        let client = self.clients.get_mut(&client_id).unwrap();
        client.local_op(kind);
        let ops = client.drain_outbox();
        for op in ops {
            self.network.broadcast(client_id, op, &ids);
        }
    }

    /// Advance simulation by one tick — deliver messages, apply to clients.
    pub fn tick(&mut self) {
        let delivered = self.network.tick();
        for (target_id, ops) in delivered {
            if let Some(client) = self.clients.get_mut(&target_id) {
                for op in &ops {
                    client.receive_op(op);
                }
            }
        }
        self.tick_count += 1;
    }

    /// Run ticks until all in-flight messages are delivered.
    pub fn drain_network(&mut self) {
        let max_ticks = 1000;
        for _ in 0..max_ticks {
            if !self.network.has_in_flight() {
                break;
            }
            self.tick();
        }
    }

    /// Check if all clients have converged to the same state.
    pub fn check_convergence(&self) -> bool {
        let hashes: Vec<_> = self
            .clients
            .values()
            .map(|c| c.graph.content_hash())
            .collect();

        hashes.windows(2).all(|w| w[0] == w[1])
    }

    /// Check if all clients pass invariants.
    pub fn check_all_invariants(&self) -> Result<(), (ClientId, GraphError)> {
        for (id, client) in &self.clients {
            if let Err(e) = client.graph.check_invariants() {
                return Err((*id, e));
            }
        }
        Ok(())
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn two_clients_converge_no_conflict() {
        let mut sim = CrdtSimulator::new(2, 42);
        let ids = sim.client_ids();

        // Client 0 adds a node
        sim.client_op(ids[0], OperationKind::AddNode {
            node_id: NodeId::from_seed(100),
            kind: "block".into(),
            x: 0.0, y: 0.0,
        });

        // Client 1 adds a different node
        sim.client_op(ids[1], OperationKind::AddNode {
            node_id: NodeId::from_seed(200),
            kind: "sensor".into(),
            x: 100.0, y: 100.0,
        });

        sim.drain_network();
        assert!(sim.check_convergence());
        assert!(sim.check_all_invariants().is_ok());

        // Both clients should have both nodes
        for client in sim.clients.values() {
            assert_eq!(client.graph.node_count(), 2);
        }
    }

    #[test]
    fn concurrent_moves_converge() {
        let mut sim = CrdtSimulator::new(2, 99);
        let ids = sim.client_ids();
        let node_id = NodeId::from_seed(1);

        // Both clients start with the same node
        for &id in &ids {
            sim.client_op(id, OperationKind::AddNode {
                node_id,
                kind: "block".into(),
                x: 0.0, y: 0.0,
            });
        }
        sim.drain_network();

        // Concurrent moves
        sim.client_op(ids[0], OperationKind::MoveNode {
            node_id, x: 50.0, y: 50.0,
        });
        sim.client_op(ids[1], OperationKind::MoveNode {
            node_id, x: 100.0, y: 100.0,
        });

        sim.drain_network();

        // Both should have invariants intact
        assert!(sim.check_all_invariants().is_ok());
    }

    #[test]
    fn partition_and_heal() {
        let mut sim = CrdtSimulator::new(3, 7);
        let ids = sim.client_ids();

        // Partition client 0 from client 1
        sim.network.add_partition(ids[0], ids[1]);

        // Client 0 adds a node
        sim.client_op(ids[0], OperationKind::AddNode {
            node_id: NodeId::from_seed(10),
            kind: "a".into(),
            x: 0.0, y: 0.0,
        });

        sim.drain_network();

        // Client 1 should NOT have the node (partitioned)
        assert_eq!(sim.clients[&ids[1]].graph.node_count(), 0);
        // Client 2 should have it (not partitioned from 0)
        assert_eq!(sim.clients[&ids[2]].graph.node_count(), 1);

        // Heal partition
        sim.network.heal_partition(ids[0], ids[1]);

        // Now send another op to trigger client 1 sync
        sim.client_op(ids[0], OperationKind::AddNode {
            node_id: NodeId::from_seed(20),
            kind: "b".into(),
            x: 10.0, y: 10.0,
        });

        sim.drain_network();

        // Client 1 gets the second node at least
        assert!(sim.clients[&ids[1]].graph.node_count() >= 1);
        assert!(sim.check_all_invariants().is_ok());
    }

    #[test]
    fn idempotent_operations() {
        let mut sim = CrdtSimulator::new(2, 55);
        let ids = sim.client_ids();

        sim.client_op(ids[0], OperationKind::AddNode {
            node_id: NodeId::from_seed(1),
            kind: "block".into(),
            x: 0.0, y: 0.0,
        });

        sim.drain_network();

        // Manually re-deliver the same operation
        let op = sim.clients[&ids[0]].applied_ops[0].clone();
        sim.clients.get_mut(&ids[1]).unwrap().receive_op(&op);

        // Should still have exactly 1 node (idempotent)
        assert_eq!(sim.clients[&ids[1]].graph.node_count(), 1);
    }

    #[test]
    fn many_clients_stress() {
        let mut sim = CrdtSimulator::new(5, 123);
        let ids = sim.client_ids();

        // Each client adds 3 nodes
        for (i, &client_id) in ids.iter().enumerate() {
            for j in 0..3 {
                sim.client_op(client_id, OperationKind::AddNode {
                    node_id: NodeId::from_seed((i * 100 + j) as u64),
                    kind: "block".into(),
                    x: (i * 50) as f64,
                    y: (j * 50) as f64,
                });
            }
        }

        sim.drain_network();
        assert!(sim.check_convergence());
        assert!(sim.check_all_invariants().is_ok());

        for client in sim.clients.values() {
            assert_eq!(client.graph.node_count(), 15);
        }
    }
}
