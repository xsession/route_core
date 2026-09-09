import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ProjectService } from '../apps/studio/server/project-service.mjs';
import { createStudioServer } from '../apps/studio/server/http-server.mjs';

test('loopback HTTP application serves secure offline APIs and assets', async () => {
  const home = mkdtempSync(join(tmpdir(), 'routecore-http-test-'));
  const projectPath = join(home, 'project.routecore');
  const service = new ProjectService({ home });
  service.createProject({ path: projectPath, name: 'HTTP Test', template: 'sample' });
  const running = await createStudioServer(service, { host: '127.0.0.1', port: 0 });
  const base = `http://${running.host}:${running.port}`;
  try {
    const healthResponse = await fetch(`${base}/api/health`);
    assert.equal(healthResponse.status, 200);
    assert.equal(healthResponse.headers.get('x-frame-options'), 'DENY');
    assert.match(healthResponse.headers.get('content-security-policy') || '', /connect-src 'self'/);
    assert.deepEqual(await healthResponse.json(), { ok: true, offline: true, projectOpen: true });

    const bootstrapResponse = await fetch(`${base}/api/bootstrap`);
    const bootstrap = await bootstrapResponse.json();
    assert.equal(bootstrap.application.offline, true);
    assert.equal(bootstrap.application.networkPolicy, 'loopback-only');
    assert.equal(bootstrap.workspace.meta.name, 'HTTP Test');
    assert.ok(bootstrap.library.components.length > 0);

    const firstState = structuredClone(bootstrap.workspace.editor.document);
    firstState.metadata = { ...(firstState.metadata || {}), historyMarker: 'first' };
    const firstSaveResponse = await fetch(`${base}/api/project/document`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        modelId: bootstrap.workspace.editor.modelId,
        pageId: bootstrap.workspace.editor.pageId,
        viewKind: bootstrap.workspace.editor.viewKind,
        document: firstState,
        reason: 'http checkout first state',
      }),
    });
    assert.equal(firstSaveResponse.status, 200);
    const commandsAfterFirst = await (await fetch(`${base}/api/project/commands?limit=20`)).json();
    const firstCommand = commandsAfterFirst.find((entry) => entry.payload.reason === 'http checkout first state');
    assert.ok(firstCommand);
    assert.equal(firstCommand.restorable, true);

    const secondState = structuredClone(firstState);
    secondState.metadata.historyMarker = 'second';
    const secondSaveResponse = await fetch(`${base}/api/project/document`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        modelId: bootstrap.workspace.editor.modelId,
        pageId: bootstrap.workspace.editor.pageId,
        viewKind: bootstrap.workspace.editor.viewKind,
        document: secondState,
        reason: 'http checkout second state',
      }),
    });
    assert.equal(secondSaveResponse.status, 200);

    const checkoutResponse = await fetch(`${base}/api/project/commands/${firstCommand.sequence}/restore`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(checkoutResponse.status, 200);
    const checkout = await checkoutResponse.json();
    assert.equal(checkout.workspace.editor.document.metadata.historyMarker, 'first');
    assert.match(checkout.workspace.editor.contentHash, /^[0-9a-f]{64}$/u);

    const index = await fetch(`${base}/`);
    assert.equal(index.status, 200);
    assert.match(await index.text(), /RouteCore Offline Studio/);

    const settings = await fetch(`${base}/api/settings`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ theme: 'light', density: 'compact' }),
    });
    assert.equal(settings.status, 200);
    assert.equal((await settings.json()).theme, 'light');

    const exports = await (await fetch(`${base}/api/exports`)).json();
    assert.equal(exports.length, 8);
    const svg = await fetch(`${base}/api/export/svg`);
    assert.equal(svg.status, 200);
    assert.match(svg.headers.get('content-type') || '', /image\/svg\+xml/);
    assert.match(await svg.text(), /data-editor-core-schema="1"/);

    const traversal = await fetch(`${base}/..%2F..%2Fetc%2Fpasswd`);
    assert.notEqual(traversal.status, 200);
  } finally {
    await new Promise((resolve) => running.server.close(resolve));
    service.close();
    rmSync(home, { recursive: true, force: true });
  }
});

test('loopback command-history endpoint restores an older editor state', async () => {
  const home = mkdtempSync(join(tmpdir(), 'routecore-http-history-test-'));
  const projectPath = join(home, 'history.routecore');
  const service = new ProjectService({ home });
  service.createProject({ path: projectPath, name: 'HTTP History Test', template: 'sample' });
  const running = await createStudioServer(service, { host: '127.0.0.1', port: 0 });
  const base = `http://${running.host}:${running.port}`;
  try {
    const workspace = await (await fetch(`${base}/api/project/workspace`)).json();
    const stateA = structuredClone(workspace.editor.document);
    stateA.metadata = { ...(stateA.metadata || {}), checkoutMarker: 'http-a' };
    let response = await fetch(`${base}/api/project/document`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        modelId: workspace.editor.modelId,
        pageId: workspace.editor.pageId,
        viewKind: workspace.editor.viewKind,
        document: stateA,
        reason: 'http state A',
      }),
    });
    assert.equal(response.status, 200);
    const stateB = structuredClone(stateA);
    stateB.metadata.checkoutMarker = 'http-b';
    response = await fetch(`${base}/api/project/document`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        modelId: workspace.editor.modelId,
        pageId: workspace.editor.pageId,
        viewKind: workspace.editor.viewKind,
        document: stateB,
        reason: 'http state B',
      }),
    });
    assert.equal(response.status, 200);

    const commands = await (await fetch(`${base}/api/project/commands?limit=20`)).json();
    const entryA = commands.find((entry) => entry.payload.reason === 'http state A');
    assert.ok(entryA?.restorable);
    response = await fetch(`${base}/api/project/commands/${entryA.sequence}/restore`, { method: 'POST' });
    assert.equal(response.status, 200);
    const restored = await response.json();
    assert.equal(restored.workspace.editor.document.metadata.checkoutMarker, 'http-a');
    const latest = await (await fetch(`${base}/api/project/commands?limit=1`)).json();
    assert.equal(latest[0].payload.reason, `checkout command #${entryA.sequence}`);
  } finally {
    await new Promise((resolve) => running.server.close(resolve));
    service.close();
    rmSync(home, { recursive: true, force: true });
  }
});
