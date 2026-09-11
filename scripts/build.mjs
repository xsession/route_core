#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const tscCommand = process.platform === 'win32' ? 'tsc.cmd' : 'tsc';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with status ${result.status}.`);
}

function filesUnder(directory) {
  if (!existsSync(directory)) return [];
  const output = [];
  for (const name of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, name.name);
    if (name.isDirectory()) output.push(...filesUnder(path));
    else output.push(path);
  }
  return output;
}

console.log('Building authoritative editor-core submodule…');
run(tscCommand, ['-p', 'references/editor-core/tsconfig.json'], { shell: process.platform === 'win32' });
run(process.execPath, ['references/editor-core/scripts/sync-advanced-declarations.mjs']);
console.log('Synchronizing editor-core runtime…');
run(process.execPath, ['scripts/sync-editor-core.mjs']);

const threeTarget = join(root, 'apps/studio/public/vendor/three');
rmSync(threeTarget, { recursive: true, force: true });
mkdirSync(join(threeTarget, 'addons/controls'), { recursive: true });
mkdirSync(join(threeTarget, 'addons/loaders'), { recursive: true });
mkdirSync(join(threeTarget, 'addons/utils'), { recursive: true });
// three >= 0.180 splits the runtime: three.module.js is a re-export layer over
// three.core.js, so the sidecar file must be vendored too or the app module
// graph 404s on load and the whole UI fails to boot.
for (const name of readdirSync(join(root, 'node_modules/three/build'))) {
  if (name === 'three.module.js' || name.endsWith('.core.js')) {
    cpSync(join(root, 'node_modules/three/build', name), join(threeTarget, name));
  }
}
for (const name of ['OrbitControls.js', 'TransformControls.js']) cpSync(join(root, 'node_modules/three/examples/jsm/controls', name), join(threeTarget, 'addons/controls', name));
cpSync(join(root, 'node_modules/three/examples/jsm/loaders/GLTFLoader.js'), join(threeTarget, 'addons/loaders', 'GLTFLoader.js'));
for (const name of ['BufferGeometryUtils.js', 'SkeletonUtils.js']) cpSync(join(root, 'node_modules/three/examples/jsm/utils', name), join(threeTarget, 'addons/utils', name));

console.log('Building offline studio frontend…');
rmSync(join(root, 'apps/studio/public/js'), { recursive: true, force: true });
run(tscCommand, ['-p', 'apps/studio/tsconfig.json'], { shell: process.platform === 'win32' });

console.log('Checking server modules…');
for (const file of filesUnder(join(root, 'apps/studio/server')).filter((path) => extname(path) === '.mjs')) {
  run(process.execPath, ['--check', file]);
}
for (const file of filesUnder(join(root, 'scripts')).filter((path) => extname(path) === '.mjs' && basename(path) !== 'build.mjs')) {
  run(process.execPath, ['--check', file]);
}

console.log('Verifying runtime is self-contained…');
const runtimeFiles = [
  ...filesUnder(join(root, 'apps/studio/public')),
  ...filesUnder(join(root, 'apps/studio/server')),
].filter((path) => ['.html', '.css', '.js', '.mjs'].includes(extname(path)));
const remoteReferences = [];
for (const file of runtimeFiles) {
  if (file.startsWith(join(root, 'apps/studio/public/vendor/three'))) continue;
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/https?:\/\/[^\s"'`<>]+/g)) {
    const value = match[0];
    if (value.startsWith('http://www.w3.org/2000/svg') || value.startsWith('http://127.0.0.1') || value.startsWith('http://${')) continue;
    remoteReferences.push(`${file.slice(root.length + 1)}: ${value}`);
  }
}
if (remoteReferences.length) throw new Error(`Remote runtime references found:\n${remoteReferences.join('\n')}`);
// Verify every relative/bare local import inside the public app (including the
// vendored three files) resolves to a real file, so a split runtime (e.g.
// three.module.js -> ./three.core.js) can never 404 in the browser.
const publicRoot = join(root, 'apps/studio/public');
const importMap = { three: join(publicRoot, 'vendor/three/three.module.js'), 'three/addons/': join(publicRoot, 'vendor/three/addons/') + '/' };
const missingImports = [];
for (const file of filesUnder(publicRoot).filter((path) => ['.js', '.mjs'].includes(extname(path)))) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/(?:import|export)\s+[^;]*?from\s+['"]([^'"]+)['"]/g)) {
    const spec = match[1];
    if (/^(?:[a-z]+:|data:|https?:\/\/)/.test(spec)) continue;
    let target = null;
    if (spec === 'three') target = importMap.three;
    else if (spec.startsWith('three/addons/')) target = importMap['three/addons/'] + spec.slice('three/addons/'.length);
    else if (spec.startsWith('.')) target = join(dirname(file), spec);
    else continue;
    if (!target) continue;
    const candidates = [target, `${target}.js`, join(target, 'index.js')];
    if (!candidates.some((candidate) => existsSync(candidate))) missingImports.push(`${file.slice(root.length + 1)} -> ${spec}`);
  }
  // Side-effect imports: import 'spec';
  for (const match of text.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) {
    const spec = match[1];
    if (!spec.startsWith('.')) continue;
    const target = join(dirname(file), spec);
    const candidates = [target, `${target}.js`, join(target, 'index.js')];
    if (!candidates.some((candidate) => existsSync(candidate))) missingImports.push(`${file.slice(root.length + 1)} -> ${spec}`);
  }
}
if (missingImports.length) throw new Error(`Unresolved local imports (would 404 in the browser):\n${missingImports.join('\n')}`);

const manifest = {
  application: 'RouteCore Offline Studio',
  version: packageVersion,
  builtAt: new Date().toISOString(),
  node: process.version,
  editorCoreFiles: filesUnder(join(root, 'packages/harness-editor-core/dist')).length,
  editorCoreSource: 'references/editor-core/editor-core',
  frontendFiles: filesUnder(join(root, 'apps/studio/public/js')).length,
  runtimeNetworkPolicy: 'loopback-only',
  externalRuntimeDependencies: 0,
  bundledRuntimeDependencies: ['three'],
};
mkdirSync(join(root, 'dist'), { recursive: true });
await import('node:fs').then(({ writeFileSync }) => writeFileSync(join(root, 'dist/build-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`));
console.log(`Build complete: ${manifest.frontendFiles} frontend files, ${manifest.editorCoreFiles} editor-core files.`);
