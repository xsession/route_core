import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';

function walk(directory) {
  const output = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...walk(path));
    else output.push(path);
  }
  return output;
}

test('compiled frontend is self-contained and contains no remote runtime dependencies', () => {
  assert.ok(existsSync('apps/studio/public/js/main.js'));
  assert.ok(existsSync('apps/studio/public/vendor/editor-core/index.js'));
  const index = readFileSync('apps/studio/public/index.html', 'utf8');
  assert.match(index, /src="\/js\/main\.js"/);
  assert.doesNotMatch(index, /https?:\/\//);
  const files = walk('apps/studio/public').filter((path) => ['.html', '.css', '.js'].includes(extname(path)));
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const matches = [...text.matchAll(/https?:\/\/[^\s"'`<>]+/g)].map((match) => match[0]);
    const unexpected = matches.filter((value) => value !== 'http://www.w3.org/2000/svg');
    assert.deepEqual(unexpected, [], `remote URL in ${file}`);
  }
});

test('application exposes the dense editor command surfaces', () => {
  const main = readFileSync('apps/studio/public/js/main.js', 'utf8');
  for (const feature of [
    'generateAssemblyDialog', 'componentCreatorDialog', 'cableCreatorDialog', 'revisionsDialog',
    'integrityDialog', 'exportsDialog', 'bomDialog', 'openContextMenu', 'handleGlobalKeyDown',
    'data-checkout-command', 'Checkout state',
  ]) assert.match(main, new RegExp(feature));
});
