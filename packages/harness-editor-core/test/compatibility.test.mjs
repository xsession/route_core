import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HarnessEditorEngine,
  LegacyHarnessEditorEngine,
  AdaptiveSpatialIndex,
  createEmptyDocument,
} from '../dist/index.js';

test('RouteCore compatibility package exposes the authoritative editor-core runtime', () => {
  const engine = new HarnessEditorEngine(createEmptyDocument('compatibility'));
  assert.ok(engine instanceof LegacyHarnessEditorEngine);
  assert.equal(typeof engine.routingObstacleRevision, 'number');
  assert.equal(typeof AdaptiveSpatialIndex, 'function');
});
