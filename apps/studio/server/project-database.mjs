import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync, statSync } from 'node:fs';
import {
  HarnessEditorEngine,
  buildComponentGeometry,
  createEmptyDocument,
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
    this.database.exec('PRAGMA application_id = 1381253970; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA temp_store = MEMORY; PRAGMA user_version = 3;');
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
    const modelId = options.modelId || workspace.activeModelId;
    const pageId = options.pageId || workspace.activePageId;
    const viewKind = options.viewKind || workspace.activeViewKind;
    let row;
    if (pageId) {
      row = this.database.prepare(`
        SELECT * FROM app_editor_document WHERE page_id = ? AND view_kind = ?
      `).get(pageId, viewKind);
    }
    if (!row && modelId) {
      row = this.database.prepare(`
        SELECT * FROM app_editor_document WHERE model_id = ? AND view_kind = ? ORDER BY updated_at DESC LIMIT 1
      `).get(modelId, viewKind);
    }
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
      revisions: this.listRevisions(document.modelId),
    };
  }

  saveEditorDocument(input) {
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
    this.database.exec('BEGIN IMMEDIATE');
    try {
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
      this.database.exec('COMMIT');
      return { changed: true, contentHash, revision: parsed.revision, savedAt: now, commandSequence: Number(commandResult.lastInsertRowid) };
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
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
          APP_VERSION, sha256(JSON.stringify(sourceEditor.document.components[originId])),
          JSON.stringify({ position: 'assembly', labels: 'plan', ports: 'plan' }),
        );
      }
      for (const [originId, assemblyEntityId] of generated.wireMap) {
        mappingStatement.run(
          createId('origin-map'), assemblyId, 'conductor', assemblyEntityId,
          sourceEditor.modelId, 'conductor', originId, originRevision,
          APP_VERSION, sha256(JSON.stringify(sourceEditor.document.wires[originId])),
          JSON.stringify({ route: 'assembly', appearance: 'assembly', connectivity: 'plan' }),
        );
      }
      this.createRecoverySnapshot(assemblyId, layoutPageId, 'layout', generated.document, null);
      this.database.exec('COMMIT');
      return this.getWorkspace();
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
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
}
