import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ProjectDatabase } from '../apps/studio/server/project-database.mjs';
import { availableExports, generateExport } from '../apps/studio/server/exporters.mjs';

function createProject(name = 'manufacturing.routecore') {
  const directory = mkdtempSync(join(tmpdir(), 'routecore-mfg-test-'));
  const project = ProjectDatabase.create(join(directory, name), { name: 'Manufacturing Test', template: 'sample' });
  return { directory, project };
}

test('manufacturing migration 0004 applies and stays intact across reopen', () => {
  const { directory, project } = createProject();
  try {
    const integrity = project.integrityCheck();
    assert.ok(integrity.ok);
    assert.equal(integrity.migrations.length, 4);
    assert.deepEqual(integrity.migrations.map((row) => Number(row.version)), [1, 2, 3, 4]);
    project.close();
    const reopened = new ProjectDatabase(join(directory, 'manufacturing.routecore'));
    try {
      assert.equal(reopened.integrityCheck().migrations.length, 4);
    } finally {
      reopened.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('part configurations store designation strategies and keep one default per entity', () => {
  const { directory, project } = createProject('config.routecore');
  try {
    const modelId = project.getWorkspace().editor.modelId;
    const first = project.savePartConfiguration({
      modelId,
      entityKind: 'component',
      entityId: 'J1',
      configKey: 'standard',
      name: 'Standard',
      designationStrategy: 'alphabetical',
      isDefault: true,
      properties: { contactPart: 'AMP-100', backshell: 'BS-2' },
    });
    assert.equal(first.designationStrategy, 'alphabetical');
    assert.equal(first.isDefault, true);
    assert.equal(first.properties.contactPart, 'AMP-100');
    const second = project.savePartConfiguration({
      modelId,
      entityKind: 'component',
      entityId: 'J1',
      configKey: 'sealed',
      name: 'Sealed',
      designationStrategy: 'grid',
      gridRows: 2,
      gridColumns: 3,
      isDefault: true,
    });
    assert.equal(second.designationStrategy, 'grid');
    assert.equal(second.gridRows, 2);
    assert.equal(second.isDefault, true);
    const rows = project.listPartConfigurations(modelId);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.filter((row) => row.isDefault).map((row) => row.configKey), ['sealed']);
    // Upserting the same key updates in place.
    const updated = project.savePartConfiguration({ modelId, entityId: 'J1', configKey: 'sealed', name: 'Sealed v2' });
    assert.equal(updated.name, 'Sealed v2');
    assert.equal(project.listPartConfigurations(modelId).length, 2);
    assert.ok(project.deletePartConfiguration(second.id));
    assert.equal(project.listPartConfigurations(modelId).length, 1);
    assert.throws(() => project.savePartConfiguration({ modelId, configKey: 'x' }), /entity and a configuration key/u);
  } finally {
    project.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('tools and fixtures persist with upsert keys and feed the tools table', () => {
  const { directory, project } = createProject('tools.routecore');
  try {
    const modelId = project.getWorkspace().editor.modelId;
    const tool = project.saveToolFixture({
      modelId,
      name: 'Crimp tool 2.5-4 mm',
      kind: 'tool',
      partNumber: 'CR-01',
      quantity: 2,
      locationNote: 'Bench 3',
    });
    assert.equal(tool.kind, 'tool');
    assert.equal(tool.quantity, 2);
    project.saveToolFixture({ modelId, name: 'Harness clip fixture', kind: 'fixture', quantity: 6 });
    assert.equal(project.listToolFixtures(modelId).length, 2);
    // Upsert by tool key.
    project.saveToolFixture({ modelId, toolKey: tool.toolKey, name: 'Crimp tool 2.5-4 mm (rev B)', quantity: 1 });
    const rows = project.listToolFixtures(modelId);
    assert.equal(rows.length, 2);
    assert.equal(rows.find((row) => row.toolKey === tool.toolKey).name, 'Crimp tool 2.5-4 mm (rev B)');
    const element = project.saveDrawingElement({ modelId, kind: 'custom', x: 20, y: 20, width: 260, height: 90, content: { title: 'TOOLS & FIXTURES' } });
    assert.deepEqual(element.content.columns, ['NAME', 'KIND', 'P/N', 'QTY', 'LOCATION']);
    assert.equal(element.content.rows.length, 2);
    assert.throws(() => project.saveToolFixture({ modelId }), /name/u);
  } finally {
    project.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('where-used finds components, wires, and BOM items by any identity field', () => {
  const { directory, project } = createProject('where-used.routecore');
  try {
    const modelId = project.getWorkspace().editor.modelId;
    const document = project.loadEditorDocument({ modelId, viewKind: 'layout' }).document;
    assert.ok(document.componentOrder.length);
    const designator = document.components[document.componentOrder[0]].designator;
    const byDesignator = project.whereUsed(modelId, designator);
    assert.ok(byDesignator.components.length >= 1);
    assert.ok(byDesignator.components.every((row) => row.designator === designator || row.designator.toLowerCase().includes(designator.toLowerCase())));

    const wire = document.wires[document.wireOrder[0]];
    wire.signal = 'SIGNAL-FOR-WHERE-USED-TEST';
    wire.label = 'W-LBL-FOR-WHERE-USED-TEST';
    project.saveEditorDocument({ modelId, pageId: project.getWorkspace().editor.pageId, viewKind: 'layout', document, reason: 'where-used test' });
    const bySignal = project.whereUsed(modelId, 'FOR-WHERE-USED-TEST');
    assert.equal(bySignal.wires.length, 1);
    assert.equal(bySignal.wires[0].wireId, wire.id);

    project.saveBomItem({
      modelId,
      entityKind: 'component',
      entityId: document.componentOrder[0],
      role: 'primary',
      partNumber: 'PN-FOR-WHERE-USED-TEST',
      description: 'Special part',
    });
    const byPart = project.whereUsed(modelId, 'PN-FOR-WHERE-USED-TEST');
    assert.equal(byPart.bomItems.length, 1);
    assert.equal(project.whereUsed(modelId, 'zzz-no-such-term-xyz').components.length, 0);
    assert.equal(project.whereUsed(modelId, '').components.length, 0);
  } finally {
    project.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('formboard derives set lengths, bend counts, and to-scale state from routed geometry', () => {
  const { directory, project } = createProject('formboard.routecore');
  try {
    const modelId = project.getWorkspace().editor.modelId;
    assert.deepEqual(project.getFormboardConfig(), {
      rows: 1, columns: 1, panelWidthMm: 1000, panelHeightMm: 1500,
      bendRadiusMm: 12, setLengthStepMm: 10, tolerancePpm: 50000,
    });
    project.setProjectSetting('formboard', { setLengthStepMm: 100, bendRadiusMm: 20, tolerancePpm: 0 });
    const board = project.getFormboard(modelId);
    assert.ok(board.wires.length > 0);
    for (const wire of board.wires) {
      assert.ok(wire.routedLengthMm > 0, `wire ${wire.wireId} must be routed for formboard math`);
      assert.ok(wire.setLengthMm >= wire.routedLengthMm);
      assert.equal(wire.setLengthMm % 100, 0);
      assert.ok(wire.minimumBendRadiusMm >= 20);
      assert.ok(['to-scale', 'not-to-scale', 'unrouted'].includes(wire.status));
      assert.ok(wire.points.length >= 2);
    }
    assert.equal(board.totals.setLengthMm, board.wires.reduce((sum, wire) => sum + wire.setLengthMm, 0));
    assert.equal(board.totals.toScale, board.wires.filter((wire) => wire.status === 'to-scale').length);
    assert.deepEqual(board.panel, { rows: 1, columns: 1, widthMm: 1000, heightMm: 1500 });
    // Persisted across reopen.
    project.close();
    const reopened = new ProjectDatabase(join(directory, 'formboard.routecore'));
    assert.equal(reopened.getFormboardConfig().setLengthStepMm, 100);
    assert.equal(reopened.getFormboard(modelId).totals.setLengthMm, board.totals.setLengthMm);
    reopened.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('live manufacturing drawing tables refresh from current project data', () => {
  const { directory, project } = createProject('tables.routecore');
  try {
    const modelId = project.getWorkspace().editor.modelId;
    const pageId = project.getWorkspace().editor.pageId;
    const document = project.loadEditorDocument({ modelId, viewKind: 'layout' }).document;

    const cutList = project.saveDrawingElement({ modelId, kind: 'cut-list', x: 60, y: 60, width: 320, height: 140 });
    assert.deepEqual(cutList.content.columns, ['WIRE', 'SIGNAL', 'FROM', 'TO', 'LENGTH MM', 'SET MM', 'BENDS']);
    assert.equal(cutList.content.rows.length, document.wireOrder.length);
    assert.ok(cutList.content.rows.every((row) => row[4] > 0));

    const connection = project.saveDrawingElement({ modelId, kind: 'connection-table', x: 400, y: 60, width: 280, height: 180 });
    assert.deepEqual(connection.content.columns, ['COMPONENT', 'PIN', 'FUNCTION', 'DESTINATION', 'WIRE']);
    const expectedPorts = document.componentOrder.reduce((sum, id) => sum + document.components[id].ports.length, 0);
    assert.equal(connection.content.rows.length, expectedPorts);
    const firstPort = connection.content.rows.find((row) => row[3] !== '—');
    assert.ok(firstPort, 'at least one port must resolve a destination');

    const continuity = project.saveDrawingElement({ modelId, kind: 'continuity-table', x: 60, y: 220, width: 300, height: 120 });
    assert.deepEqual(continuity.content.columns, ['TEST', 'SIGNAL', 'POINT A', 'POINT B', 'EXPECTED', 'RESULT']);
    assert.equal(continuity.content.rows.length, document.wireOrder.length);

    const revisionTable = project.saveDrawingElement({ modelId, kind: 'revision-table', x: 60, y: 360, width: 240, height: 90 });
    assert.deepEqual(revisionTable.content.columns, ['REV', 'NAME', 'STATE', 'DATE']);
    project.createRevision({ modelId, name: 'Rev A', message: 'Initial release' });
    const refreshed = project.listDrawingElements(modelId, pageId).find((row) => row.kind === 'revision-table');
    assert.equal(refreshed.content.rows.length, 1);
    assert.equal(refreshed.content.rows[0][0], 'Rev A');
  } finally {
    project.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('manufacturing exports include set lengths, tools, connection table, and digital formboard', () => {
  const { directory, project } = createProject('exports.routecore');
  try {
    const modelId = project.getWorkspace().editor.modelId;
    project.saveToolFixture({ modelId, name: 'Crimp tool', partNumber: 'CR-01', quantity: 2, locationNote: 'Bench 3' });
    const ids = availableExports().map((item) => item.id);
    for (const id of ['cut-list-csv', 'connection-table-csv', 'tools-csv', 'formboard-json', 'svg', 'project-json']) {
      assert.ok(ids.includes(id), `export ${id} must be advertised`);
    }
    const cutList = generateExport(project, 'cut-list-csv', { modelId }).body.split(/\r?\n/)[0];
    assert.match(cutList, /Cut\/set length/);
    assert.match(cutList, /Formboard state/);
    const tools = generateExport(project, 'tools-csv', { modelId }).body.split(/\r?\n/);
    assert.equal(tools[0], 'Key,Name,Kind,Part number,Quantity,Location,Description');
    assert.match(tools[1], /Crimp tool,tool,CR-01,2,Bench 3/);
    const connectionTable = generateExport(project, 'connection-table-csv', { modelId }).body.split(/\r?\n/)[0];
    assert.equal(connectionTable, 'Component,Pin,Function,Destination,Wire');
    const formboard = JSON.parse(generateExport(project, 'formboard-json', { modelId }).body);
    assert.equal(formboard.schema, 'routecore-formboard/1');
    assert.ok(formboard.wires.length > 0);
    assert.ok(formboard.wires.every((wire) => wire.points.length >= 2));
    const interchange = JSON.parse(generateExport(project, 'project-json', { modelId }).body);
    assert.ok(Array.isArray(interchange.toolFixtures));
    assert.ok(Array.isArray(interchange.partConfigurations));
    assert.ok(interchange.formboard.config);
  } finally {
    project.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('svg export embeds the manufacturing drawing tables', () => {
  const { directory, project } = createProject('svg.routecore');
  try {
    const modelId = project.getWorkspace().editor.modelId;
    project.saveDrawingElement({ modelId, kind: 'cut-list', x: 60, y: 60, width: 320, height: 140, content: { title: 'WIRE CUT LIST' } });
    const svg = generateExport(project, 'svg', { modelId }).body;
    assert.ok(svg.includes('data-drawing-id'), 'svg must include drawing elements');
    assert.ok(svg.includes('WIRE CUT LIST'));
  } finally {
    project.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('generated assemblies can prefix designators for qualified sub-harness names', () => {
  const { directory, project } = createProject('assembly.routecore');
  try {
    const modelId = project.getWorkspace().editor.modelId;
    const source = project.loadEditorDocument({ modelId, viewKind: 'layout' }).document;
    const firstDesignator = source.components[source.componentOrder[0]].designator;
    const workspace = project.generateAssembly({ sourceModelId: modelId, designatorPrefix: 'Rear' });
    const assembly = workspace.models.find((model) => model.kind === 'assembly');
    assert.ok(assembly);
    const document = project.loadEditorDocument({ modelId: assembly.id, viewKind: 'layout' }).document;
    assert.ok(document.componentOrder.length);
    assert.ok(document.componentOrder.every((id) => document.components[id].designator.startsWith('Rear-')));
    // The assembly clones components with new ids; the origin designator is
    // preserved as the suffix after the prefix.
    const prefixed = document.componentOrder
      .map((id) => document.components[id].designator)
      .find((designator) => designator === `Rear-${firstDesignator}`);
    assert.ok(prefixed, `expected a component designator Rear-${firstDesignator}`);
    // No prefix keeps original designators.
    const plain = project.generateAssembly({ sourceModelId: modelId });
    const second = plain.models.find((model) => model.kind === 'assembly' && model.id !== assembly.id);
    assert.ok(second, 'second assembly must exist');
    const secondDoc = project.loadEditorDocument({ modelId: second.id, viewKind: 'layout' }).document;
    assert.equal(secondDoc.components[secondDoc.componentOrder[0]].designator, firstDesignator);
  } finally {
    project.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
