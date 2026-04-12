//! Test runner — executes test suites with parallel execution, deterministic seeding,
//! and structured result reporting.

use crate::logging::StructuredLogger;
use chrono::{DateTime, Utc};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};

// ── Test Case ────────────────────────────────────────────────────────────────

/// A single test case.
pub struct TestCase {
    pub name: String,
    pub tags: Vec<String>,
    pub timeout: Duration,
    pub seed: Option<u64>,
    body: Box<dyn Fn() -> Result<(), String> + Send + Sync>,
}

impl TestCase {
    pub fn new(name: impl Into<String>, body: impl Fn() -> Result<(), String> + Send + Sync + 'static) -> Self {
        Self {
            name: name.into(),
            tags: Vec::new(),
            timeout: Duration::from_secs(30),
            seed: None,
            body: Box::new(body),
        }
    }

    pub fn with_tag(mut self, tag: impl Into<String>) -> Self {
        self.tags.push(tag.into());
        self
    }

    pub fn with_timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }

    pub fn with_seed(mut self, seed: u64) -> Self {
        self.seed = Some(seed);
        self
    }

    pub fn run(&self) -> TestResult {
        let start = Instant::now();

        let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| (self.body)()));
        let duration = start.elapsed();

        let timed_out = duration > self.timeout;

        match outcome {
            Ok(Ok(())) if !timed_out => TestResult {
                name: self.name.clone(),
                status: TestStatus::Passed,
                duration,
                error: None,
                seed: self.seed,
                timestamp: Utc::now(),
            },
            Ok(Ok(())) => TestResult {
                name: self.name.clone(),
                status: TestStatus::TimedOut,
                duration,
                error: Some(format!("Exceeded timeout of {:?}", self.timeout)),
                seed: self.seed,
                timestamp: Utc::now(),
            },
            Ok(Err(e)) => TestResult {
                name: self.name.clone(),
                status: TestStatus::Failed,
                duration,
                error: Some(e),
                seed: self.seed,
                timestamp: Utc::now(),
            },
            Err(panic_info) => {
                let msg = if let Some(s) = panic_info.downcast_ref::<String>() {
                    s.clone()
                } else if let Some(s) = panic_info.downcast_ref::<&str>() {
                    s.to_string()
                } else {
                    "Unknown panic".to_string()
                };
                TestResult {
                    name: self.name.clone(),
                    status: TestStatus::Panicked,
                    duration,
                    error: Some(msg),
                    seed: self.seed,
                    timestamp: Utc::now(),
                }
            }
        }
    }
}

// ── Test Result ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum TestStatus {
    Passed,
    Failed,
    Panicked,
    TimedOut,
    Skipped,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestResult {
    pub name: String,
    pub status: TestStatus,
    pub duration: Duration,
    pub error: Option<String>,
    pub seed: Option<u64>,
    pub timestamp: DateTime<Utc>,
}

impl TestResult {
    pub fn passed(&self) -> bool {
        self.status == TestStatus::Passed
    }
}

impl std::fmt::Display for TestResult {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let status_icon = match self.status {
            TestStatus::Passed => "PASS",
            TestStatus::Failed => "FAIL",
            TestStatus::Panicked => "PANIC",
            TestStatus::TimedOut => "TIMEOUT",
            TestStatus::Skipped => "SKIP",
        };
        write!(f, "[{}] {} ({:.2?})", status_icon, self.name, self.duration)?;
        if let Some(ref e) = self.error {
            write!(f, " — {}", e)?;
        }
        if let Some(seed) = self.seed {
            write!(f, " [seed={}]", seed)?;
        }
        Ok(())
    }
}

// ── Test Suite ───────────────────────────────────────────────────────────────

/// A collection of test cases.
pub struct TestSuite {
    pub name: String,
    cases: Vec<TestCase>,
}

impl TestSuite {
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            cases: Vec::new(),
        }
    }

    pub fn add(&mut self, case: TestCase) {
        self.cases.push(case);
    }

    pub fn case_count(&self) -> usize {
        self.cases.len()
    }

    /// Filter cases by tag.
    pub fn filter_by_tag(&self, tag: &str) -> Vec<&TestCase> {
        self.cases
            .iter()
            .filter(|c| c.tags.iter().any(|t| t == tag))
            .collect()
    }
}

// ── Test Runner ──────────────────────────────────────────────────────────────

/// Executes test suites with parallel execution and reporting.
pub struct TestRunner {
    pub parallel: bool,
    pub filter: Option<String>,
    pub tag_filter: Option<String>,
    logger: StructuredLogger,
}

impl TestRunner {
    pub fn new() -> Self {
        Self {
            parallel: true,
            filter: None,
            tag_filter: None,
            logger: StructuredLogger::new("test_runner"),
        }
    }

    pub fn sequential(mut self) -> Self {
        self.parallel = false;
        self
    }

    pub fn with_filter(mut self, filter: impl Into<String>) -> Self {
        self.filter = Some(filter.into());
        self
    }

    pub fn with_tag_filter(mut self, tag: impl Into<String>) -> Self {
        self.tag_filter = Some(tag.into());
        self
    }

    /// Run all suites and return aggregated results.
    pub fn run(&self, suites: Vec<TestSuite>) -> RunReport {
        let start = Instant::now();
        self.logger.info(format!(
            "Starting test run: {} suite(s)",
            suites.len()
        ));

        let mut all_results = Vec::new();

        for suite in &suites {
            self.logger.info(format!("Running suite: {}", suite.name));

            let cases: Vec<&TestCase> = suite
                .cases
                .iter()
                .filter(|c| self.matches_filter(c))
                .collect();

            let results: Vec<TestResult> = if self.parallel {
                cases.par_iter().map(|c| c.run()).collect()
            } else {
                cases.iter().map(|c| c.run()).collect()
            };

            for r in &results {
                self.logger.info(format!("{}", r));
            }

            all_results.extend(results);
        }

        let duration = start.elapsed();

        let passed = all_results.iter().filter(|r| r.passed()).count();
        let failed = all_results.len() - passed;

        self.logger.info(format!(
            "Test run complete: {}/{} passed in {:.2?}",
            passed,
            all_results.len(),
            duration
        ));

        RunReport {
            results: all_results,
            total_duration: duration,
            passed,
            failed,
            timestamp: Utc::now(),
            logs: self.logger.entries(),
        }
    }

    fn matches_filter(&self, case: &TestCase) -> bool {
        if let Some(ref filter) = self.filter {
            if !case.name.contains(filter.as_str()) {
                return false;
            }
        }
        if let Some(ref tag) = self.tag_filter {
            if !case.tags.iter().any(|t| t == tag) {
                return false;
            }
        }
        true
    }
}

impl Default for TestRunner {
    fn default() -> Self {
        Self::new()
    }
}

// ── Run Report ───────────────────────────────────────────────────────────────

/// Aggregated results of a test run.
#[derive(Debug, Serialize, Deserialize)]
pub struct RunReport {
    pub results: Vec<TestResult>,
    pub total_duration: Duration,
    pub passed: usize,
    pub failed: usize,
    pub timestamp: DateTime<Utc>,
    pub logs: Vec<crate::logging::LogEntry>,
}

impl RunReport {
    pub fn success(&self) -> bool {
        self.failed == 0
    }

    pub fn summary(&self) -> String {
        format!(
            "{}/{} passed, {} failed, {:.2?} total",
            self.passed,
            self.results.len(),
            self.failed,
            self.total_duration
        )
    }

    /// Export as JSON.
    pub fn to_json(&self) -> String {
        serde_json::to_string_pretty(self).unwrap_or_default()
    }

    /// Get only failed results.
    pub fn failures(&self) -> Vec<&TestResult> {
        self.results.iter().filter(|r| !r.passed()).collect()
    }

    /// Generate a JUnit-compatible XML report.
    pub fn to_junit_xml(&self) -> String {
        let mut xml = String::new();
        xml.push_str("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
        xml.push_str(&format!(
            "<testsuite name=\"industrial-test\" tests=\"{}\" failures=\"{}\" time=\"{:.3}\">\n",
            self.results.len(),
            self.failed,
            self.total_duration.as_secs_f64()
        ));

        for r in &self.results {
            xml.push_str(&format!(
                "  <testcase name=\"{}\" time=\"{:.3}\"",
                escape_xml(&r.name),
                r.duration.as_secs_f64()
            ));

            if r.passed() {
                xml.push_str(" />\n");
            } else {
                xml.push_str(">\n");
                if let Some(ref err) = r.error {
                    xml.push_str(&format!(
                        "    <failure message=\"{}\">{}</failure>\n",
                        escape_xml(err),
                        escape_xml(err)
                    ));
                }
                xml.push_str("  </testcase>\n");
            }
        }

        xml.push_str("</testsuite>\n");
        xml
    }
}

fn escape_xml(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_case_pass() {
        let tc = TestCase::new("always_pass", || Ok(()));
        let result = tc.run();
        assert!(result.passed());
    }

    #[test]
    fn test_case_fail() {
        let tc = TestCase::new("always_fail", || Err("intentional".into()));
        let result = tc.run();
        assert!(!result.passed());
        assert_eq!(result.status, TestStatus::Failed);
    }

    #[test]
    fn test_case_panic() {
        let tc = TestCase::new("always_panic", || {
            panic!("boom");
        });
        let result = tc.run();
        assert_eq!(result.status, TestStatus::Panicked);
    }

    #[test]
    fn runner_executes_suite() {
        let mut suite = TestSuite::new("test_suite");
        suite.add(TestCase::new("pass1", || Ok(())));
        suite.add(TestCase::new("pass2", || Ok(())));
        suite.add(TestCase::new("fail1", || Err("nope".into())));

        let runner = TestRunner::new();
        let report = runner.run(vec![suite]);

        assert_eq!(report.passed, 2);
        assert_eq!(report.failed, 1);
        assert!(!report.success());
    }

    #[test]
    fn runner_filter() {
        let mut suite = TestSuite::new("filtered");
        suite.add(TestCase::new("model::add_node", || Ok(())));
        suite.add(TestCase::new("model::remove_node", || Ok(())));
        suite.add(TestCase::new("render::layout", || Ok(())));

        let runner = TestRunner::new().with_filter("model");
        let report = runner.run(vec![suite]);
        assert_eq!(report.results.len(), 2);
    }

    #[test]
    fn runner_tag_filter() {
        let mut suite = TestSuite::new("tagged");
        suite.add(TestCase::new("fast1", || Ok(())).with_tag("fast"));
        suite.add(TestCase::new("slow1", || Ok(())).with_tag("slow"));

        let runner = TestRunner::new().with_tag_filter("fast");
        let report = runner.run(vec![suite]);
        assert_eq!(report.results.len(), 1);
    }

    #[test]
    fn junit_xml_output() {
        let mut suite = TestSuite::new("xml_suite");
        suite.add(TestCase::new("ok_test", || Ok(())));
        suite.add(TestCase::new("fail_test", || Err("bad".into())));

        let runner = TestRunner::new();
        let report = runner.run(vec![suite]);
        let xml = report.to_junit_xml();

        assert!(xml.contains("testsuite"));
        assert!(xml.contains("ok_test"));
        assert!(xml.contains("failure"));
    }
}
