"""CLI interface for the test orchestrator."""

from __future__ import annotations

import sys
from pathlib import Path

import click

from .runner import TestOrchestrator, RunConfig, ResultsAggregator


@click.group()
@click.option("--verbose", "-v", is_flag=True, help="Enable verbose output")
@click.option("--output", "-o", default="./test-output", help="Output directory")
@click.option("--binary", default="industrial-test", help="Path to Rust binary")
@click.pass_context
def main(ctx, verbose: bool, output: str, binary: str):
    """Industrial Test Orchestrator — coordinate test runs across CI."""
    ctx.ensure_object(dict)
    ctx.obj["config"] = RunConfig(
        rust_binary=binary,
        output_dir=Path(output),
        verbose=verbose,
    )


@main.command()
@click.option("--filter", "-f", default=None, help="Filter tests by name")
@click.option("--tag", "-t", default=None, help="Filter tests by tag")
@click.option("--seed", "-s", default=None, type=int, help="Deterministic seed")
@click.option("--sequential", is_flag=True, help="Run sequentially")
@click.pass_context
def run(ctx, filter: str, tag: str, seed: int, sequential: bool):
    """Run the main test suite."""
    config: RunConfig = ctx.obj["config"]
    config.filter_pattern = filter
    config.tag_filter = tag
    config.seed = seed
    config.parallel = not sequential

    orch = TestOrchestrator(config)
    report = orch.run_tests()

    print(report.stdout)
    if report.stderr:
        print(report.stderr, file=sys.stderr)

    sys.exit(report.exit_code)


@main.command()
@click.option("--cases", "-n", default=100, help="Number of test cases")
@click.option("--seed", "-s", default=42, type=int, help="Random seed")
@click.pass_context
def property(ctx, cases: int, seed: int):
    """Run property-based tests."""
    config: RunConfig = ctx.obj["config"]
    config.seed = seed

    orch = TestOrchestrator(config)
    report = orch.run_property_tests(cases=cases)

    print(report.stdout)
    sys.exit(report.exit_code)


@main.command()
@click.option("--nodes", "-n", default=10000, help="Number of nodes")
@click.option("--edges", "-e", default=50000, help="Number of edges")
@click.pass_context
def stress(ctx, nodes: int, edges: int):
    """Run stress tests."""
    config: RunConfig = ctx.obj["config"]
    orch = TestOrchestrator(config)
    report = orch.run_stress(nodes=nodes, edges=edges)

    print(report.stdout)
    sys.exit(report.exit_code)


@main.command()
@click.option("--iterations", "-n", default=100, help="Iterations per benchmark")
@click.pass_context
def bench(ctx, iterations: int):
    """Run benchmarks."""
    config: RunConfig = ctx.obj["config"]
    orch = TestOrchestrator(config)
    report = orch.run_benchmarks(iterations=iterations)

    print(report.stdout)
    sys.exit(report.exit_code)


@main.command()
@click.option("--clients", "-c", default=3, help="Number of simulated clients")
@click.option("--ops", "-n", default=20, help="Operations per client")
@click.option("--seed", "-s", default=42, type=int, help="Network seed")
@click.pass_context
def crdt(ctx, clients: int, ops: int, seed: int):
    """Run CRDT convergence simulation."""
    config: RunConfig = ctx.obj["config"]
    config.seed = seed

    orch = TestOrchestrator(config)
    report = orch.run_crdt_simulation(clients=clients, ops=ops)

    print(report.stdout)
    sys.exit(report.exit_code)


@main.command()
@click.argument("event_log", type=click.Path(exists=True))
@click.option("--verify/--no-verify", default=True, help="Verify determinism")
@click.pass_context
def replay(ctx, event_log: str, verify: bool):
    """Replay an event log file."""
    config: RunConfig = ctx.obj["config"]
    orch = TestOrchestrator(config)
    report = orch.run_replay(Path(event_log), verify=verify)

    print(report.stdout)
    sys.exit(report.exit_code)


@main.command()
@click.option("--seed", "-s", default=42, type=int, help="Random seed")
@click.pass_context
def all(ctx, seed: int):
    """Run all test categories."""
    config: RunConfig = ctx.obj["config"]
    config.seed = seed

    orch = TestOrchestrator(config)
    reports = orch.run_all()

    agg = ResultsAggregator()
    for category, report in reports.items():
        agg.add(report)
        status = "PASS" if report.success else "FAIL"
        print(f"[{status}] {category}: {report.passed} passed, {report.failed} failed")
        if report.stderr:
            print(f"  stderr: {report.stderr}")

    print(f"\nTotal: {agg.total_passed} passed, {agg.total_failed} failed")

    # Write aggregated results
    results_path = config.output_dir / "aggregated-results.json"
    results_path.write_text(agg.to_json())
    print(f"Results: {results_path}")

    sys.exit(0 if agg.all_passed else 1)


if __name__ == "__main__":
    main()
