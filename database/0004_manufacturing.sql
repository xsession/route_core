-- RouteCore manufacturing-detail schema extension.
-- Migration: 0004_manufacturing_detail
-- Requires: database/0003_application.sql version 3
-- Purpose: part configurations, tools/fixtures records, and project-level
-- manufacturing settings (designation strategy, formboard geometry). Project
-- settings live in project_setting(key, value_json); this file adds the
-- normalized tables that cannot be expressed as a single JSON setting.

PRAGMA foreign_keys = ON;
PRAGMA trusted_schema = OFF;

BEGIN IMMEDIATE;

-- A named combination of accessories/defaults applied to a component or
-- branch point when its part is assigned. Modeled as a reusable recipe keyed
-- by (model, component, configuration key) with a properties bag holding the
-- accessory part references and defaults (contact part, backshell, boots,
-- seal, lock, mount, strip lengths).
CREATE TABLE app_part_configuration (
    id TEXT PRIMARY KEY,
    model_id TEXT NOT NULL REFERENCES design_model(id) ON DELETE CASCADE,
    entity_kind TEXT NOT NULL
        CHECK (entity_kind IN ('component', 'branch_point', 'splice', 'cable')),
    entity_id TEXT NOT NULL,
    config_key TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    designation_strategy TEXT NOT NULL DEFAULT 'custom'
        CHECK (designation_strategy IN ('custom', 'sequential', 'alphabetical', 'grid', 'source')),
    grid_rows INTEGER CHECK (grid_rows IS NULL OR grid_rows > 0),
    grid_columns INTEGER CHECK (grid_columns IS NULL OR grid_columns > 0),
    properties_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(properties_json)),
    is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
    created_at TEXT NOT NULL,
    modified_at TEXT NOT NULL,
    UNIQUE (model_id, entity_kind, entity_id, config_key)
) STRICT;

CREATE INDEX ix_app_part_configuration_entity
ON app_part_configuration(model_id, entity_kind, entity_id);

-- Tools and fixtures needed to build the harness, printed on manufacturing
-- output. One row per tool, optionally scoped to a bundle or global to the
-- model.
CREATE TABLE app_tool_fixture (
    id TEXT PRIMARY KEY,
    model_id TEXT NOT NULL REFERENCES design_model(id) ON DELETE CASCADE,
    tool_key TEXT NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'tool'
        CHECK (kind IN ('tool', 'fixture', 'equipment', 'consumable')),
    part_number TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    bundle_id TEXT REFERENCES bundle(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    location_note TEXT NOT NULL DEFAULT '',
    properties_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(properties_json)),
    created_at TEXT NOT NULL,
    modified_at TEXT NOT NULL,
    UNIQUE (model_id, tool_key)
) STRICT;

CREATE INDEX ix_app_tool_fixture_model
ON app_tool_fixture(model_id, kind);

INSERT INTO schema_migration(version, name, applied_at, application_version, checksum)
VALUES (4, 'manufacturing_detail', '2026-09-10T00:00:00Z', '0.4.0', 'MANUFACTURING-0004');

COMMIT;
