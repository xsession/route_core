//! Performance testing — stress tests, memory profiling, benchmarking harness.

use crate::model::*;
use crate::property::ArbitraryGraph;
use std::time::{Duration, Instant};

// ── Benchmark Suite ──────────────────────────────────────────────────────────

/// A named benchmark result.
#[derive(Debug, Clone)]
pub struct BenchmarkResult {
    pub name: String,
    pub iterations: u64,
    pub total_time: Duration,
    pub mean_time: Duration,
    pub min_time: Duration,
    pub max_time: Duration,
    pub std_dev: Duration,
}

impl BenchmarkResult {
    pub fn ops_per_second(&self) -> f64 {
        if self.mean_time.as_secs_f64() == 0.0 {
            return 0.0;
        }
        1.0 / self.mean_time.as_secs_f64()
    }
}

impl std::fmt::Display for BenchmarkResult {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{}: mean={:.2?}, min={:.2?}, max={:.2?}, stddev={:.2?}, ops/s={:.0}",
            self.name,
            self.mean_time,
            self.min_time,
            self.max_time,
            self.std_dev,
            self.ops_per_second()
        )
    }
}

/// Harness for running benchmarks.
pub struct BenchmarkSuite {
    pub results: Vec<BenchmarkResult>,
}

impl BenchmarkSuite {
    pub fn new() -> Self {
        Self {
            results: Vec::new(),
        }
    }

    /// Run a benchmark with the given number of iterations.
    pub fn bench<F: FnMut()>(&mut self, name: impl Into<String>, iterations: u64, mut f: F) {
        let name = name.into();
        let mut times = Vec::with_capacity(iterations as usize);

        // Warmup
        for _ in 0..3 {
            f();
        }

        for _ in 0..iterations {
            let start = Instant::now();
            f();
            times.push(start.elapsed());
        }

        let total: Duration = times.iter().sum();
        let mean = total / iterations as u32;
        let min = *times.iter().min().unwrap();
        let max = *times.iter().max().unwrap();

        let mean_nanos = mean.as_nanos() as f64;
        let variance: f64 = times
            .iter()
            .map(|t| {
                let diff = t.as_nanos() as f64 - mean_nanos;
                diff * diff
            })
            .sum::<f64>()
            / iterations as f64;
        let std_dev = Duration::from_nanos(variance.sqrt() as u64);

        self.results.push(BenchmarkResult {
            name,
            iterations,
            total_time: total,
            mean_time: mean,
            min_time: min,
            max_time: max,
            std_dev,
        });
    }

    /// Print all results.
    pub fn report(&self) -> String {
        let mut out = String::new();
        out.push_str("=== Benchmark Results ===\n");
        for r in &self.results {
            out.push_str(&format!("{}\n", r));
        }
        out
    }

    /// Export results as CSV.
    pub fn export_csv(&self) -> String {
        let mut out = String::from("name,iterations,mean_ns,min_ns,max_ns,stddev_ns,ops_per_sec\n");
        for r in &self.results {
            out.push_str(&format!(
                "{},{},{},{},{},{},{:.2}\n",
                r.name,
                r.iterations,
                r.mean_time.as_nanos(),
                r.min_time.as_nanos(),
                r.max_time.as_nanos(),
                r.std_dev.as_nanos(),
                r.ops_per_second(),
            ));
        }
        out
    }
}

impl Default for BenchmarkSuite {
    fn default() -> Self {
        Self::new()
    }
}

// ── Stress Test Configuration ────────────────────────────────────────────────

/// Configuration for large-model stress tests.
#[derive(Debug, Clone)]
pub struct StressTestConfig {
    /// Number of nodes to generate.
    pub num_nodes: usize,
    /// Number of edges to generate.
    pub num_edges: usize,
    /// Seed for deterministic generation.
    pub seed: u64,
    /// Maximum time allowed for the test.
    pub timeout: Duration,
}

impl Default for StressTestConfig {
    fn default() -> Self {
        Self {
            num_nodes: 10_000,
            num_edges: 50_000,
            seed: 42,
            timeout: Duration::from_secs(60),
        }
    }
}

/// Result of a stress test run.
#[derive(Debug)]
pub struct StressTestResult {
    pub config: StressTestConfig,
    pub actual_nodes: usize,
    pub actual_edges: usize,
    pub build_time: Duration,
    pub invariant_check_time: Duration,
    pub serialization_time: Duration,
    pub deserialization_time: Duration,
    pub content_hash_time: Duration,
    pub timed_out: bool,
}

impl StressTestResult {
    pub fn passed(&self) -> bool {
        !self.timed_out
    }
}

impl std::fmt::Display for StressTestResult {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "StressTest: {}N/{}E, build={:.2?}, invariants={:.2?}, ser={:.2?}, deser={:.2?}, hash={:.2?}{}",
            self.actual_nodes,
            self.actual_edges,
            self.build_time,
            self.invariant_check_time,
            self.serialization_time,
            self.deserialization_time,
            self.content_hash_time,
            if self.timed_out { " [TIMEOUT]" } else { "" }
        )
    }
}

/// Run a stress test with the given configuration.
pub fn run_stress_test(config: StressTestConfig) -> StressTestResult {
    let deadline = Instant::now() + config.timeout;

    // Build the graph
    let build_start = Instant::now();
    let graph = ArbitraryGraph::generate(config.seed, config.num_nodes, config.num_edges);
    let build_time = build_start.elapsed();

    if Instant::now() > deadline {
        return StressTestResult {
            actual_nodes: graph.node_count(),
            actual_edges: graph.edge_count(),
            build_time,
            invariant_check_time: Duration::ZERO,
            serialization_time: Duration::ZERO,
            deserialization_time: Duration::ZERO,
            content_hash_time: Duration::ZERO,
            config,
            timed_out: true,
        };
    }

    // Check invariants
    let inv_start = Instant::now();
    let _ = graph.check_invariants();
    let invariant_check_time = inv_start.elapsed();

    // Serialization
    let ser_start = Instant::now();
    let json = serde_json::to_string(&graph).unwrap();
    let serialization_time = ser_start.elapsed();

    // Deserialization
    let deser_start = Instant::now();
    let _restored: Graph = serde_json::from_str(&json).unwrap();
    let deserialization_time = deser_start.elapsed();

    // Content hash
    let hash_start = Instant::now();
    let _hash = graph.content_hash();
    let content_hash_time = hash_start.elapsed();

    let timed_out = Instant::now() > deadline;

    StressTestResult {
        actual_nodes: graph.node_count(),
        actual_edges: graph.edge_count(),
        build_time,
        invariant_check_time,
        serialization_time,
        deserialization_time,
        content_hash_time,
        config,
        timed_out,
    }
}

// ── Memory Profile ───────────────────────────────────────────────────────────

/// Rough memory usage estimates for graphs.
#[derive(Debug)]
pub struct MemoryProfile {
    /// JSON serialized size in bytes.
    pub json_size: usize,
    /// Bincode serialized size in bytes.
    pub bincode_size: usize,
    /// Number of nodes.
    pub node_count: usize,
    /// Number of edges.
    pub edge_count: usize,
}

impl MemoryProfile {
    pub fn estimate(graph: &Graph) -> Self {
        let json = serde_json::to_string(graph).unwrap_or_default();
        let bincode = bincode::serialize(graph).unwrap_or_default();

        Self {
            json_size: json.len(),
            bincode_size: bincode.len(),
            node_count: graph.node_count(),
            edge_count: graph.edge_count(),
        }
    }

    pub fn bytes_per_node_json(&self) -> f64 {
        if self.node_count == 0 {
            0.0
        } else {
            self.json_size as f64 / self.node_count as f64
        }
    }

    pub fn compression_ratio(&self) -> f64 {
        if self.json_size == 0 {
            0.0
        } else {
            self.bincode_size as f64 / self.json_size as f64
        }
    }
}

impl std::fmt::Display for MemoryProfile {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "MemoryProfile: {}N/{}E, json={}B, bincode={}B, ratio={:.2}",
            self.node_count,
            self.edge_count,
            self.json_size,
            self.bincode_size,
            self.compression_ratio()
        )
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn benchmark_suite_runs() {
        let mut suite = BenchmarkSuite::new();
        suite.bench("noop", 10, || {});
        assert_eq!(suite.results.len(), 1);
        assert_eq!(suite.results[0].iterations, 10);
    }

    #[test]
    fn stress_test_small() {
        let config = StressTestConfig {
            num_nodes: 100,
            num_edges: 200,
            seed: 42,
            timeout: Duration::from_secs(10),
        };
        let result = run_stress_test(config);
        assert!(result.passed());
        assert!(result.actual_nodes > 0);
    }

    #[test]
    fn memory_profile() {
        let graph = ArbitraryGraph::generate(42, 50, 100);
        let profile = MemoryProfile::estimate(&graph);
        assert!(profile.json_size > 0);
        assert!(profile.bincode_size > 0);
        assert!(profile.compression_ratio() < 1.0); // bincode is typically smaller
    }

    #[test]
    fn benchmark_csv_export() {
        let mut suite = BenchmarkSuite::new();
        suite.bench("test_op", 5, || {
            let _ = 2 + 2;
        });
        let csv = suite.export_csv();
        assert!(csv.contains("test_op"));
        assert!(csv.contains("name,iterations"));
    }
}
