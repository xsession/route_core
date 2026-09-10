import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ProjectDatabase } from '../apps/studio/server/project-database.mjs';

function minimalGlb() {
  const source = Buffer.from(JSON.stringify({ asset: { version: '2.0' }, scene: 0, scenes: [{}] }), 'utf8');
  const paddedLength = Math.ceil(source.length / 4) * 4;
  const output = Buffer.alloc(20 + paddedLength, 0x20);
  output.write('glTF', 0, 'ascii');
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(paddedLength, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  source.copy(output, 20);
  return output;
}

test('embedded project assets are content-addressed and keep binary data outside editor documents', () => {
  const directory = mkdtempSync(join(tmpdir(), 'routecore-asset-test-'));
  const project = ProjectDatabase.create(join(directory, 'assets.routecore'), { name: 'Asset Test', template: 'sample' });
  try {
    const modelId = project.getWorkspace().editor.modelId;
    const data = minimalGlb();
    const first = project.saveEmbeddedAsset({
      modelId,
      data,
      mediaType: 'model/gltf-binary',
      originalFilename: 'fixture.glb',
      entityKind: 'design_model',
      entityId: modelId,
      role: 'spatial-product-model',
    });
    const duplicate = project.saveEmbeddedAsset({
      modelId,
      data,
      mediaType: 'model/gltf-binary',
      originalFilename: 'duplicate-name.glb',
      entityKind: 'design_model',
      entityId: modelId,
      role: 'spatial-product-model',
    });

    assert.equal(duplicate.id, first.id);
    assert.equal(first.byteLength, data.length);
    assert.match(first.sha256, /^[0-9a-f]{64}$/u);
    const stored = project.getEmbeddedAsset(first.id);
    assert.equal(stored.mediaType, 'model/gltf-binary');
    assert.deepEqual(Buffer.from(stored.data), data);
    assert.throws(() => project.saveEmbeddedAsset({ modelId: 'missing-model', data }), /valid model/u);
    assert.throws(() => project.getEmbeddedAsset('missing-asset'), /not found/u);
  } finally {
    project.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
