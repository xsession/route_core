//! Structured logging and trace export.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

// ── Log Entry ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum LogLevel {
    Trace,
    Debug,
    Info,
    Warn,
    Error,
}

impl std::fmt::Display for LogLevel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LogLevel::Trace => write!(f, "TRACE"),
            LogLevel::Debug => write!(f, "DEBUG"),
            LogLevel::Info => write!(f, "INFO"),
            LogLevel::Warn => write!(f, "WARN"),
            LogLevel::Error => write!(f, "ERROR"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub timestamp: DateTime<Utc>,
    pub level: LogLevel,
    pub module: String,
    pub message: String,
    pub fields: std::collections::HashMap<String, serde_json::Value>,
}

// ── Structured Logger ────────────────────────────────────────────────────────

/// Thread-safe structured logger that captures log entries in memory.
#[derive(Clone)]
pub struct StructuredLogger {
    entries: Arc<Mutex<Vec<LogEntry>>>,
    module: String,
}

impl StructuredLogger {
    pub fn new(module: impl Into<String>) -> Self {
        Self {
            entries: Arc::new(Mutex::new(Vec::new())),
            module: module.into(),
        }
    }

    /// Create a child logger with a sub-module prefix.
    pub fn child(&self, submodule: impl Into<String>) -> Self {
        Self {
            entries: self.entries.clone(),
            module: format!("{}::{}", self.module, submodule.into()),
        }
    }

    pub fn log(
        &self,
        level: LogLevel,
        message: impl Into<String>,
        fields: std::collections::HashMap<String, serde_json::Value>,
    ) {
        let entry = LogEntry {
            timestamp: Utc::now(),
            level,
            module: self.module.clone(),
            message: message.into(),
            fields,
        };
        if let Ok(mut entries) = self.entries.lock() {
            entries.push(entry);
        }
    }

    pub fn info(&self, message: impl Into<String>) {
        self.log(LogLevel::Info, message, Default::default());
    }

    pub fn warn(&self, message: impl Into<String>) {
        self.log(LogLevel::Warn, message, Default::default());
    }

    pub fn error(&self, message: impl Into<String>) {
        self.log(LogLevel::Error, message, Default::default());
    }

    pub fn debug(&self, message: impl Into<String>) {
        self.log(LogLevel::Debug, message, Default::default());
    }

    /// Get all captured entries.
    pub fn entries(&self) -> Vec<LogEntry> {
        self.entries.lock().unwrap().clone()
    }

    /// Clear all entries.
    pub fn clear(&self) {
        self.entries.lock().unwrap().clear();
    }

    /// Export entries as JSON.
    pub fn export_json(&self) -> String {
        serde_json::to_string_pretty(&self.entries()).unwrap_or_default()
    }

    /// Export entries as NDJSON (newline-delimited JSON).
    pub fn export_ndjson(&self) -> String {
        self.entries()
            .iter()
            .map(|e| serde_json::to_string(e).unwrap_or_default())
            .collect::<Vec<_>>()
            .join("\n")
    }
}

// ── Trace Exporter ───────────────────────────────────────────────────────────

/// Exports event traces for debugging and replay.
pub struct TraceExporter;

impl TraceExporter {
    /// Write structured log entries to a JSON file.
    pub fn to_json_file(entries: &[LogEntry], path: impl Into<PathBuf>) -> std::io::Result<()> {
        let path = path.into();
        let json = serde_json::to_string_pretty(entries)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
        std::fs::write(path, json)
    }

    /// Write structured log entries to a CSV file.
    pub fn to_csv_file(entries: &[LogEntry], path: impl Into<PathBuf>) -> std::io::Result<()> {
        let path = path.into();
        let mut wtr = csv::Writer::from_path(path)?;
        wtr.write_record(["timestamp", "level", "module", "message", "fields"])?;
        for entry in entries {
            wtr.write_record(&[
                entry.timestamp.to_rfc3339(),
                entry.level.to_string(),
                entry.module.clone(),
                entry.message.clone(),
                serde_json::to_string(&entry.fields).unwrap_or_default(),
            ])?;
        }
        wtr.flush()?;
        Ok(())
    }

    /// Write log entries as NDJSON for streaming consumption.
    pub fn to_ndjson_file(entries: &[LogEntry], path: impl Into<PathBuf>) -> std::io::Result<()> {
        let path = path.into();
        let mut file = std::fs::File::create(path)?;
        for entry in entries {
            let json = serde_json::to_string(entry)
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
            writeln!(file, "{}", json)?;
        }
        Ok(())
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn logger_captures_entries() {
        let logger = StructuredLogger::new("test");
        logger.info("hello");
        logger.warn("warning");
        assert_eq!(logger.entries().len(), 2);
    }

    #[test]
    fn child_logger_shares_entries() {
        let parent = StructuredLogger::new("parent");
        let child = parent.child("child");
        parent.info("from parent");
        child.info("from child");
        assert_eq!(parent.entries().len(), 2);
        assert_eq!(parent.entries()[1].module, "parent::child");
    }

    #[test]
    fn export_json() {
        let logger = StructuredLogger::new("test");
        logger.info("msg");
        let json = logger.export_json();
        assert!(json.contains("msg"));
    }

    #[test]
    fn export_to_files() {
        let logger = StructuredLogger::new("test");
        logger.info("test message");

        let dir = tempfile::tempdir().unwrap();
        let entries = logger.entries();

        TraceExporter::to_json_file(&entries, dir.path().join("log.json")).unwrap();
        TraceExporter::to_csv_file(&entries, dir.path().join("log.csv")).unwrap();
        TraceExporter::to_ndjson_file(&entries, dir.path().join("log.ndjson")).unwrap();

        assert!(dir.path().join("log.json").exists());
        assert!(dir.path().join("log.csv").exists());
        assert!(dir.path().join("log.ndjson").exists());
    }
}
