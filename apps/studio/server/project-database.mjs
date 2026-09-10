import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync, statSync } from 'node:fs';
import {
  HarnessEditorEngine,
  buildComponentGeometry,
  createEmptyDocument,
  deriveEditorScene,
  parseDocument,
} from '../../../packages/harness-editor-core/dist/index.js';
import { createProjectDocument, createSchematicFromLayout } from './sample-data.mjs';
import {
  APP_VERSION,
  createId,
  ensureParent,
  nowIso,
  sha256,
  stripProjectExtension,
} from './util.mjs';

const schemaFiles = [
  new URL('../../../database/0001_project.sql', import.meta.url),
  new URL('../../../database/0002_editor.sql', import.meta.url),
  new URL('../../../database/0003_application.sql', import.meta.url),
  new URL('../../../database/0004_manufacturing.sql', import.meta.url),
];

function booleanInteger(value) {
  return value ? 1 : 0;
}

function lu(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : 0;
}

function nullableLu(value) {
  if (value === null || value === undefined || value === '') return null;
  return lu(value);
}

function componentKind(kind) {
  const mapping = {
    connector: 'connector',
    'terminal-point': 'terminal_point',
    termination: 'termination',
    device: 'generic_device',
    'inline-device': 'inline_device',
    passive: 'protection_device',
    'branch-point': 'custom',
    custom: 'custom',
  };
  return mapping[kind] || 'custom';
}

function conductorKind(kind) {
  const mapping = {
    discrete: 'discrete_wire',
    'cable-core': 'cable_core',
    shield: 'shield',
    drain: 'drain',
    bundle: 'jumper_wire',
    mate: 'jumper_wire',
    annotation: 'jumper_wire',
  };
  return mapping[kind] || 'discrete_wire';
}

function routePattern(pattern) {
  return String(pattern || 'orthogonal').replaceAll('-', '_');
}

function colorPattern(pattern) {
  return String(pattern?.kind || 'solid').replaceAll('-', '_');
}

function primaryColor(pattern) {
  if (!pattern) return '#4b5563';
  if (pattern.kind === 'solid') return pattern.color;
  if (pattern.kind === 'stripe' || pattern.kind === 'tracer') return pattern.base;
  if (pattern.kind === 'dual') return pattern.primary;
  if (pattern.kind === 'shield') return pattern.core;
  if (pattern.kind === 'custom') return pattern.layers?.[0]?.color || '#4b5563';
  return '#4b5563';
}

function secondaryColor(pattern) {
  if (!pattern) return null;
  if (pattern.kind === 'stripe') return pattern.stripe;
  if (pattern.kind === 'tracer') return pattern.tracer;
  if (pattern.kind === 'dual') return pattern.secondary;
  if (pattern.kind === 'shield') return pattern.sheath;
  if (pattern.kind === 'custom') return pattern.layers?.[1]?.color || null;
  return null;
}

function routeStatus(wire) {
  if (!wire.route) return 'unrouted';
  if (wire.route.status === 'invalid') return 'invalid';
  if (wire.route.points?.length >= 2) return 'routed';
  return 'partial';
}

function endpointProjection(endpoint, wireId, order) {
  if (endpoint.kind === 'port') {
    return { targetKind: 'pin', targetId: endpoint.portId };
  }
  if (endpoint.kind === 'off-page') {
    return { targetKind: 'boundary_port', targetId: `${wireId}:off-page:${order}:${endpoint.reference}` };
  }
  if (endpoint.kind === 'junction') {
    return { targetKind: 'junction', targetId: endpoint.junctionId };
  }
  return { targetKind: 'junction', targetId: `${wireId}:free:${order}` };
}

function labelOwner(label) {
  const mapping = {
    component: 'component',
    port: 'pin',
    wire: 'conductor',
    free: 'free',
    group: 'visual_group',
  };
  return {
    ownerKind: mapping[label.anchor?.ownerKind] || 'free',
    ownerId: label.anchor?.ownerKind === 'free' ? null : label.anchor?.ownerId || label.anchor?.portId || null,
  };
}

function labelAnchorKind(label) {
  if (label.anchor?.ownerKind === 'port') return 'port';
  if (label.anchor?.ownerKind === 'wire') {
    return Number.isInteger(label.anchor.segmentIndex) ? 'segment' : 'path_fraction';
  }
  if (label.anchor?.point) return 'point';
  return 'center';
}

function normalizePinLabels(component) {
  const used = new Set();
  return component.ports.map((port, index) => {
    let label = String(port.label || index + 1);
    if (used.has(label)) label = `${label}-${index + 1}`;
    used.add(label);
    return { port, label, index };
  });
}

const COMPONENT_ASSEMBLY_FIELD_OWNERSHIP = Object.freeze({
  definitionId: 'plan',
  kind: 'plan',
  designator: 'plan',
  labels: 'plan',
  ports: 'plan',
  position: 'assembly',
  size: 'assembly',
  orientation: 'assembly',
  appearance: 'assembly',
});

const CONDUCTOR_ASSEMBLY_FIELD_OWNERSHIP = Object.freeze({
  kind: 'plan',
  label: 'plan',
  signal: 'plan',
  connectivity: 'plan',
  route: 'assembly',
  appearance: 'assembly',
});

function componentPlanOwnedProjection(component) {
  return {
    definitionId: component.definitionId,
    kind: component.kind,
    designator: component.designator,
    labels: component.labels,
    ports: (component.ports || []).map((port) => {
      const projected = structuredClone(port);
      delete projected.bankId;
      return projected;
    }),
  };
}

function conductorPlanOwnedProjection(wire) {
  return {
    kind: wire.kind,
    label: wire.label,
    signal: wire.signal,
    source: wire.source,
    target: wire.target,
  };
}

function assemblyOriginContentHash(kind, value) {
  const projection = kind === 'component'
    ? componentPlanOwnedProjection(value)
    : conductorPlanOwnedProjection(value);
  return sha256(JSON.stringify(projection));
}


function cloneAssemblyDocument(source, selectedComponentIds = [], selectedWireIds = []) {
  const selectedComponents = new Set(selectedComponentIds.length ? selectedComponentIds : source.componentOrder);
  const explicitWires = new Set(selectedWireIds || []);
  const document = createEmptyDocument(createId('assembly-document'), structuredClone(source.settings));
  document.settings = structuredClone(source.settings);
  document.metadata = {
    ...(source.metadata || {}),
    title: 'Generated Assembly',
    sourceDocumentId: source.id,
    generatedAt: nowIso(),
  };

  const componentMap = new Map();
  const portMap = new Map();
  const bankMap = new Map();
  let minimumX = Number.POSITIVE_INFINITY;
  let minimumY = Number.POSITIVE_INFINITY;

  for (const componentId of source.componentOrder) {
    if (!selectedComponents.has(componentId)) continue;
    const original = source.components[componentId];
    if (!original) continue;
    const cloned = structuredClone(original);
    cloned.id = createId('component');
    cloned.metadata = { ...(cloned.metadata || {}), originComponentId: original.id };
    componentMap.set(original.id, cloned.id);

    cloned.pinBanks = (cloned.pinBanks || []).map((bank) => {
      const newId = createId('bank');
      bankMap.set(`${original.id}:${bank.id}`, newId);
      return { ...bank, id: newId, portIds: [] };
    });
    cloned.ports = (cloned.ports || []).map((port) => {
      const newId = createId('port');
      portMap.set(port.id, newId);
      return {
        ...port,
        id: newId,
        bankId: port.bankId ? bankMap.get(`${original.id}:${port.bankId}`) : undefined,
        metadata: { ...(port.metadata || {}), originPortId: port.id },
      };
    });
    const bankById = new Map(cloned.pinBanks.map((bank) => [bank.id, bank]));
    for (const port of cloned.ports) {
      if (port.bankId && bankById.has(port.bankId)) bankById.get(port.bankId).portIds.push(port.id);
    }
    document.components[cloned.id] = cloned;
    document.componentOrder.push(cloned.id);
    minimumX = Math.min(minimumX, cloned.position.x);
    minimumY = Math.min(minimumY, cloned.position.y);
  }

  if (Number.isFinite(minimumX) && Number.isFinite(minimumY)) {
    for (const componentId of document.componentOrder) {
      const component = document.components[componentId];
      component.position = {
        x: component.position.x - minimumX + 100,
        y: component.position.y - minimumY + 100,
      };
    }
  }

  const wireMap = new Map();
  const sourcePoint = (wire, endpointOrder) => {
    const points = wire.route?.points || [];
    if (!points.length) return { x: 0, y: 0 };
    return structuredClone(endpointOrder === 0 ? points[0] : points[points.length - 1]);
  };
  const remapEndpoint = (wire, endpoint, endpointOrder) => {
    if (endpoint.kind !== 'port') return structuredClone(endpoint);
    const mappedComponentId = componentMap.get(endpoint.componentId);
    const mappedPortId = portMap.get(endpoint.portId);
    if (mappedComponentId && mappedPortId) {
      return { kind: 'port', componentId: mappedComponentId, portId: mappedPortId };
    }
    return {
      kind: 'off-page',
      point: sourcePoint(wire, endpointOrder),
      reference: `${endpoint.componentId}.${endpoint.portId}`,
      direction: endpointOrder === 0 ? 'west' : 'east',
    };
  };

  for (const wireId of source.wireOrder) {
    const original = source.wires[wireId];
    if (!original) continue;
    const sourceSelected = original.source.kind !== 'port' || selectedComponents.has(original.source.componentId);
    const targetSelected = original.target.kind !== 'port' || selectedComponents.has(original.target.componentId);
    const touchesSelection = sourceSelected || targetSelected;
    const shouldInclude = explicitWires.size ? explicitWires.has(wireId) : touchesSelection;
    if (!shouldInclude) continue;
    if (!sourceSelected && !targetSelected) continue;
    const cloned = structuredClone(original);
    cloned.id = createId('wire');
    cloned.source = remapEndpoint(original, original.source, 0);
    cloned.target = remapEndpoint(original, original.target, 1);
    cloned.routing.constraints = [];
    delete cloned.route;
    cloned.metadata = { ...(cloned.metadata || {}), originWireId: original.id };
    document.wires[cloned.id] = cloned;
    document.wireOrder.push(cloned.id);
    wireMap.set(original.id, cloned.id);
  }

  for (const labelId of source.labelOrder) {
    const original = source.labels[labelId];
    if (!original) continue;
    const cloned = structuredClone(original);
    let include = false;
    if (original.anchor.ownerKind === 'component') {
      const mapped = componentMap.get(original.anchor.ownerId);
      if (mapped) {
        cloned.anchor.ownerId = mapped;
        include = true;
      }
    } else if (original.anchor.ownerKind === 'wire') {
      const mapped = wireMap.get(original.anchor.ownerId);
      if (mapped) {
        cloned.anchor.ownerId = mapped;
        include = true;
      }
    } else if (original.anchor.ownerKind === 'port') {
      const mappedOwner = componentMap.get(original.anchor.ownerId);
      const mappedPort = portMap.get(original.anchor.portId);
      if (mappedOwner && mappedPort) {
        cloned.anchor.ownerId = mappedOwner;
        cloned.anchor.portId = mappedPort;
        include = true;
      }
    } else if (original.anchor.ownerKind === 'free') {
      include = true;
    }
    if (!include) continue;
    cloned.id = createId('label');
    cloned.metadata = { ...(cloned.metadata || {}), originLabelId: original.id };
    document.labels[cloned.id] = cloned;
    document.labelOrder.push(cloned.id);
  }

  return { document, componentMap, portMap, wireMap };
}

function validationSummary(document) {
  const engine = new HarnessEditorEngine(document, { autoRoute: true, validateOnChange: true });
  const summary = { info: 0, warning: 0, error: 0, total: engine.validationIssues.length };
  for (const issue of engine.validationIssues) summary[issue.severity] += 1;
  return summary;
}

export class ProjectDatabase {
  static create(path, options = {}) {
    ensureParent(path);
    if (existsSync(path) && statSync(path).size > 0) {
      throw new Error(`Project already exists: ${path}`);
    }
    const project = new ProjectDatabase(path, { create: true });
    project.initialize(options);
    return project;
  }

  constructor(path, options = {}) {
    this.path = path;
    ensureParent(path);
    const wasEmpty = !existsSync(path) || statSync(path).size === 0;
    this.database = new DatabaseSync(path);
    this.database.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    if (wasEmpty || options.create) this.applyAllSchemas();
    else this.applyMissingSchemas();
    this.database.exec('PRAGMA application_id = 1381253970; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA temp_store = MEMORY; PRAGMA user_version = 4;');
  }

  close() {
    try {
      this.database.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    } finally {
      this.database.close();
    }
  }

  applyAllSchemas() {
    for (const schemaFile of schemaFiles) this.database.exec(readFileSync(schemaFile, 'utf8'));
  }

  applyMissingSchemas() {
    const hasMigrationTable = this.database.prepare(`
      SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'schema_migration'
    `).get().count > 0;
    if (!hasMigrationTable) throw new Error('The selected file is not a RouteCore project database.');
    const versions = new Set(this.database.prepare('SELECT version FROM schema_migration').all().map((row) => Number(row.version)));
    for (let index = 0; index < schemaFiles.length; index += 1) {
      const version = index + 1;
      if (!versions.has(version)) this.database.exec(readFileSync(schemaFiles[index], 'utf8'));
    }
  }

  initialize(options = {}) {
    const name = String(options.name || stripProjectExtension(this.path) || 'Untitled Harness');
    const template = options.template || 'sample';
    const layoutDocument = createProjectDocument(template);
    const schematicDocument = createSchematicFromLayout(layoutDocument);
    const projectUuid = createId('project');
    const actorId = createId('actor');
    const planId = createId('plan');
    const layoutPageId = createId('page-layout');
    const schematicPageId = createId('page-schematic');
    const now = nowIso();

    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.database.prepare(`
        INSERT INTO project_meta(
          singleton_id, project_uuid, format_semver, minimum_reader_semver,
          created_by_app_semver, name, description, organization, status,
          default_length_unit, default_wire_unit, local_actor_id,
          created_at, modified_at, feature_flags_json, extra_json
        ) VALUES (1, ?, '1.0.0', '0.3.0', ?, ?, ?, ?, 'draft', 'mm', 'awg', ?, ?, ?, '{}', '{}')
      `).run(projectUuid, APP_VERSION, name, options.description || '', options.organization || '', actorId, now, now);

      this.database.prepare(`
        INSERT INTO design_model(id, kind, name, description, designator, source_mode, lifecycle_state, created_at, modified_at, extra_json)
        VALUES (?, 'plan', ?, ?, 'PLAN-1', 'native', 'draft', ?, ?, '{}')
      `).run(planId, name, options.description || '', now, now);

      const pageStatement = this.database.prepare(`
        INSERT INTO canvas_page(
          id, model_id, view_kind, name, page_order, width_um, height_um,
          orientation, viewport_json, layer_state_json, created_at, modified_at
        ) VALUES (?, ?, ?, ?, 0, 1189000, 841000, 'landscape', '{}', '{}', ?, ?)
      `);
      pageStatement.run(layoutPageId, planId, 'layout', 'Layout 1', now, now);
      pageStatement.run(schematicPageId, planId, 'schematic', 'Schematic 1', now, now);

      this.insertEditorDocument(planId, layoutPageId, 'layout', layoutDocument, now);
      this.insertEditorDocument(planId, schematicPageId, 'schematic', schematicDocument, now);

      this.database.prepare(`
        INSERT INTO app_workspace_state(
          singleton_id, active_model_id, active_page_id, active_view_kind,
          panel_state_json, viewport_state_json, selected_entities_json, updated_at
        ) VALUES (1, ?, ?, 'layout', '{}', '{}', '[]', ?)
      `).run(planId, layoutPageId, now);

      this.rebuildNormalizedModel(planId);
      this.createRecoverySnapshot(planId, layoutPageId, 'layout', layoutDocument, null);
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  insertEditorDocument(modelId, pageId, viewKind, document, now = nowIso()) {
    const json = JSON.stringify(document);
    this.database.prepare(`
      INSERT INTO app_editor_document(
        id, model_id, page_id, view_kind, schema_version,
        document_revision, content_hash, document_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `${pageId}:${viewKind}`,
      modelId,
      pageId,
      viewKind,
      document.schemaVersion || 1,
      document.revision || 0,
      sha256(json),
      json,
      now,
    );
  }

  getMeta() {
    const row = this.database.prepare('SELECT * FROM project_meta WHERE singleton_id = 1').get();
    if (!row) throw new Error('Project metadata is missing.');
    return {
      project_uuid: row.project_uuid,
      name: row.name,
      description: row.description,
      organization: row.organization,
      status: row.status,
      defaultLengthUnit: row.default_length_unit,
      defaultWireUnit: row.default_wire_unit,
      createdAt: row.created_at,
      modifiedAt: row.modified_at,
      formatSemver: row.format_semver,
      applicationVersion: row.created_by_app_semver,
    };
  }

  updateMeta(values = {}) {
    const current = this.getMeta();
    const now = nowIso();
    this.database.prepare(`
      UPDATE project_meta SET
        name = ?, description = ?, organization = ?, status = ?,
        default_length_unit = ?, default_wire_unit = ?, modified_at = ?
      WHERE singleton_id = 1
    `).run(
      values.name ?? current.name,
      values.description ?? current.description,
      values.organization ?? current.organization,
      values.status ?? current.status,
      values.defaultLengthUnit ?? current.defaultLengthUnit,
      values.defaultWireUnit ?? current.defaultWireUnit,
      now,
    );
    return this.getMeta();
  }

  listModelsAndPages() {
    const models = this.database.prepare(`
      SELECT id, kind, name, description, designator, source_mode, lifecycle_state, created_at, modified_at
      FROM design_model WHERE deleted_at IS NULL ORDER BY kind DESC, created_at
    `).all();
    const pages = this.database.prepare(`
      SELECT id, model_id, view_kind, name, page_order, width_um, height_um, orientation, viewport_json, layer_state_json
      FROM canvas_page WHERE is_archived = 0 ORDER BY model_id, view_kind, page_order
    `).all();
    return {
      models: models.map((row) => ({
        id: row.id,
        kind: row.kind,
        name: row.name,
        description: row.description,
        designator: row.designator,
        sourceMode: row.source_mode,
        lifecycleState: row.lifecycle_state,
        createdAt: row.created_at,
        modifiedAt: row.modified_at,
      })),
      pages: pages.map((row) => ({
        id: row.id,
        modelId: row.model_id,
        viewKind: row.view_kind,
        name: row.name,
        order: row.page_order,
        widthUm: row.width_um,
        heightUm: row.height_um,
        orientation: row.orientation,
        viewport: JSON.parse(row.viewport_json),
        layers: JSON.parse(row.layer_state_json),
      })),
    };
  }

  getWorkspaceState() {
    const row = this.database.prepare('SELECT * FROM app_workspace_state WHERE singleton_id = 1').get();
    return {
      activeModelId: row?.active_model_id || null,
      activePageId: row?.active_page_id || null,
      activeViewKind: row?.active_view_kind || 'layout',
      panelState: JSON.parse(row?.panel_state_json || '{}'),
      viewportState: JSON.parse(row?.viewport_state_json || '{}'),
      selectedEntities: JSON.parse(row?.selected_entities_json || '[]'),
      updatedAt: row?.updated_at || null,
    };
  }

  setWorkspaceState(values = {}) {
    const current = this.getWorkspaceState();
    const now = nowIso();
    this.database.prepare(`
      INSERT INTO app_workspace_state(
        singleton_id, active_model_id, active_page_id, active_view_kind,
        panel_state_json, viewport_state_json, selected_entities_json, updated_at
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(singleton_id) DO UPDATE SET
        active_model_id = excluded.active_model_id,
        active_page_id = excluded.active_page_id,
        active_view_kind = excluded.active_view_kind,
        panel_state_json = excluded.panel_state_json,
        viewport_state_json = excluded.viewport_state_json,
        selected_entities_json = excluded.selected_entities_json,
        updated_at = excluded.updated_at
    `).run(
      values.activeModelId ?? current.activeModelId,
      values.activePageId ?? current.activePageId,
      values.activeViewKind ?? current.activeViewKind,
      JSON.stringify(values.panelState ?? current.panelState),
      JSON.stringify(values.viewportState ?? current.viewportState),
      JSON.stringify(values.selectedEntities ?? current.selectedEntities),
      now,
    );
    return this.getWorkspaceState();
  }

  loadEditorDocument(options = {}) {
    const workspace = this.getWorkspaceState();
    const requestedModelId = options.modelId || options.activeModelId || null;
    const requestedPageId = options.pageId || options.activePageId || null;
    const requestedViewKind = options.viewKind || options.activeViewKind || null;
    const modelId = requestedModelId || workspace.activeModelId;
    const pageId = requestedPageId
      || (!requestedModelId || requestedModelId === workspace.activeModelId ? workspace.activePageId : null);
    const viewKind = requestedViewKind || workspace.activeViewKind;
    let row;
    if (pageId) {
      row = requestedModelId
        ? this.database.prepare(`
            SELECT * FROM app_editor_document WHERE page_id = ? AND view_kind = ? AND model_id = ?
          `).get(pageId, viewKind, requestedModelId)
        : this.database.prepare(`
            SELECT * FROM app_editor_document WHERE page_id = ? AND view_kind = ?
          `).get(pageId, viewKind);
    }
    if (!row && requestedPageId) throw new Error('The requested editor page does not exist in the selected model and view.');
    if (!row && modelId) {
      row = this.database.prepare(`
        SELECT * FROM app_editor_document WHERE model_id = ? AND view_kind = ? ORDER BY updated_at DESC LIMIT 1
      `).get(modelId, viewKind);
    }
    if (!row && requestedModelId) throw new Error('The requested editor model does not contain this view.');
    if (!row) row = this.database.prepare('SELECT * FROM app_editor_document ORDER BY updated_at DESC LIMIT 1').get();
    if (!row) throw new Error('No editor document exists in the project.');
    return {
      modelId: row.model_id,
      pageId: row.page_id,
      viewKind: row.view_kind,
      contentHash: row.content_hash,
      updatedAt: row.updated_at,
      document: JSON.parse(row.document_json),
    };
  }


  listEditorDocuments(modelId = null) {
    const rows = modelId
      ? this.database.prepare(`
          SELECT model_id, page_id, view_kind, content_hash, updated_at, document_json
          FROM app_editor_document WHERE model_id = ? ORDER BY view_kind, updated_at
        `).all(modelId)
      : this.database.prepare(`
          SELECT model_id, page_id, view_kind, content_hash, updated_at, document_json
          FROM app_editor_document ORDER BY model_id, view_kind, updated_at
        `).all();
    return rows.map((row) => ({
      modelId: row.model_id,
      pageId: row.page_id,
      viewKind: row.view_kind,
      contentHash: row.content_hash,
      updatedAt: row.updated_at,
      document: JSON.parse(row.document_json),
    }));
  }

  getCommandLog(limit = 100, modelId = null) {
    const boundedLimit = Math.max(1, Math.min(1000, Number(limit) || 100));
    const requestedModel = modelId || null;
    const rows = requestedModel
      ? this.database.prepare(`
          SELECT c.command_seq, c.command_id, c.model_id, c.actor_id, c.batch_id,
                 c.command_type, c.payload_json, c.result_json, c.committed_at, c.content_hash,
                 (
                   SELECT s.id FROM snapshot s
                   WHERE s.snapshot_kind = 'recovery'
                     AND s.model_id = c.model_id
                     AND s.head_command_seq = c.command_seq
                   ORDER BY s.created_at DESC LIMIT 1
                 ) AS snapshot_id
          FROM command_log c
          WHERE c.model_id = ?
          ORDER BY c.command_seq DESC LIMIT ?
        `).all(requestedModel, boundedLimit)
      : this.database.prepare(`
          SELECT c.command_seq, c.command_id, c.model_id, c.actor_id, c.batch_id,
                 c.command_type, c.payload_json, c.result_json, c.committed_at, c.content_hash,
                 (
                   SELECT s.id FROM snapshot s
                   WHERE s.snapshot_kind = 'recovery'
                     AND s.model_id = c.model_id
                     AND s.head_command_seq = c.command_seq
                   ORDER BY s.created_at DESC LIMIT 1
                 ) AS snapshot_id
          FROM command_log c
          ORDER BY c.command_seq DESC LIMIT ?
        `).all(boundedLimit);
    const currentDocuments = new Map(this.database.prepare(`
      SELECT model_id, page_id, view_kind, content_hash FROM app_editor_document
    `).all().map((row) => [`${row.model_id}:${row.page_id}:${row.view_kind}`, row.content_hash]));
    return rows.map((row) => {
      const payload = JSON.parse(row.payload_json);
      const result = JSON.parse(row.result_json);
      const documentContentHash = typeof result.contentHash === 'string' ? result.contentHash : '';
      const documentKey = `${row.model_id}:${String(payload.pageId || '')}:${String(payload.viewKind || '')}`;
      return {
        sequence: row.command_seq,
        id: row.command_id,
        modelId: row.model_id,
        actorId: row.actor_id,
        batchId: row.batch_id,
        type: row.command_type,
        payload,
        result,
        committedAt: row.committed_at,
        contentHash: row.content_hash,
        documentContentHash,
        current: Boolean(documentContentHash) && currentDocuments.get(documentKey) === documentContentHash,
        restorable: Boolean(row.snapshot_id),
        snapshotAvailable: Boolean(row.snapshot_id),
        snapshotId: row.snapshot_id || null,
      };
    });
  }

  getWorkspace() {
    const workspace = this.getWorkspaceState();
    const document = this.loadEditorDocument(workspace);
    const modelData = this.listModelsAndPages();
    return {
      path: this.path,
      meta: this.getMeta(),
      ...modelData,
      workspace: {
        ...workspace,
        activeModelId: document.modelId,
        activePageId: document.pageId,
        activeViewKind: document.viewKind,
      },
      editor: document,
      bom: this.listBomItems(document.modelId),
      drawingElements: this.listDrawingElements(document.modelId, document.pageId),
      revisions: this.listRevisions(document.modelId),
    };
  }

  saveEditorDocument(input) {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const result = this.saveEditorDocumentInTransaction(input);
      this.database.exec('COMMIT');
      return result;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  saveEditorDocumentInTransaction(input) {
    const parsed = parseDocument(JSON.stringify(input.document));
    const modelId = input.modelId || this.getWorkspaceState().activeModelId;
    const pageId = input.pageId || this.getWorkspaceState().activePageId;
    const viewKind = input.viewKind || this.getWorkspaceState().activeViewKind;
    if (!modelId || !pageId) throw new Error('A model and page are required to save an editor document.');
    const page = this.database.prepare('SELECT id FROM canvas_page WHERE id = ? AND model_id = ? AND view_kind = ?').get(pageId, modelId, viewKind);
    if (!page) throw new Error('The requested model/page/view combination does not exist.');

    const json = JSON.stringify(parsed);
    const contentHash = sha256(json);
    const previous = this.database.prepare(`
      SELECT content_hash, document_json FROM app_editor_document WHERE page_id = ? AND view_kind = ?
    `).get(pageId, viewKind);
    if (previous?.content_hash === contentHash) {
      this.setWorkspaceState({
        activeModelId: modelId,
        activePageId: pageId,
        activeViewKind: viewKind,
        viewportState: input.viewportState,
        selectedEntities: input.selectedEntities,
        panelState: input.panelState,
      });
      return { changed: false, contentHash, revision: parsed.revision, savedAt: nowIso() };
    }

    const now = nowIso();
    this.database.prepare(`
        INSERT INTO app_editor_document(
          id, model_id, page_id, view_kind, schema_version,
          document_revision, content_hash, document_json, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(page_id, view_kind) DO UPDATE SET
          schema_version = excluded.schema_version,
          document_revision = excluded.document_revision,
          content_hash = excluded.content_hash,
          document_json = excluded.document_json,
          updated_at = excluded.updated_at
      `).run(
        `${pageId}:${viewKind}`,
        modelId,
        pageId,
        viewKind,
        parsed.schemaVersion,
        parsed.revision,
        contentHash,
        json,
        now,
      );

      this.database.prepare('UPDATE canvas_page SET viewport_json = ?, modified_at = ? WHERE id = ?')
        .run(JSON.stringify(input.viewportState || {}), now, pageId);
      this.database.prepare('UPDATE design_model SET modified_at = ? WHERE id = ?').run(now, modelId);
      this.database.prepare('UPDATE project_meta SET modified_at = ? WHERE singleton_id = 1').run(now);

      const workspace = this.getWorkspaceState();
      this.database.prepare(`
        UPDATE app_workspace_state SET
          active_model_id = ?, active_page_id = ?, active_view_kind = ?,
          panel_state_json = ?, viewport_state_json = ?, selected_entities_json = ?, updated_at = ?
        WHERE singleton_id = 1
      `).run(
        modelId,
        pageId,
        viewKind,
        JSON.stringify(input.panelState ?? workspace.panelState),
        JSON.stringify(input.viewportState ?? workspace.viewportState),
        JSON.stringify(input.selectedEntities ?? workspace.selectedEntities),
        now,
      );

      const commandId = createId('command');
      const batchId = input.batchId || createId('batch');
      const actorId = this.database.prepare('SELECT local_actor_id FROM project_meta WHERE singleton_id = 1').get().local_actor_id;
      const payload = {
        pageId,
        viewKind,
        reason: input.reason || 'editor change',
        documentRevision: parsed.revision,
        previousContentHash: previous?.content_hash || null,
        contentHash,
      };
      const commandResult = this.database.prepare(`
        INSERT INTO command_log(
          command_id, schema_version, model_id, actor_id, batch_id, command_type,
          payload_json, preconditions_json, result_json, inverse_json,
          committed_at, content_hash
        ) VALUES (?, 1, ?, ?, ?, 'editor.document.commit', ?, '[]', ?, ?, ?, ?)
      `).run(
        commandId,
        modelId,
        actorId,
        batchId,
        JSON.stringify(payload),
        JSON.stringify({ contentHash, revision: parsed.revision }),
        JSON.stringify({ previousContentHash: previous?.content_hash || null }),
        now,
        sha256(JSON.stringify(payload)),
      );

      this.rebuildNormalizedModel(modelId);
    this.createRecoverySnapshot(modelId, pageId, viewKind, parsed, Number(commandResult.lastInsertRowid));
    return { changed: true, contentHash, revision: parsed.revision, savedAt: now, commandSequence: Number(commandResult.lastInsertRowid) };
  }

  rebuildNormalizedModel(modelId) {
    const rows = this.database.prepare(`
      SELECT model_id, page_id, view_kind, document_json
      FROM app_editor_document WHERE model_id = ?
      ORDER BY CASE view_kind WHEN 'layout' THEN 0 ELSE 1 END, updated_at DESC
    `).all(modelId);
    if (!rows.length) return;
    const documents = rows.map((row) => ({ ...row, document: JSON.parse(row.document_json) }));
    const engineering = documents[0].document;
    const now = nowIso();

    this.database.prepare('DELETE FROM editor_label WHERE model_id = ?').run(modelId);
    this.database.prepare('DELETE FROM editor_wire_appearance WHERE model_id = ?').run(modelId);
    this.database.prepare('DELETE FROM editor_route_constraint WHERE model_id = ?').run(modelId);
    this.database.prepare('DELETE FROM route_point WHERE model_id = ?').run(modelId);
    this.database.prepare('DELETE FROM view_placement WHERE model_id = ?').run(modelId);
    this.database.prepare('DELETE FROM conductor WHERE model_id = ?').run(modelId);
    this.database.prepare('DELETE FROM component WHERE model_id = ?').run(modelId);

    const componentStatement = this.database.prepare(`
      INSERT INTO component(
        id, model_id, designator, name, category, component_kind,
        manufacturer, mpn, lifecycle_state,
        rotation_layout_udeg, rotation_schematic_udeg,
        custom_properties_json, created_at, modified_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)
    `);
    const pinStatement = this.database.prepare(`
      INSERT INTO pin(
        id, component_id, pin_index, label, function, detail,
        electrical_class, connection_limit, properties_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const componentId of engineering.componentOrder) {
      const component = engineering.components[componentId];
      if (!component) continue;
      componentStatement.run(
        component.id,
        modelId,
        component.designator || component.id,
        component.labels?.title || component.designator || component.id,
        component.kind || 'custom',
        componentKind(component.kind),
        component.labels?.manufacturer || '',
        component.labels?.partNumber || '',
        (component.rotation || 0) * 1000000,
        (component.rotation || 0) * 1000000,
        JSON.stringify(component.metadata || {}),
        now,
        now,
      );
      for (const { port, label, index } of normalizePinLabels(component)) {
        pinStatement.run(
          port.id,
          component.id,
          index,
          label,
          port.function || '',
          port.detail || '',
          port.electricalClass || 'unknown',
          port.connectionPolicy?.maximumConnections ?? 1,
          JSON.stringify(port.metadata || {}),
        );
      }
    }

    const conductorStatement = this.database.prepare(`
      INSERT INTO conductor(
        id, model_id, designator, name, conductor_kind, route_state,
        color_code, stripe_code, properties_json, created_at, modified_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const endpointStatement = this.database.prepare(`
      INSERT INTO conductor_endpoint(
        id, conductor_id, endpoint_order, target_kind, target_id,
        connection_side, properties_json
      ) VALUES (?, ?, ?, ?, ?, 'unspecified', ?)
    `);
    for (const wireId of engineering.wireOrder) {
      const wire = engineering.wires[wireId];
      if (!wire) continue;
      conductorStatement.run(
        wire.id,
        modelId,
        wire.id,
        wire.label || wire.signal || wire.id,
        conductorKind(wire.kind),
        routeStatus(wire),
        primaryColor(wire.style?.pattern),
        secondaryColor(wire.style?.pattern),
        JSON.stringify({ signal: wire.signal || null, style: wire.style || {}, routing: wire.routing || {} }),
        now,
        now,
      );
      [wire.source, wire.target].forEach((endpoint, order) => {
        const projected = endpointProjection(endpoint, wire.id, order);
        endpointStatement.run(
          `${wire.id}:endpoint:${order}`,
          wire.id,
          order,
          projected.targetKind,
          projected.targetId,
          JSON.stringify(endpoint),
        );
      });
    }

    for (const row of documents) this.insertViewProjection(modelId, row.page_id, row.view_kind, row.document, now);
  }

  insertViewProjection(modelId, pageId, viewKind, document, now) {
    const placementStatement = this.database.prepare(`
      INSERT INTO view_placement(
        id, model_id, page_id, view_kind, entity_kind, entity_id,
        x_lu, y_lu, width_lu, height_lu, rotation_udeg, z_order,
        visible, locked, display_json
      ) VALUES (?, ?, ?, ?, 'component', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const componentViewStatement = this.database.prepare(`
      INSERT INTO editor_component_view_state(
        id, placement_id, sizing_mode, minimum_width_lu, minimum_height_lu,
        maximum_width_lu, maximum_height_lu, header_height_lu, footer_height_lu,
        row_height_lu, row_gap_lu, body_radius_lu, obstacle_padding_lu,
        lead_in_lu, mirror_x, mirror_y, pin_visibility_mode,
        layout_rules_json, style_json, modified_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'all', ?, ?, ?)
    `);
    const bankStatement = this.database.prepare(`
      INSERT INTO editor_pin_bank_view(
        id, component_view_state_id, bank_key, side, bank_order, flow,
        edge_padding_lu, row_gap_lu, label_column_width_lu,
        function_column_width_lu, collapsed, collapse_empty,
        header_text, style_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, '{}')
    `);
    const portStatement = this.database.prepare(`
      INSERT INTO editor_port_view_override(
        id, component_view_state_id, pin_id, bank_id, side_override,
        display_order, side_fraction_ppm, tangent_offset_lu, normal_offset_lu,
        minimum_row_height_lu, label_override, function_override,
        detail_override, visible, label_visible, function_visible, style_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, '{}')
    `);

    for (const componentId of document.componentOrder) {
      const component = document.components[componentId];
      if (!component) continue;
      const geometry = buildComponentGeometry(component);
      const placementId = `${pageId}:${viewKind}:component:${component.id}`;
      const viewId = `${placementId}:state`;
      placementStatement.run(
        placementId,
        modelId,
        pageId,
        viewKind,
        component.id,
        lu(component.position.x),
        lu(component.position.y),
        lu(geometry.worldBody.width),
        lu(geometry.worldBody.height),
        component.rotation * 1000000,
        component.zIndex || 0,
        booleanInteger(!component.hidden),
        booleanInteger(component.locked),
        JSON.stringify({ labels: component.labels, kind: component.kind }),
      );
      componentViewStatement.run(
        viewId,
        placementId,
        component.size ? 'manual' : 'auto',
        lu(component.layout.minimumSize.width),
        lu(component.layout.minimumSize.height),
        nullableLu(component.layout.maximumSize?.width),
        nullableLu(component.layout.maximumSize?.height),
        lu(component.layout.headerHeight),
        lu(component.layout.footerHeight),
        lu(component.layout.rowHeight),
        lu(component.layout.rowGap),
        lu(component.style?.bodyRadius ?? 6),
        lu(component.layout.obstaclePadding),
        lu(component.layout.portLeadIn),
        booleanInteger(component.mirrorX),
        booleanInteger(component.mirrorY),
        JSON.stringify(component.layout),
        JSON.stringify(component.style || {}),
        now,
      );
      const sideOrder = new Map();
      const bankIds = new Map();
      for (const bank of component.pinBanks || []) {
        const order = sideOrder.get(bank.side) || 0;
        sideOrder.set(bank.side, order + 1);
        const bankId = `${viewId}:bank:${bank.id}`;
        bankIds.set(bank.id, bankId);
        bankStatement.run(
          bankId,
          viewId,
          bank.id,
          bank.side,
          order,
          String(bank.flow || 'forward').replaceAll('-', '_'),
          lu(bank.edgePadding || 0),
          lu(bank.rowGap || 0),
          nullableLu(bank.labelColumnWidth),
          nullableLu(bank.functionColumnWidth),
          booleanInteger(bank.collapseEmpty),
          bank.header || null,
        );
      }
      for (const port of component.ports || []) {
        portStatement.run(
          `${viewId}:port:${port.id}`,
          viewId,
          port.id,
          port.bankId ? bankIds.get(port.bankId) || null : null,
          port.side,
          port.order,
          port.sideFraction == null ? null : Math.round(port.sideFraction * 1000000),
          lu(port.tangentOffset || 0),
          lu(port.normalOffset || 0),
          nullableLu(port.minimumRowHeight),
          port.label || null,
          port.function || null,
          port.detail || null,
          booleanInteger(port.visible),
        );
      }
    }

    const routePointStatement = this.database.prepare(`
      INSERT INTO route_point(
        id, model_id, owner_kind, owner_id, view_kind, page_id,
        route_branch, point_order, point_kind, x_lu, y_lu,
        locked, properties_json
      ) VALUES (?, ?, 'conductor', ?, ?, ?, 'main', ?, ?, ?, ?, ?, '{}')
    `);
    const wireAppearanceStatement = this.database.prepare(`
      INSERT INTO editor_wire_appearance(
        id, model_id, page_id, view_kind, owner_kind, owner_id,
        route_branch, path_style, route_pattern, color_pattern,
        primary_color, secondary_color, tertiary_color,
        stroke_width_lu, outline_width_lu, stripe_width_lu,
        pattern_repeat_lu, opacity_ppm, line_cap, line_join,
        requested_radius_lu, clearance_lu, lead_in_lu,
        minimum_segment_lu, z_order, style_json, modified_at
      ) VALUES (?, ?, ?, ?, 'conductor', ?, 'main', ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const routeConstraintStatement = this.database.prepare(`
      INSERT INTO editor_route_constraint(
        id, model_id, page_id, view_kind, owner_kind, owner_id,
        route_branch, constraint_order, constraint_kind, strength,
        owner_frame, x_lu, y_lu, rect_x_lu, rect_y_lu,
        rect_width_lu, rect_height_lu, coordinate_lu,
        segment_index, side, locked, metadata_json, modified_at
      ) VALUES (?, ?, ?, ?, 'conductor', ?, 'main', ?, ?, ?, 'world', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const wireId of document.wireOrder) {
      const wire = document.wires[wireId];
      if (!wire) continue;
      const points = wire.route?.points || [];
      points.forEach((point, index) => routePointStatement.run(
        `${pageId}:${viewKind}:${wire.id}:point:${index}`,
        modelId,
        wire.id,
        viewKind,
        pageId,
        index,
        index === 0 || index === points.length - 1 ? 'endpoint' : 'bend',
        lu(point.x),
        lu(point.y),
        0,
      ));
      const pattern = wire.style?.pattern || { kind: 'solid', color: '#4b5563' };
      const pathStyle = wire.routing?.pattern === 'direct' ? 'straight' : wire.routing?.pattern === 'manual' ? 'manual' : 'orthogonal';
      wireAppearanceStatement.run(
        `${pageId}:${viewKind}:${wire.id}:appearance`,
        modelId,
        pageId,
        viewKind,
        wire.id,
        pathStyle,
        routePattern(wire.routing?.pattern),
        colorPattern(pattern),
        primaryColor(pattern),
        secondaryColor(pattern),
        lu(wire.style?.width || 3),
        lu(wire.style?.outlineWidth || 0),
        nullableLu(pattern.stripeWidth),
        nullableLu(pattern.repeat),
        Math.round((wire.style?.opacity ?? 1) * 1000000),
        wire.style?.lineCap || 'round',
        wire.style?.lineJoin || 'round',
        lu(wire.routing?.requestedRadius || 0),
        lu(wire.routing?.clearance || 0),
        lu(wire.routing?.leadIn || 0),
        lu(wire.routing?.minimumSegment || 0),
        wire.style?.zIndex || 0,
        JSON.stringify(wire.style || {}),
        now,
      );
      for (let index = 0; index < (wire.routing?.constraints || []).length; index += 1) {
        const constraint = wire.routing.constraints[index];
        routeConstraintStatement.run(
          `${pageId}:${viewKind}:${wire.id}:constraint:${constraint.id}`,
          modelId,
          pageId,
          viewKind,
          wire.id,
          index,
          String(constraint.kind).replaceAll('-', '_'),
          constraint.strength || 'strong',
          nullableLu(constraint.point?.x),
          nullableLu(constraint.point?.y),
          nullableLu(constraint.rect?.x),
          nullableLu(constraint.rect?.y),
          nullableLu(constraint.rect?.width),
          nullableLu(constraint.rect?.height),
          nullableLu(constraint.coordinate),
          constraint.segmentIndex ?? null,
          constraint.side ?? null,
          booleanInteger(constraint.locked),
          JSON.stringify(constraint.metadata || {}),
          now,
        );
      }
    }

    const labelStatement = this.database.prepare(`
      INSERT INTO editor_label(
        id, model_id, page_id, view_kind, owner_kind, owner_id,
        secondary_owner_id, label_role, text_value, secondary_text,
        placement_mode, anchor_kind, anchor_x_lu, anchor_y_lu,
        path_fraction_ppm, segment_index, preferred_side,
        offset_x_lu, offset_y_lu, world_x_lu, world_y_lu,
        orientation, priority, avoid_components, avoid_wires,
        allow_leader, visible, locked, style_json, modified_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'custom', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const labelId of document.labelOrder) {
      const label = document.labels[labelId];
      if (!label) continue;
      const owner = labelOwner(label);
      const preferred = label.anchor?.preferredCandidates?.[0]?.replaceAll('-', '_') || null;
      labelStatement.run(
        `${pageId}:${viewKind}:${label.id}`,
        modelId,
        pageId,
        viewKind,
        owner.ownerKind,
        owner.ownerId,
        label.anchor?.portId || null,
        label.text || '',
        label.secondaryText || null,
        String(label.mode || 'auto').replaceAll('-', '_'),
        labelAnchorKind(label),
        nullableLu(label.anchor?.point?.x),
        nullableLu(label.anchor?.point?.y),
        label.anchor?.wireFraction == null ? null : Math.round(label.anchor.wireFraction * 1000000),
        label.anchor?.segmentIndex ?? null,
        preferred,
        lu(label.offset?.x || 0),
        lu(label.offset?.y || 0),
        nullableLu(label.worldPosition?.x),
        nullableLu(label.worldPosition?.y),
        String(label.orientation || 'horizontal').replaceAll('-', '_'),
        label.priority || 0,
        booleanInteger(label.avoidComponents),
        booleanInteger(label.avoidWires),
        booleanInteger(label.allowLeader),
        booleanInteger(label.visible),
        booleanInteger(label.locked),
        JSON.stringify(label.style || {}),
        now,
      );
    }
  }

  createRecoverySnapshot(modelId, pageId, viewKind, document, headCommandSeq) {
    const wrapper = JSON.stringify({ pageId, viewKind, document });
    this.database.prepare(`
      INSERT INTO snapshot(
        id, revision_id, model_id, head_command_seq, snapshot_kind,
        codec, content_hash, snapshot_blob, created_at
      ) VALUES (?, NULL, ?, ?, 'recovery', 'json-utf8', ?, ?, ?)
    `).run(createId('snapshot'), modelId, headCommandSeq, sha256(wrapper), Buffer.from(wrapper, 'utf8'), nowIso());
    this.database.prepare(`
      DELETE FROM snapshot
      WHERE snapshot_kind = 'recovery' AND model_id = ? AND id NOT IN (
        SELECT id FROM snapshot
        WHERE snapshot_kind = 'recovery' AND model_id = ?
        ORDER BY head_command_seq DESC, created_at DESC LIMIT 300
      )
    `).run(modelId, modelId);
  }

  restoreCommand(commandSequence) {
    const sequence = Number(commandSequence);
    if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error('A valid command sequence is required.');
    const row = this.database.prepare(`
      SELECT c.command_seq, c.command_type, c.committed_at, c.model_id,
             s.id AS snapshot_id, s.snapshot_blob
      FROM command_log c
      JOIN snapshot s
        ON s.snapshot_kind = 'recovery'
       AND s.model_id = c.model_id
       AND s.head_command_seq = c.command_seq
      WHERE c.command_seq = ?
      ORDER BY s.created_at DESC
      LIMIT 1
    `).get(sequence);
    if (!row) throw new Error(`A recovery snapshot is not available for command #${sequence}.`);
    const wrapper = JSON.parse(Buffer.from(row.snapshot_blob).toString('utf8'));
    if (!wrapper?.pageId || !wrapper?.viewKind || !wrapper?.document) {
      throw new Error(`Recovery snapshot for command #${sequence} is invalid.`);
    }
    const current = this.loadEditorDocument({
      modelId: row.model_id,
      pageId: wrapper.pageId,
      viewKind: wrapper.viewKind,
    });
    const document = structuredClone(wrapper.document);
    const snapshotRevision = Number(document.revision) || 0;
    const currentRevision = Number(current.document.revision) || 0;
    document.revision = Math.max(snapshotRevision, currentRevision) + 1;
    document.metadata = {
      ...(document.metadata || {}),
      historyCheckout: {
        commandSequence: sequence,
        sourceRevision: snapshotRevision,
        sourceCommittedAt: row.committed_at,
        checkedOutAt: nowIso(),
      },
    };
    return this.saveEditorDocument({
      modelId: row.model_id,
      pageId: wrapper.pageId,
      viewKind: wrapper.viewKind,
      document,
      selectedEntities: [],
      reason: `checkout command #${sequence}`,
    });
  }

  createRevision(input = {}) {
    const editor = this.loadEditorDocument({ modelId: input.modelId, pageId: input.pageId, viewKind: input.viewKind });
    const modelId = editor.modelId;
    const document = editor.document;
    const wrapper = JSON.stringify({ pageId: editor.pageId, viewKind: editor.viewKind, document });
    const revisionId = createId('revision');
    const snapshotId = createId('snapshot');
    const actorId = this.database.prepare('SELECT local_actor_id FROM project_meta WHERE singleton_id = 1').get().local_actor_id;
    const head = this.database.prepare('SELECT max(command_seq) AS seq FROM command_log WHERE model_id = ?').get(modelId).seq || null;
    const previous = this.database.prepare('SELECT id FROM revision WHERE model_id = ? ORDER BY created_at DESC LIMIT 1').get(modelId);
    const now = nowIso();
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.database.prepare(`
        INSERT INTO revision(
          id, model_id, revision_name, message, author_actor_id,
          lifecycle_state, head_command_seq, model_content_hash,
          validation_summary_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        revisionId,
        modelId,
        input.name || `Revision ${new Date().toLocaleString('en-GB')}`,
        input.message || '',
        actorId,
        input.lifecycleState || 'draft',
        head,
        editor.contentHash,
        JSON.stringify(validationSummary(document)),
        now,
      );
      if (previous) {
        this.database.prepare('INSERT INTO revision_parent(revision_id, parent_revision_id, parent_order) VALUES (?, ?, 0)')
          .run(revisionId, previous.id);
      }
      this.database.prepare(`
        INSERT INTO snapshot(
          id, revision_id, model_id, head_command_seq, snapshot_kind,
          codec, content_hash, snapshot_blob, created_at
        ) VALUES (?, ?, ?, ?, 'revision', 'json-utf8', ?, ?, ?)
      `).run(snapshotId, revisionId, modelId, head, sha256(wrapper), Buffer.from(wrapper, 'utf8'), now);
      this.database.exec('COMMIT');
      return this.listRevisions(modelId).find((revision) => revision.id === revisionId);
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  listRevisions(modelId = null) {
    const rows = modelId
      ? this.database.prepare(`
          SELECT r.*, s.id AS snapshot_id
          FROM revision r LEFT JOIN snapshot s ON s.revision_id = r.id AND s.snapshot_kind = 'revision'
          WHERE r.model_id = ? ORDER BY r.created_at DESC
        `).all(modelId)
      : this.database.prepare(`
          SELECT r.*, s.id AS snapshot_id
          FROM revision r LEFT JOIN snapshot s ON s.revision_id = r.id AND s.snapshot_kind = 'revision'
          ORDER BY r.created_at DESC
        `).all();
    return rows.map((row) => ({
      id: row.id,
      modelId: row.model_id,
      name: row.revision_name,
      message: row.message,
      lifecycleState: row.lifecycle_state,
      headCommandSeq: row.head_command_seq,
      contentHash: row.model_content_hash,
      validation: JSON.parse(row.validation_summary_json),
      createdAt: row.created_at,
      releasedAt: row.released_at,
      snapshotId: row.snapshot_id,
    }));
  }

  restoreRevision(revisionId) {
    const row = this.database.prepare(`
      SELECT r.model_id, s.snapshot_blob
      FROM revision r JOIN snapshot s ON s.revision_id = r.id AND s.snapshot_kind = 'revision'
      WHERE r.id = ?
    `).get(revisionId);
    if (!row) throw new Error('Revision snapshot not found.');
    const wrapper = JSON.parse(Buffer.from(row.snapshot_blob).toString('utf8'));
    return this.saveEditorDocument({
      modelId: row.model_id,
      pageId: wrapper.pageId,
      viewKind: wrapper.viewKind,
      document: wrapper.document,
      reason: `restore revision ${revisionId}`,
    });
  }


  generateAssembly(input = {}) {
    const sourceEditor = this.loadEditorDocument({
      modelId: input.sourceModelId,
      pageId: input.sourcePageId,
      viewKind: input.sourceViewKind || 'layout',
    });
    const generated = cloneAssemblyDocument(
      sourceEditor.document,
      input.componentIds || [],
      input.wireIds || [],
    );
    if (!generated.document.componentOrder.length) {
      throw new Error('Select at least one component before generating an assembly.');
    }
    const prefix = String(input.designatorPrefix || '').trim();
    if (prefix) {
      for (const componentId of generated.document.componentOrder) {
        const component = generated.document.components[componentId];
        if (component.designator) component.designator = `${prefix}-${component.designator}`;
      }
    }
    const schematic = createSchematicFromLayout(generated.document);
    const assemblyId = createId('assembly');
    const layoutPageId = createId('page-layout');
    const schematicPageId = createId('page-schematic');
    const name = input.name || `Assembly ${this.listModelsAndPages().models.filter((model) => model.kind === 'assembly').length + 1}`;
    const now = nowIso();

    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.database.prepare(`
        INSERT INTO design_model(
          id, kind, name, description, designator, source_mode,
          lifecycle_state, created_at, modified_at, extra_json
        ) VALUES (?, 'assembly', ?, ?, ?, 'generated', 'draft', ?, ?, ?)
      `).run(
        assemblyId,
        name,
        input.description || `Generated from ${sourceEditor.modelId}`,
        input.designator || `ASM-${Date.now().toString(36).toUpperCase()}`,
        now,
        now,
        JSON.stringify({ sourceModelId: sourceEditor.modelId, sourcePageId: sourceEditor.pageId }),
      );
      const pageStatement = this.database.prepare(`
        INSERT INTO canvas_page(
          id, model_id, view_kind, name, page_order, width_um, height_um,
          orientation, viewport_json, layer_state_json, created_at, modified_at
        ) VALUES (?, ?, ?, ?, 0, 1189000, 841000, 'landscape', '{}', '{}', ?, ?)
      `);
      pageStatement.run(layoutPageId, assemblyId, 'layout', 'Assembly Layout', now, now);
      pageStatement.run(schematicPageId, assemblyId, 'schematic', 'Assembly Schematic', now, now);
      generated.document.metadata = {
        ...(generated.document.metadata || {}),
        title: `${name} Layout`,
        assemblyModelId: assemblyId,
      };
      schematic.metadata = {
        ...(schematic.metadata || {}),
        title: `${name} Schematic`,
        assemblyModelId: assemblyId,
      };
      this.insertEditorDocument(assemblyId, layoutPageId, 'layout', generated.document, now);
      this.insertEditorDocument(assemblyId, schematicPageId, 'schematic', schematic, now);
      this.database.prepare(`
        UPDATE app_workspace_state SET
          active_model_id = ?, active_page_id = ?, active_view_kind = 'layout',
          viewport_state_json = '{}', selected_entities_json = '[]', updated_at = ?
        WHERE singleton_id = 1
      `).run(assemblyId, layoutPageId, now);
      this.rebuildNormalizedModel(assemblyId);

      const mappingStatement = this.database.prepare(`
        INSERT INTO assembly_origin_mapping(
          id, assembly_model_id, assembly_entity_kind, assembly_entity_id,
          origin_model_id, origin_entity_kind, origin_entity_id,
          origin_revision_id, generation_rule_version,
          last_synced_content_hash, field_ownership_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const originRevision = this.database.prepare(`
        SELECT id FROM revision WHERE model_id = ? ORDER BY created_at DESC LIMIT 1
      `).get(sourceEditor.modelId)?.id || null;
      for (const [originId, assemblyEntityId] of generated.componentMap) {
        mappingStatement.run(
          createId('origin-map'), assemblyId, 'component', assemblyEntityId,
          sourceEditor.modelId, 'component', originId, originRevision,
          APP_VERSION, assemblyOriginContentHash('component', sourceEditor.document.components[originId]),
          JSON.stringify(COMPONENT_ASSEMBLY_FIELD_OWNERSHIP),
        );
      }
      for (const [originId, assemblyEntityId] of generated.wireMap) {
        mappingStatement.run(
          createId('origin-map'), assemblyId, 'conductor', assemblyEntityId,
          sourceEditor.modelId, 'conductor', originId, originRevision,
          APP_VERSION, assemblyOriginContentHash('conductor', sourceEditor.document.wires[originId]),
          JSON.stringify(CONDUCTOR_ASSEMBLY_FIELD_OWNERSHIP),
        );
      }
      this.createRecoverySnapshot(assemblyId, layoutPageId, 'layout', generated.document, null);
      const sheetId = this.ensureLayoutSheet(assemblyId, layoutPageId, name, now);
      this.insertDefaultDrawingElements(sheetId, name);
      this.database.exec('COMMIT');
      return this.getWorkspace();
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  ensureLayoutSheet(modelId, pageId, name = 'Assembly Drawing', now = nowIso()) {
    const page = this.database.prepare(`
      SELECT id, name, width_um, height_um, orientation FROM canvas_page
      WHERE id = ? AND model_id = ? AND view_kind = 'layout'
    `).get(pageId, modelId);
    if (!page) throw new Error('Drawing elements require a layout page in the selected model.');
    let layout = this.database.prepare('SELECT id FROM layout_document WHERE model_id = ? ORDER BY created_at LIMIT 1').get(modelId);
    if (!layout) {
      layout = { id: createId('layout-document') };
      this.database.prepare(`
        INSERT INTO layout_document(id, model_id, name, status, properties_json, created_at, modified_at)
        VALUES (?, ?, ?, 'draft', '{}', ?, ?)
      `).run(layout.id, modelId, name, now, now);
    }
    let sheet = this.database.prepare(`
      SELECT id FROM layout_sheet WHERE document_id = ? AND json_extract(properties_json, '$.pageId') = ?
    `).get(layout.id, pageId);
    if (!sheet) {
      sheet = { id: createId('layout-sheet') };
      const order = Number(this.database.prepare('SELECT count(*) AS count FROM layout_sheet WHERE document_id = ?').get(layout.id).count);
      this.database.prepare(`
        INSERT INTO layout_sheet(
          id, document_id, sheet_order, name, paper_size, orientation,
          width_um, height_um, properties_json
        ) VALUES (?, ?, ?, ?, 'A3', ?, ?, ?, ?)
      `).run(sheet.id, layout.id, order, page.name, page.orientation || 'landscape', page.width_um || 1189000, page.height_um || 841000, JSON.stringify({ pageId }));
    }
    return sheet.id;
  }

  insertDefaultDrawingElements(sheetId, title = 'Assembly Drawing') {
    const statement = this.database.prepare(`
      INSERT INTO layout_element(
        id, sheet_id, element_kind, x_lu, y_lu, width_lu, height_lu,
        rotation_udeg, z_order, locked, query_json, style_json, content_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?, '{}', ?)
    `);
    statement.run(createId('drawing'), sheetId, 'title_block', 650, 610, 330, 95, 10, '{}', JSON.stringify({ title, text: 'Draft · Live project data' }));
    statement.run(createId('drawing'), sheetId, 'bom_table', 650, 60, 330, 240, 5, JSON.stringify({ source: 'bom' }), JSON.stringify({ title: 'BILL OF MATERIALS' }));
    statement.run(createId('drawing'), sheetId, 'wire_schedule', 650, 320, 330, 260, 6, JSON.stringify({ source: 'wires' }), JSON.stringify({ title: 'WIRE SCHEDULE' }));
  }

  listDrawingElements(modelId = null, pageId = null) {
    const workspace = this.getWorkspaceState();
    const selectedModelId = modelId || workspace.activeModelId;
    const selectedPageId = pageId || workspace.activePageId;
    if (!selectedModelId || !selectedPageId) return [];
    const rows = this.database.prepare(`
      SELECT e.* FROM layout_element e
      JOIN layout_sheet s ON s.id = e.sheet_id
      JOIN layout_document d ON d.id = s.document_id
      WHERE d.model_id = ? AND json_extract(s.properties_json, '$.pageId') = ?
      ORDER BY e.z_order, e.id
    `).all(selectedModelId, selectedPageId);
    const editor = rows.length ? this.loadEditorDocument({ modelId: selectedModelId, pageId: selectedPageId, viewKind: 'layout' }).document : null;
    const model = this.database.prepare('SELECT name, designator, lifecycle_state FROM design_model WHERE id = ?').get(selectedModelId);
    const revision = this.database.prepare('SELECT revision_name FROM revision WHERE model_id = ? ORDER BY created_at DESC LIMIT 1').get(selectedModelId);
    return rows.map((row) => {
      const query = JSON.parse(row.query_json);
      const content = JSON.parse(row.content_json);
      if (row.element_kind === 'bom_table') {
        content.columns = ['PART', 'DESCRIPTION', 'QTY'];
        content.rows = this.listBomItems(selectedModelId).map((item) => [item.partNumber || '—', item.description || item.entityId, `${item.quantity} ${item.unit}`]);
      } else if (row.element_kind === 'wire_schedule' && editor) {
        content.columns = ['WIRE', 'SIGNAL', 'FROM', 'TO'];
        content.rows = editor.wireOrder.map((id) => {
          const wire = editor.wires[id];
          const endpoint = (value) => value.kind === 'port' ? `${editor.components[value.componentId]?.designator || value.componentId}.${editor.components[value.componentId]?.ports.find((port) => port.id === value.portId)?.label || value.portId}` : value.kind;
          return [wire.label || id, wire.signal || '—', endpoint(wire.source), endpoint(wire.target)];
        });
      } else if (row.element_kind === 'cut_list' && editor) {
        const formboard = this.getFormboard(selectedModelId);
        const byId = new Map(formboard.wires.map((wire) => [wire.wireId, wire]));
        content.columns = ['WIRE', 'SIGNAL', 'FROM', 'TO', 'LENGTH MM', 'SET MM', 'BENDS'];
        content.rows = editor.wireOrder.map((id) => {
          const wire = editor.wires[id];
          const detail = byId.get(id) || {};
          return [wire.label || id, wire.signal || '—', detail.from || '—', detail.to || '—', detail.routedLengthMm ?? 0, detail.setLengthMm ?? 0, detail.bendCount ?? 0];
        });
      } else if (row.element_kind === 'connection_table' && editor) {
        const destination = (componentId, portId) => {
          for (const wireId of editor.wireOrder) {
            const wire = editor.wires[wireId];
            const at = (endpoint) => endpoint.kind === 'port' && endpoint.componentId === componentId && endpoint.portId === portId;
            if (at(wire.source) || at(wire.target)) {
              const other = at(wire.source) ? wire.target : wire.source;
              if (other.kind === 'port') {
                const component = editor.components[other.componentId];
                return `${component?.designator || other.componentId}.${component?.ports.find((port) => port.id === other.portId)?.label || other.portId}`;
              }
              return other.kind;
            }
          }
          return '—';
        };
        content.columns = ['COMPONENT', 'PIN', 'FUNCTION', 'DESTINATION', 'WIRE'];
        content.rows = [];
        for (const componentId of editor.componentOrder) {
          const component = editor.components[componentId];
          for (const port of component.ports || []) {
            content.rows.push([component.designator || componentId, port.label, port.function || '—', destination(componentId, port.id), '—']);
          }
        }
      } else if (row.element_kind === 'continuity_table' && editor) {
        content.columns = ['TEST', 'SIGNAL', 'POINT A', 'POINT B', 'EXPECTED', 'RESULT'];
        content.rows = editor.wireOrder.map((id, index) => {
          const wire = editor.wires[id];
          const endpoint = (value) => value.kind === 'port' ? `${editor.components[value.componentId]?.designator || value.componentId}.${editor.components[value.componentId]?.ports.find((port) => port.id === value.portId)?.label || value.portId}` : value.kind;
          return [String(index + 1), wire.signal || wire.label || '—', endpoint(wire.source), endpoint(wire.target), 'CLOSED', ''];
        });
      } else if (row.element_kind === 'revision_table') {
        const revisions = this.listRevisions(selectedModelId).slice(0, 12);
        content.columns = ['REV', 'NAME', 'STATE', 'DATE'];
        content.rows = revisions.map((revision) => [revision.name, revision.message || '—', revision.lifecycleState, (revision.createdAt || '').slice(0, 10)]);
      } else if (row.element_kind === 'custom' && content.title?.toUpperCase() === 'TOOLS & FIXTURES') {
        const tools = this.listToolFixtures(selectedModelId);
        content.columns = ['NAME', 'KIND', 'P/N', 'QTY', 'LOCATION'];
        content.rows = tools.map((tool) => [tool.name, tool.kind, tool.partNumber || '—', String(tool.quantity), tool.locationNote || '—']);
      } else if (row.element_kind === 'title_block') {
        content.title = content.title || model?.name || 'ASSEMBLY DRAWING';
        content.text = `${model?.designator || 'ASSEMBLY'} · ${model?.lifecycle_state || 'draft'} · ${revision?.revision_name || 'unrevisioned'}`;
      } else if (row.element_kind === 'dimension' && editor && query.fromEntityId && query.toEntityId) {
        const from = editor.components[query.fromEntityId]?.position;
        const to = editor.components[query.toEntityId]?.position;
        if (from && to) content.value = `${Math.hypot(to.x - from.x, to.y - from.y).toFixed(1)} mm`;
      }
      return {
        id: row.id,
        kind: ({ title_block: 'title-block', bom_table: 'bom-table', wire_schedule: 'wire-schedule', cut_list: 'cut-list', connection_table: 'connection-table', continuity_table: 'continuity-table', revision_table: 'revision-table', note: 'leader-note' })[row.element_kind] || row.element_kind,
        x: row.x_lu,
        y: row.y_lu,
        width: row.width_lu,
        height: row.height_lu,
        rotation: row.rotation_udeg / 1000000,
        locked: Boolean(row.locked),
        query,
        style: JSON.parse(row.style_json),
        content,
      };
    });
  }

  saveDrawingElement(input = {}) {
    const modelId = input.modelId || this.getWorkspaceState().activeModelId;
    const pageId = input.pageId || this.getWorkspaceState().activePageId;
    const model = this.database.prepare(`
      SELECT m.name FROM design_model m JOIN canvas_page p ON p.model_id = m.id
      WHERE m.id = ? AND p.id = ? AND p.view_kind = 'layout'
    `).get(modelId, pageId);
    if (!model) throw new Error('Select a layout page before adding drawing content.');
    const sheetId = this.ensureLayoutSheet(modelId, pageId, model.name);
    const kind = ({ 'title-block': 'title_block', 'bom-table': 'bom_table', 'wire-schedule': 'wire_schedule', 'cut-list': 'cut_list', 'connection-table': 'connection_table', 'continuity-table': 'continuity_table', 'revision-table': 'revision_table', 'leader-note': 'note' })[input.kind] || input.kind;
    const allowed = new Set(['dimension', 'note', 'title_block', 'bom_table', 'wire_schedule', 'cut_list', 'connection_table', 'continuity_table', 'revision_table', 'custom']);
    if (!allowed.has(kind)) throw new Error(`Unsupported drawing element kind: ${String(input.kind)}`);
    const id = input.id || createId('drawing');
    const zOrder = Number.isFinite(Number(input.zOrder)) ? Number(input.zOrder) : Number(this.database.prepare('SELECT coalesce(max(z_order), 0) + 1 AS value FROM layout_element WHERE sheet_id = ?').get(sheetId).value);
    this.database.prepare(`
      INSERT INTO layout_element(
        id, sheet_id, element_kind, x_lu, y_lu, width_lu, height_lu,
        rotation_udeg, z_order, locked, query_json, style_json, content_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        element_kind = excluded.element_kind, x_lu = excluded.x_lu, y_lu = excluded.y_lu,
        width_lu = excluded.width_lu, height_lu = excluded.height_lu,
        rotation_udeg = excluded.rotation_udeg, z_order = excluded.z_order,
        locked = excluded.locked, query_json = excluded.query_json,
        style_json = excluded.style_json, content_json = excluded.content_json
    `).run(
      id, sheetId, kind, lu(input.x ?? 80), lu(input.y ?? 80), Math.max(20, lu(input.width ?? 220)),
      Math.max(16, lu(input.height ?? 60)), lu(Number(input.rotation || 0) * 1000000), zOrder,
      booleanInteger(input.locked), JSON.stringify(input.query || {}), JSON.stringify(input.style || {}), JSON.stringify(input.content || {}),
    );
    return this.listDrawingElements(modelId, pageId).find((element) => element.id === id);
  }

  deleteDrawingElement(id) {
    return this.database.prepare('DELETE FROM layout_element WHERE id = ?').run(id).changes > 0;
  }

  previewAssemblySync(assemblyModelId = null) {
    const selectedAssemblyId = assemblyModelId || this.getWorkspaceState().activeModelId;
    const assemblyModel = this.database.prepare(`SELECT id, kind, extra_json FROM design_model WHERE id = ?`).get(selectedAssemblyId);
    if (!assemblyModel || assemblyModel.kind !== 'assembly') throw new Error('Select an assembly before reviewing synchronization.');
    const mappings = this.database.prepare(`SELECT * FROM assembly_origin_mapping WHERE assembly_model_id = ? ORDER BY origin_entity_kind, origin_entity_id`).all(selectedAssemblyId);
    const extra = JSON.parse(assemblyModel.extra_json || '{}');
    const originModelId = mappings[0]?.origin_model_id || extra.sourceModelId;
    if (!originModelId) throw new Error('This assembly has no linked project plan.');
    const origin = this.loadEditorDocument({ modelId: originModelId, viewKind: 'layout' });
    const assembly = this.loadEditorDocument({ modelId: selectedAssemblyId, viewKind: 'layout' });
    const mappingByOrigin = new Map(mappings.map((row) => [`${row.origin_entity_kind}:${row.origin_entity_id}`, row]));
    const details = [];
    const sourceEntities = [
      ...origin.document.componentOrder.map((id) => ({ kind: 'component', id, value: origin.document.components[id] })),
      ...origin.document.wireOrder.map((id) => ({ kind: 'conductor', id, value: origin.document.wires[id] })),
    ];
    for (const entity of sourceEntities) {
      const mapping = mappingByOrigin.get(`${entity.kind}:${entity.id}`);
      if (!mapping) {
        details.push({ state: 'added', entityKind: entity.kind, originEntityId: entity.id, assemblyEntityId: null, explanation: 'Exists in the project plan but has not been generated into this assembly.' });
        continue;
      }
      const assemblyValue = entity.kind === 'component' ? assembly.document.components[mapping.assembly_entity_id] : assembly.document.wires[mapping.assembly_entity_id];
      if (!assemblyValue) {
        details.push({ state: 'conflicted', entityKind: entity.kind, originEntityId: entity.id, assemblyEntityId: mapping.assembly_entity_id, explanation: 'The linked assembly entity was deleted or cannot be resolved.' });
        continue;
      }
      const currentHash = assemblyOriginContentHash(entity.kind, entity.value);
      if (currentHash !== mapping.last_synced_content_hash) {
        details.push({ state: 'changed', entityKind: entity.kind, originEntityId: entity.id, assemblyEntityId: mapping.assembly_entity_id, explanation: 'Plan-owned electrical identity or connectivity changed since the last synchronization.' });
      }
    }
    for (const mapping of mappings) {
      const originValue = mapping.origin_entity_kind === 'component' ? origin.document.components[mapping.origin_entity_id] : origin.document.wires[mapping.origin_entity_id];
      if (!originValue) details.push({ state: 'detached', entityKind: mapping.origin_entity_kind, originEntityId: mapping.origin_entity_id, assemblyEntityId: mapping.assembly_entity_id, explanation: 'The plan entity was removed; the assembly entity will be retained as detached.' });
    }
    const counts = { added: 0, changed: 0, detached: 0, conflicted: 0 };
    for (const detail of details) counts[detail.state] += 1;
    const latestOriginRevision = this.database.prepare('SELECT id, model_content_hash FROM revision WHERE model_id = ? ORDER BY created_at DESC LIMIT 1').get(originModelId);
    const toRevisionId = latestOriginRevision?.model_content_hash === origin.contentHash ? latestOriginRevision.id : origin.contentHash;
    const fromRevisionId = mappings.find((row) => row.origin_revision_id)?.origin_revision_id || null;
    const summary = { assemblyModelId: selectedAssemblyId, originModelId, originPageId: origin.pageId, counts, details };
    const previewHash = sha256(JSON.stringify({
      summary,
      originContentHash: origin.contentHash,
      assemblyContentHash: assembly.contentHash,
      fromRevisionId,
      toRevisionId,
      mappings: mappings.map((row) => ({
        id: row.id,
        originEntityKind: row.origin_entity_kind,
        originEntityId: row.origin_entity_id,
        assemblyEntityId: row.assembly_entity_id,
        lastSyncedContentHash: row.last_synced_content_hash,
        fieldOwnership: JSON.parse(row.field_ownership_json),
      })),
    }));
    const existing = this.database.prepare(`SELECT id FROM assembly_sync_record WHERE assembly_model_id = ? AND preview_hash = ? AND state = 'preview' ORDER BY created_at DESC LIMIT 1`).get(selectedAssemblyId, previewHash);
    const syncRecordId = existing?.id || createId('assembly-sync');
    if (!existing) this.database.prepare(`
      INSERT INTO assembly_sync_record(
        id, assembly_model_id, from_origin_revision_id, to_origin_revision_id,
        preview_hash, state, summary_json, created_at
      ) VALUES (?, ?, ?, ?, ?, 'preview', ?, ?)
    `).run(syncRecordId, selectedAssemblyId, fromRevisionId, toRevisionId, previewHash, JSON.stringify(summary), nowIso());
    return { id: syncRecordId, previewHash, ...summary };
  }

  applyAssemblySync(syncRecordId) {
    const record = this.database.prepare(`SELECT * FROM assembly_sync_record WHERE id = ? AND state = 'preview'`).get(syncRecordId);
    if (!record) throw new Error('The synchronization preview is missing or has already been applied.');
    const summary = JSON.parse(record.summary_json);
    const current = this.previewAssemblySync(record.assembly_model_id);
    if (current.previewHash !== record.preview_hash) throw new Error('The plan or assembly changed after this preview. Review the synchronization diff again.');
    if (current.counts.conflicted) throw new Error('Resolve conflicted entities before applying synchronization.');
    const origin = this.loadEditorDocument({ modelId: summary.originModelId, viewKind: 'layout' });
    const layout = this.loadEditorDocument({ modelId: record.assembly_model_id, viewKind: 'layout' });
    const document = structuredClone(layout.document);
    const mappings = this.database.prepare(`SELECT * FROM assembly_origin_mapping WHERE assembly_model_id = ?`).all(record.assembly_model_id);
    const componentMapping = new Map(mappings.filter((row) => row.origin_entity_kind === 'component').map((row) => [row.origin_entity_id, row]));
    const wireMapping = new Map(mappings.filter((row) => row.origin_entity_kind === 'conductor').map((row) => [row.origin_entity_id, row]));
    const portMap = new Map();
    for (const row of componentMapping.values()) {
      const component = document.components[row.assembly_entity_id];
      for (const port of component?.ports || []) portMap.set(port.metadata?.originPortId, port.id);
    }
    const mappingInserts = [];
    const mappingUpdates = [];
    const mappingDeletes = [];
    for (const originId of origin.document.componentOrder) {
      const source = origin.document.components[originId];
      let mapping = componentMapping.get(originId);
      let target = mapping ? document.components[mapping.assembly_entity_id] : null;
      if (!target) {
        const generated = cloneAssemblyDocument(origin.document, [originId], []);
        target = generated.document.components[generated.componentMap.get(originId)];
        target.position = { x: 120 + (document.componentOrder.length % 4) * 230, y: 120 + Math.floor(document.componentOrder.length / 4) * 190 };
        document.components[target.id] = target;
        document.componentOrder.push(target.id);
        mapping = {
          id: createId('origin-map'), assembly_entity_id: target.id, origin_entity_id: originId,
        };
        componentMapping.set(originId, mapping);
        mappingInserts.push({
          id: mapping.id,
          assemblyEntityKind: 'component',
          assemblyEntityId: target.id,
          originEntityKind: 'component',
          originEntityId: originId,
          contentHash: assemblyOriginContentHash('component', source),
          fieldOwnership: COMPONENT_ASSEMBLY_FIELD_OWNERSHIP,
        });
      }
      if (source.definitionId === undefined) delete target.definitionId;
      else target.definitionId = source.definitionId;
      target.kind = source.kind;
      target.designator = source.designator;
      target.labels = structuredClone(source.labels);
      const existingByOrigin = new Map(target.ports.map((port) => [port.metadata?.originPortId, port]));
      const usedBanks = new Map();
      target.ports = source.ports.map((port, index) => {
        const existing = existingByOrigin.get(port.id);
        const next = { ...structuredClone(port), id: existing?.id || createId('port') };
        delete next.bankId;
        next.metadata = { ...(structuredClone(port.metadata) || {}), originPortId: port.id };
        const side = port.side;
        let bank = usedBanks.get(side);
        if (!bank) {
          bank = target.pinBanks.find((value) => value.side === side) || { id: createId('bank'), side, portIds: [], flow: 'forward', rowGap: 2, edgePadding: 12, collapseEmpty: false };
          bank.portIds = [];
          usedBanks.set(side, bank);
        }
        next.side = side;
        next.bankId = bank.id;
        next.order = index;
        bank.portIds.push(next.id);
        portMap.set(port.id, next.id);
        return next;
      });
      target.pinBanks = [...usedBanks.values()];
      target.metadata = { ...(target.metadata || {}), originComponentId: originId, detachedFromOrigin: false };
      mappingUpdates.push({ id: mapping.id, entityKind: 'component', contentHash: assemblyOriginContentHash('component', source) });
    }
    const mapEndpoint = (endpoint) => {
      if (endpoint.kind !== 'port') return structuredClone(endpoint);
      const component = componentMapping.get(endpoint.componentId);
      const portId = portMap.get(endpoint.portId);
      return component && portId ? { kind: 'port', componentId: component.assembly_entity_id, portId } : { kind: 'off-page', point: { x: 0, y: 0 }, reference: `${endpoint.componentId}.${endpoint.portId}`, direction: 'east' };
    };
    for (const originId of origin.document.wireOrder) {
      const source = origin.document.wires[originId];
      let mapping = wireMapping.get(originId);
      let target = mapping ? document.wires[mapping.assembly_entity_id] : null;
      if (!target) {
        target = structuredClone(source);
        target.id = createId('wire');
        delete target.route;
        target.routing.constraints = [];
        document.wires[target.id] = target;
        document.wireOrder.push(target.id);
        mapping = { id: createId('origin-map'), assembly_entity_id: target.id, origin_entity_id: originId };
        wireMapping.set(originId, mapping);
        mappingInserts.push({
          id: mapping.id,
          assemblyEntityKind: 'conductor',
          assemblyEntityId: target.id,
          originEntityKind: 'conductor',
          originEntityId: originId,
          contentHash: assemblyOriginContentHash('conductor', source),
          fieldOwnership: CONDUCTOR_ASSEMBLY_FIELD_OWNERSHIP,
        });
      }
      target.label = source.label;
      target.signal = source.signal;
      target.kind = source.kind;
      target.source = mapEndpoint(source.source);
      target.target = mapEndpoint(source.target);
      target.metadata = { ...(target.metadata || {}), originWireId: originId, detachedFromOrigin: false };
      mappingUpdates.push({ id: mapping.id, entityKind: 'conductor', contentHash: assemblyOriginContentHash('conductor', source) });
    }
    for (const detail of summary.details.filter((value) => value.state === 'detached')) {
      const entity = detail.entityKind === 'component' ? document.components[detail.assemblyEntityId] : document.wires[detail.assemblyEntityId];
      if (entity) entity.metadata = { ...(entity.metadata || {}), detachedFromOrigin: true };
      mappingDeletes.push({ entityKind: detail.entityKind, originEntityId: detail.originEntityId });
      if (detail.entityKind === 'component') componentMapping.delete(detail.originEntityId);
      else wireMapping.delete(detail.originEntityId);
    }
    const usedDesignators = new Set();
    const planOwnedComponentIds = origin.document.componentOrder
      .map((originId) => componentMapping.get(originId)?.assembly_entity_id)
      .filter((id) => Boolean(id) && Boolean(document.components[id]));
    const planOwnedComponentSet = new Set(planOwnedComponentIds);
    const designatorPriority = [
      ...planOwnedComponentIds,
      ...document.componentOrder.filter((id) => !planOwnedComponentSet.has(id)),
    ];
    for (const componentId of designatorPriority) {
      const component = document.components[componentId];
      if (!component) continue;
      const original = component.designator || component.id;
      if (!usedDesignators.has(original)) {
        usedDesignators.add(original);
        continue;
      }
      const prefix = original.replace(/\d+$/u, '') || 'X';
      let number = 1;
      while (usedDesignators.has(`${prefix}${number}`)) number += 1;
      component.designator = `${prefix}${number}`;
      if (component.labels.title === original) component.labels.title = component.designator;
      usedDesignators.add(component.designator);
    }
    const schematicEnvelope = this.loadEditorDocument({ modelId: record.assembly_model_id, viewKind: 'schematic' });
    const schematic = structuredClone(schematicEnvelope.document);
    for (const id of document.componentOrder) {
      const source = document.components[id];
      if (!schematic.components[id]) {
        schematic.components[id] = structuredClone(source);
        schematic.components[id].position = { x: 120 + (schematic.componentOrder.length % 3) * 300, y: 100 + Math.floor(schematic.componentOrder.length / 3) * 240 };
        schematic.componentOrder.push(id);
      } else {
        const position = schematic.components[id].position;
        schematic.components[id] = { ...structuredClone(source), position, rotation: 0, mirrorX: false, mirrorY: false };
      }
    }
    for (const id of document.wireOrder) {
      const source = document.wires[id];
      schematic.wires[id] = { ...structuredClone(source), routing: { ...structuredClone(source.routing), pattern: 'orthogonal', constraints: [] } };
      delete schematic.wires[id].route;
        if (!schematic.wireOrder.includes(id)) schematic.wireOrder.push(id);
    }
    const validatedLayout = parseDocument(JSON.stringify(document));
    const validatedSchematic = parseDocument(JSON.stringify(schematic));
    const now = nowIso();
    const syncBatchId = createId('batch');
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.saveEditorDocumentInTransaction({
        modelId: record.assembly_model_id,
        pageId: layout.pageId,
        viewKind: 'layout',
        document: validatedLayout,
        reason: `apply assembly sync ${record.id}`,
        batchId: syncBatchId,
      });
      this.saveEditorDocumentInTransaction({
        modelId: record.assembly_model_id,
        pageId: schematicEnvelope.pageId,
        viewKind: 'schematic',
        document: validatedSchematic,
        reason: `apply assembly sync ${record.id}`,
        batchId: syncBatchId,
      });

      const mappingInsert = this.database.prepare(`
        INSERT INTO assembly_origin_mapping(
          id, assembly_model_id, assembly_entity_kind, assembly_entity_id,
          origin_model_id, origin_entity_kind, origin_entity_id, origin_revision_id,
          generation_rule_version, last_synced_content_hash, field_ownership_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const mapping of mappingInserts) {
        mappingInsert.run(
          mapping.id,
          record.assembly_model_id,
          mapping.assemblyEntityKind,
          mapping.assemblyEntityId,
          summary.originModelId,
          mapping.originEntityKind,
          mapping.originEntityId,
          record.to_origin_revision_id,
          APP_VERSION,
          mapping.contentHash,
          JSON.stringify(mapping.fieldOwnership),
        );
      }
      const mappingUpdate = this.database.prepare(`
        UPDATE assembly_origin_mapping
        SET origin_revision_id = ?, generation_rule_version = ?, last_synced_content_hash = ?, field_ownership_json = ?
        WHERE id = ?
      `);
      for (const mapping of mappingUpdates) {
        const ownership = mapping.entityKind === 'component'
          ? COMPONENT_ASSEMBLY_FIELD_OWNERSHIP
          : CONDUCTOR_ASSEMBLY_FIELD_OWNERSHIP;
        mappingUpdate.run(record.to_origin_revision_id, APP_VERSION, mapping.contentHash, JSON.stringify(ownership), mapping.id);
      }
      const mappingDelete = this.database.prepare(`
        DELETE FROM assembly_origin_mapping
        WHERE assembly_model_id = ? AND origin_entity_kind = ? AND origin_entity_id = ?
      `);
      for (const mapping of mappingDeletes) {
        mappingDelete.run(record.assembly_model_id, mapping.entityKind, mapping.originEntityId);
      }
      this.database.prepare(`UPDATE assembly_sync_record SET state = 'applied', applied_revision_id = ?, applied_at = ? WHERE id = ?`).run(record.to_origin_revision_id, now, record.id);
      this.setWorkspaceState({ activeModelId: record.assembly_model_id, activePageId: layout.pageId, activeViewKind: 'layout' });
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
    return { recordId: record.id, state: 'applied', counts: summary.counts, workspace: this.getWorkspace() };
  }

  listBomItems(modelId = null) {
    const rows = modelId
      ? this.database.prepare('SELECT * FROM app_bom_item WHERE model_id = ? ORDER BY entity_kind, entity_id, role').all(modelId)
      : this.database.prepare('SELECT * FROM app_bom_item ORDER BY model_id, entity_kind, entity_id, role').all();
    return rows.map((row) => ({
      id: row.id,
      modelId: row.model_id,
      entityKind: row.entity_kind,
      entityId: row.entity_id,
      role: row.role,
      manufacturer: row.manufacturer,
      partNumber: row.part_number,
      description: row.description,
      quantity: row.quantity,
      unit: row.unit,
      supplier: row.supplier,
      notes: row.notes,
      properties: JSON.parse(row.properties_json),
      createdAt: row.created_at,
      modifiedAt: row.modified_at,
    }));
  }

  saveBomItem(item) {
    const modelId = item.modelId || this.getWorkspaceState().activeModelId;
    if (!modelId) throw new Error('A model is required for a BOM item.');
    const id = item.id || createId('bom');
    const now = nowIso();
    this.database.prepare(`
      INSERT INTO app_bom_item(
        id, model_id, entity_kind, entity_id, role,
        manufacturer, part_number, description, quantity, unit,
        supplier, notes, properties_json, created_at, modified_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(model_id, entity_kind, entity_id, role) DO UPDATE SET
        manufacturer = excluded.manufacturer,
        part_number = excluded.part_number,
        description = excluded.description,
        quantity = excluded.quantity,
        unit = excluded.unit,
        supplier = excluded.supplier,
        notes = excluded.notes,
        properties_json = excluded.properties_json,
        modified_at = excluded.modified_at
    `).run(
      id,
      modelId,
      item.entityKind,
      item.entityId,
      item.role || 'primary',
      item.manufacturer || '',
      item.partNumber || '',
      item.description || '',
      Number(item.quantity ?? 1),
      item.unit || 'each',
      item.supplier || '',
      item.notes || '',
      JSON.stringify(item.properties || {}),
      now,
      now,
    );
    return this.listBomItems(modelId).find((entry) => entry.entityKind === item.entityKind && entry.entityId === item.entityId && entry.role === (item.role || 'primary'));
  }

  deleteBomItem(id) {
    return this.database.prepare('DELETE FROM app_bom_item WHERE id = ?').run(id).changes > 0;
  }

  saveEmbeddedAsset(input = {}) {
    const modelId = input.modelId || this.getWorkspaceState().activeModelId;
    const data = Buffer.isBuffer(input.data) ? input.data : Buffer.from(input.data || []);
    if (!modelId || !this.database.prepare('SELECT id FROM design_model WHERE id = ?').get(modelId)) {
      throw new Error('A valid model is required for a project asset.');
    }
    if (!data.length) throw new Error('The project asset is empty.');
    const mediaType = String(input.mediaType || 'application/octet-stream').slice(0, 200);
    const filename = String(input.originalFilename || 'asset').replaceAll('\\', '/').split('/').pop().slice(0, 255) || 'asset';
    const digest = sha256(data);
    const entityKind = String(input.entityKind || 'design_model');
    const entityId = String(input.entityId || modelId);
    const role = String(input.role || 'attachment');
    const now = nowIso();

    this.database.exec('BEGIN IMMEDIATE');
    try {
      let asset = this.database.prepare('SELECT * FROM asset_blob WHERE sha256 = ?').get(digest);
      if (!asset) {
        const id = createId('asset');
        this.database.prepare(`
          INSERT INTO asset_blob(
            id, sha256, media_type, byte_length, original_filename,
            storage_mode, blob_data, external_path, required, created_at
          ) VALUES (?, ?, ?, ?, ?, 'embedded', ?, NULL, 1, ?)
        `).run(id, digest, mediaType, data.length, filename, data, now);
        asset = this.database.prepare('SELECT * FROM asset_blob WHERE id = ?').get(id);
      }
      this.database.prepare(`DELETE FROM entity_asset WHERE entity_kind = ? AND entity_id = ? AND role = ?`).run(entityKind, entityId, role);
      this.database.prepare(`
        INSERT INTO entity_asset(asset_id, entity_kind, entity_id, role, display_order)
        VALUES (?, ?, ?, ?, 0)
      `).run(asset.id, entityKind, entityId, role);
      this.database.exec('COMMIT');
      return {
        id: asset.id,
        sha256: asset.sha256,
        mediaType: asset.media_type,
        byteLength: asset.byte_length,
        originalFilename: asset.original_filename,
        entityKind,
        entityId,
        role,
      };
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  getEmbeddedAsset(id) {
    const row = this.database.prepare(`
      SELECT id, sha256, media_type, byte_length, original_filename, blob_data
      FROM asset_blob WHERE id = ? AND storage_mode = 'embedded'
    `).get(id);
    if (!row) throw new Error('Project asset not found.');
    return {
      id: row.id,
      sha256: row.sha256,
      mediaType: row.media_type,
      byteLength: row.byte_length,
      originalFilename: row.original_filename,
      data: row.blob_data,
    };
  }

  integrityCheck() {
    const quick = this.database.prepare('PRAGMA quick_check').all().map((row) => Object.values(row)[0]);
    const foreignKeys = this.database.prepare('PRAGMA foreign_key_check').all();
    const migrations = this.database.prepare('SELECT version, name, applied_at, application_version FROM schema_migration ORDER BY version').all();
    return { quick, foreignKeys, migrations, ok: quick.length === 1 && quick[0] === 'ok' && foreignKeys.length === 0 };
  }

  checkpoint() {
    const result = this.database.prepare('PRAGMA wal_checkpoint(TRUNCATE)').all();
    return { result, integrity: this.integrityCheck() };
  }

  getProjectSetting(key, fallback = null) {
    const row = this.database.prepare('SELECT value_json FROM project_setting WHERE key = ?').get(key);
    if (!row) return fallback;
    try {
      return JSON.parse(row.value_json);
    } catch {
      return fallback;
    }
  }

  setProjectSetting(key, value) {
    const now = nowIso();
    this.database.prepare(`
      INSERT INTO project_setting(key, value_json, modified_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, modified_at = excluded.modified_at
    `).run(key, JSON.stringify(value ?? {}), now);
    return this.getProjectSetting(key, null);
  }

  getFormboardConfig() {
    const defaults = {
      rows: 1,
      columns: 1,
      panelWidthMm: 1000,
      panelHeightMm: 1500,
      bendRadiusMm: 12,
      setLengthStepMm: 10,
      tolerancePpm: 50000,
    };
    return { ...defaults, ...this.getProjectSetting('formboard', {}) };
  }

  getFormboard(modelId = null) {
    const selectedModelId = modelId || this.getWorkspaceState().activeModelId;
    if (!selectedModelId) throw new Error('Select a model before computing a formboard.');
    const editor = this.loadEditorDocument({ modelId: selectedModelId, viewKind: 'layout' });
    const document = editor.document;
    const config = this.getFormboardConfig();
    const step = Math.max(1, Number(config.setLengthStepMm) || 10);
    const setLength = (lengthMm) => Math.ceil(lengthMm / step) * step;
    // Persisted documents may predate the last routing pass; derive routed
    // geometry the same way the canvas and SVG export do so lengths are live.
    const scene = deriveEditorScene(document, { autoRoute: true });
    const routedWires = scene.document.wires;
    const endpoint = (value) => value.kind === 'port'
      ? `${document.components[value.componentId]?.designator || value.componentId}.${document.components[value.componentId]?.ports.find((port) => port.id === value.portId)?.label || value.portId}`
      : value.kind === 'off-page' ? `off-page:${value.reference || ''}` : value.kind;
    const wires = document.wireOrder.map((id) => {
      const wire = routedWires[id] || document.wires[id];
      const lengthMm = Number(wire.route?.length || 0);
      const setLengthMm = setLength(lengthMm);
      const deltaPpm = setLengthMm > 0 ? (setLengthMm - lengthMm) / setLengthMm * 1000000 : 0;
      const status = lengthMm <= 0 ? 'unrouted' : deltaPpm <= config.tolerancePpm ? 'to-scale' : 'not-to-scale';
      return {
        wireId: id,
        label: wire.label || id,
        signal: wire.signal || '',
        from: endpoint(wire.source),
        to: endpoint(wire.target),
        routedLengthMm: Math.round(lengthMm * 100) / 100,
        setLengthMm,
        bendCount: wire.route?.bends ?? 0,
        minimumBendRadiusMm: Math.max(Number(config.bendRadiusMm) || 0, Number(wire.routing?.requestedRadius) || 0),
        points: (wire.route?.points || []).map((point) => ({ x: Math.round(point.x * 100) / 100, y: Math.round(point.y * 100) / 100 })),
        status,
      };
    });
    return {
      modelId: selectedModelId,
      config,
      panel: { rows: config.rows, columns: config.columns, widthMm: config.panelWidthMm, heightMm: config.panelHeightMm },
      totals: {
        wireCount: wires.length,
        routedLengthMm: Math.round(wires.reduce((sum, wire) => sum + wire.routedLengthMm, 0) * 100) / 100,
        setLengthMm: wires.reduce((sum, wire) => sum + wire.setLengthMm, 0),
        bendCount: wires.reduce((sum, wire) => sum + wire.bendCount, 0),
        toScale: wires.filter((wire) => wire.status === 'to-scale').length,
      },
      wires,
    };
  }

  listPartConfigurations(modelId = null) {
    const rows = modelId
      ? this.database.prepare('SELECT * FROM app_part_configuration WHERE model_id = ? ORDER BY entity_kind, entity_id, config_key').all(modelId)
      : this.database.prepare('SELECT * FROM app_part_configuration ORDER BY model_id, entity_kind, entity_id, config_key').all();
    return rows.map((row) => ({
      id: row.id,
      modelId: row.model_id,
      entityKind: row.entity_kind,
      entityId: row.entity_id,
      configKey: row.config_key,
      name: row.name,
      description: row.description,
      designationStrategy: row.designation_strategy,
      gridRows: row.grid_rows,
      gridColumns: row.grid_columns,
      isDefault: Boolean(row.is_default),
      properties: JSON.parse(row.properties_json),
      createdAt: row.created_at,
      modifiedAt: row.modified_at,
    }));
  }

  savePartConfiguration(input = {}) {
    const modelId = input.modelId || this.getWorkspaceState().activeModelId;
    if (!modelId) throw new Error('A model is required for a part configuration.');
    if (!input.entityId || !input.configKey) throw new Error('Part configurations require an entity and a configuration key.');
    const id = input.id || createId('part-config');
    const now = nowIso();
    const strategy = ['custom', 'sequential', 'alphabetical', 'grid', 'source'].includes(input.designationStrategy)
      ? input.designationStrategy
      : 'custom';
    if (input.isDefault) {
      this.database.prepare('UPDATE app_part_configuration SET is_default = 0 WHERE model_id = ? AND entity_kind = ? AND entity_id = ?')
        .run(modelId, input.entityKind || 'component', input.entityId);
    }
    this.database.prepare(`
      INSERT INTO app_part_configuration(
        id, model_id, entity_kind, entity_id, config_key, name, description,
        designation_strategy, grid_rows, grid_columns, properties_json, is_default, created_at, modified_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(model_id, entity_kind, entity_id, config_key) DO UPDATE SET
        name = excluded.name, description = excluded.description,
        designation_strategy = excluded.designation_strategy, grid_rows = excluded.grid_rows,
        grid_columns = excluded.grid_columns, properties_json = excluded.properties_json,
        is_default = excluded.is_default, modified_at = excluded.modified_at
    `).run(
      id, modelId, input.entityKind || 'component', input.entityId, input.configKey,
      input.name || input.configKey, input.description || '', strategy,
      input.gridRows ? Math.round(Number(input.gridRows)) : null,
      input.gridColumns ? Math.round(Number(input.gridColumns)) : null,
      JSON.stringify(input.properties || {}), booleanInteger(input.isDefault), now, now,
    );
    return this.listPartConfigurations(modelId)
      .find((row) => row.id === id)
      || this.listPartConfigurations(modelId).find((row) => row.entityId === input.entityId && row.configKey === input.configKey);
  }

  deletePartConfiguration(id) {
    return this.database.prepare('DELETE FROM app_part_configuration WHERE id = ?').run(id).changes > 0;
  }

  listToolFixtures(modelId = null) {
    const rows = modelId
      ? this.database.prepare('SELECT * FROM app_tool_fixture WHERE model_id = ? ORDER BY kind, name').all(modelId)
      : this.database.prepare('SELECT * FROM app_tool_fixture ORDER BY model_id, kind, name').all();
    return rows.map((row) => ({
      id: row.id,
      modelId: row.model_id,
      toolKey: row.tool_key,
      name: row.name,
      kind: row.kind,
      partNumber: row.part_number,
      description: row.description,
      bundleId: row.bundle_id,
      quantity: row.quantity,
      locationNote: row.location_note,
      properties: JSON.parse(row.properties_json),
      createdAt: row.created_at,
      modifiedAt: row.modified_at,
    }));
  }

  saveToolFixture(input = {}) {
    const modelId = input.modelId || this.getWorkspaceState().activeModelId;
    if (!modelId) throw new Error('A model is required for a tool or fixture.');
    if (!input.name) throw new Error('Tools and fixtures require a name.');
    const id = input.id || createId('tool');
    const now = nowIso();
    const kind = ['tool', 'fixture', 'equipment', 'consumable'].includes(input.kind) ? input.kind : 'tool';
    this.database.prepare(`
      INSERT INTO app_tool_fixture(
        id, model_id, tool_key, name, kind, part_number, description,
        bundle_id, quantity, location_note, properties_json, created_at, modified_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(model_id, tool_key) DO UPDATE SET
        name = excluded.name, kind = excluded.kind, part_number = excluded.part_number,
        description = excluded.description, bundle_id = excluded.bundle_id, quantity = excluded.quantity,
        location_note = excluded.location_note, properties_json = excluded.properties_json,
        modified_at = excluded.modified_at
    `).run(
      id, modelId, input.toolKey || id, input.name, kind, input.partNumber || '',
      input.description || '', input.bundleId || null,
      Math.max(1, Math.round(Number(input.quantity) || 1)), input.locationNote || '',
      JSON.stringify(input.properties || {}), now, now,
    );
    return this.listToolFixtures(modelId).find((row) => row.id === id);
  }

  deleteToolFixture(id) {
    return this.database.prepare('DELETE FROM app_tool_fixture WHERE id = ?').run(id).changes > 0;
  }

  whereUsed(modelId, term) {
    const needle = String(term || '').trim().toLowerCase();
    const results = { query: needle, modelId: modelId || null, components: [], wires: [], bomItems: [] };
    if (!needle) return results;
    const documents = this.listEditorDocuments(modelId);
    for (const envelope of documents) {
      const document = envelope.document;
      for (const componentId of document.componentOrder) {
        const component = document.components[componentId];
        if (!component) continue;
        const fields = {
          designator: component.designator || '',
          title: component.labels?.title || '',
          manufacturer: component.labels?.manufacturer || '',
          partNumber: component.labels?.partNumber || '',
        };
        const match = Object.entries(fields).find(([, value]) => String(value).toLowerCase().includes(needle));
        if (match) results.components.push({
          modelId,
          viewKind: envelope.viewKind,
          componentId,
          designator: component.designator || '',
          title: component.labels?.title || '',
          matchedField: match[0],
          matchedValue: match[1],
        });
      }
      for (const wireId of document.wireOrder) {
        const wire = document.wires[wireId];
        if (!wire) continue;
        const label = String(wire.label || '');
        const signal = String(wire.signal || '');
        const match = label.toLowerCase().includes(needle)
          ? ['label', label]
          : signal.toLowerCase().includes(needle) ? ['signal', signal] : null;
        if (match) results.wires.push({
          modelId,
          viewKind: envelope.viewKind,
          wireId,
          label,
          signal,
          matchedField: match[0],
          matchedValue: match[1],
        });
      }
    }
    for (const item of this.listBomItems(modelId)) {
      const fields = { partNumber: item.partNumber || '', manufacturer: item.manufacturer || '', description: item.description || '' };
      const match = Object.entries(fields).find(([, value]) => String(value).toLowerCase().includes(needle));
      if (match) results.bomItems.push({
        id: item.id,
        entityKind: item.entityKind,
        entityId: item.entityId,
        partNumber: item.partNumber,
        description: item.description,
        matchedField: match[0],
        matchedValue: match[1],
      });
    }
    return results;
  }
}
