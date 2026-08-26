-- RouteCore application persistence extension.
-- Stores the deterministic editor document while maintaining normalized
-- engineering and presentation projections in the baseline tables.

PRAGMA foreign_keys = ON;
PRAGMA trusted_schema = OFF;

BEGIN IMMEDIATE;

CREATE TABLE app_editor_document (
    id TEXT PRIMARY KEY,
    model_id TEXT NOT NULL REFERENCES design_model(id) ON DELETE CASCADE,
    page_id TEXT NOT NULL REFERENCES canvas_page(id) ON DELETE CASCADE,
    view_kind TEXT NOT NULL CHECK (view_kind IN ('layout', 'schematic')),
    schema_version INTEGER NOT NULL,
    document_revision INTEGER NOT NULL DEFAULT 0 CHECK (document_revision >= 0),
    content_hash TEXT NOT NULL,
    document_json TEXT NOT NULL CHECK (json_valid(document_json)),
    updated_at TEXT NOT NULL,
    UNIQUE (page_id, view_kind)
) STRICT;

CREATE INDEX ix_app_editor_document_model
ON app_editor_document(model_id, view_kind, updated_at DESC);

CREATE TABLE app_workspace_state (
    singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
    active_model_id TEXT REFERENCES design_model(id) ON DELETE SET NULL,
    active_page_id TEXT REFERENCES canvas_page(id) ON DELETE SET NULL,
    active_view_kind TEXT NOT NULL DEFAULT 'layout'
        CHECK (active_view_kind IN ('layout', 'schematic')),
    panel_state_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(panel_state_json)),
    viewport_state_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(viewport_state_json)),
    selected_entities_json TEXT NOT NULL DEFAULT '[]'
        CHECK (json_valid(selected_entities_json)),
    updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE app_component_definition (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'connector',
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    definition_json TEXT NOT NULL CHECK (json_valid(definition_json)),
    content_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    modified_at TEXT NOT NULL,
    UNIQUE (name, revision)
) STRICT;

CREATE TABLE app_cable_definition (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    part_number TEXT NOT NULL DEFAULT '',
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    definition_json TEXT NOT NULL CHECK (json_valid(definition_json)),
    content_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    modified_at TEXT NOT NULL,
    UNIQUE (name, revision)
) STRICT;

CREATE TABLE app_bom_item (
    id TEXT PRIMARY KEY,
    model_id TEXT NOT NULL REFERENCES design_model(id) ON DELETE CASCADE,
    entity_kind TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'primary',
    manufacturer TEXT NOT NULL DEFAULT '',
    part_number TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    quantity REAL NOT NULL DEFAULT 1 CHECK (quantity >= 0),
    unit TEXT NOT NULL DEFAULT 'each',
    supplier TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    properties_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(properties_json)),
    created_at TEXT NOT NULL,
    modified_at TEXT NOT NULL,
    UNIQUE (model_id, entity_kind, entity_id, role)
) STRICT;

CREATE INDEX ix_app_bom_item_model
ON app_bom_item(model_id, entity_kind, entity_id);

CREATE TABLE app_document_note (
    id TEXT PRIMARY KEY,
    model_id TEXT NOT NULL REFERENCES design_model(id) ON DELETE CASCADE,
    page_id TEXT REFERENCES canvas_page(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    x_lu REAL,
    y_lu REAL,
    created_at TEXT NOT NULL,
    modified_at TEXT NOT NULL
) STRICT;

CREATE TABLE app_export_profile (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    format TEXT NOT NULL,
    profile_json TEXT NOT NULL CHECK (json_valid(profile_json)),
    created_at TEXT NOT NULL,
    modified_at TEXT NOT NULL
) STRICT;

INSERT INTO schema_migration(version, name, applied_at, application_version, checksum)
VALUES (3, 'offline_studio_application_state', '2026-08-26T00:00:00Z', '0.3.0', 'APP-SCHEMA-0003');

COMMIT;
