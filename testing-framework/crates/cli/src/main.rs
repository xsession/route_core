//! CLI test runner — `anvil` command-line tool.
//!
//! Usage:
//!   anvil run [--filter <pattern>] [--tag <tag>] [--parallel] [--seed <n>]
//!   anvil stress [--nodes <n>] [--edges <n>] [--seed <n>]
//!   anvil bench [--iterations <n>]
//!   anvil replay <event-log.json>
//!   anvil report <results.json> --format <junit|csv|json>
//!   anvil web [--trees <n>] [--depth <n>] [--seed <n>]

use clap::{Parser, Subcommand};
use anvil_core::*;
use std::path::PathBuf;
use std::time::Duration;

#[derive(Parser)]
#[command(name = "anvil")]
#[command(about = "Production-grade testing framework for industrial & web GUI applications")]
#[command(version)]
struct Cli {
    #[command(subcommand)]
    command: Commands,

    /// Enable verbose logging
    #[arg(short, long, global = true)]
    verbose: bool,

    /// Output directory for artifacts
    #[arg(short, long, global = true, default_value = "./test-output")]
    output: PathBuf,
}

#[derive(Subcommand)]
enum Commands {
    /// Run test suites
    Run {
        /// Filter tests by name pattern
        #[arg(short, long)]
        filter: Option<String>,

        /// Filter tests by tag
        #[arg(short, long)]
        tag: Option<String>,

        /// Run tests sequentially (default: parallel)
        #[arg(long)]
        sequential: bool,

        /// Deterministic seed
        #[arg(short, long)]
        seed: Option<u64>,

        /// Output format
        #[arg(long, default_value = "text")]
        format: String,
    },

    /// Run stress tests with large models
    Stress {
        /// Number of nodes
        #[arg(short, long, default_value = "10000")]
        nodes: usize,

        /// Number of edges
        #[arg(short, long, default_value = "50000")]
        edges: usize,

        /// Deterministic seed
        #[arg(short, long, default_value = "42")]
        seed: u64,

        /// Timeout in seconds
        #[arg(short, long, default_value = "120")]
        timeout: u64,
    },

    /// Run benchmarks
    Bench {
        /// Number of iterations per benchmark
        #[arg(short, long, default_value = "100")]
        iterations: u64,

        /// Export results as CSV
        #[arg(long)]
        csv: bool,
    },

    /// Replay an event log and verify determinism
    Replay {
        /// Path to event log JSON file
        path: PathBuf,

        /// Verify determinism by replaying twice
        #[arg(long)]
        verify: bool,

        /// Replay to a specific event index
        #[arg(long)]
        to_index: Option<usize>,
    },

    /// Convert test results to different formats
    Report {
        /// Path to results JSON
        path: PathBuf,

        /// Output format: junit, csv, json
        #[arg(long, default_value = "junit")]
        format: String,
    },

    /// Run property-based tests
    Property {
        /// Number of test cases
        #[arg(short, long, default_value = "100")]
        cases: usize,

        /// Max nodes per generated graph
        #[arg(long, default_value = "50")]
        max_nodes: usize,

        /// Max edges per generated graph
        #[arg(long, default_value = "100")]
        max_edges: usize,

        /// Deterministic seed
        #[arg(short, long, default_value = "42")]
        seed: u64,

        /// Max shrink attempts
        #[arg(long, default_value = "100")]
        max_shrinks: usize,
    },

    /// Run CRDT convergence simulation
    Crdt {
        /// Number of simulated clients
        #[arg(short, long, default_value = "3")]
        clients: usize,

        /// Operations per client
        #[arg(short, long, default_value = "20")]
        ops: usize,

        /// Network seed
        #[arg(short, long, default_value = "42")]
        seed: u64,

        /// Simulate network partitions
        #[arg(long)]
        partitions: bool,
    },

    /// Run web GUI tests (component trees, forms, accessibility, routing)
    Web {
        /// Number of component trees to generate
        #[arg(short, long, default_value = "20")]
        trees: usize,

        /// Maximum tree depth
        #[arg(short, long, default_value = "4")]
        depth: usize,

        /// Maximum children per node
        #[arg(short = 'c', long, default_value = "5")]
        max_children: usize,

        /// Deterministic seed
        #[arg(short, long, default_value = "42")]
        seed: u64,

        /// Number of form fields to generate
        #[arg(long, default_value = "5")]
        form_fields: usize,
    },
}

fn main() {
    let cli = Cli::parse();

    // Setup tracing
    if cli.verbose {
        tracing_subscriber::fmt()
            .with_env_filter("debug")
            .json()
            .init();
    } else {
        tracing_subscriber::fmt()
            .with_env_filter("info")
            .init();
    }

    // Ensure output directory exists
    std::fs::create_dir_all(&cli.output).ok();

    let exit_code = match cli.command {
        Commands::Run {
            filter,
            tag,
            sequential,
            seed,
            format,
        } => cmd_run(filter, tag, sequential, seed, format, &cli.output),

        Commands::Stress {
            nodes,
            edges,
            seed,
            timeout,
        } => cmd_stress(nodes, edges, seed, timeout, &cli.output),

        Commands::Bench { iterations, csv } => cmd_bench(iterations, csv, &cli.output),

        Commands::Replay {
            path,
            verify,
            to_index,
        } => cmd_replay(path, verify, to_index),

        Commands::Report { path, format } => cmd_report(path, format, &cli.output),

        Commands::Property {
            cases,
            max_nodes,
            max_edges,
            seed,
            max_shrinks,
        } => cmd_property(cases, max_nodes, max_edges, seed, max_shrinks, &cli.output),

        Commands::Crdt {
            clients,
            ops,
            seed,
            partitions,
        } => cmd_crdt(clients, ops, seed, partitions),

        Commands::Web {
            trees,
            depth,
            max_children,
            seed,
            form_fields,
        } => cmd_web(trees, depth, max_children, seed, form_fields),
    };

    std::process::exit(exit_code);
}

// ── Command Implementations ──────────────────────────────────────────────────

fn cmd_run(
    filter: Option<String>,
    tag: Option<String>,
    sequential: bool,
    _seed: Option<u64>,
    format: String,
    output: &PathBuf,
) -> i32 {
    println!("=== Anvil Test Runner ===\n");

    // Build built-in test suites
    let suites = build_example_suites();

    let mut runner = TestRunner::new();
    if sequential {
        runner = runner.sequential();
    }
    if let Some(f) = filter {
        runner = runner.with_filter(f);
    }
    if let Some(t) = tag {
        runner = runner.with_tag_filter(t);
    }

    let report = runner.run(suites);

    // Print results
    for r in &report.results {
        println!("{}", r);
    }
    println!("\n{}", report.summary());

    // Save artifacts
    match format.as_str() {
        "junit" => {
            let xml = report.to_junit_xml();
            let path = output.join("results.xml");
            std::fs::write(&path, &xml).ok();
            println!("JUnit XML: {}", path.display());
        }
        "json" => {
            let json = report.to_json();
            let path = output.join("results.json");
            std::fs::write(&path, &json).ok();
            println!("JSON: {}", path.display());
        }
        _ => {}
    }

    if report.success() { 0 } else { 1 }
}

fn cmd_stress(nodes: usize, edges: usize, seed: u64, timeout: u64, _output: &PathBuf) -> i32 {
    println!("=== Stress Test: {}N / {}E ===\n", nodes, edges);

    let config = perf::StressTestConfig {
        num_nodes: nodes,
        num_edges: edges,
        seed,
        timeout: Duration::from_secs(timeout),
    };

    let result = perf::run_stress_test(config);
    println!("{}", result);

    // Save memory profile
    let graph = property::ArbitraryGraph::generate(seed, nodes, edges);
    let profile = perf::MemoryProfile::estimate(&graph);
    println!("{}", profile);

    if result.passed() { 0 } else { 1 }
}

fn cmd_bench(iterations: u64, csv_output: bool, output: &PathBuf) -> i32 {
    println!("=== Benchmarks ({} iterations) ===\n", iterations);

    let mut suite = perf::BenchmarkSuite::new();

    // Graph creation
    suite.bench("graph_create_100_nodes", iterations, || {
        let mut g = Graph::new();
        for i in 0..100 {
            let _ = g.add_node(model::Node::new("block").with_id(model::NodeId::from_seed(i)));
        }
    });

    // Graph with edges
    suite.bench("graph_create_50n_100e", iterations, || {
        let _ = property::ArbitraryGraph::generate(42, 50, 100);
    });

    // Content hash
    let graph = property::ArbitraryGraph::generate(42, 100, 200);
    suite.bench("content_hash_100n", iterations, || {
        let _ = graph.content_hash();
    });

    // Invariant check
    suite.bench("invariant_check_100n", iterations, || {
        let _ = graph.check_invariants();
    });

    // JSON serialization
    suite.bench("json_serialize_100n", iterations, || {
        let _ = serde_json::to_string(&graph);
    });

    // JSON deserialization
    let json = serde_json::to_string(&graph).unwrap();
    suite.bench("json_deserialize_100n", iterations, || {
        let _: Graph = serde_json::from_str(&json).unwrap();
    });

    println!("{}", suite.report());

    if csv_output {
        let csv = suite.export_csv();
        let path = output.join("benchmarks.csv");
        std::fs::write(&path, &csv).ok();
        println!("CSV: {}", path.display());
    }

    0
}

fn cmd_replay(path: PathBuf, verify: bool, to_index: Option<usize>) -> i32 {
    println!("=== Event Replay: {} ===\n", path.display());

    let data = match std::fs::read_to_string(&path) {
        Ok(d) => d,
        Err(e) => {
            eprintln!("Error reading file: {}", e);
            return 1;
        }
    };

    let value: serde_json::Value = match serde_json::from_str(&data) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("Error parsing JSON: {}", e);
            return 1;
        }
    };

    let log = match events::EventLog::import_json(&value) {
        Ok(l) => l,
        Err(e) => {
            eprintln!("Error importing event log: {}", e);
            return 1;
        }
    };

    println!("Event log: {} entries", log.len());

    let graph = if let Some(idx) = to_index {
        println!("Replaying to index {}...", idx);
        events::ReplayEngine::replay_to(&log, idx)
    } else {
        events::ReplayEngine::replay(&log)
    };

    match graph {
        Ok(g) => {
            println!("Replay successful: {} nodes, {} edges", g.node_count(), g.edge_count());
            println!("Content hash: {}", g.content_hash());

            if let Err(e) = g.check_invariants() {
                eprintln!("Invariant violation after replay: {}", e);
                return 1;
            }

            if verify {
                match events::ReplayEngine::verify_determinism(&log) {
                    Ok(true) => println!("Determinism verified: OK"),
                    Ok(false) => {
                        eprintln!("Determinism check FAILED");
                        return 1;
                    }
                    Err(e) => {
                        eprintln!("Replay error: {}", e);
                        return 1;
                    }
                }
            }

            0
        }
        Err(e) => {
            eprintln!("Replay failed: {}", e);
            1
        }
    }
}

fn cmd_report(path: PathBuf, format: String, output: &PathBuf) -> i32 {
    let data = match std::fs::read_to_string(&path) {
        Ok(d) => d,
        Err(e) => {
            eprintln!("Error reading file: {}", e);
            return 1;
        }
    };

    let report: runner::RunReport = match serde_json::from_str(&data) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("Error parsing report: {}", e);
            return 1;
        }
    };

    match format.as_str() {
        "junit" => {
            let xml = report.to_junit_xml();
            let out_path = output.join("results.xml");
            std::fs::write(&out_path, &xml).ok();
            println!("{}", xml);
        }
        "json" => {
            println!("{}", report.to_json());
        }
        _ => {
            println!("{}", report.summary());
        }
    }

    0
}

fn cmd_property(
    cases: usize,
    max_nodes: usize,
    max_edges: usize,
    seed: u64,
    max_shrinks: usize,
    _output: &PathBuf,
) -> i32 {
    println!("=== Property-Based Tests ({} cases, seed={}) ===\n", cases, seed);

    let config = property::PropertyTestConfig {
        seed,
        num_cases: cases,
        max_nodes,
        max_edges,
        max_shrinks,
    };

    let runner = property::PropertyRunner::new(config);

    // Property 1: All generated graphs pass invariants
    println!("Property: invariants_hold");
    let results = runner.check_graph_property(|g| {
        g.check_invariants().map_err(|e| e.to_string())
    });
    let pass_count = results.iter().filter(|r| r.passed).count();
    println!("  {}/{} passed", pass_count, results.len());

    // Property 2: Serialization round-trip
    println!("Property: json_roundtrip");
    let results2 = runner.check_graph_property(|g| {
        serialization::RoundTrip::graph_json(g).map_err(|e| e.to_string())
    });
    let pass_count2 = results2.iter().filter(|r| r.passed).count();
    println!("  {}/{} passed", pass_count2, results2.len());

    // Property 3: Content hash determinism
    println!("Property: hash_determinism");
    let results3 = runner.check_graph_property(|g| {
        let h1 = g.content_hash();
        let h2 = g.content_hash();
        if h1 == h2 {
            Ok(())
        } else {
            Err(format!("Hash mismatch: {} vs {}", h1, h2))
        }
    });
    let pass_count3 = results3.iter().filter(|r| r.passed).count();
    println!("  {}/{} passed", pass_count3, results3.len());

    // Property 4: Operation sequences maintain invariants
    println!("Property: operation_sequences_valid");
    let results4 = runner.check_operation_property(|_ops, g| {
        g.check_invariants().map_err(|e| e.to_string())
    });
    let pass_count4 = results4.iter().filter(|r| r.passed).count();
    println!("  {}/{} passed", pass_count4, results4.len());

    let total_failures = results.iter().chain(results2.iter()).chain(results3.iter()).chain(results4.iter())
        .filter(|r| !r.passed)
        .count();

    if total_failures > 0 {
        println!("\n{} total failures", total_failures);
        // Report failing seeds
        for r in results.iter().chain(results2.iter()).chain(results3.iter()).chain(results4.iter()) {
            if !r.passed {
                println!(
                    "  seed={}, error={}, shrunk_seed={:?}",
                    r.seed,
                    r.error.as_deref().unwrap_or("unknown"),
                    r.shrunk_seed
                );
            }
        }
        1
    } else {
        println!("\nAll properties hold.");
        0
    }
}

fn cmd_crdt(clients: usize, ops_per_client: usize, seed: u64, partitions: bool) -> i32 {
    println!(
        "=== CRDT Simulation: {} clients, {} ops each ===\n",
        clients, ops_per_client
    );

    let mut sim = crdt::CrdtSimulator::new(clients, seed);
    let ids = sim.client_ids();

    // Optionally add a partition
    if partitions && ids.len() >= 3 {
        println!("Adding partition between client 0 and client 1");
        sim.network.add_partition(ids[0], ids[1]);
    }

    // Each client adds some nodes
    for (i, &client_id) in ids.iter().enumerate() {
        for j in 0..ops_per_client {
            sim.client_op(
                client_id,
                crdt::OperationKind::AddNode {
                    node_id: NodeId::from_seed((i * 1000 + j) as u64),
                    kind: "block".into(),
                    x: (i * 100) as f64,
                    y: (j * 50) as f64,
                },
            );
            // Tick between operations
            sim.tick();
        }
    }

    // Heal partitions if any
    if partitions && ids.len() >= 3 {
        println!("Healing partition...");
        sim.network.heal_partition(ids[0], ids[1]);
    }

    // Drain all messages
    sim.drain_network();

    // Check results
    println!("Ticks: {}", sim.tick_count);

    match sim.check_all_invariants() {
        Ok(()) => println!("All invariants: OK"),
        Err((id, err)) => {
            eprintln!("Invariant violation on client {:?}: {}", id, err);
            return 1;
        }
    }

    if sim.check_convergence() {
        println!("Convergence: OK");
    } else {
        println!("Convergence: NOT YET (expected with partitions)");
        for (id, client) in &sim.clients {
            println!(
                "  Client {:?}: {} nodes, hash={}",
                id,
                client.graph.node_count(),
                client.graph.content_hash().chars().take(12).collect::<String>()
            );
        }
    }

    0
}

// ── Built-in Example Suites ──────────────────────────────────────────────────

fn build_example_suites() -> Vec<runner::TestSuite> {
    let mut model_suite = runner::TestSuite::new("model");

    model_suite.add(
        runner::TestCase::new("model::add_remove_nodes", || {
            let mut g = Graph::new();
            let id = g.add_node(model::Node::new("block")).map_err(|e| e.to_string())?;
            g.remove_node(id).map_err(|e| e.to_string())?;
            if g.node_count() != 0 {
                return Err("Node count should be 0".into());
            }
            Ok(())
        })
        .with_tag("model")
        .with_tag("fast"),
    );

    model_suite.add(
        runner::TestCase::new("model::edge_referential_integrity", || {
            let mut g = Graph::new();
            let a = g.add_node(model::Node::new("a")).map_err(|e| e.to_string())?;
            let b = g.add_node(model::Node::new("b")).map_err(|e| e.to_string())?;
            g.add_edge(model::Edge::new(a, b, "wire")).map_err(|e| e.to_string())?;
            g.check_invariants().map_err(|e| e.to_string())?;
            Ok(())
        })
        .with_tag("model")
        .with_tag("fast"),
    );

    model_suite.add(
        runner::TestCase::new("model::reject_self_loop", || {
            let mut g = Graph::new();
            let a = g.add_node(model::Node::new("a")).map_err(|e| e.to_string())?;
            match g.add_edge(model::Edge::new(a, a, "wire")) {
                Err(model::GraphError::SelfLoop(_)) => Ok(()),
                _ => Err("Expected SelfLoop error".into()),
            }
        })
        .with_tag("model")
        .with_tag("fast"),
    );

    // Serialization suite
    let mut ser_suite = runner::TestSuite::new("serialization");

    ser_suite.add(
        runner::TestCase::new("serialization::json_roundtrip", || {
            let g = property::ArbitraryGraph::generate(42, 20, 40);
            serialization::RoundTrip::graph_json(&g).map_err(|e| e.to_string())
        })
        .with_tag("serialization"),
    );

    ser_suite.add(
        runner::TestCase::new("serialization::bincode_roundtrip", || {
            let g = property::ArbitraryGraph::generate(42, 20, 40);
            serialization::RoundTrip::graph_bincode(&g).map_err(|e| e.to_string())
        })
        .with_tag("serialization"),
    );

    // Event replay suite
    let mut event_suite = runner::TestSuite::new("events");

    event_suite.add(
        runner::TestCase::new("events::replay_determinism", || {
            let mut log = events::EventLog::new();
            let node = model::Node::new("x").with_id(model::NodeId::from_seed(1));
            log.push(events::EventEntry::new(events::Event::NodeAdded { node }));
            log.push(events::EventEntry::new(events::Event::NodeMoved {
                node_id: model::NodeId::from_seed(1),
                from: (0.0, 0.0),
                to: (10.0, 20.0),
            }));
            match events::ReplayEngine::verify_determinism(&log) {
                Ok(true) => Ok(()),
                Ok(false) => Err("Replay not deterministic".into()),
                Err(e) => Err(e.to_string()),
            }
        })
        .with_tag("events"),
    );

    // Web suite
    let mut web_suite = runner::TestSuite::new("web");

    web_suite.add(
        runner::TestCase::new("web::component_tree_gen", || {
            let tree = web::ArbitraryComponent::generate_tree(42, 3, 4);
            if tree.total_count() == 0 {
                return Err("Empty tree".into());
            }
            Ok(())
        })
        .with_tag("web")
        .with_tag("gen"),
    );

    web_suite.add(
        runner::TestCase::new("web::form_validation", || {
            let form = web::ArbitraryComponent::generate_form(42, 5);
            let tree = web::ComponentTree::new("form", "/form", form);
            let violations = web::WebValidator::check_form_submit_buttons(&tree);
            if !violations.is_empty() {
                return Err("Form missing submit button".into());
            }
            Ok(())
        })
        .with_tag("web")
        .with_tag("form"),
    );

    web_suite.add(
        runner::TestCase::new("web::accessibility_labels", || {
            let nav = web::ArbitraryComponent::generate_nav(42, 5);
            for child in &nav.children {
                if child.kind == web::ComponentKind::Link {
                    if !child.accessibility.focusable {
                        return Err("Link not focusable".into());
                    }
                }
            }
            Ok(())
        })
        .with_tag("web")
        .with_tag("a11y"),
    );

    web_suite.add(
        runner::TestCase::new("web::state_roundtrip", || {
            let mut state = web::AppState::new();
            state.set("count", serde_json::json!(42));
            let json = serde_json::to_string(&state).map_err(|e| e.to_string())?;
            let restored: web::AppState = serde_json::from_str(&json).map_err(|e| e.to_string())?;
            if state != restored {
                return Err("State roundtrip failed".into());
            }
            Ok(())
        })
        .with_tag("web")
        .with_tag("state"),
    );

    vec![model_suite, ser_suite, event_suite, web_suite]
}

// ── Web Command ──────────────────────────────────────────────────────────────

fn cmd_web(num_trees: usize, max_depth: usize, max_children: usize, seed: u64, form_fields: usize) -> i32 {
    println!("=== Web GUI Tests (seed={}, trees={}, depth={}) ===\n", seed, num_trees, max_depth);

    let mut failures = 0;

    // 1. Component tree generation + accessibility
    println!("--- Component Tree Generation ---");
    for i in 0..num_trees {
        let tree_seed = seed.wrapping_add(i as u64);
        let tree = web::ArbitraryComponent::generate_tree(tree_seed, max_depth, max_children);
        let a11y_violations = web::WebValidator::check_accessibility_labels(&tree);
        let tab_violations = web::WebValidator::check_tab_order(&tree);
        let hidden_violations = web::WebValidator::check_hidden_interactive(&tree);

        let total = a11y_violations.len() + tab_violations.len() + hidden_violations.len();
        if total > 0 {
            println!("  Tree seed={}: {} components, {} a11y issues", tree_seed, tree.total_count(), total);
        }
    }
    println!("  {} trees validated\n", num_trees);

    // 2. Form generation + validation
    println!("--- Form Validation ---");
    for i in 0..5 {
        let form_seed = seed.wrapping_add(1000 + i);
        let form = web::ArbitraryComponent::generate_form(form_seed, form_fields);
        let tree = web::ComponentTree::new("form", "/form", form);

        let submit_violations = web::WebValidator::check_form_submit_buttons(&tree);
        if !submit_violations.is_empty() {
            println!("  FAIL: Form seed={} missing submit button", form_seed);
            failures += 1;
        }

        let form_errors = tree.validate_forms();
        println!("  Form seed={}: {} fields, {} validation errors (empty required fields)",
            form_seed, form_fields, form_errors.len());
    }
    println!();

    // 3. Routing validation
    println!("--- Route Validation ---");
    let mut router = web::Router::new();
    router.add_route(web::Route::new("/", "home"));
    router.add_route(web::Route::new("/login", "login"));
    router.add_route(web::Route::new("/dashboard", "dashboard").with_auth());
    router.add_route(web::Route::new("/users/:id", "user_detail").with_auth().with_param("id"));
    let route_errors = web::WebValidator::check_routes(&router);
    if route_errors.is_empty() {
        println!("  Routes: OK ({} routes)", router.routes.len());
    } else {
        println!("  FAIL: {:?}", route_errors);
        failures += 1;
    }
    println!();

    // 4. Responsive testing
    println!("--- Responsive Breakpoints ---");
    for bp in web::Breakpoint::all() {
        let vp = web::Viewport::from_breakpoint(bp);
        println!("  {:?}: {}x{} (dpr={})", bp, vp.width, vp.height, vp.device_pixel_ratio);
    }
    println!();

    // 5. Event simulation
    println!("--- Event Simulation ---");
    let tree = web::ArbitraryComponent::generate_tree(seed, max_depth, max_children);
    let sim = web::EventSimulator::new(tree).random_interaction(seed, 50);
    println!("  Dispatched {} events", sim.event_count());
    println!("  Tree: {} components (unchanged)\n", sim.tree.total_count());

    // 6. Generative property tests
    println!("--- Generative Properties ---");
    let gen_config = generators::GenPropertyConfig {
        seed,
        num_cases: num_trees,
        size: 50,
        max_shrinks: 10,
    };
    let gen_runner = generators::GenRunner::new(gen_config);

    let results = gen_runner.check::<web::ComponentKind, _>(|kind| {
        let c = web::Component::new(kind.clone());
        match kind {
            web::ComponentKind::Button | web::ComponentKind::Link |
            web::ComponentKind::Input | web::ComponentKind::TextArea |
            web::ComponentKind::Select | web::ComponentKind::Checkbox |
            web::ComponentKind::Radio => {
                if !c.accessibility.focusable {
                    return Err(format!("{:?} not focusable", kind));
                }
            }
            _ => {}
        }
        Ok(())
    });
    let pass = results.iter().filter(|r| r.passed).count();
    println!("  a11y_defaults: {}/{} passed", pass, results.len());
    if results.iter().any(|r| !r.passed) {
        failures += 1;
    }

    if failures > 0 {
        println!("\n{} failures", failures);
        1
    } else {
        println!("\nAll web tests passed.");
        0
    }
}
