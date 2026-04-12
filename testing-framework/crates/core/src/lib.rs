//! Industrial Test Core — Production-grade testing framework for professional GUI applications.
//!
//! # Architecture
//!
//! ```text
//! MODEL → OPERATIONS → EVENTS → SERIALIZATION → RENDER → UI
//! ```
//!
//! Each layer is independently testable. This crate provides:
//! - Deterministic model layer with strict invariants
//! - Event sourcing with replay and undo/redo
//! - Property-based test generators
//! - Serialization round-trip validation
//! - CRDT simulation for distributed editing
//! - Render validation (structural, not pixel-based)
//! - Performance benchmarking harness
//! - Generic generative testing engine with combinators
//! - Web GUI testing primitives (components, state, events, a11y)

pub mod model;
pub mod events;
pub mod serialization;
pub mod property;
pub mod crdt;
pub mod render;
pub mod perf;
pub mod logging;
pub mod runner;
pub mod generators;
pub mod web;

pub use model::{Graph, Node, Edge, NodeId, EdgeId, GraphError, Invariant};
pub use events::{Event, EventLog, EventStore, ReplayEngine};
pub use serialization::{RoundTrip, GoldenTest, SchemaVersion};
pub use property::{ArbitraryGraph, PropertyTestConfig, PropertyRunner};
pub use crdt::{CrdtSimulator, ClientId, Operation as CrdtOp};
pub use render::{BoundingBox, LayoutValidator, RenderTree};
pub use perf::{BenchmarkSuite, StressTestConfig, MemoryProfile};
pub use logging::{StructuredLogger, TraceExporter};
pub use runner::{TestSuite, TestCase, TestResult, TestRunner};
pub use generators::{Gen, Arbitrary, GenRunner, GenPropertyConfig, GenFn};
pub use web::{
    Component, ComponentId, ComponentKind, ComponentTree,
    ArbitraryComponent, WebValidator, DomEvent, AppState, StateAction,
    Breakpoint, Viewport, Route, Router, EventSimulator,
    ValidationRule, Accessibility,
};
