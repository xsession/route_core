PRAGMA foreign_keys = ON;
PRAGMA trusted_schema = OFF;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS app_migration (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS setting (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL CHECK (json_valid(value_json)),
    modified_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS recent_project (
    path TEXT PRIMARY KEY,
    project_uuid TEXT,
    name TEXT NOT NULL,
    last_opened_at TEXT NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
    missing INTEGER NOT NULL DEFAULT 0 CHECK (missing IN (0, 1))
) STRICT;

CREATE INDEX IF NOT EXISTS ix_recent_project_opened
ON recent_project(pinned DESC, last_opened_at DESC);

CREATE TABLE IF NOT EXISTS library_component (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    manufacturer TEXT NOT NULL DEFAULT '',
    part_number TEXT NOT NULL DEFAULT '',
    tags_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags_json)),
    definition_json TEXT NOT NULL CHECK (json_valid(definition_json)),
    content_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    modified_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS library_cable (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    manufacturer TEXT NOT NULL DEFAULT '',
    part_number TEXT NOT NULL DEFAULT '',
    tags_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags_json)),
    definition_json TEXT NOT NULL CHECK (json_valid(definition_json)),
    content_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    modified_at TEXT NOT NULL
) STRICT;

INSERT OR IGNORE INTO app_migration(version, name, applied_at)
VALUES (1, 'initial_application_database', '2026-08-26T00:00:00Z');
