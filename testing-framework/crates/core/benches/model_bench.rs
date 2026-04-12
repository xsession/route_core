//! Criterion benchmarks for the core model.

use criterion::{black_box, criterion_group, criterion_main, Criterion, BenchmarkId};
use industrial_test_core::*;
use industrial_test_core::property::ArbitraryGraph;

fn bench_graph_creation(c: &mut Criterion) {
    let mut group = c.benchmark_group("graph_creation");

    for size in [10, 50, 100, 500, 1000] {
        group.bench_with_input(BenchmarkId::new("nodes", size), &size, |b, &size| {
            b.iter(|| {
                let mut g = model::Graph::new();
                for i in 0..size {
                    let _ = g.add_node(
                        model::Node::new("block").with_id(model::NodeId::from_seed(i as u64)),
                    );
                }
                black_box(&g);
            });
        });
    }

    group.finish();
}

fn bench_arbitrary_graph(c: &mut Criterion) {
    let mut group = c.benchmark_group("arbitrary_graph");

    for (nodes, edges) in [(10, 20), (50, 100), (100, 300), (500, 1500)] {
        group.bench_with_input(
            BenchmarkId::new("generate", format!("{}n_{}e", nodes, edges)),
            &(nodes, edges),
            |b, &(n, e)| {
                b.iter(|| {
                    black_box(ArbitraryGraph::generate(42, n, e));
                });
            },
        );
    }

    group.finish();
}

fn bench_content_hash(c: &mut Criterion) {
    let mut group = c.benchmark_group("content_hash");

    for size in [10, 100, 500] {
        let graph = ArbitraryGraph::generate(42, size, size * 2);
        group.bench_with_input(BenchmarkId::new("hash", size), &graph, |b, g| {
            b.iter(|| {
                black_box(g.content_hash());
            });
        });
    }

    group.finish();
}

fn bench_invariant_check(c: &mut Criterion) {
    let mut group = c.benchmark_group("invariant_check");

    for size in [10, 100, 500] {
        let graph = ArbitraryGraph::generate(42, size, size * 2);
        group.bench_with_input(BenchmarkId::new("check", size), &graph, |b, g| {
            b.iter(|| {
                black_box(g.check_invariants().unwrap());
            });
        });
    }

    group.finish();
}

fn bench_serialization(c: &mut Criterion) {
    let mut group = c.benchmark_group("serialization");

    for size in [10, 100, 500] {
        let graph = ArbitraryGraph::generate(42, size, size * 2);

        group.bench_with_input(BenchmarkId::new("json_serialize", size), &graph, |b, g| {
            b.iter(|| {
                black_box(serde_json::to_string(g).unwrap());
            });
        });

        let json = serde_json::to_string(&graph).unwrap();
        group.bench_with_input(
            BenchmarkId::new("json_deserialize", size),
            &json,
            |b, j| {
                b.iter(|| {
                    black_box(serde_json::from_str::<model::Graph>(j).unwrap());
                });
            },
        );

        group.bench_with_input(BenchmarkId::new("bincode_serialize", size), &graph, |b, g| {
            b.iter(|| {
                black_box(bincode::serialize(g).unwrap());
            });
        });
    }

    group.finish();
}

fn bench_event_replay(c: &mut Criterion) {
    let mut group = c.benchmark_group("event_replay");

    for num_events in [10, 50, 200] {
        let mut log = events::EventLog::new();
        for i in 0..num_events {
            log.push(events::EventEntry::new(events::Event::NodeAdded {
                node: model::Node::new("block").with_id(model::NodeId::from_seed(i as u64)),
            }));
        }

        group.bench_with_input(
            BenchmarkId::new("replay", num_events),
            &log,
            |b, log| {
                b.iter(|| {
                    black_box(events::ReplayEngine::replay(log).unwrap());
                });
            },
        );
    }

    group.finish();
}

criterion_group!(
    benches,
    bench_graph_creation,
    bench_arbitrary_graph,
    bench_content_hash,
    bench_invariant_check,
    bench_serialization,
    bench_event_replay,
);
criterion_main!(benches);
