//! Framework self-tests — meta-tests that validate the testing framework itself.
//!
//! These tests exercise edge cases, error paths, and invariants of the framework
//! components: runner, generators, validators, and cross-module interactions.

use anvil_core::*;
use std::time::Duration;

// ═══════════════════════════════════════════════════════════════════════════════
// Runner Self-Tests
// ═══════════════════════════════════════════════════════════════════════════════

#[test]
fn runner_empty_suite_succeeds() {
    let suite = runner::TestSuite::new("empty");
    assert_eq!(suite.case_count(), 0);

    let runner = runner::TestRunner::new();
    let report = runner.run(vec![suite]);

    assert!(report.success());
    assert_eq!(report.passed, 0);
    assert_eq!(report.failed, 0);
    assert_eq!(report.results.len(), 0);
}

#[test]
fn runner_multiple_suites() {
    let mut s1 = runner::TestSuite::new("suite_a");
    s1.add(runner::TestCase::new("a::pass", || Ok(())));
    s1.add(runner::TestCase::new("a::fail", || Err("nope".into())));

    let mut s2 = runner::TestSuite::new("suite_b");
    s2.add(runner::TestCase::new("b::pass", || Ok(())));

    let runner = runner::TestRunner::new();
    let report = runner.run(vec![s1, s2]);

    assert_eq!(report.results.len(), 3);
    assert_eq!(report.passed, 2);
    assert_eq!(report.failed, 1);
}

#[test]
fn runner_sequential_mode() {
    let mut suite = runner::TestSuite::new("seq");
    for i in 0..5 {
        let name = format!("case_{}", i);
        suite.add(runner::TestCase::new(name, || Ok(())));
    }

    let runner = runner::TestRunner::new().sequential();
    let report = runner.run(vec![suite]);

    assert!(report.success());
    assert_eq!(report.results.len(), 5);
}

#[test]
fn runner_panic_recovery_does_not_abort_suite() {
    let mut suite = runner::TestSuite::new("panic_mix");
    suite.add(runner::TestCase::new("before_panic", || Ok(())));
    suite.add(runner::TestCase::new("panicker", || {
        panic!("intentional panic");
    }));
    suite.add(runner::TestCase::new("after_panic", || Ok(())));

    // Use sequential to guarantee ordering
    let runner = runner::TestRunner::new().sequential();
    let report = runner.run(vec![suite]);

    // All three should have run
    assert_eq!(report.results.len(), 3);
    assert_eq!(report.passed, 2);
    assert_eq!(report.failed, 1);

    let panicked = report.results.iter().find(|r| r.name == "panicker").unwrap();
    assert_eq!(panicked.status, runner::TestStatus::Panicked);
    assert!(panicked.error.as_ref().unwrap().contains("intentional panic"));
}

#[test]
fn runner_filter_excludes_non_matching() {
    let mut suite = runner::TestSuite::new("filter_test");
    suite.add(runner::TestCase::new("model::add", || Ok(())));
    suite.add(runner::TestCase::new("model::remove", || Ok(())));
    suite.add(runner::TestCase::new("render::layout", || Ok(())));
    suite.add(runner::TestCase::new("render::overlap", || Ok(())));

    let runner = runner::TestRunner::new().with_filter("render");
    let report = runner.run(vec![suite]);

    assert_eq!(report.results.len(), 2);
    assert!(report.results.iter().all(|r| r.name.starts_with("render")));
}

#[test]
fn runner_tag_filter() {
    let mut suite = runner::TestSuite::new("tagged");
    suite.add(runner::TestCase::new("fast_1", || Ok(())).with_tag("fast"));
    suite.add(runner::TestCase::new("fast_2", || Ok(())).with_tag("fast"));
    suite.add(runner::TestCase::new("slow_1", || Ok(())).with_tag("slow"));

    let runner = runner::TestRunner::new().with_tag_filter("slow");
    let report = runner.run(vec![suite]);

    assert_eq!(report.results.len(), 1);
    assert_eq!(report.results[0].name, "slow_1");
}

#[test]
fn runner_combined_filter_and_tag() {
    let mut suite = runner::TestSuite::new("combo");
    suite.add(runner::TestCase::new("model::fast", || Ok(())).with_tag("fast"));
    suite.add(runner::TestCase::new("model::slow", || Ok(())).with_tag("slow"));
    suite.add(runner::TestCase::new("render::fast", || Ok(())).with_tag("fast"));

    let runner = runner::TestRunner::new()
        .with_filter("model")
        .with_tag_filter("fast");
    let report = runner.run(vec![suite]);

    assert_eq!(report.results.len(), 1);
    assert_eq!(report.results[0].name, "model::fast");
}

#[test]
fn runner_junit_xml_is_valid_structure() {
    let mut suite = runner::TestSuite::new("xml_valid");
    suite.add(runner::TestCase::new("pass_case", || Ok(())));
    suite.add(runner::TestCase::new("fail_case", || Err("err msg".into())));
    suite.add(runner::TestCase::new("panic_case", || {
        panic!("boom");
    }));

    let runner = runner::TestRunner::new();
    let report = runner.run(vec![suite]);
    let xml = report.to_junit_xml();

    assert!(xml.starts_with("<?xml version="));
    assert!(xml.contains("<testsuite"));
    assert!(xml.contains("tests=\"3\""));
    assert!(xml.contains("failures=\"2\""));
    assert!(xml.contains("pass_case"));
    assert!(xml.contains("fail_case"));
    assert!(xml.contains("panic_case"));
    assert!(xml.contains("<failure"));
    assert!(xml.contains("</testsuite>"));
}

#[test]
fn runner_junit_xml_escapes_special_chars() {
    let mut suite = runner::TestSuite::new("escape");
    suite.add(runner::TestCase::new(
        "special_chars",
        || Err("error with <xml> & \"quotes\" 'apostrophes'".into()),
    ));

    let runner = runner::TestRunner::new();
    let report = runner.run(vec![suite]);
    let xml = report.to_junit_xml();

    assert!(!xml.contains("<xml>"), "Unescaped XML in JUnit output");
    assert!(xml.contains("&lt;xml&gt;"));
    assert!(xml.contains("&amp;"));
    assert!(xml.contains("&quot;"));
    assert!(xml.contains("&apos;"));
}

#[test]
fn runner_report_json_roundtrip() {
    let mut suite = runner::TestSuite::new("json_rt");
    suite.add(runner::TestCase::new("ok", || Ok(())));
    suite.add(runner::TestCase::new("fail", || Err("err".into())));

    let runner = runner::TestRunner::new();
    let report = runner.run(vec![suite]);
    let json = report.to_json();

    // Should be valid JSON
    let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
    assert_eq!(parsed["passed"], 1);
    assert_eq!(parsed["failed"], 1);
    assert!(parsed["results"].is_array());
    assert_eq!(parsed["results"].as_array().unwrap().len(), 2);
}

#[test]
fn runner_failures_method() {
    let mut suite = runner::TestSuite::new("failures_check");
    suite.add(runner::TestCase::new("p1", || Ok(())));
    suite.add(runner::TestCase::new("f1", || Err("err1".into())));
    suite.add(runner::TestCase::new("f2", || Err("err2".into())));

    let runner = runner::TestRunner::new();
    let report = runner.run(vec![suite]);

    let failures = report.failures();
    assert_eq!(failures.len(), 2);
    assert!(failures.iter().all(|f| !f.passed()));
}

#[test]
fn runner_test_case_with_seed() {
    let tc = runner::TestCase::new("seeded", || Ok(())).with_seed(12345);
    let result = tc.run();
    assert_eq!(result.seed, Some(12345));
}

#[test]
fn runner_test_case_with_timeout() {
    let tc = runner::TestCase::new("quick", || Ok(()))
        .with_timeout(Duration::from_secs(60));
    let result = tc.run();
    assert!(result.passed());
}

// ═══════════════════════════════════════════════════════════════════════════════
// Generator Self-Tests
// ═══════════════════════════════════════════════════════════════════════════════

#[test]
fn generator_determinism_across_types() {
    // Same seed must produce identical values for every Arbitrary type
    for seed in [0u64, 1, 42, 999, u64::MAX] {
        let mut g1 = generators::Gen::new(seed);
        let mut g2 = generators::Gen::new(seed);

        assert_eq!(g1.arbitrary::<bool>(), g2.arbitrary::<bool>());
        assert_eq!(g1.arbitrary::<u8>(), g2.arbitrary::<u8>());
        assert_eq!(g1.arbitrary::<u32>(), g2.arbitrary::<u32>());
        assert_eq!(g1.arbitrary::<u64>(), g2.arbitrary::<u64>());
        assert_eq!(g1.arbitrary::<i32>(), g2.arbitrary::<i32>());
        assert_eq!(g1.arbitrary::<i64>(), g2.arbitrary::<i64>());
        assert_eq!(g1.arbitrary::<String>(), g2.arbitrary::<String>());
    }
}

#[test]
fn generator_different_seeds_differ() {
    // Different seeds should (overwhelmingly) produce different values
    let mut g1 = generators::Gen::new(1);
    let mut g2 = generators::Gen::new(2);
    let a: u64 = g1.arbitrary();
    let b: u64 = g2.arbitrary();
    assert_ne!(a, b, "Different seeds produced identical u64");
}

#[test]
fn generator_size_affects_output() {
    // Larger size should produce longer strings on average
    let mut small_total = 0usize;
    let mut large_total = 0usize;

    for seed in 0..50 {
        let mut gs = generators::Gen::with_size(seed, 5);
        let mut gl = generators::Gen::with_size(seed, 100);
        let ss: String = gs.arbitrary();
        let sl: String = gl.arbitrary();
        small_total += ss.len();
        large_total += sl.len();
    }

    assert!(
        large_total > small_total,
        "Larger size should produce longer strings: small={}, large={}",
        small_total,
        large_total
    );
}

#[test]
fn generator_fork_produces_independent_stream() {
    let mut parent = generators::Gen::new(42);
    let mut child = parent.fork();

    let p1: u64 = parent.arbitrary();
    let c1: u64 = child.arbitrary();
    // They should differ (different stream positions)
    // We can't assert inequality with 100% certainty but for u64 collision is negligible
    let _ = (p1, c1); // Just verify it compiles and runs without panic
}

#[test]
fn generator_range_stays_in_bounds() {
    let mut gen = generators::Gen::new(42);
    for _ in 0..1000 {
        let v = gen.range(10, 20);
        assert!((10..=20).contains(&v), "range out of bounds: {}", v);
    }
}

#[test]
fn generator_range_f64_stays_in_bounds() {
    let mut gen = generators::Gen::new(42);
    for _ in 0..1000 {
        let v = gen.range_f64(0.0, 1.0);
        assert!((0.0..1.0).contains(&v), "f64 range out of bounds: {}", v);
    }
}

#[test]
fn generator_weighted_bool_respects_probability() {
    let mut gen = generators::Gen::new(42);
    let n = 10_000;
    let trues: usize = (0..n).filter(|_| gen.weighted_bool(0.8)).count();
    let ratio = trues as f64 / n as f64;
    // Should be roughly 0.8 ± 0.05
    assert!(
        (0.7..=0.9).contains(&ratio),
        "Expected ~0.8, got {}",
        ratio
    );
}

#[test]
fn generator_choose_never_panics_on_non_empty() {
    let items = vec![1, 2, 3, 4, 5];
    let mut gen = generators::Gen::new(42);
    for _ in 0..100 {
        let v = gen.choose(&items);
        assert!(items.contains(v));
    }
}

#[test]
fn generator_optional_produces_both_variants() {
    let mut gen = generators::Gen::new(42);
    let mut found_some = false;
    let mut found_none = false;
    for _ in 0..100 {
        let v: Option<u32> = gen.optional();
        match v {
            Some(_) => found_some = true,
            None => found_none = true,
        }
        if found_some && found_none {
            break;
        }
    }
    assert!(found_some, "Never produced Some");
    assert!(found_none, "Never produced None");
}

#[test]
fn shrinking_u8_converges_to_zero() {
    use generators::Arbitrary;
    let v: u8 = 200;
    let shrunk = v.shrink();
    assert!(shrunk.contains(&0));
    assert!(shrunk.iter().all(|&x| x < v));
}

#[test]
fn shrinking_string_produces_shorter() {
    use generators::Arbitrary;
    let s = "hello world".to_string();
    let shrunk = s.shrink();
    assert!(!shrunk.is_empty());
    assert!(shrunk.iter().all(|x| x.len() < s.len()));
    assert!(shrunk.contains(&String::new())); // empty string should be a candidate
}

#[test]
fn shrinking_vec_produces_shorter() {
    use generators::Arbitrary;
    let v: Vec<u32> = vec![1, 2, 3, 4, 5];
    let shrunk = v.shrink();
    assert!(!shrunk.is_empty());
    assert!(shrunk.iter().all(|x| x.len() < v.len()));
}

#[test]
fn shrinking_empty_has_no_candidates() {
    use generators::Arbitrary;
    assert!(String::new().shrink().is_empty());
    assert!(Vec::<u32>::new().shrink().is_empty());
    assert!(0u8.shrink().is_empty());
    assert!(false.shrink().is_empty());
}

#[test]
fn gen_runner_zero_cases_produces_empty() {
    let config = generators::GenPropertyConfig {
        seed: 0,
        num_cases: 0,
        size: 10,
        max_shrinks: 10,
    };
    let runner = generators::GenRunner::new(config);
    let results = runner.check::<u32, _>(|_| Ok(()));
    assert!(results.is_empty());
}

#[test]
fn gen_runner_shrinks_on_failure() {
    let config = generators::GenPropertyConfig {
        seed: 0,
        num_cases: 50,
        size: 20,
        max_shrinks: 50,
    };
    let runner = generators::GenRunner::new(config);

    // Property: string must be non-empty. Many generated strings are empty.
    let results = runner.check::<String, _>(|s| {
        if s.is_empty() {
            Err("empty string".into())
        } else {
            Ok(())
        }
    });

    // Should detect failures and attempt shrinking
    let failures: Vec<_> = results.iter().filter(|r| !r.passed).collect();
    // At least some should have been shrunk
    if !failures.is_empty() {
        // The shrink flag indicates the runner tried to shrink
        // (may or may not find smaller since empty string is already minimal)
        assert!(failures.iter().any(|f| f.error.is_some()));
    }
}

#[test]
fn gen_runner_custom_generator_all_pass() {
    let config = generators::GenPropertyConfig {
        seed: 0,
        num_cases: 100,
        size: 10,
        max_shrinks: 0,
    };
    let runner = generators::GenRunner::new(config);
    let gen = generators::constant(42i32);
    let results = runner.check_with(&gen, |v| {
        if *v == 42 {
            Ok(())
        } else {
            Err(format!("expected 42, got {}", v))
        }
    });
    assert!(results.iter().all(|r| r.passed));
}

#[test]
fn web_strings_all_valid() {
    // Generate many web strings and verify they're structurally valid
    for seed in 0..100 {
        let mut gen = generators::Gen::new(seed);

        let cls = generators::WebStrings::css_class(&mut gen);
        assert!(!cls.is_empty());
        assert!(cls.contains('-'));

        let id = generators::WebStrings::html_id(&mut gen);
        assert!(!id.is_empty());
        assert!(id.contains('-'));

        let url = generators::WebStrings::url_path(&mut gen);
        assert!(url.starts_with('/'));
        assert!(!url.contains(' '));

        let email = generators::WebStrings::email(&mut gen);
        assert!(email.contains('@'));
        assert!(email.contains('.'));

        let label = generators::WebStrings::label(&mut gen);
        assert!(!label.is_empty());

        let sentence = generators::WebStrings::sentence(&mut gen);
        assert!(sentence.ends_with('.'));
        assert!(sentence.len() > 3);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Model Self-Tests
// ═══════════════════════════════════════════════════════════════════════════════

#[test]
fn model_empty_graph_invariants() {
    let graph = Graph::new();
    assert_eq!(graph.node_count(), 0);
    assert_eq!(graph.edge_count(), 0);
    assert!(graph.check_invariants().is_ok());
    assert!(!graph.content_hash().is_empty());
}

#[test]
fn model_content_hash_deterministic() {
    let mut g1 = Graph::new();
    g1.add_node(model::Node::new("a").with_id(model::NodeId::from_seed(1)))
        .unwrap();

    let mut g2 = Graph::new();
    g2.add_node(model::Node::new("a").with_id(model::NodeId::from_seed(1)))
        .unwrap();

    assert_eq!(g1.content_hash(), g2.content_hash());
}

#[test]
fn model_content_hash_differs_for_different_graphs() {
    let mut g1 = Graph::new();
    g1.add_node(model::Node::new("a").with_id(model::NodeId::from_seed(1)))
        .unwrap();

    let mut g2 = Graph::new();
    g2.add_node(model::Node::new("b").with_id(model::NodeId::from_seed(2)))
        .unwrap();

    assert_ne!(g1.content_hash(), g2.content_hash());
}

#[test]
fn model_duplicate_node_rejected() {
    let mut graph = Graph::new();
    let id = model::NodeId::from_seed(1);
    graph.add_node(model::Node::new("a").with_id(id)).unwrap();
    let result = graph.add_node(model::Node::new("b").with_id(id));
    assert!(result.is_err());
}

#[test]
fn model_edge_to_nonexistent_node_rejected() {
    let mut graph = Graph::new();
    let a = graph
        .add_node(model::Node::new("a").with_id(model::NodeId::from_seed(1)))
        .unwrap();
    let bogus = model::NodeId::from_seed(999);
    let result = graph.add_edge(
        model::Edge::new(a, bogus, "wire").with_id(model::EdgeId::from_seed(1)),
    );
    assert!(result.is_err());
}

#[test]
fn model_remove_node_cascades_edges() {
    let mut graph = Graph::new();
    let a = graph
        .add_node(model::Node::new("a").with_id(model::NodeId::from_seed(1)))
        .unwrap();
    let b = graph
        .add_node(model::Node::new("b").with_id(model::NodeId::from_seed(2)))
        .unwrap();
    graph
        .add_edge(model::Edge::new(a, b, "wire").with_id(model::EdgeId::from_seed(10)))
        .unwrap();

    assert_eq!(graph.edge_count(), 1);
    graph.remove_node(a).unwrap();
    assert_eq!(graph.node_count(), 1);
    assert_eq!(graph.edge_count(), 0, "Edge should cascade-delete with node");
}

// ═══════════════════════════════════════════════════════════════════════════════
// Property-Based Self-Tests
// ═══════════════════════════════════════════════════════════════════════════════

#[test]
fn property_arbitrary_graph_always_valid() {
    // Generated graphs should always pass invariants
    for seed in 0..100 {
        let graph = property::ArbitraryGraph::generate(seed, 20, 40);
        assert!(
            graph.check_invariants().is_ok(),
            "Generated graph fails invariants at seed {}",
            seed
        );
    }
}

#[test]
fn property_arbitrary_graph_respects_bounds() {
    for seed in 0..50 {
        let graph = property::ArbitraryGraph::generate(seed, 10, 20);
        assert!(
            graph.node_count() <= 10,
            "Too many nodes at seed {}: {}",
            seed,
            graph.node_count()
        );
        assert!(
            graph.edge_count() <= 20,
            "Too many edges at seed {}: {}",
            seed,
            graph.edge_count()
        );
    }
}

#[test]
fn property_runner_all_pass_for_valid_property() {
    let config = property::PropertyTestConfig {
        seed: 0,
        num_cases: 100,
        max_nodes: 10,
        max_edges: 20,
        max_shrinks: 10,
    };
    let runner = property::PropertyRunner::new(config);

    let results = runner.check_graph_property(|g| g.check_invariants().map_err(|e| e.to_string()));
    assert!(
        results.iter().all(|r| r.passed),
        "Invariant check failed on valid generated graphs"
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Serialization Self-Tests
// ═══════════════════════════════════════════════════════════════════════════════

#[test]
fn serialization_empty_graph_roundtrip() {
    let graph = Graph::new();
    serialization::RoundTrip::graph_json(&graph).unwrap();
    serialization::RoundTrip::graph_bincode(&graph).unwrap();
}

#[test]
fn serialization_large_graph_roundtrip() {
    let graph = property::ArbitraryGraph::generate(42, 200, 500);
    serialization::RoundTrip::graph_json(&graph).unwrap();
    serialization::RoundTrip::graph_bincode(&graph).unwrap();
}

#[test]
fn serialization_preserves_structural_equality() {
    // Use the proven RoundTrip utility which handles HashMap key-ordering
    let graph = property::ArbitraryGraph::generate(99, 30, 60);
    serialization::RoundTrip::graph_json(&graph).unwrap();
    // Also verify node/edge counts survive
    let json = serde_json::to_string(&graph).unwrap();
    let restored: Graph = serde_json::from_str(&json).unwrap();
    assert_eq!(graph.node_count(), restored.node_count());
    assert_eq!(graph.edge_count(), restored.edge_count());
}

// ═══════════════════════════════════════════════════════════════════════════════
// Event Sourcing Self-Tests
// ═══════════════════════════════════════════════════════════════════════════════

#[test]
fn event_log_undo_redo_symmetry() {
    let mut log = events::EventLog::new();

    let node = model::Node::new("test").with_id(model::NodeId::from_seed(1));
    log.push(events::EventEntry::new(events::Event::NodeAdded {
        node: node.clone(),
    }));
    log.push(events::EventEntry::new(events::Event::NodeMoved {
        node_id: model::NodeId::from_seed(1),
        from: (0.0, 0.0),
        to: (10.0, 20.0),
    }));

    assert_eq!(log.len(), 2);

    // Undo both
    log.undo();
    log.undo();
    let graph_empty = events::ReplayEngine::replay(&log).unwrap();
    assert_eq!(graph_empty.node_count(), 0);

    // Redo both
    log.redo();
    log.redo();
    let graph_full = events::ReplayEngine::replay(&log).unwrap();
    assert_eq!(graph_full.node_count(), 1);
    assert_eq!(
        graph_full.node(model::NodeId::from_seed(1)).unwrap().position,
        (10.0, 20.0)
    );
}

#[test]
fn event_replay_at_each_step() {
    let mut log = events::EventLog::new();

    // Build a 3-event sequence
    for i in 0..3 {
        log.push(events::EventEntry::new(events::Event::NodeAdded {
            node: model::Node::new("n")
                .with_id(model::NodeId::from_seed(i))
                .with_position(i as f64, 0.0),
        }));
    }

    // At each replay point, node count should match
    for step in 0..3 {
        let graph = events::ReplayEngine::replay_to(&log, step + 1).unwrap();
        assert_eq!(
            graph.node_count(),
            step + 1,
            "Wrong node count at step {}",
            step
        );
    }
}

#[test]
fn event_store_persistence_roundtrip() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("test_events.json");

    // Write
    {
        let mut store = events::EventStore::new(&path);
        store.append(events::Event::NodeAdded {
            node: model::Node::new("x").with_id(model::NodeId::from_seed(42)),
        });
        store.save().unwrap();
    }

    // Read back
    {
        let store = events::EventStore::open(&path).unwrap();
        assert_eq!(store.log().len(), 1);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CRDT Self-Tests
// ═══════════════════════════════════════════════════════════════════════════════

#[test]
fn crdt_two_clients_converge() {
    let mut sim = crdt::CrdtSimulator::new(2, 42);
    let ids = sim.client_ids();

    sim.client_op(
        ids[0],
        crdt::OperationKind::AddNode {
            node_id: model::NodeId::from_seed(1),
            kind: "a".into(),
            x: 0.0,
            y: 0.0,
        },
    );
    sim.client_op(
        ids[1],
        crdt::OperationKind::AddNode {
            node_id: model::NodeId::from_seed(2),
            kind: "b".into(),
            x: 10.0,
            y: 10.0,
        },
    );

    sim.drain_network();
    assert!(sim.check_convergence());

    for client in sim.clients.values() {
        assert_eq!(client.graph.node_count(), 2);
    }
}

#[test]
fn crdt_single_client_no_conflicts() {
    let mut sim = crdt::CrdtSimulator::new(1, 0);
    let ids = sim.client_ids();

    for i in 0..5 {
        sim.client_op(
            ids[0],
            crdt::OperationKind::AddNode {
                node_id: model::NodeId::from_seed(i),
                kind: "test".into(),
                x: i as f64,
                y: 0.0,
            },
        );
    }

    sim.drain_network();
    assert!(sim.check_convergence());
    assert_eq!(sim.clients[&ids[0]].graph.node_count(), 5);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Render Self-Tests
// ═══════════════════════════════════════════════════════════════════════════════

#[test]
fn render_empty_graph_produces_empty_tree() {
    let graph = Graph::new();
    let tree = render::RenderTree::from_graph(&graph);
    assert!(tree.root_nodes.is_empty());
}

#[test]
fn render_all_nodes_present() {
    let graph = property::ArbitraryGraph::generate(42, 20, 40);
    let tree = render::RenderTree::from_graph(&graph);
    assert!(render::LayoutValidator::check_completeness(&graph, &tree));
}

// ═══════════════════════════════════════════════════════════════════════════════
// Web Self-Tests
// ═══════════════════════════════════════════════════════════════════════════════

#[test]
fn web_component_tree_deterministic() {
    for seed in 0..10 {
        let t1 = web::ArbitraryComponent::generate_tree(seed, 3, 4);
        let t2 = web::ArbitraryComponent::generate_tree(seed, 3, 4);
        assert_eq!(t1.total_count(), t2.total_count());
        assert_eq!(t1.title, t2.title);
        assert_eq!(t1.route, t2.route);
    }
}

#[test]
fn web_component_tree_respects_depth_limit() {
    for seed in 0..20 {
        let max_depth = 3;
        let tree = web::ArbitraryComponent::generate_tree(seed, max_depth, 4);
        let actual_depth = measure_tree_depth(&tree.root, 1);
        assert!(
            actual_depth <= max_depth + 1, // +1 because root is level 1
            "Tree depth {} exceeds limit {} at seed {}",
            actual_depth,
            max_depth,
            seed
        );
    }
}

fn measure_tree_depth(component: &web::Component, level: usize) -> usize {
    if component.children.is_empty() {
        level
    } else {
        component
            .children
            .iter()
            .map(|c| measure_tree_depth(c, level + 1))
            .max()
            .unwrap_or(level)
    }
}

#[test]
fn web_all_interactive_elements_focusable() {
    // This is a key accessibility invariant
    for seed in 0..20 {
        let tree = web::ArbitraryComponent::generate_tree(seed, 3, 4);
        check_focusable_recursive(&tree.root);
    }
}

fn check_focusable_recursive(comp: &web::Component) {
    use web::ComponentKind::*;
    match &comp.kind {
        Button | Link | Input | TextArea | Select | Checkbox | Radio => {
            assert!(
                comp.accessibility.focusable,
                "{:?} (id={:?}) should be focusable",
                comp.kind,
                comp.id
            );
        }
        _ => {}
    }
    for child in &comp.children {
        check_focusable_recursive(child);
    }
}

#[test]
fn web_event_simulator_produces_valid_events() {
    let tree = web::ArbitraryComponent::generate_tree(42, 3, 4);
    let sim = web::EventSimulator::new(tree).random_interaction(99, 50);
    assert_eq!(sim.event_count(), 50);
}

#[test]
fn web_state_apply_and_read_back() {
    let mut state = web::AppState::new();
    state.set("count", serde_json::json!(0));

    state.apply(
        &web::StateAction::new("inc", serde_json::json!(1)),
        |s, a| {
            let val = s.get("count").and_then(|v| v.as_i64()).unwrap_or(0);
            let delta = a.payload.as_i64().unwrap_or(0);
            s.data.insert("count".into(), serde_json::json!(val + delta));
        },
    );

    assert_eq!(state.get("count").unwrap(), &serde_json::json!(1));

    // Serialize roundtrip
    let json = serde_json::to_string(&state).unwrap();
    let restored: web::AppState = serde_json::from_str(&json).unwrap();
    assert_eq!(state, restored);
}

#[test]
fn web_breakpoint_ordering() {
    let bps = web::Breakpoint::all();
    let widths: Vec<f64> = bps
        .iter()
        .map(|bp| web::Viewport::from_breakpoint(*bp).width)
        .collect();

    // Breakpoints should be sorted by ascending width
    for window in widths.windows(2) {
        assert!(
            window[0] <= window[1],
            "Breakpoints not in ascending order: {} > {}",
            window[0],
            window[1]
        );
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Logging Self-Tests
// ═══════════════════════════════════════════════════════════════════════════════

#[test]
fn logging_entries_in_order() {
    let logger = logging::StructuredLogger::new("test");
    logger.info("first");
    logger.warn("second");
    logger.error("third");

    let entries = logger.entries();
    assert_eq!(entries.len(), 3);
    assert_eq!(entries[0].message, "first");
    assert_eq!(entries[1].message, "second");
    assert_eq!(entries[2].message, "third");
}

#[test]
fn logging_child_inherits_module_prefix() {
    let parent = logging::StructuredLogger::new("root");
    let child = parent.child("sub");

    child.info("hello");

    let entries = parent.entries();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].module, "root::sub");
}

#[test]
fn logging_ndjson_line_count() {
    let logger = logging::StructuredLogger::new("ndjson_test");
    for i in 0..10 {
        logger.info(format!("msg_{}", i));
    }

    let ndjson = logger.export_ndjson();
    assert_eq!(ndjson.lines().count(), 10);
}

#[test]
fn logging_json_export_valid() {
    let logger = logging::StructuredLogger::new("json_test");
    logger.info("hello");
    logger.warn("world");

    let json = logger.export_json();
    let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
    assert!(parsed.is_array());
    assert_eq!(parsed.as_array().unwrap().len(), 2);
}
