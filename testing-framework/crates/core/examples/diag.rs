use industrial_test_core::*;

fn main() {
    // Test idempotency after first round-trip
    for seed in 0u64..50 {
        let g = property::ArbitraryGraph::generate(seed, 15, 30);
        match serialization::RoundTrip::graph_json(&g) {
            Ok(()) => {}
            Err(e) => {
                println!("FAIL seed={} err={}", seed, e);
            }
        }
    }
    println!("Done - all idempotency checks");

    // Now test what the property runner actually does
    let config = property::PropertyTestConfig {
        seed: 0,
        num_cases: 5,
        max_nodes: 15,
        max_edges: 30,
        max_shrinks: 0,
    };
    let runner = property::PropertyRunner::new(config);
    let results = runner.check_graph_property(|g| {
        serialization::RoundTrip::graph_json(g).map_err(|e| e.to_string())
    });
    for r in &results {
        println!("seed={} passed={} err={:?}", r.seed, r.passed, r.error);
    }
}
