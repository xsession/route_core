"""Test runner orchestration — invokes Rust CLI, collects results, manages sharding."""

from __future__ import annotations

import json
import subprocess
import os
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


@dataclass
class ShardConfig:
    """Configuration for test sharding across CI workers."""
    total_shards: int = 1
    shard_index: int = 0

    def should_run(self, test_index: int) -> bool:
        return test_index % self.total_shards == self.shard_index


@dataclass
class RunConfig:
    """Configuration for a test orchestration run."""
    rust_binary: str = "industrial-test"
    output_dir: Path = field(default_factory=lambda: Path("./test-output"))
    verbose: bool = False
    parallel: bool = True
    seed: Optional[int] = None
    filter_pattern: Optional[str] = None
    tag_filter: Optional[str] = None
    timeout_seconds: int = 300
    shard: ShardConfig = field(default_factory=ShardConfig)

    @classmethod
    def from_env(cls) -> "RunConfig":
        """Create config from environment variables (CI-friendly)."""
        return cls(
            rust_binary=os.environ.get("INDUSTRIAL_TEST_BIN", "industrial-test"),
            output_dir=Path(os.environ.get("TEST_OUTPUT_DIR", "./test-output")),
            verbose=os.environ.get("VERBOSE", "").lower() in ("1", "true"),
            parallel=os.environ.get("SEQUENTIAL", "").lower() not in ("1", "true"),
            seed=int(os.environ["TEST_SEED"]) if "TEST_SEED" in os.environ else None,
            filter_pattern=os.environ.get("TEST_FILTER"),
            tag_filter=os.environ.get("TEST_TAG"),
            timeout_seconds=int(os.environ.get("TEST_TIMEOUT", "300")),
            shard=ShardConfig(
                total_shards=int(os.environ.get("TOTAL_SHARDS", "1")),
                shard_index=int(os.environ.get("SHARD_INDEX", "0")),
            ),
        )


@dataclass
class TestResult:
    """A single test result from the Rust runner."""
    name: str
    status: str
    duration_ms: float
    error: Optional[str] = None
    seed: Optional[int] = None

    @property
    def passed(self) -> bool:
        return self.status == "Passed"


@dataclass
class RunReport:
    """Aggregated results from an orchestrated run."""
    results: list[TestResult]
    total_duration_ms: float
    passed: int
    failed: int
    exit_code: int
    stdout: str
    stderr: str

    @property
    def success(self) -> bool:
        return self.exit_code == 0 and self.failed == 0


class TestOrchestrator:
    """Orchestrates test execution via the Rust CLI binary."""

    def __init__(self, config: RunConfig):
        self.config = config
        self.config.output_dir.mkdir(parents=True, exist_ok=True)

    def run_tests(self) -> RunReport:
        """Run the main test suite."""
        cmd = self._build_command("run", ["--format", "json"])
        return self._execute(cmd)

    def run_stress(self, nodes: int = 10000, edges: int = 50000) -> RunReport:
        """Run stress tests."""
        cmd = self._build_command("stress", [
            "--nodes", str(nodes),
            "--edges", str(edges),
        ])
        return self._execute(cmd)

    def run_benchmarks(self, iterations: int = 100) -> RunReport:
        """Run benchmarks."""
        cmd = self._build_command("bench", [
            "--iterations", str(iterations),
            "--csv",
        ])
        return self._execute(cmd)

    def run_property_tests(self, cases: int = 100) -> RunReport:
        """Run property-based tests."""
        cmd = self._build_command("property", [
            "--cases", str(cases),
        ])
        if self.config.seed is not None:
            cmd.extend(["--seed", str(self.config.seed)])
        return self._execute(cmd)

    def run_crdt_simulation(self, clients: int = 3, ops: int = 20) -> RunReport:
        """Run CRDT convergence tests."""
        cmd = self._build_command("crdt", [
            "--clients", str(clients),
            "--ops", str(ops),
        ])
        return self._execute(cmd)

    def run_replay(self, event_log: Path, verify: bool = True) -> RunReport:
        """Replay an event log."""
        cmd = self._build_command("replay", [str(event_log)])
        if verify:
            cmd.append("--verify")
        return self._execute(cmd)

    def run_all(self) -> dict[str, RunReport]:
        """Run all test categories and return results keyed by category."""
        reports = {}
        reports["unit"] = self.run_tests()
        reports["property"] = self.run_property_tests()
        reports["crdt"] = self.run_crdt_simulation()
        reports["stress"] = self.run_stress(nodes=1000, edges=2000)
        reports["benchmarks"] = self.run_benchmarks(iterations=50)
        return reports

    def _build_command(self, subcommand: str, extra_args: list[str]) -> list[str]:
        cmd = [self.config.rust_binary]
        if self.config.verbose:
            cmd.append("--verbose")
        cmd.extend(["--output", str(self.config.output_dir)])
        cmd.append(subcommand)

        if subcommand == "run":
            if self.config.filter_pattern:
                cmd.extend(["--filter", self.config.filter_pattern])
            if self.config.tag_filter:
                cmd.extend(["--tag", self.config.tag_filter])
            if not self.config.parallel:
                cmd.append("--sequential")
            if self.config.seed is not None:
                cmd.extend(["--seed", str(self.config.seed)])

        cmd.extend(extra_args)
        return cmd

    def _execute(self, cmd: list[str]) -> RunReport:
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=self.config.timeout_seconds,
                cwd=str(self.config.output_dir.parent),
            )
        except FileNotFoundError:
            return RunReport(
                results=[],
                total_duration_ms=0,
                passed=0,
                failed=1,
                exit_code=127,
                stdout="",
                stderr=f"Binary not found: {cmd[0]}",
            )
        except subprocess.TimeoutExpired:
            return RunReport(
                results=[],
                total_duration_ms=self.config.timeout_seconds * 1000,
                passed=0,
                failed=1,
                exit_code=124,
                stdout="",
                stderr="Test execution timed out",
            )

        # Try to parse structured results
        test_results = self._parse_results(result.stdout)
        passed = sum(1 for r in test_results if r.passed)
        failed = len(test_results) - passed

        return RunReport(
            results=test_results,
            total_duration_ms=0,  # Could parse from output
            passed=passed,
            failed=failed,
            exit_code=result.returncode,
            stdout=result.stdout,
            stderr=result.stderr,
        )

    def _parse_results(self, stdout: str) -> list[TestResult]:
        """Parse test results from CLI output."""
        results = []
        for line in stdout.splitlines():
            line = line.strip()
            if line.startswith("[PASS]"):
                name = line.split("]", 1)[1].strip().split("(")[0].strip()
                results.append(TestResult(name=name, status="Passed", duration_ms=0))
            elif line.startswith("[FAIL]"):
                name = line.split("]", 1)[1].strip().split("(")[0].strip()
                error = line.split("—", 1)[1].strip() if "—" in line else None
                results.append(TestResult(name=name, status="Failed", duration_ms=0, error=error))
            elif line.startswith("[PANIC]"):
                name = line.split("]", 1)[1].strip().split("(")[0].strip()
                results.append(TestResult(name=name, status="Panicked", duration_ms=0))
        return results


class ResultsAggregator:
    """Aggregates results from multiple shards/runs."""

    def __init__(self):
        self.reports: list[RunReport] = []

    def add(self, report: RunReport):
        self.reports.append(report)

    @property
    def total_passed(self) -> int:
        return sum(r.passed for r in self.reports)

    @property
    def total_failed(self) -> int:
        return sum(r.failed for r in self.reports)

    @property
    def all_passed(self) -> bool:
        return all(r.success for r in self.reports)

    def failures(self) -> list[TestResult]:
        failed = []
        for report in self.reports:
            failed.extend(r for r in report.results if not r.passed)
        return failed

    def to_json(self) -> str:
        data = {
            "total_passed": self.total_passed,
            "total_failed": self.total_failed,
            "all_passed": self.all_passed,
            "failures": [
                {"name": f.name, "status": f.status, "error": f.error, "seed": f.seed}
                for f in self.failures()
            ],
        }
        return json.dumps(data, indent=2)
