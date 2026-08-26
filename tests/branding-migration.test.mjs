import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { ProjectDatabase } from '../apps/studio/server/project-database.mjs';
import { ProjectService } from '../apps/studio/server/project-service.mjs';
import { generateExport } from '../apps/studio/server/exporters.mjs';
import {
  APPLICATION_NAME,
  APP_VERSION,
  PRODUCT_NAME,
  PROJECT_EXTENSION,
  hasSupportedProjectExtension,
  normalizeProjectPath,
  stripProjectExtension,
} from '../apps/studio/server/util.mjs';

test('RouteCore identity, package namespace, and canonical file extension are consistent', () => {
  assert.equal(PRODUCT_NAME, 'RouteCore');
  assert.equal(APPLICATION_NAME, 'RouteCore Offline Studio');
  assert.equal(APP_VERSION, '0.4.0');
  assert.equal(PROJECT_EXTENSION, '.routecore');
  assert.equal(normalizeProjectPath('/tmp/harness'), resolve('/tmp/harness.routecore'));
  assert.equal(normalizeProjectPath('/tmp/harness.routecore'), resolve('/tmp/harness.routecore'));
  assert.equal(normalizeProjectPath('/tmp/legacy.ohcad'), resolve('/tmp/legacy.ohcad'));
  assert.equal(hasSupportedProjectExtension('design.routecore'), true);
  assert.equal(hasSupportedProjectExtension('design.ohcad'), true);
  assert.equal(stripProjectExtension('/tmp/design.routecore'), 'design');
  assert.equal(stripProjectExtension('/tmp/design.ohcad'), 'design');

  const rootPackage = JSON.parse(readFileSync('package.json', 'utf8'));
  const corePackage = JSON.parse(readFileSync('packages/harness-editor-core/package.json', 'utf8'));
  assert.equal(rootPackage.name, 'routecore-offline-studio');
  assert.equal(rootPackage.version, '0.4.0');
  assert.equal(corePackage.name, '@routecore/harness-editor-core');
  assert.equal(corePackage.version, '0.3.0');

  const index = readFileSync('apps/studio/public/index.html', 'utf8');
  assert.match(index, /RouteCore Offline Studio/u);
  assert.match(index, /class="brand-mark"[^>]*>RC</u);
  assert.doesNotMatch(index, /OH-CAD/u);
});

test('legacy .ohcad projects open without conversion and use RouteCore exports', () => {
  const home = mkdtempSync(join(tmpdir(), 'routecore-brand-migration-'));
  const legacyPath = join(home, 'legacy-project.ohcad');
  const created = ProjectDatabase.create(legacyPath, {
    name: 'Legacy Project',
    organization: 'RouteCore Migration Test',
    template: 'sample',
  });
  created.close();

  const service = new ProjectService({ home });
  try {
    const workspace = service.openProject(legacyPath);
    assert.equal(workspace.path, legacyPath);
    assert.equal(workspace.meta.name, 'Legacy Project');
    const bootstrap = service.bootstrap();
    assert.equal(bootstrap.application.name, 'RouteCore Offline Studio');
    assert.match(bootstrap.application.projectFormat, /\.routecore/u);
    assert.match(bootstrap.application.projectFormat, /legacy \.ohcad supported/u);

    const output = generateExport(service.requireProject(), 'project-json', {
      modelId: workspace.editor.modelId,
      pageId: workspace.editor.pageId,
      viewKind: workspace.editor.viewKind,
    });
    assert.match(output.filename, /\.routecore\.json$/u);
    assert.equal(JSON.parse(output.body).schema, 'routecore-project-interchange/1');
  } finally {
    service.close();
  }

  const database = new DatabaseSync(legacyPath, { readOnly: true });
  try {
    assert.equal(Number(database.prepare('PRAGMA application_id').get().application_id), 1381253970);
  } finally {
    database.close();
    rmSync(home, { recursive: true, force: true });
  }
});
