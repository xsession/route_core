import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ProjectDatabase } from '../apps/studio/server/project-database.mjs';
import { availableExports, generateExport } from '../apps/studio/server/exporters.mjs';

test('project database supports editor persistence, revisions, BOM, assemblies, and exports', () => {
  const directory = mkdtempSync(join(tmpdir(), 'routecore-project-test-'));
  const path = join(directory, 'test.routecore');
  const project = ProjectDatabase.create(path, { name: 'Test Harness', template: 'sample' });
  try {
    const workspace = project.getWorkspace();
    assert.equal(workspace.meta.name, 'Test Harness');
    assert.equal(workspace.models.length, 1);
    assert.equal(workspace.pages.length, 2);
    assert.ok(workspace.editor.document.componentOrder.length >= 3);
    assert.ok(workspace.editor.document.wireOrder.length >= 1);

    const document = structuredClone(workspace.editor.document);
    document.metadata = { ...(document.metadata || {}), testMarker: 'persisted' };
    const save = project.saveEditorDocument({
      modelId: workspace.editor.modelId,
      pageId: workspace.editor.pageId,
      viewKind: workspace.editor.viewKind,
      document,
      reason: 'automated persistence test',
    });
    assert.equal(save.changed, true);
    assert.equal(project.loadEditorDocument({ modelId: workspace.editor.modelId }).document.metadata.testMarker, 'persisted');

    const persistedCommand = project.getCommandLog(10).find((entry) => entry.payload.reason === 'automated persistence test');
    assert.ok(persistedCommand);
    assert.equal(persistedCommand.restorable, true);
    assert.ok(persistedCommand.snapshotId);

    const laterDocument = structuredClone(document);
    laterDocument.metadata.testMarker = 'later-state';
    const laterSave = project.saveEditorDocument({
      modelId: workspace.editor.modelId,
      pageId: workspace.editor.pageId,
      viewKind: workspace.editor.viewKind,
      document: laterDocument,
      reason: 'later state for command checkout test',
    });
    assert.equal(laterSave.changed, true);
    assert.equal(project.loadEditorDocument({ modelId: workspace.editor.modelId }).document.metadata.testMarker, 'later-state');

    const checkout = project.restoreCommand(persistedCommand.sequence);
    assert.equal(checkout.changed, true);
    assert.equal(project.loadEditorDocument({ modelId: workspace.editor.modelId }).document.metadata.testMarker, 'persisted');
    assert.equal(project.getCommandLog(1)[0].payload.reason, `checkout command #${persistedCommand.sequence}`);

    const firstComponent = document.componentOrder[0];
    const bom = project.saveBomItem({
      modelId: workspace.editor.modelId,
      entityKind: 'component',
      entityId: firstComponent,
      role: 'primary',
      manufacturer: 'Test Manufacturer',
      partNumber: 'TEST-001',
      description: 'Reference part',
      quantity: 1,
      unit: 'each',
    });
    assert.equal(bom.partNumber, 'TEST-001');
    assert.equal(project.listBomItems(workspace.editor.modelId).length, 1);

    const revision = project.createRevision({
      modelId: workspace.editor.modelId,
      pageId: workspace.editor.pageId,
      viewKind: workspace.editor.viewKind,
      name: 'Acceptance revision',
      message: 'Automated test snapshot',
    });
    assert.ok(revision.snapshotId);
    assert.equal(project.listRevisions(workspace.editor.modelId).length, 1);

    const assembly = project.generateAssembly({
      sourceModelId: workspace.editor.modelId,
      sourcePageId: workspace.editor.pageId,
      sourceViewKind: workspace.editor.viewKind,
      name: 'Generated Assembly',
      componentIds: document.componentOrder.slice(0, 2),
      wireIds: document.wireOrder,
    });
    assert.equal(assembly.models.filter((model) => model.kind === 'assembly').length, 1);
    assert.equal(assembly.pages.filter((page) => page.modelId === assembly.workspace.activeModelId).length, 2);
    assert.equal(assembly.drawingElements.filter((element) => ['title-block', 'bom-table', 'wire-schedule'].includes(element.kind)).length, 3);
    const dimension = project.saveDrawingElement({
      modelId: assembly.workspace.activeModelId,
      pageId: assembly.workspace.activePageId,
      kind: 'dimension',
      x: 100,
      y: 80,
      width: 220,
      height: 40,
    });
    assert.equal(dimension.kind, 'dimension');
    assert.equal(project.listDrawingElements(assembly.workspace.activeModelId, assembly.workspace.activePageId).length, 4);

    const syncPreview = project.previewAssemblySync(assembly.workspace.activeModelId);
    assert.ok(syncPreview.counts.added >= 1);
    const syncResult = project.applyAssemblySync(syncPreview.id);
    assert.equal(syncResult.state, 'applied');
    assert.equal(syncResult.workspace.workspace.activeViewKind, 'layout');

    for (const definition of availableExports()) {
      const output = generateExport(project, definition.id, {
        modelId: workspace.editor.modelId,
        pageId: workspace.editor.pageId,
        viewKind: workspace.editor.viewKind,
      });
      assert.ok(output.body.length > 20, `${definition.id} should contain data`);
      assert.ok(output.filename.endsWith(`.${definition.extension}`));
    }

    const integrity = project.integrityCheck();
    assert.equal(integrity.ok, true);
    assert.deepEqual(integrity.foreignKeys, []);
  } finally {
    project.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('project command history can checkout an older recovery state non-destructively', () => {
  const directory = mkdtempSync(join(tmpdir(), 'routecore-history-test-'));
  const path = join(directory, 'history.routecore');
  const project = ProjectDatabase.create(path, { name: 'History Harness', template: 'sample' });
  try {
    const workspace = project.getWorkspace();
    const base = workspace.editor.document;
    const stateA = structuredClone(base);
    stateA.metadata = { ...(stateA.metadata || {}), checkoutMarker: 'state-a' };
    project.saveEditorDocument({
      modelId: workspace.editor.modelId,
      pageId: workspace.editor.pageId,
      viewKind: workspace.editor.viewKind,
      document: stateA,
      reason: 'history state A',
    });
    const stateB = structuredClone(stateA);
    stateB.metadata.checkoutMarker = 'state-b';
    project.saveEditorDocument({
      modelId: workspace.editor.modelId,
      pageId: workspace.editor.pageId,
      viewKind: workspace.editor.viewKind,
      document: stateB,
      reason: 'history state B',
    });

    const log = project.getCommandLog(20);
    const entryA = log.find((entry) => entry.payload.reason === 'history state A');
    assert.ok(entryA?.restorable);
    assert.ok(entryA.snapshotId);
    const result = project.restoreCommand(entryA.sequence);
    assert.equal(result.changed, true);
    assert.equal(project.getWorkspace().editor.document.metadata.checkoutMarker, 'state-a');
    const latest = project.getCommandLog(1)[0];
    assert.equal(latest.payload.reason, `checkout command #${entryA.sequence}`);
    assert.equal(latest.restorable, true);
    assert.throws(() => project.restoreCommand(999999), /recovery snapshot is not available/u);
  } finally {
    project.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
