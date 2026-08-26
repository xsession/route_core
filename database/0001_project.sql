-- RouteCore project database schema baseline
-- Document: RouteCore-CRS-001
-- Target: SQLite 3.45+ with JSON1 and FTS5
-- This is an independently designed schema. It is not a representation of
-- any private Splice CAD database.

PRAGMA foreign_keys = ON;
PRAGMA trusted_schema = OFF;
PRAGMA recursive_triggers = OFF;

BEGIN IMMEDIATE;

CREATE TABLE schema_migration (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL,
    application_version TEXT NOT NULL,
    checksum TEXT NOT NULL
) STRICT;

CREATE TABLE project_meta (
    singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
    project_uuid TEXT NOT NULL UNIQUE,
    format_semver TEXT NOT NULL,
    minimum_reader_semver TEXT NOT NULL,
    created_by_app_semver TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    organization TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'review', 'released', 'obsolete')),
    default_length_unit TEXT NOT NULL DEFAULT 'mm'
        CHECK (default_length_unit IN ('mm', 'cm', 'm', 'in', 'ft')),
    default_wire_unit TEXT NOT NULL DEFAULT 'awg'
        CHECK (default_wire_unit IN ('awg', 'mm2')),
    local_actor_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    modified_at TEXT NOT NULL,
    feature_flags_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(feature_flags_json)),
    extra_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(extra_json))
) STRICT;

CREATE TABLE project_setting (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL CHECK (json_valid(value_json)),
    modified_at TEXT NOT NULL
) STRICT;

CREATE TABLE design_model (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('plan', 'assembly')),
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    designator TEXT,
    source_mode TEXT NOT NULL DEFAULT 'native'
        CHECK (source_mode IN ('native', 'generated', 'quick_assembly', 'imported')),
    lifecycle_state TEXT NOT NULL DEFAULT 'draft'
        CHECK (lifecycle_state IN ('draft', 'review', 'released', 'obsolete')),
    created_at TEXT NOT NULL,
    modified_at TEXT NOT NULL,
    deleted_at TEXT,
    extra_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(extra_json))
) STRICT;

CREATE UNIQUE INDEX ux_design_model_single_plan
ON design_model(kind)
WHERE kind = 'plan' AND deleted_at IS NULL;

CREATE TABLE canvas_page (
    id TEXT PRIMARY KEY,
    model_id TEXT NOT NULL REFERENCES design_model(id) ON DELETE CASCADE,
    view_kind TEXT NOT NULL CHECK (view_kind IN ('layout', 'schematic')),
    name TEXT NOT NULL,
    page_order INTEGER NOT NULL,
    width_um INTEGER,
    height_um INTEGER,
    orientation TEXT CHECK (orientation IS NULL OR orientation IN ('portrait', 'landscape')),
    is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
    viewport_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(viewport_json)),
    layer_state_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(layer_state_json)),
    created_at TEXT NOT NULL,
    modified_at TEXT NOT NULL,
    UNIQUE (model_id, view_kind, name),
    UNIQUE (model_id, view_kind, page_order)
) STRICT;

CREATE TABLE part_snapshot (
    id TEXT PRIMARY KEY,
    part_kind TEXT NOT NULL,
    source_namespace TEXT,
    source_part_id TEXT,
    source_revision TEXT,
    source_license TEXT,
    source_url TEXT,
    manufacturer TEXT NOT NULL DEFAULT '',
    mpn TEXT NOT NULL DEFAULT '',
    internal_part_number TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT '',
    lifecycle_state TEXT NOT NULL DEFAULT 'unknown'
        CHECK (lifecycle_state IN ('unknown', 'active', 'nrnd', 'obsolete', 'blocked')),
    content_hash TEXT NOT NULL,
    captured_at TEXT NOT NULL,
    specification_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(specification_json)),
    attribution_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(attribution_json)),
    extra_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(extra_json))
) STRICT;

CREATE INDEX ix_part_snapshot_mpn
ON part_snapshot(manufacturer, mpn, part_kind);

CREATE TABLE part_spec (
    id TEXT PRIMARY KEY,
    part_snapshot_id TEXT NOT NULL REFERENCES part_snapshot(id) ON DELETE CASCADE,
    namespace TEXT NOT NULL,
    key TEXT NOT NULL,
    value_type TEXT NOT NULL
        CHECK (value_type IN ('text', 'integer', 'decimal', 'boolean', 'enum', 'json')),
    value_text TEXT,
    value_integer INTEGER,
    value_real REAL,
    value_json TEXT CHECK (value_json IS NULL OR json_valid(value_json)),
    unit TEXT,
    source TEXT,
    UNIQUE (part_snapshot_id, namespace, key)
) STRICT;

CREATE TABLE part_compatibility (
    id TEXT PRIMARY KEY,
    source_part_id TEXT NOT NULL REFERENCES part_snapshot(id) ON DELETE CASCADE,
    target_part_id TEXT REFERENCES part_snapshot(id) ON DELETE CASCADE,
    target_kind TEXT,
    relation TEXT NOT NULL,
    rule_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(rule_json)),
    severity TEXT NOT NULL DEFAULT 'error'
        CHECK (severity IN ('info', 'warning', 'error', 'blocker')),
    created_at TEXT NOT NULL
) STRICT;

CREATE TABLE component (
    id TEXT PRIMARY KEY,
    model_id TEXT NOT NULL REFERENCES design_model(id) ON DELETE CASCADE,
    definition_part_id TEXT REFERENCES part_snapshot(id) ON DELETE SET NULL,
    designator TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL,
    component_kind TEXT NOT NULL
        CHECK (component_kind IN ('connector', 'terminal_point', 'termination', 'generic_device', 'inline_device', 'protection_device', 'custom')),
    manufacturer TEXT NOT NULL DEFAULT '',
    mpn TEXT NOT NULL DEFAULT '',
    lifecycle_state TEXT NOT NULL DEFAULT 'draft'
        CHECK (lifecycle_state IN ('draft', 'review', 'released', 'obsolete')),
    rotation_layout_udeg INTEGER NOT NULL DEFAULT 0,
    rotation_schematic_udeg INTEGER NOT NULL DEFAULT 0,
    symbol_revision TEXT,
    custom_properties_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(custom_properties_json)),
    created_at TEXT NOT NULL,
    modified_at TEXT NOT NULL,
    deleted_at TEXT,
    UNIQUE (model_id, designator)
) STRICT;

CREATE INDEX ix_component_model_kind
ON component(model_id, component_kind);

CREATE TABLE pin (
    id TEXT PRIMARY KEY,
    component_id TEXT NOT NULL REFERENCES component(id) ON DELETE CASCADE,
    pin_index INTEGER NOT NULL,
    label TEXT NOT NULL,
    function TEXT NOT NULL DEFAULT '',
    detail TEXT NOT NULL DEFAULT '',
    electrical_class TEXT NOT NULL DEFAULT 'unspecified',
    gender TEXT NOT NULL DEFAULT 'none'
        CHECK (gender IN ('none', 'male', 'female', 'mixed', 'unknown')),
    connection_limit INTEGER NOT NULL DEFAULT 1 CHECK (connection_limit >= 0),
    current_limit_ua INTEGER,
    voltage_min_uv INTEGER,
    voltage_max_uv INTEGER,
    contact_size TEXT,
    wire_area_min_um2 INTEGER,
    wire_area_max_um2 INTEGER,
    sealing_required INTEGER NOT NULL DEFAULT 0 CHECK (sealing_required IN (0, 1)),
    properties_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(properties_json)),
    UNIQUE (component_id, pin_index),
    UNIQUE (component_id, label)
) STRICT;

CREATE INDEX ix_pin_component_function
ON pin(component_id, function);

CREATE TABLE pin_bridge_group (
    id TEXT PRIMARY KEY,
    component_id TEXT NOT NULL REFERENCES component(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT '',
    bridge_kind TEXT NOT NULL DEFAULT 'internal'
        CHECK (bridge_kind IN ('internal', 'configurable')),
    properties_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(properties_json))
) STRICT;

CREATE TABLE pin_bridge_member (
    bridge_group_id TEXT NOT NULL REFERENCES pin_bridge_group(id) ON DELETE CASCADE,
    pin_id TEXT NOT NULL REFERENCES pin(id) ON DELETE CASCADE,
    PRIMARY KEY (bridge_group_id, pin_id)
) STRICT, WITHOUT ROWID;

CREATE TABLE mate (
    id TEXT PRIMARY KEY,
    model_id TEXT NOT NULL REFERENCES design_model(id) ON DELETE CASCADE,
    component_a_id TEXT NOT NULL REFERENCES component(id) ON DELETE CASCADE,
    component_b_id TEXT NOT NULL REFERENCES component(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT '',
    compatibility_state TEXT NOT NULL DEFAULT 'unchecked'
        CHECK (compatibility_state IN ('unchecked', 'compatible', 'warning', 'incompatible', 'overridden')),
    override_reason TEXT,
    properties_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(properties_json)),
    created_at TEXT NOT NULL,
    CHECK (component_a_id <> component_b_id),
    UNIQUE (model_id, component_a_id, component_b_id)
) STRICT;

CREATE TABLE mate_pin_map (
    mate_id TEXT NOT NULL REFERENCES mate(id) ON DELETE CASCADE,
    pin_a_id TEXT NOT NULL REFERENCES pin(id) ON DELETE CASCADE,
    pin_b_id TEXT NOT NULL REFERENCES pin(id) ON DELETE CASCADE,
    map_order INTEGER NOT NULL,
    PRIMARY KEY (mate_id, pin_a_id, pin_b_id),
    UNIQUE (mate_id, map_order)
) STRICT, WITHOUT ROWID;

CREATE TABLE device_group (
    id TEXT PRIMARY KEY,
    model_id TEXT NOT NULL REFERENCES design_model(id) ON DELETE CASCADE,
    designator TEXT,
    name TEXT NOT NULL,
    part_snapshot_id TEXT REFERENCES part_snapshot(id) ON DELETE SET NULL,
    properties_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(properties_json)),
    UNIQUE (model_id, designator)
) STRICT;

CREATE TABLE device_group_member (
    device_group_id TEXT NOT NULL REFERENCES device_group(id) ON DELETE CASCADE,
    component_id TEXT NOT NULL REFERENCES component(id) ON DELETE CASCADE,
    member_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (device_group_id, component_id)
) STRICT, WITHOUT ROWID;

CREATE TABLE branch_point (
    id TEXT PRIMARY KEY,
    model_id TEXT NOT NULL REFERENCES design_model(id) ON DELETE CASCADE,
    designator TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    branch_kind TEXT NOT NULL DEFAULT 'passive'
        CHECK (branch_kind IN ('passive', 'splice_host', 'transition', 'breakout', 'custom')),
    part_snapshot_id TEXT REFERENCES part_snapshot(id) ON DELETE SET NULL,
    properties_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(properties_json)),
    created_at TEXT NOT NULL,
    modified_at TEXT NOT NULL,
    UNIQUE (model_id, designator)
) STRICT;

CREATE TABLE bundle (
    id TEXT PRIMARY KEY,
    model_id TEXT NOT NULL REFERENCES design_model(id) ON DELETE CASCADE,
    designator TEXT,
    name TEXT NOT NULL DEFAULT '',
    start_node_kind TEXT NOT NULL
        CHECK (start_node_kind IN ('component', 'branch_point', 'route_node', 'boundary')),
    start_node_id TEXT NOT NULL,
    end_node_kind TEXT NOT NULL
        CHECK (end_node_kind IN ('component', 'branch_point', 'route_node', 'boundary')),
    end_node_id TEXT NOT NULL,
    nominal_length_um INTEGER CHECK (nominal_length_um IS NULL OR nominal_length_um >= 0),
    tolerance_minus_um INTEGER CHECK (tolerance_minus_um IS NULL OR tolerance_minus_um >= 0),
    tolerance_plus_um INTEGER CHECK (tolerance_plus_um IS NULL OR tolerance_plus_um >= 0),
    measurement_method TEXT NOT NULL DEFAULT 'centerline',
    color_token TEXT,
    diameter_override_um INTEGER,
    route_locked INTEGER NOT NULL DEFAULT 0 CHECK (route_locked IN (0, 1)),
    properties_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(properties_json)),
    created_at TEXT NOT NULL,
    modified_at TEXT NOT NULL,
    CHECK (start_node_id <> end_node_id),
    UNIQUE (model_id, designator)
) STRICT;

CREATE INDEX ix_bundle_model_nodes
ON bundle(model_id, start_node_id, end_node_id);

CREATE TABLE route_point (
    id TEXT PRIMARY KEY,
    model_id TEXT NOT NULL REFERENCES design_model(id) ON DELETE CASCADE,
    owner_kind TEXT NOT NULL
        CHECK (owner_kind IN ('bundle', 'conductor', 'mate', 'annotation', 'assembly_view')),
    owner_id TEXT NOT NULL,
    view_kind TEXT NOT NULL
        CHECK (view_kind IN ('layout', 'schematic', 'documentation')),
    page_id TEXT REFERENCES canvas_page(id) ON DELETE CASCADE,
    route_branch TEXT NOT NULL DEFAULT 'main',
    point_order INTEGER NOT NULL,
    point_kind TEXT NOT NULL DEFAULT 'waypoint'
        CHECK (point_kind IN ('endpoint', 'waypoint', 'bend', 'control_in', 'control_out', 'anchor')),
    x_lu INTEGER NOT NULL,
    y_lu INTEGER NOT NULL,
    locked INTEGER NOT NULL DEFAULT 0 CHECK (locked IN (0, 1)),
    properties_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(properties_json)),
    UNIQUE (owner_kind, owner_id, view_kind, page_id, route_branch, point_order)
) STRICT;

CREATE INDEX ix_route_point_page
ON route_point(page_id, owner_kind, owner_id);

CREATE TABLE conductor (
    id TEXT PRIMARY KEY,
    model_id TEXT NOT NULL REFERENCES design_model(id) ON DELETE CASCADE,
    designator TEXT,
    name TEXT NOT NULL DEFAULT '',
    conductor_kind TEXT NOT NULL DEFAULT 'discrete_wire'
        CHECK (conductor_kind IN ('discrete_wire', 'cable_core', 'shield', 'drain', 'pigtail', 'flying_lead', 'jumper_wire')),
    route_state TEXT NOT NULL DEFAULT 'unrouted'
        CHECK (route_state IN ('unrouted', 'partial', 'routed', 'invalid')),
    gauge_awg_x100 INTEGER,
    cross_section_um2 INTEGER,
    color_code TEXT,
    stripe_code TEXT,
    material TEXT,
    stranding TEXT,
    voltage_rating_uv INTEGER,
    temperature_rating_mk INTEGER,
    explicit_length_um INTEGER,
    service_loop_um INTEGER NOT NULL DEFAULT 0,
    strip_allowance_um INTEGER NOT NULL DEFAULT 0,
    source_kind TEXT NOT NULL DEFAULT 'cut_from_stock'
        CHECK (source_kind IN ('cut_from_stock', 'included_with_component', 'included_with_cable', 'user_defined')),
    properties_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(properties_json)),
    created_at TEXT NOT NULL,
    modified_at TEXT NOT NULL,
    UNIQUE (model_id, designator)
) STRICT;

CREATE INDEX ix_conductor_model_kind
ON conductor(model_id, conductor_kind);

CREATE TABLE conductor_endpoint (
    id TEXT PRIMARY KEY,
    conductor_id TEXT NOT NULL REFERENCES conductor(id) ON DELETE CASCADE,
    endpoint_order INTEGER NOT NULL,
    target_kind TEXT NOT NULL
        CHECK (target_kind IN ('pin', 'splice_port', 'flying_lead', 'boundary_port', 'junction')),
    target_id TEXT NOT NULL,
    connection_side TEXT NOT NULL DEFAULT 'unspecified'
        CHECK (connection_side IN ('unspecified', 'left', 'right', 'top', 'bottom', 'front', 'back')),
    termination_method TEXT,
    pigtail_length_um INTEGER,
    properties_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(properties_json)),
    UNIQUE (conductor_id, endpoint_order),
    UNIQUE (conductor_id, target_kind, target_id)
) STRICT;

CREATE INDEX ix_conductor_endpoint_target
ON conductor_endpoint(target_kind, target_id);

CREATE TABLE conductor_path (
    id TEXT PRIMARY KEY,
    conductor_id TEXT NOT NULL REFERENCES conductor(id) ON DELETE CASCADE,
    parent_path_id TEXT REFERENCES conductor_path(id) ON DELETE CASCADE,
    path_role TEXT NOT NULL DEFAULT 'main'
        CHECK (path_role IN ('main', 'branch', 'service_loop', 'shield_tail')),
    start_anchor_kind TEXT NOT NULL,
    start_anchor_id TEXT NOT NULL,
    end_anchor_kind TEXT NOT NULL,
    end_anchor_id TEXT NOT NULL,
    path_order INTEGER NOT NULL DEFAULT 0,
    properties_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(properties_json)),
    UNIQUE (conductor_id, path_order)
) STRICT;

CREATE TABLE conductor_path_bundle (
    conductor_path_id TEXT NOT NULL REFERENCES conductor_path(id) ON DELETE CASCADE,
    path_order INTEGER NOT NULL,
    bundle_id TEXT NOT NULL REFERENCES bundle(id) ON DELETE RESTRICT,
    direction INTEGER NOT NULL CHECK (direction IN (-1, 1)),
    PRIMARY KEY (conductor_path_id, path_order),
    UNIQUE (conductor_path_id, bundle_id, path_order)
) STRICT, WITHOUT ROWID;

CREATE INDEX ix_conductor_path_bundle_bundle
ON conductor_path_bundle(bundle_id);

CREATE TABLE splice (
    id TEXT PRIMARY KEY,
    model_id TEXT NOT NULL REFERENCES design_model(id) ON DELETE CASCADE,
    branch_point_id TEXT REFERENCES branch_point(id) ON DELETE SET NULL,
    designator TEXT NOT NULL,
    splice_type TEXT NOT NULL DEFAULT 'unspecified',
    part_snapshot_id TEXT REFERENCES part_snapshot(id) ON DELETE SET NULL,
    properties_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(properties_json)),
    created_at TEXT NOT NULL,
    modified_at TEXT NOT NULL,
    UNIQUE (model_id, designator)
) STRICT;

CREATE TABLE splice_member (
    splice_id TEXT NOT NULL REFERENCES splice(id) ON DELETE CASCADE,
    conductor_endpoint_id TEXT NOT NULL REFERENCES conductor_endpoint(id) ON DELETE CASCADE,
    member_order INTEGER NOT NULL,
    PRIMARY KEY (splice_id, conductor_endpoint_id),
    UNIQUE (splice_id, member_order),
    UNIQUE (conductor_endpoint_id)
) STRICT, WITHOUT ROWID;

CREATE TABLE jumper (
    id TEXT PRIMARY KEY,
    model_id TEXT NOT NULL REFERENCES design_model(id) ON DELETE CASCADE,
    component_id TEXT NOT NULL REFERENCES component(id) ON DELETE CASCADE,
    designator TEXT NOT NULL,
    jumper_kind TEXT NOT NULL DEFAULT 'bar',
    part_snapshot_id TEXT REFERENCES part_snapshot(id) ON DELETE SET NULL,
    properties_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(properties_json)),
    UNIQUE (model_id, designator)
) STRICT;

CREATE TABLE jumper_member (
    jumper_id TEXT NOT NULL REFERENCES jumper(id) ON DELETE CASCADE,
    pin_id TEXT NOT NULL REFERENCES pin(id) ON DELETE CASCADE,
    member_order INTEGER NOT NULL,
    PRIMARY KEY (jumper_id, pin_id),
    UNIQUE (jumper_id, member_order)
) STRICT, WITHOUT ROWID;

CREATE TABLE wire_group (
    id TEXT PRIMARY KEY,
    model_id TEXT NOT NULL REFERENCES design_model(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    grouping_method TEXT NOT NULL
        CHECK (grouping_method IN ('twisted', 'bundled', 'shielded', 'custom')),
    twist_pitch_um INTEGER,
    twist_direction TEXT CHECK (twist_direction IS NULL OR twist_direction IN ('left', 'right')),
    properties_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(properties_json))
) STRICT;

CREATE TABLE wire_group_member (
    wire_group_id TEXT NOT NULL REFERENCES wire_group(id) ON DELETE CASCADE,
    conductor_id TEXT NOT NULL REFERENCES conductor(id) ON DELETE CASCADE,
    member_order INTEGER NOT NULL,
    PRIMARY KEY (wire_group_id, conductor_id),
    UNIQUE (wire_group_id, member_order)
) STRICT, WITHOUT ROWID;

CREATE TABLE cable_instance (
    id TEXT PRIMARY KEY,
    model_id TEXT NOT NULL REFERENCES design_model(id) ON DELETE CASCADE,
    designator TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    part_snapshot_id TEXT REFERENCES part_snapshot(id) ON DELETE SET NULL,
    shielded INTEGER NOT NULL DEFAULT 0 CHECK (shielded IN (0, 1)),
    properties_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(properties_json)),
    created_at TEXT NOT NULL,
    modified_at TEXT NOT NULL,
    UNIQUE (model_id, designator)
) STRICT;

CREATE TABLE cable_bundle_path (
    cable_instance_id TEXT NOT NULL REFERENCES cable_instance(id) ON DELETE CASCADE,
    path_order INTEGER NOT NULL,
    bundle_id TEXT NOT NULL REFERENCES bundle(id) ON DELETE RESTRICT,
    direction INTEGER NOT NULL CHECK (direction IN (-1, 1)),
    PRIMARY KEY (cable_instance_id, path_order)
) STRICT, WITHOUT ROWID;

CREATE TABLE cable_core (
    id TEXT PRIMARY KEY,
    cable_instance_id TEXT NOT NULL REFERENCES cable_instance(id) ON DELETE CASCADE,
    core_index INTEGER NOT NULL,
    label TEXT NOT NULL,
    color_code TEXT,
    stripe_code TEXT,
    gauge_awg_x100 INTEGER,
    cross_section_um2 INTEGER,
    pair_group TEXT,
    shield_group TEXT,
    is_drain INTEGER NOT NULL DEFAULT 0 CHECK (is_drain IN (0, 1)),
    core_part_snapshot_id TEXT REFERENCES part_snapshot(id) ON DELETE SET NULL,
    properties_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(properties_json)),
    UNIQUE (cable_instance_id, core_index),
    UNIQUE (cable_instance_id, label)
) STRICT;

CREATE TABLE cable_core_assignment (
    cable_core_id TEXT PRIMARY KEY REFERENCES cable_core(id) ON DELETE CASCADE,
    conductor_id TEXT NOT NULL UNIQUE REFERENCES conductor(id) ON DELETE CASCADE,
    override_policy TEXT NOT NULL DEFAULT 'inherit'
        CHECK (override_policy IN ('inherit', 'allowed_override', 'locked')),
    mismatch_state TEXT NOT NULL DEFAULT 'ok'
        CHECK (mismatch_state IN ('ok', 'warning', 'error', 'unresolved'))
) STRICT;

CREATE TABLE signal (
    id TEXT PRIMARY KEY,
    model_id TEXT NOT NULL REFERENCES design_model(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    color_token TEXT,
    default_wire_color TEXT,
    default_stripe_color TEXT,
    default_gauge_awg_x100 INTEGER,
    default_cross_section_um2 INTEGER,
    default_voltage_uv INTEGER,
    signal_class TEXT NOT NULL DEFAULT 'unspecified',
    properties_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(properties_json)),
    UNIQUE (model_id, name)
) STRICT;

CREATE TABLE net_intent (
    id TEXT PRIMARY KEY,
    model_id TEXT NOT NULL REFERENCES design_model(id) ON DELETE CASCADE,
    display_name TEXT,
    signal_id TEXT REFERENCES signal(id) ON DELETE SET NULL,
    last_connectivity_fingerprint TEXT,
    resolution_state TEXT NOT NULL DEFAULT 'unresolved'
        CHECK (resolution_state IN ('exact', 'expanded', 'split', 'orphaned', 'ambiguous', 'unresolved')),
    properties_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(properties_json)),
    created_at TEXT NOT NULL,
    modified_at TEXT NOT NULL
) STRICT;

CREATE TABLE net_intent_anchor (
    net_intent_id TEXT NOT NULL REFERENCES net_intent(id) ON DELETE CASCADE,
    anchor_kind TEXT NOT NULL CHECK (anchor_kind IN ('pin', 'conductor', 'splice', 'jumper')),
    anchor_id TEXT NOT NULL,
    anchor_order INTEGER NOT NULL,
    PRIMARY KEY (net_intent_id, anchor_kind, anchor_id),
    UNIQUE (net_intent_id, anchor_order)
) STRICT, WITHOUT ROWID;

CREATE TABLE visual_group (
    id TEXT PRIMARY KEY,
    model_id TEXT NOT NULL REFERENCES design_model(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    style_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(style_json)),
    properties_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(properties_json))
) STRICT;

CREATE TABLE visual_group_member (
    visual_group_id TEXT NOT NULL REFERENCES visual_group(id) ON DELETE CASCADE,
    entity_kind TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    member_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (visual_group_id, entity_kind, entity_id)
) STRICT, WITHOUT ROWID;

CREATE TABLE note (
    id TEXT PRIMARY KEY,
    model_id TEXT NOT NULL REFERENCES design_model(id) ON DELETE CASCADE,
    note_class TEXT NOT NULL DEFAULT 'text'
        CHECK (note_class IN ('text', 'numbered_list', 'table', 'requirement', 'warning', 'manufacturing')),
    title TEXT NOT NULL DEFAULT '',
    content_json TEXT NOT NULL CHECK (json_valid(content_json)),
    anchor_kind TEXT,
    anchor_id TEXT,
    created_at TEXT NOT NULL,
    modified_at TEXT NOT NULL
) STRICT;

CREATE TABLE view_placement (
    id TEXT PRIMARY KEY,
    model_id TEXT NOT NULL REFERENCES design_model(id) ON DELETE CASCADE,
    page_id TEXT REFERENCES canvas_page(id) ON DELETE CASCADE,
    view_kind TEXT NOT NULL CHECK (view_kind IN ('layout', 'schematic')),
    entity_kind TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    x_lu INTEGER NOT NULL,
    y_lu INTEGER NOT NULL,
    width_lu INTEGER,
    height_lu INTEGER,
    rotation_udeg INTEGER NOT NULL DEFAULT 0,
    z_order INTEGER NOT NULL DEFAULT 0,
    visible INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0, 1)),
    locked INTEGER NOT NULL DEFAULT 0 CHECK (locked IN (0, 1)),
    display_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(display_json)),
    UNIQUE (model_id, view_kind, entity_kind, entity_id)
) STRICT;

CREATE INDEX ix_view_placement_page_z
ON view_placement(page_id, z_order);

CREATE TABLE bom_assignment (
    id TEXT PRIMARY KEY,
    model_id TEXT REFERENCES design_model(id) ON DELETE CASCADE,
    entity_kind TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    role TEXT NOT NULL,
    part_snapshot_id TEXT NOT NULL REFERENCES part_snapshot(id) ON DELETE RESTRICT,
    quantity_num INTEGER NOT NULL DEFAULT 1,
    quantity_den INTEGER NOT NULL DEFAULT 1 CHECK (quantity_den > 0),
    quantity_unit TEXT NOT NULL DEFAULT 'each',
    assignment_state TEXT NOT NULL DEFAULT 'active'
        CHECK (assignment_state IN ('active', 'optional', 'reference', 'excluded')),
    source TEXT NOT NULL DEFAULT 'manual'
        CHECK (source IN ('manual', 'template', 'generated', 'imported', 'inherited')),
    properties_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(properties_json)),
    created_at TEXT NOT NULL,
    modified_at TEXT NOT NULL,
    UNIQUE (entity_kind, entity_id, role, part_snapshot_id)
) STRICT;

CREATE INDEX ix_bom_assignment_part
ON bom_assignment(part_snapshot_id, assignment_state);

CREATE TABLE bundle_accessory (
    id TEXT PRIMARY KEY,
    bundle_id TEXT REFERENCES bundle(id) ON DELETE CASCADE,
    branch_point_id TEXT REFERENCES branch_point(id) ON DELETE CASCADE,
    accessory_kind TEXT NOT NULL,
    part_snapshot_id TEXT REFERENCES part_snapshot(id) ON DELETE SET NULL,
    position_um INTEGER,
    length_um INTEGER,
    datum TEXT CHECK (datum IS NULL OR datum IN ('start', 'end', 'center', 'branch')),
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    properties_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(properties_json)),
    CHECK (bundle_id IS NOT NULL OR branch_point_id IS NOT NULL)
) STRICT;

CREATE TABLE designator_reservation (
    model_id TEXT NOT NULL REFERENCES design_model(id) ON DELETE CASCADE,
    entity_kind TEXT NOT NULL,
    prefix TEXT NOT NULL,
    number INTEGER NOT NULL CHECK (number > 0),
    entity_id TEXT,
    state TEXT NOT NULL DEFAULT 'allocated'
        CHECK (state IN ('allocated', 'reserved', 'retired')),
    PRIMARY KEY (model_id, entity_kind, prefix, number)
) STRICT, WITHOUT ROWID;

CREATE TABLE assembly_origin_mapping (
    id TEXT PRIMARY KEY,
    assembly_model_id TEXT NOT NULL REFERENCES design_model(id) ON DELETE CASCADE,
    assembly_entity_kind TEXT NOT NULL,
    assembly_entity_id TEXT NOT NULL,
    origin_model_id TEXT NOT NULL REFERENCES design_model(id) ON DELETE CASCADE,
    origin_entity_kind TEXT NOT NULL,
    origin_entity_id TEXT NOT NULL,
    origin_revision_id TEXT,
    generation_rule_version TEXT NOT NULL,
    last_synced_content_hash TEXT NOT NULL,
    field_ownership_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(field_ownership_json)),
    UNIQUE (assembly_model_id, assembly_entity_kind, assembly_entity_id),
    UNIQUE (assembly_model_id, origin_entity_kind, origin_entity_id)
) STRICT;

CREATE TABLE assembly_sync_record (
    id TEXT PRIMARY KEY,
    assembly_model_id TEXT NOT NULL REFERENCES design_model(id) ON DELETE CASCADE,
    from_origin_revision_id TEXT,
    to_origin_revision_id TEXT NOT NULL,
    preview_hash TEXT NOT NULL,
    applied_revision_id TEXT,
    state TEXT NOT NULL
        CHECK (state IN ('preview', 'partially_applied', 'applied', 'cancelled')),
    summary_json TEXT NOT NULL CHECK (json_valid(summary_json)),
    created_at TEXT NOT NULL,
    applied_at TEXT
) STRICT;

CREATE TABLE assembly_sync_conflict (
    id TEXT PRIMARY KEY,
    sync_record_id TEXT NOT NULL REFERENCES assembly_sync_record(id) ON DELETE CASCADE,
    mapping_id TEXT REFERENCES assembly_origin_mapping(id) ON DELETE SET NULL,
    field_path TEXT NOT NULL,
    conflict_kind TEXT NOT NULL,
    plan_value_json TEXT CHECK (plan_value_json IS NULL OR json_valid(plan_value_json)),
    assembly_value_json TEXT CHECK (assembly_value_json IS NULL OR json_valid(assembly_value_json)),
    resolution TEXT CHECK (resolution IS NULL OR resolution IN ('plan', 'assembly', 'merge', 'keep_both', 'defer')),
    resolved_value_json TEXT CHECK (resolved_value_json IS NULL OR json_valid(resolved_value_json)),
    resolved_at TEXT,
    resolved_by_actor_id TEXT
) STRICT;

CREATE TABLE layout_document (
    id TEXT PRIMARY KEY,
    model_id TEXT NOT NULL REFERENCES design_model(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    template_id TEXT,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'review', 'released', 'obsolete')),
    properties_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(properties_json)),
    created_at TEXT NOT NULL,
    modified_at TEXT NOT NULL
) STRICT;

CREATE TABLE layout_sheet (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES layout_document(id) ON DELETE CASCADE,
    sheet_order INTEGER NOT NULL,
    name TEXT NOT NULL,
    paper_size TEXT NOT NULL,
    orientation TEXT NOT NULL CHECK (orientation IN ('portrait', 'landscape')),
    width_um INTEGER NOT NULL CHECK (width_um > 0),
    height_um INTEGER NOT NULL CHECK (height_um > 0),
    text_scale_ppm INTEGER NOT NULL DEFAULT 1000000 CHECK (text_scale_ppm > 0),
    border_template_id TEXT,
    title_block_template_id TEXT,
    properties_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(properties_json)),
    UNIQUE (document_id, sheet_order),
    UNIQUE (document_id, name)
) STRICT;

CREATE TABLE layout_element (
    id TEXT PRIMARY KEY,
    sheet_id TEXT NOT NULL REFERENCES layout_sheet(id) ON DELETE CASCADE,
    element_kind TEXT NOT NULL
        CHECK (element_kind IN ('assembly_view', 'bom_table', 'wire_schedule', 'cut_list', 'connection_table', 'termination_schedule', 'splice_schedule', 'bundle_schedule', 'covering_schedule', 'continuity_table', 'note', 'title_block', 'legend', 'revision_table', 'approval_block', 'image', 'vector_graphic', 'dimension', 'custom')),
    x_lu INTEGER NOT NULL,
    y_lu INTEGER NOT NULL,
    width_lu INTEGER NOT NULL,
    height_lu INTEGER NOT NULL,
    rotation_udeg INTEGER NOT NULL DEFAULT 0,
    z_order INTEGER NOT NULL DEFAULT 0,
    locked INTEGER NOT NULL DEFAULT 0 CHECK (locked IN (0, 1)),
    query_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(query_json)),
    style_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(style_json)),
    content_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(content_json))
) STRICT;

CREATE INDEX ix_layout_element_sheet_z
ON layout_element(sheet_id, z_order);

CREATE TABLE asset_blob (
    id TEXT PRIMARY KEY,
    sha256 TEXT NOT NULL UNIQUE,
    media_type TEXT NOT NULL,
    byte_length INTEGER NOT NULL CHECK (byte_length >= 0),
    original_filename TEXT,
    license_text TEXT,
    attribution_text TEXT,
    source_url TEXT,
    storage_mode TEXT NOT NULL DEFAULT 'embedded'
        CHECK (storage_mode IN ('embedded', 'external_relative')),
    blob_data BLOB,
    external_path TEXT,
    required INTEGER NOT NULL DEFAULT 1 CHECK (required IN (0, 1)),
    created_at TEXT NOT NULL,
    CHECK (
        (storage_mode = 'embedded' AND blob_data IS NOT NULL AND external_path IS NULL)
        OR
        (storage_mode = 'external_relative' AND blob_data IS NULL AND external_path IS NOT NULL)
    )
) STRICT;

CREATE TABLE entity_asset (
    asset_id TEXT NOT NULL REFERENCES asset_blob(id) ON DELETE CASCADE,
    entity_kind TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    role TEXT NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (asset_id, entity_kind, entity_id, role)
) STRICT, WITHOUT ROWID;

CREATE TABLE external_reference (
    id TEXT PRIMARY KEY,
    entity_kind TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    namespace TEXT NOT NULL,
    external_id TEXT NOT NULL,
    external_revision TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(metadata_json)),
    UNIQUE (namespace, external_id, entity_kind, entity_id)
) STRICT;

CREATE TABLE command_log (
    command_seq INTEGER PRIMARY KEY AUTOINCREMENT,
    command_id TEXT NOT NULL UNIQUE,
    schema_version INTEGER NOT NULL,
    model_id TEXT REFERENCES design_model(id) ON DELETE SET NULL,
    actor_id TEXT NOT NULL,
    batch_id TEXT NOT NULL,
    command_type TEXT NOT NULL,
    base_revision_id TEXT,
    payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
    preconditions_json TEXT NOT NULL DEFAULT '[]'
        CHECK (json_valid(preconditions_json)),
    result_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(result_json)),
    inverse_json TEXT CHECK (inverse_json IS NULL OR json_valid(inverse_json)),
    idempotency_key TEXT,
    committed_at TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    UNIQUE (actor_id, idempotency_key)
) STRICT;

CREATE INDEX ix_command_log_batch
ON command_log(batch_id, command_seq);

CREATE TABLE revision (
    id TEXT PRIMARY KEY,
    model_id TEXT REFERENCES design_model(id) ON DELETE CASCADE,
    revision_name TEXT,
    message TEXT NOT NULL DEFAULT '',
    author_actor_id TEXT NOT NULL,
    lifecycle_state TEXT NOT NULL DEFAULT 'draft'
        CHECK (lifecycle_state IN ('draft', 'review', 'released', 'obsolete')),
    head_command_seq INTEGER REFERENCES command_log(command_seq) ON DELETE SET NULL,
    model_content_hash TEXT NOT NULL,
    validation_summary_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(validation_summary_json)),
    signature_json TEXT CHECK (signature_json IS NULL OR json_valid(signature_json)),
    created_at TEXT NOT NULL,
    released_at TEXT
) STRICT;

CREATE TABLE revision_parent (
    revision_id TEXT NOT NULL REFERENCES revision(id) ON DELETE CASCADE,
    parent_revision_id TEXT NOT NULL REFERENCES revision(id) ON DELETE RESTRICT,
    parent_order INTEGER NOT NULL,
    PRIMARY KEY (revision_id, parent_revision_id),
    UNIQUE (revision_id, parent_order),
    CHECK (revision_id <> parent_revision_id)
) STRICT, WITHOUT ROWID;

CREATE TABLE snapshot (
    id TEXT PRIMARY KEY,
    revision_id TEXT REFERENCES revision(id) ON DELETE CASCADE,
    model_id TEXT REFERENCES design_model(id) ON DELETE CASCADE,
    head_command_seq INTEGER REFERENCES command_log(command_seq) ON DELETE SET NULL,
    snapshot_kind TEXT NOT NULL
        CHECK (snapshot_kind IN ('recovery', 'revision', 'branch_head', 'migration')),
    codec TEXT NOT NULL DEFAULT 'zstd-json',
    content_hash TEXT NOT NULL,
    snapshot_blob BLOB NOT NULL,
    created_at TEXT NOT NULL
) STRICT;

CREATE TABLE validation_issue (
    id TEXT PRIMARY KEY,
    model_id TEXT REFERENCES design_model(id) ON DELETE CASCADE,
    source_content_hash TEXT NOT NULL,
    rule_id TEXT NOT NULL,
    rule_version TEXT NOT NULL,
    severity TEXT NOT NULL
        CHECK (severity IN ('info', 'warning', 'error', 'blocker')),
    fingerprint TEXT NOT NULL,
    message_key TEXT NOT NULL,
    parameters_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(parameters_json)),
    location_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(location_json)),
    suggested_fixes_json TEXT NOT NULL DEFAULT '[]'
        CHECK (json_valid(suggested_fixes_json)),
    state TEXT NOT NULL DEFAULT 'open'
        CHECK (state IN ('open', 'waived', 'resolved', 'stale')),
    created_at TEXT NOT NULL,
    UNIQUE (model_id, fingerprint, source_content_hash)
) STRICT;

CREATE TABLE validation_issue_entity (
    issue_id TEXT NOT NULL REFERENCES validation_issue(id) ON DELETE CASCADE,
    entity_kind TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'primary',
    PRIMARY KEY (issue_id, entity_kind, entity_id, role)
) STRICT, WITHOUT ROWID;

CREATE TABLE validation_waiver (
    id TEXT PRIMARY KEY,
    issue_fingerprint TEXT NOT NULL,
    model_id TEXT REFERENCES design_model(id) ON DELETE CASCADE,
    rule_id TEXT NOT NULL,
    entity_kind TEXT,
    entity_id TEXT,
    reason TEXT NOT NULL,
    author_actor_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT,
    source_entity_hash TEXT,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
) STRICT;

CREATE TABLE export_profile (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    export_kind TEXT NOT NULL,
    profile_json TEXT NOT NULL CHECK (json_valid(profile_json)),
    project_scoped INTEGER NOT NULL DEFAULT 1 CHECK (project_scoped IN (0, 1)),
    created_at TEXT NOT NULL,
    modified_at TEXT NOT NULL
) STRICT;

CREATE TABLE import_profile (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    import_kind TEXT NOT NULL,
    profile_json TEXT NOT NULL CHECK (json_valid(profile_json)),
    project_scoped INTEGER NOT NULL DEFAULT 1 CHECK (project_scoped IN (0, 1)),
    created_at TEXT NOT NULL,
    modified_at TEXT NOT NULL
) STRICT;

CREATE TABLE tag (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color_token TEXT,
    description TEXT NOT NULL DEFAULT ''
) STRICT;

CREATE TABLE entity_tag (
    tag_id TEXT NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
    entity_kind TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    PRIMARY KEY (tag_id, entity_kind, entity_id)
) STRICT, WITHOUT ROWID;

CREATE TABLE job_record (
    id TEXT PRIMARY KEY,
    job_kind TEXT NOT NULL,
    state TEXT NOT NULL
        CHECK (state IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
    snapshot_token TEXT,
    progress_ppm INTEGER NOT NULL DEFAULT 0 CHECK (progress_ppm BETWEEN 0 AND 1000000),
    request_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(request_json)),
    result_json TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
    error_json TEXT CHECK (error_json IS NULL OR json_valid(error_json)),
    created_at TEXT NOT NULL,
    started_at TEXT,
    finished_at TEXT
) STRICT;

CREATE TABLE sync_remote (
    id TEXT PRIMARY KEY,
    provider_kind TEXT NOT NULL,
    name TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    remote_project_id TEXT,
    enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
    capabilities_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(capabilities_json)),
    last_pull_cursor TEXT,
    last_push_command_seq INTEGER,
    created_at TEXT NOT NULL,
    modified_at TEXT NOT NULL
) STRICT;

CREATE TABLE sync_outbox (
    id TEXT PRIMARY KEY,
    remote_id TEXT NOT NULL REFERENCES sync_remote(id) ON DELETE CASCADE,
    command_seq INTEGER NOT NULL REFERENCES command_log(command_seq) ON DELETE CASCADE,
    state TEXT NOT NULL DEFAULT 'pending'
        CHECK (state IN ('pending', 'sending', 'sent', 'failed', 'blocked')),
    attempt_count INTEGER NOT NULL DEFAULT 0,
    last_error_json TEXT CHECK (last_error_json IS NULL OR json_valid(last_error_json)),
    next_attempt_at TEXT,
    UNIQUE (remote_id, command_seq)
) STRICT;

CREATE TABLE sync_conflict (
    id TEXT PRIMARY KEY,
    remote_id TEXT NOT NULL REFERENCES sync_remote(id) ON DELETE CASCADE,
    entity_kind TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    field_path TEXT NOT NULL,
    local_value_json TEXT CHECK (local_value_json IS NULL OR json_valid(local_value_json)),
    remote_value_json TEXT CHECK (remote_value_json IS NULL OR json_valid(remote_value_json)),
    base_value_json TEXT CHECK (base_value_json IS NULL OR json_valid(base_value_json)),
    state TEXT NOT NULL DEFAULT 'open'
        CHECK (state IN ('open', 'resolved_local', 'resolved_remote', 'resolved_merge', 'dismissed')),
    resolution_json TEXT CHECK (resolution_json IS NULL OR json_valid(resolution_json)),
    created_at TEXT NOT NULL,
    resolved_at TEXT
) STRICT;

CREATE TABLE audit_event (
    event_seq INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL UNIQUE,
    actor_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    entity_kind TEXT,
    entity_id TEXT,
    event_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(event_json)),
    created_at TEXT NOT NULL
) STRICT;

-- Project-local part search. The application rebuilds this cache when needed.
CREATE VIRTUAL TABLE part_search_fts USING fts5(
    part_snapshot_id UNINDEXED,
    manufacturer,
    mpn,
    internal_part_number,
    description,
    category,
    tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER part_snapshot_ai
AFTER INSERT ON part_snapshot
BEGIN
    INSERT INTO part_search_fts(
        part_snapshot_id, manufacturer, mpn, internal_part_number, description, category
    ) VALUES (
        NEW.id, NEW.manufacturer, NEW.mpn, NEW.internal_part_number, NEW.description, NEW.category
    );
END;

CREATE TRIGGER part_snapshot_au
AFTER UPDATE ON part_snapshot
BEGIN
    DELETE FROM part_search_fts WHERE part_snapshot_id = OLD.id;
    INSERT INTO part_search_fts(
        part_snapshot_id, manufacturer, mpn, internal_part_number, description, category
    ) VALUES (
        NEW.id, NEW.manufacturer, NEW.mpn, NEW.internal_part_number, NEW.description, NEW.category
    );
END;

CREATE TRIGGER part_snapshot_ad
AFTER DELETE ON part_snapshot
BEGIN
    DELETE FROM part_search_fts WHERE part_snapshot_id = OLD.id;
END;

INSERT INTO schema_migration(version, name, applied_at, application_version, checksum)
VALUES (1, 'initial_clean_room_schema', '2026-08-26T00:00:00Z', '0.1.0', 'SPEC-BASELINE');

COMMIT;
