"""Tests for the orchestrator."""

from pathlib import Path
from orchestrator.runner import (
    RunConfig,
    ShardConfig,
    TestResult,
    RunReport,
    ResultsAggregator,
)


def test_shard_config_distributes_evenly():
    shard_0 = ShardConfig(total_shards=3, shard_index=0)
    shard_1 = ShardConfig(total_shards=3, shard_index=1)
    shard_2 = ShardConfig(total_shards=3, shard_index=2)

    tests_per_shard = [0, 0, 0]
    for i in range(30):
        if shard_0.should_run(i):
            tests_per_shard[0] += 1
        if shard_1.should_run(i):
            tests_per_shard[1] += 1
        if shard_2.should_run(i):
            tests_per_shard[2] += 1

    assert tests_per_shard == [10, 10, 10]


def test_config_from_env(monkeypatch):
    monkeypatch.setenv("TEST_SEED", "123")
    monkeypatch.setenv("TOTAL_SHARDS", "4")
    monkeypatch.setenv("SHARD_INDEX", "2")

    config = RunConfig.from_env()
    assert config.seed == 123
    assert config.shard.total_shards == 4
    assert config.shard.shard_index == 2


def test_results_aggregator():
    agg = ResultsAggregator()

    report1 = RunReport(
        results=[
            TestResult(name="a", status="Passed", duration_ms=10),
            TestResult(name="b", status="Failed", duration_ms=20, error="bad"),
        ],
        total_duration_ms=30,
        passed=1,
        failed=1,
        exit_code=1,
        stdout="",
        stderr="",
    )

    report2 = RunReport(
        results=[
            TestResult(name="c", status="Passed", duration_ms=15),
        ],
        total_duration_ms=15,
        passed=1,
        failed=0,
        exit_code=0,
        stdout="",
        stderr="",
    )

    agg.add(report1)
    agg.add(report2)

    assert agg.total_passed == 2
    assert agg.total_failed == 1
    assert not agg.all_passed
    assert len(agg.failures()) == 1
    assert agg.failures()[0].name == "b"


def test_aggregator_json():
    agg = ResultsAggregator()
    report = RunReport(
        results=[TestResult(name="x", status="Passed", duration_ms=5)],
        total_duration_ms=5,
        passed=1,
        failed=0,
        exit_code=0,
        stdout="",
        stderr="",
    )
    agg.add(report)
    json_str = agg.to_json()
    assert '"all_passed": true' in json_str
