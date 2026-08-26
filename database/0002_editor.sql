-- RouteCore editor-detail schema extension
-- Migration: 0002_visual_editor_state
-- Requires: DATABASE_SCHEMA.sql version 1
-- Purpose: normalized, portable persistence for component presentation,
-- labels, wire appearance, routing constraints, keep-outs, and rebuildable
-- route/label caches. Engineering connectivity remains authoritative in the
-- version-1 component/pin/conductor/bundle tables.

PRAGMA foreign_keys = ON;
PRAGMA trusted_schema = OFF;

BEGIN IMMEDIATE;

CREATE TABLE editor_component_view_state (
    id TEXT PRIMARY KEY,
    placement_id TEXT NOT NULL UNIQUE
        REFERENCES view_placement(id) ON DELETE CASCADE,
    definition_revision TEXT,
    sizing_mode TEXT NOT NULL DEFAULT 'auto'
        CHECK (sizing_mode IN ('auto', 'manual', 'minimum', 'fit_connected')),
    minimum_width_lu INTEGER NOT NULL DEFAULT 0 CHECK (minimum_width_lu >= 0),
    minimum_height_lu INTEGER NOT NULL DEFAULT 0 CHECK (minimum_height_lu >= 0),
    maximum_width_lu INTEGER CHECK (maximum_width_lu IS NULL OR maximum_width_lu >= minimum_width_lu),
    maximum_height_lu INTEGER CHECK (maximum_height_lu IS NULL OR maximum_height_lu >= minimum_height_lu),
    header_height_lu INTEGER NOT NULL DEFAULT 0 CHECK (header_height_lu >= 0),
    footer_height_lu INTEGER NOT NULL DEFAULT 0 CHECK (footer_height_lu >= 0),
    row_height_lu INTEGER NOT NULL DEFAULT 0 CHECK (row_height_lu >= 0),
    row_gap_lu INTEGER NOT NULL DEFAULT 0 CHECK (row_gap_lu >= 0),
    body_radius_lu INTEGER NOT NULL DEFAULT 0 CHECK (body_radius_lu >= 0),
    obstacle_padding_lu INTEGER NOT NULL DEFAULT 0 CHECK (obstacle_padding_lu >= 0),
    lead_in_lu INTEGER NOT NULL DEFAULT 0 CHECK (lead_in_lu >= 0),
    mirror_x INTEGER NOT NULL DEFAULT 0 CHECK (mirror_x IN (0, 1)),
    mirror_y INTEGER NOT NULL DEFAULT 0 CHECK (mirror_y IN (0, 1)),
    pin_visibility_mode TEXT NOT NULL DEFAULT 'all'
        CHECK (pin_visibility_mode IN ('all', 'connected', 'used_or_warned', 'custom')),
    layout_rules_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(layout_rules_json)),
    style_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(style_json)),
    modified_at TEXT NOT NULL
) STRICT;

CREATE TABLE editor_pin_bank_view (
    id TEXT PRIMARY KEY,
    component_view_state_id TEXT NOT NULL
        REFERENCES editor_component_view_state(id) ON DELETE CASCADE,
    bank_key TEXT NOT NULL,
    side TEXT NOT NULL CHECK (side IN ('north', 'east', 'south', 'west')),
    bank_order INTEGER NOT NULL DEFAULT 0,
    flow TEXT NOT NULL DEFAULT 'forward'
        CHECK (flow IN ('forward', 'reverse', 'center_out')),
    edge_padding_lu INTEGER NOT NULL DEFAULT 0 CHECK (edge_padding_lu >= 0),
    row_gap_lu INTEGER NOT NULL DEFAULT 0 CHECK (row_gap_lu >= 0),
    label_column_width_lu INTEGER CHECK (label_column_width_lu IS NULL OR label_column_width_lu >= 0),
    function_column_width_lu INTEGER CHECK (function_column_width_lu IS NULL OR function_column_width_lu >= 0),
    collapsed INTEGER NOT NULL DEFAULT 0 CHECK (collapsed IN (0, 1)),
    collapse_empty INTEGER NOT NULL DEFAULT 0 CHECK (collapse_empty IN (0, 1)),
    header_text TEXT,
    style_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(style_json)),
    UNIQUE (component_view_state_id, bank_key),
    UNIQUE (component_view_state_id, side, bank_order)
) STRICT;

CREATE INDEX ix_editor_pin_bank_view_component
ON editor_pin_bank_view(component_view_state_id, side, bank_order);

CREATE TABLE editor_port_view_override (
    id TEXT PRIMARY KEY,
    component_view_state_id TEXT NOT NULL
        REFERENCES editor_component_view_state(id) ON DELETE CASCADE,
    pin_id TEXT NOT NULL REFERENCES pin(id) ON DELETE CASCADE,
    bank_id TEXT REFERENCES editor_pin_bank_view(id) ON DELETE SET NULL,
    side_override TEXT
        CHECK (side_override IS NULL OR side_override IN ('north', 'east', 'south', 'west')),
    display_order INTEGER,
    side_fraction_ppm INTEGER
        CHECK (side_fraction_ppm IS NULL OR side_fraction_ppm BETWEEN 0 AND 1000000),
    tangent_offset_lu INTEGER NOT NULL DEFAULT 0,
    normal_offset_lu INTEGER NOT NULL DEFAULT 0,
    minimum_row_height_lu INTEGER CHECK (minimum_row_height_lu IS NULL OR minimum_row_height_lu >= 0),
    label_override TEXT,
    function_override TEXT,
    detail_override TEXT,
    visible INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0, 1)),
    label_visible INTEGER NOT NULL DEFAULT 1 CHECK (label_visible IN (0, 1)),
    function_visible INTEGER NOT NULL DEFAULT 1 CHECK (function_visible IN (0, 1)),
    style_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(style_json)),
    UNIQUE (component_view_state_id, pin_id)
) STRICT;

CREATE INDEX ix_editor_port_view_override_bank
ON editor_port_view_override(bank_id, display_order);

CREATE TABLE editor_label (
    id TEXT PRIMARY KEY,
    model_id TEXT NOT NULL REFERENCES design_model(id) ON DELETE CASCADE,
    page_id TEXT REFERENCES canvas_page(id) ON DELETE CASCADE,
    view_kind TEXT NOT NULL CHECK (view_kind IN ('layout', 'schematic', 'documentation')),
    owner_kind TEXT NOT NULL
        CHECK (owner_kind IN ('component', 'pin', 'bundle', 'conductor', 'mate', 'splice', 'branch_point', 'visual_group', 'free')),
    owner_id TEXT,
    secondary_owner_id TEXT,
    label_role TEXT NOT NULL DEFAULT 'name'
        CHECK (label_role IN ('name', 'designator', 'pin', 'function', 'wire_id', 'signal', 'length', 'bundle', 'note', 'off_page', 'custom')),
    text_value TEXT NOT NULL DEFAULT '',
    secondary_text TEXT,
    placement_mode TEXT NOT NULL DEFAULT 'auto'
        CHECK (placement_mode IN ('auto', 'owner_relative', 'world_pinned')),
    anchor_kind TEXT NOT NULL DEFAULT 'center'
        CHECK (anchor_kind IN ('center', 'port', 'path_fraction', 'segment', 'point', 'side')),
    anchor_x_lu INTEGER,
    anchor_y_lu INTEGER,
    path_fraction_ppm INTEGER
        CHECK (path_fraction_ppm IS NULL OR path_fraction_ppm BETWEEN 0 AND 1000000),
    segment_index INTEGER CHECK (segment_index IS NULL OR segment_index >= 0),
    preferred_side TEXT
        CHECK (preferred_side IS NULL OR preferred_side IN ('north', 'north_east', 'east', 'south_east', 'south', 'south_west', 'west', 'north_west', 'inside_header', 'inside_body')),
    offset_x_lu INTEGER NOT NULL DEFAULT 0,
    offset_y_lu INTEGER NOT NULL DEFAULT 0,
    world_x_lu INTEGER,
    world_y_lu INTEGER,
    orientation TEXT NOT NULL DEFAULT 'horizontal'
        CHECK (orientation IN ('horizontal', 'vertical', 'follow_segment')),
    priority INTEGER NOT NULL DEFAULT 0,
    avoid_components INTEGER NOT NULL DEFAULT 1 CHECK (avoid_components IN (0, 1)),
    avoid_wires INTEGER NOT NULL DEFAULT 1 CHECK (avoid_wires IN (0, 1)),
    allow_leader INTEGER NOT NULL DEFAULT 1 CHECK (allow_leader IN (0, 1)),
    visible INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0, 1)),
    locked INTEGER NOT NULL DEFAULT 0 CHECK (locked IN (0, 1)),
    style_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(style_json)),
    modified_at TEXT NOT NULL,
    CHECK ((owner_kind = 'free' AND owner_id IS NULL) OR (owner_kind <> 'free' AND owner_id IS NOT NULL)),
    CHECK (placement_mode <> 'world_pinned' OR (world_x_lu IS NOT NULL AND world_y_lu IS NOT NULL))
) STRICT;

CREATE INDEX ix_editor_label_page_owner
ON editor_label(page_id, view_kind, owner_kind, owner_id);

CREATE INDEX ix_editor_label_visible_priority
ON editor_label(page_id, view_kind, visible, priority DESC);

CREATE TABLE editor_wire_appearance (
    id TEXT PRIMARY KEY,
    model_id TEXT NOT NULL REFERENCES design_model(id) ON DELETE CASCADE,
    page_id TEXT REFERENCES canvas_page(id) ON DELETE CASCADE,
    view_kind TEXT NOT NULL CHECK (view_kind IN ('layout', 'schematic', 'documentation')),
    owner_kind TEXT NOT NULL
        CHECK (owner_kind IN ('bundle', 'conductor', 'mate', 'annotation', 'off_page_stub')),
    owner_id TEXT NOT NULL,
    route_branch TEXT NOT NULL DEFAULT 'main',
    path_style TEXT NOT NULL DEFAULT 'orthogonal'
        CHECK (path_style IN ('orthogonal', 'straight', 'bezier', 'manual')),
    route_pattern TEXT NOT NULL DEFAULT 'orthogonal'
        CHECK (route_pattern IN ('direct', 'orthogonal', 'horizontal_first', 'vertical_first', 'dogleg_horizontal', 'dogleg_vertical', 'trunk_horizontal', 'trunk_vertical', 'manual')),
    color_pattern TEXT NOT NULL DEFAULT 'solid'
        CHECK (color_pattern IN ('solid', 'stripe', 'tracer', 'dual', 'shield', 'bundle_sheath', 'custom')),
    primary_color TEXT NOT NULL DEFAULT '#4b5563',
    secondary_color TEXT,
    tertiary_color TEXT,
    stroke_width_lu INTEGER NOT NULL DEFAULT 3 CHECK (stroke_width_lu > 0),
    outline_width_lu INTEGER NOT NULL DEFAULT 1 CHECK (outline_width_lu >= 0),
    stripe_width_lu INTEGER CHECK (stripe_width_lu IS NULL OR stripe_width_lu > 0),
    pattern_repeat_lu INTEGER CHECK (pattern_repeat_lu IS NULL OR pattern_repeat_lu > 0),
    opacity_ppm INTEGER NOT NULL DEFAULT 1000000 CHECK (opacity_ppm BETWEEN 0 AND 1000000),
    line_cap TEXT NOT NULL DEFAULT 'round' CHECK (line_cap IN ('butt', 'round', 'square')),
    line_join TEXT NOT NULL DEFAULT 'round' CHECK (line_join IN ('miter', 'round', 'bevel')),
    requested_radius_lu INTEGER NOT NULL DEFAULT 0 CHECK (requested_radius_lu >= 0),
    clearance_lu INTEGER NOT NULL DEFAULT 0 CHECK (clearance_lu >= 0),
    lead_in_lu INTEGER NOT NULL DEFAULT 0 CHECK (lead_in_lu >= 0),
    minimum_segment_lu INTEGER NOT NULL DEFAULT 0 CHECK (minimum_segment_lu >= 0),
    z_order INTEGER NOT NULL DEFAULT 0,
    style_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(style_json)),
    modified_at TEXT NOT NULL,
    UNIQUE (page_id, view_kind, owner_kind, owner_id, route_branch)
) STRICT;

CREATE INDEX ix_editor_wire_appearance_page_z
ON editor_wire_appearance(page_id, view_kind, z_order, owner_kind, owner_id);

CREATE TABLE editor_route_constraint (
    id TEXT PRIMARY KEY,
    model_id TEXT NOT NULL REFERENCES design_model(id) ON DELETE CASCADE,
    page_id TEXT REFERENCES canvas_page(id) ON DELETE CASCADE,
    view_kind TEXT NOT NULL CHECK (view_kind IN ('layout', 'schematic', 'documentation')),
    owner_kind TEXT NOT NULL
        CHECK (owner_kind IN ('bundle', 'conductor', 'mate', 'annotation', 'off_page_stub')),
    owner_id TEXT NOT NULL,
    route_branch TEXT NOT NULL DEFAULT 'main',
    constraint_order INTEGER NOT NULL DEFAULT 0,
    constraint_kind TEXT NOT NULL
        CHECK (constraint_kind IN ('waypoint', 'locked_waypoint', 'locked_segment', 'corridor_horizontal', 'corridor_vertical', 'avoid_rect', 'prefer_rect', 'exit_side', 'trunk_coordinate')),
    strength TEXT NOT NULL DEFAULT 'strong'
        CHECK (strength IN ('soft', 'strong', 'hard')),
    owner_frame TEXT NOT NULL DEFAULT 'world'
        CHECK (owner_frame IN ('world', 'source', 'target')),
    x_lu INTEGER,
    y_lu INTEGER,
    rect_x_lu INTEGER,
    rect_y_lu INTEGER,
    rect_width_lu INTEGER CHECK (rect_width_lu IS NULL OR rect_width_lu >= 0),
    rect_height_lu INTEGER CHECK (rect_height_lu IS NULL OR rect_height_lu >= 0),
    coordinate_lu INTEGER,
    segment_index INTEGER CHECK (segment_index IS NULL OR segment_index >= 0),
    side TEXT CHECK (side IS NULL OR side IN ('north', 'east', 'south', 'west')),
    locked INTEGER NOT NULL DEFAULT 0 CHECK (locked IN (0, 1)),
    metadata_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(metadata_json)),
    modified_at TEXT NOT NULL,
    UNIQUE (page_id, view_kind, owner_kind, owner_id, route_branch, constraint_order)
) STRICT;

CREATE INDEX ix_editor_route_constraint_owner
ON editor_route_constraint(page_id, view_kind, owner_kind, owner_id, route_branch, constraint_order);

CREATE TABLE editor_keepout_zone (
    id TEXT PRIMARY KEY,
    model_id TEXT NOT NULL REFERENCES design_model(id) ON DELETE CASCADE,
    page_id TEXT REFERENCES canvas_page(id) ON DELETE CASCADE,
    view_kind TEXT NOT NULL CHECK (view_kind IN ('layout', 'schematic', 'documentation')),
    name TEXT NOT NULL DEFAULT '',
    zone_kind TEXT NOT NULL DEFAULT 'hard'
        CHECK (zone_kind IN ('hard', 'soft', 'preferred_channel', 'label_only', 'wire_only')),
    geometry_kind TEXT NOT NULL DEFAULT 'rect'
        CHECK (geometry_kind IN ('rect', 'polygon')),
    x_lu INTEGER,
    y_lu INTEGER,
    width_lu INTEGER CHECK (width_lu IS NULL OR width_lu >= 0),
    height_lu INTEGER CHECK (height_lu IS NULL OR height_lu >= 0),
    geometry_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(geometry_json)),
    visible INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0, 1)),
    locked INTEGER NOT NULL DEFAULT 0 CHECK (locked IN (0, 1)),
    style_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(style_json)),
    modified_at TEXT NOT NULL
) STRICT;

CREATE INDEX ix_editor_keepout_zone_page
ON editor_keepout_zone(page_id, view_kind, zone_kind);

CREATE TABLE editor_view_preference (
    id TEXT PRIMARY KEY,
    model_id TEXT NOT NULL REFERENCES design_model(id) ON DELETE CASCADE,
    page_id TEXT REFERENCES canvas_page(id) ON DELETE CASCADE,
    view_kind TEXT NOT NULL CHECK (view_kind IN ('layout', 'schematic', 'documentation')),
    actor_id TEXT NOT NULL,
    grid_visible INTEGER NOT NULL DEFAULT 1 CHECK (grid_visible IN (0, 1)),
    grid_snap INTEGER NOT NULL DEFAULT 1 CHECK (grid_snap IN (0, 1)),
    grid_spacing_lu INTEGER NOT NULL DEFAULT 10 CHECK (grid_spacing_lu > 0),
    major_grid_every INTEGER NOT NULL DEFAULT 5 CHECK (major_grid_every > 0),
    grid_opacity_ppm INTEGER NOT NULL DEFAULT 320000 CHECK (grid_opacity_ppm BETWEEN 0 AND 1000000),
    background_color TEXT NOT NULL DEFAULT '#f7f8fa',
    grid_color TEXT,
    display_mode TEXT NOT NULL DEFAULT 'engineering'
        CHECK (display_mode IN ('engineering', 'bundles_only', 'bundles_and_conductors', 'conductors_only', 'documentation')),
    show_ports INTEGER NOT NULL DEFAULT 1 CHECK (show_ports IN (0, 1)),
    show_labels INTEGER NOT NULL DEFAULT 1 CHECK (show_labels IN (0, 1)),
    show_diagnostics INTEGER NOT NULL DEFAULT 1 CHECK (show_diagnostics IN (0, 1)),
    scroll_mode TEXT NOT NULL DEFAULT 'auto'
        CHECK (scroll_mode IN ('auto', 'zoom', 'pan')),
    zoom_sensitivity_ppm INTEGER NOT NULL DEFAULT 1000000 CHECK (zoom_sensitivity_ppm BETWEEN 100000 AND 4000000),
    preference_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(preference_json)),
    modified_at TEXT NOT NULL,
    UNIQUE (page_id, view_kind, actor_id)
) STRICT;

-- Rebuildable route cache. Never use it as engineering or command truth.
CREATE TABLE editor_route_cache (
    cache_key TEXT PRIMARY KEY,
    model_id TEXT NOT NULL REFERENCES design_model(id) ON DELETE CASCADE,
    page_id TEXT REFERENCES canvas_page(id) ON DELETE CASCADE,
    view_kind TEXT NOT NULL CHECK (view_kind IN ('layout', 'schematic', 'documentation')),
    owner_kind TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    route_branch TEXT NOT NULL DEFAULT 'main',
    input_hash TEXT NOT NULL,
    router_version TEXT NOT NULL,
    points_json TEXT NOT NULL CHECK (json_valid(points_json)),
    result_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(result_json)),
    generated_at TEXT NOT NULL,
    UNIQUE (page_id, view_kind, owner_kind, owner_id, route_branch, input_hash, router_version)
) STRICT;

CREATE INDEX ix_editor_route_cache_owner
ON editor_route_cache(page_id, view_kind, owner_kind, owner_id, route_branch);

-- Rebuildable label placement cache. Manual label intent remains in editor_label.
CREATE TABLE editor_label_placement_cache (
    label_id TEXT PRIMARY KEY REFERENCES editor_label(id) ON DELETE CASCADE,
    input_hash TEXT NOT NULL,
    placer_version TEXT NOT NULL,
    x_lu INTEGER NOT NULL,
    y_lu INTEGER NOT NULL,
    width_lu INTEGER NOT NULL CHECK (width_lu >= 0),
    height_lu INTEGER NOT NULL CHECK (height_lu >= 0),
    rotation_udeg INTEGER NOT NULL DEFAULT 0,
    placement_status TEXT NOT NULL
        CHECK (placement_status IN ('placed', 'overlap', 'invalid_anchor')),
    collisions_json TEXT NOT NULL DEFAULT '[]'
        CHECK (json_valid(collisions_json)),
    generated_at TEXT NOT NULL
) STRICT;

INSERT INTO schema_migration(version, name, applied_at, application_version, checksum)
VALUES (2, 'visual_editor_state', '2026-08-26T00:00:00Z', '0.2.0', 'EDITOR-SPEC-0002');

COMMIT;
