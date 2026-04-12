use industrial_test_core::*;
fn main() {
    let config = property::PropertyTestConfig {
        seed: 0, num_cases: 50, max_nodes: 15, max_edges: 30, max_shrinks: 0,
    };
    let runner = property::PropertyRunner::new(config);
    let results = runner.check_graph_property(|g| {
        serialization::RoundTrip::graph_json(g).map_err(|e| e.to_string())
    });
    for r in &results {
        if !r.passed {
            println!("FAIL seed={} err={}", r.seed, r.error.as_deref().unwrap_or("?"));
            // Generate same graph and inspect
            let g = property::ArbitraryGraph::generate(r.seed, 15, 30);
            let h1 = g.content_hash();
            let json = serde_json::to_string_pretty(&g).unwrap();
            let g2: model::Graph = serde_json::from_str(&json).unwrap();
            let h2 = g2.content_hash();
            println!("  nodes={} edges={} h1={} h2={}", g.node_count(), g.edge_count(), &h1[..16], &h2[..16]);
            // Check each node
            for (id, n1) in &g.nodes {
                let n2 = g2.nodes.get(id).unwrap();
                if n1.position != n2.position || n1.size != n2.size {
                    println!("  node {:?} pos {:?} vs {:?} size {:?} vs {:?}", id, n1.position, n2.position, n1.size, n2.size);
                }
            }
        }
    }
}
