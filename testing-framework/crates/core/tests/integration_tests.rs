//! Integration tests — full cross-layer validation.

use industrial_test_core::*;

#[test]
fn end_to_end_model_event_serialize() {
    // 1. Create model
    let mut graph = Graph::new();
    let a = graph
        .add_node(model::Node::new("sensor").with_id(model::NodeId::from_seed(1)))
        .unwrap();
    let b = graph
        .add_node(model::Node::new("actuator").with_id(model::NodeId::from_seed(2)))
        .unwrap();
    graph
        .add_edge(model::Edge::new(a, b, "wire").with_id(model::EdgeId::from_seed(100)))
        .unwrap();

    // 2. Record as events
    let mut log = events::EventLog::new();
    log.push(events::EventEntry::new(events::Event::NodeAdded {
        node: graph.node(a).unwrap().clone(),
    }));
    log.push(events::EventEntry::new(events::Event::NodeAdded {
        node: graph.node(b).unwrap().clone(),
    }));
    log.push(events::EventEntry::new(events::Event::EdgeAdded {
        edge: graph.edge(model::EdgeId::from_seed(100)).unwrap().clone(),
    }));

    // 3. Replay from events
    let replayed = events::ReplayEngine::replay(&log).unwrap();
    assert_eq!(replayed.content_hash(), graph.content_hash());

    // 4. Serialize round-trip
    serialization::RoundTrip::graph_json(&replayed).unwrap();
    serialization::RoundTrip::graph_bincode(&replayed).unwrap();

    // 5. Validate invariants
    replayed.check_invariants().unwrap();

    // 6. Validate render tree
    let tree = render::RenderTree::from_graph(&replayed);
    assert!(render::LayoutValidator::check_completeness(&replayed, &tree));
}

#[test]
fn event_log_persistence_roundtrip() {
    let dir = tempfile::tempdir().unwrap();
    let store_path = dir.path().join("events.json");

    // Create and save event log
    {
        let mut store = events::EventStore::new(&store_path);
        store.append(events::Event::NodeAdded {
            node: model::Node::new("x").with_id(model::NodeId::from_seed(10)),
        });
        store.append(events::Event::NodeMoved {
            node_id: model::NodeId::from_seed(10),
            from: (0.0, 0.0),
            to: (42.0, 99.0),
        });
        store.save().unwrap();
    }

    // Reload and replay
    {
        let store = events::EventStore::open(&store_path).unwrap();
        let graph = events::ReplayEngine::replay(store.log()).unwrap();
        assert_eq!(graph.node_count(), 1);
        assert_eq!(
            graph.node(model::NodeId::from_seed(10)).unwrap().position,
            (42.0, 99.0)
        );
    }
}

#[test]
fn property_tests_all_categories() {
    let config = property::PropertyTestConfig {
        seed: 0,
        num_cases: 50,
        max_nodes: 15,
        max_edges: 30,
        max_shrinks: 20,
    };
    let runner = property::PropertyRunner::new(config);

    // Invariants
    let r = runner.check_graph_property(|g| g.check_invariants().map_err(|e| e.to_string()));
    assert!(r.iter().all(|x| x.passed), "Invariant property failed");

    // JSON roundtrip
    let r = runner.check_graph_property(|g| {
        serialization::RoundTrip::graph_json(g).map_err(|e| e.to_string())
    });
    assert!(r.iter().all(|x| x.passed), "JSON roundtrip property failed");

    // Deterministic hash
    let r = runner.check_graph_property(|g| {
        let h1 = g.content_hash();
        let h2 = g.content_hash();
        if h1 == h2 { Ok(()) } else { Err("hash differs".into()) }
    });
    assert!(r.iter().all(|x| x.passed), "Hash determinism property failed");
}

#[test]
fn crdt_convergence_under_load() {
    let mut sim = crdt::CrdtSimulator::new(4, 77);
    let ids = sim.client_ids();

    // Each client concurrently adds nodes
    for (i, &client_id) in ids.iter().enumerate() {
        for j in 0..10 {
            sim.client_op(
                client_id,
                crdt::OperationKind::AddNode {
                    node_id: model::NodeId::from_seed((i * 100 + j) as u64),
                    kind: "block".into(),
                    x: (i * 50) as f64,
                    y: (j * 30) as f64,
                },
            );
        }
    }

    sim.drain_network();

    // All clients should converge
    assert!(sim.check_convergence(), "CRDT clients did not converge");
    assert!(sim.check_all_invariants().is_ok(), "Invariant violation in CRDT");

    // Each client should have all 40 nodes
    for client in sim.clients.values() {
        assert_eq!(client.graph.node_count(), 40);
    }
}

#[test]
fn golden_test_backward_compat() {
    let dir = tempfile::tempdir().unwrap();
    let golden = serialization::GoldenTest::new(dir.path());

    // Simulate v1 format
    let mut g = Graph::new();
    g.add_node(
        model::Node::new("connector")
            .with_id(model::NodeId::from_seed(42))
            .with_position(10.0, 20.0)
            .with_size(50.0, 30.0),
    )
    .unwrap();

    // Create golden file
    golden.check("compat_test", &g).unwrap();

    // Verify backward compat read
    let restored: Graph = golden.check_backward_compat("compat_test").unwrap();
    assert_eq!(restored.node_count(), 1);
    assert_eq!(restored.content_hash(), g.content_hash());
}

#[test]
fn render_tree_structural_validation() {
    let mut g = Graph::new();

    // Create a parent-child hierarchy
    let parent_id = g
        .add_node(
            model::Node::new("panel")
                .with_id(model::NodeId::from_seed(1))
                .with_position(0.0, 0.0)
                .with_size(400.0, 300.0),
        )
        .unwrap();

    g.add_node(
        model::Node::new("button")
            .with_id(model::NodeId::from_seed(2))
            .with_position(10.0, 10.0)
            .with_size(80.0, 30.0)
            .with_parent(parent_id),
    )
    .unwrap();

    g.add_node(
        model::Node::new("button")
            .with_id(model::NodeId::from_seed(3))
            .with_position(100.0, 10.0)
            .with_size(80.0, 30.0)
            .with_parent(parent_id),
    )
    .unwrap();

    let tree = render::RenderTree::from_graph(&g);

    // Structural checks
    assert_eq!(tree.root_nodes.len(), 1); // Only the panel is a root
    assert_eq!(tree.root_nodes[0].children.len(), 2);
    assert!(render::LayoutValidator::check_completeness(&g, &tree));

    let invalid = render::LayoutValidator::check_valid_dimensions(&tree);
    assert!(invalid.is_empty());

    // Children should be contained within parent
    let containment = render::LayoutValidator::check_children_contained(&tree, 1.0);
    assert!(containment.is_empty(), "Children escaped parent bounds");
}

#[test]
fn test_runner_framework() {
    let mut suite = runner::TestSuite::new("integration_demo");

    suite.add(runner::TestCase::new("demo::pass", || Ok(())).with_tag("demo"));

    suite.add(
        runner::TestCase::new("demo::model_check", || {
            let g = property::ArbitraryGraph::generate(99, 10, 20);
            g.check_invariants().map_err(|e| e.to_string())
        })
        .with_tag("demo")
        .with_seed(99),
    );

    let test_runner = runner::TestRunner::new();
    let report = test_runner.run(vec![suite]);

    assert!(report.success());
    assert_eq!(report.results.len(), 2);
}

#[test]
fn structured_logging_captures_all() {
    let logger = logging::StructuredLogger::new("integration");
    let child = logger.child("submodule");

    logger.info("parent message");
    child.info("child message");
    child.warn("warning");

    let entries = logger.entries();
    assert_eq!(entries.len(), 3);
    assert_eq!(entries[1].module, "integration::submodule");

    // Export formats
    let json = logger.export_json();
    assert!(json.contains("parent message"));

    let ndjson = logger.export_ndjson();
    assert_eq!(ndjson.lines().count(), 3);
}

// ── Web GUI Integration Tests ────────────────────────────────────────────────

#[test]
fn web_component_tree_generation_and_validation() {
    // Generate random component trees and validate them
    for seed in 0..20 {
        let tree = web::ArbitraryComponent::generate_tree(seed, 3, 4);

        // Tree should be non-empty
        assert!(tree.total_count() >= 1, "Empty tree at seed {}", seed);

        // Route should be valid
        assert!(tree.route.starts_with('/'), "Invalid route at seed {}", seed);

        // Should be findable by root id
        assert!(tree.find(tree.root.id).is_some());
    }
}

#[test]
fn web_form_generation_and_validation() {
    for seed in 0..10 {
        let form = web::ArbitraryComponent::generate_form(seed, 5);
        assert_eq!(form.kind, web::ComponentKind::Form);
        assert_eq!(form.children.len(), 6); // 5 fields + submit

        // Submit button should exist
        let violations = web::WebValidator::check_form_submit_buttons(
            &web::ComponentTree::new("form", "/form", form.clone()),
        );
        assert!(violations.is_empty(), "Form missing submit at seed {}", seed);

        // Validate empty form — required fields should fail
        let errors = form.validate_form();
        // Some fields may have Required rule with no value
        for (id, errs) in &errors {
            assert!(!errs.is_empty(), "Empty error list for {:?}", id);
        }
    }
}

#[test]
fn web_accessibility_property_test() {
    let config = generators::GenPropertyConfig {
        seed: 0,
        num_cases: 30,
        size: 50,
        max_shrinks: 0,
    };
    let runner = generators::GenRunner::new(config);

    // Property: Generated nav components always have focusable links
    let results = runner.check::<u64, _>(|seed| {
        let nav = web::ArbitraryComponent::generate_nav(*seed, 5);
        for child in &nav.children {
            if child.kind == web::ComponentKind::Link && !child.accessibility.focusable {
                return Err(format!("Link not focusable at seed {}", seed));
            }
        }
        Ok(())
    });
    assert!(
        results.iter().all(|r| r.passed),
        "Nav links should be focusable"
    );
}

#[test]
fn web_routing_validation() {
    let mut router = web::Router::new();
    router.add_route(web::Route::new("/", "home"));
    router.add_route(web::Route::new("/login", "login"));
    router.add_route(web::Route::new("/dashboard", "dashboard").with_auth());
    router.add_route(web::Route::new("/users/:id", "user_detail").with_auth().with_param("id"));
    router.add_route(web::Route::new("/settings", "settings").with_auth());

    // Validate route definitions
    let errors = web::WebValidator::check_routes(&router);
    assert!(errors.is_empty(), "Route errors: {:?}", errors);

    // Public routes
    assert!(router.has_unprotected_route("/"));
    assert!(router.has_unprotected_route("/login"));
    assert!(!router.has_unprotected_route("/dashboard"));

    // Dynamic route matching
    assert!(router.resolve("/users/42").is_some());
    assert!(router.resolve("/users/42").unwrap().requires_auth);
}

#[test]
fn web_event_simulation_stress() {
    // Generate a tree and simulate heavy interaction
    let tree = web::ArbitraryComponent::generate_tree(42, 3, 5);
    let initial_count = tree.total_count();

    let sim = web::EventSimulator::new(tree).random_interaction(99, 100);

    assert_eq!(sim.event_count(), 100);
    // Tree should be unchanged (events don't mutate tree in this model)
    assert_eq!(sim.tree.total_count(), initial_count);
}

#[test]
fn web_state_management_roundtrip() {
    let mut state = web::AppState::new();

    // Simulate a todo app
    state.set("todos", serde_json::json!([]));
    state.set("filter", serde_json::json!("all"));

    // Add items via actions
    let action = web::StateAction::new("add_todo", serde_json::json!({"text": "Buy milk"}));
    state.apply(&action, |s, a| {
        let mut todos = s.get("todos").cloned().unwrap_or(serde_json::json!([]));
        if let Some(arr) = todos.as_array_mut() {
            arr.push(a.payload.clone());
        }
        s.data.insert("todos".into(), todos);
    });

    let todos = state.get("todos").unwrap();
    assert_eq!(todos.as_array().unwrap().len(), 1);

    // Serialize state round-trip
    let json = serde_json::to_string(&state).unwrap();
    let restored: web::AppState = serde_json::from_str(&json).unwrap();
    assert_eq!(state, restored);
}

#[test]
fn web_responsive_breakpoint_coverage() {
    // Generate a tree at each breakpoint and check it generates
    for bp in web::Breakpoint::all() {
        let viewport = web::Viewport::from_breakpoint(bp);
        assert!(viewport.width > 0.0);
        assert!(viewport.height > 0.0);
        assert_eq!(viewport.breakpoint(), bp);
    }
}

#[test]
fn generators_with_web_types() {
    // Use the generic generative engine with web types
    let config = generators::GenPropertyConfig {
        seed: 0,
        num_cases: 20,
        size: 10,
        max_shrinks: 5,
    };
    let runner = generators::GenRunner::new(config);

    // Property: all generated DomEvents are valid
    let results = runner.check::<web::DomEvent, _>(|_event| {
        // All generated events should be constructible
        Ok(())
    });
    assert!(results.iter().all(|r| r.passed));

    // Property: all generated ComponentKinds have correct accessibility defaults
    let results = runner.check::<web::ComponentKind, _>(|kind| {
        let component = web::Component::new(kind.clone());
        // Button, Link, Input etc. should be focusable
        match kind {
            web::ComponentKind::Button | web::ComponentKind::Link |
            web::ComponentKind::Input | web::ComponentKind::TextArea |
            web::ComponentKind::Select | web::ComponentKind::Checkbox |
            web::ComponentKind::Radio => {
                if !component.accessibility.focusable {
                    return Err(format!("{:?} should be focusable", kind));
                }
            }
            _ => {}
        }
        Ok(())
    });
    assert!(results.iter().all(|r| r.passed), "Accessibility defaults failed");
}

#[test]
fn web_deterministic_generation() {
    // Same seed → same tree
    let t1 = web::ArbitraryComponent::generate_tree(42, 3, 4);
    let t2 = web::ArbitraryComponent::generate_tree(42, 3, 4);
    assert_eq!(t1.total_count(), t2.total_count());
    assert_eq!(t1.title, t2.title);
    assert_eq!(t1.route, t2.route);

    // Different seed → different tree
    let t3 = web::ArbitraryComponent::generate_tree(99, 3, 4);
    assert_ne!(t1.title, t3.title);
}
