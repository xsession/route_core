#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const stageRoot = join(root, 'dist/package-stage');
const stage = join(stageRoot, `routecore-offline-studio-${version}`);
const archive = join(root, 'dist', `routecore-offline-studio-${version}.zip`);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with status ${result.status}.`);
}

run(process.execPath, ['scripts/build.mjs']);
run(process.execPath, ['scripts/create-demo-project.mjs', '--output', join(root, 'dist/RouteCore-Demonstration.routecore')]);
rmSync(stageRoot, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
const include = ['apps', 'database', 'docs', 'examples', 'packages', 'scripts', 'tests', 'package.json', 'README.md', 'START_HERE.md', 'run.sh', 'run.cmd', 'LICENSE'];
for (const name of include) {
  const source = join(root, name);
  if (existsSync(source)) cpSync(source, join(stage, name), { recursive: true });
}
cpSync(join(root, 'dist/build-manifest.json'), join(stage, 'build-manifest.json'));
cpSync(join(root, 'dist/RouteCore-Demonstration.routecore'), join(stage, 'RouteCore-Demonstration.routecore'));
rmSync(archive, { force: true });
run('zip', ['-q', '-r', archive, basename(stage)], { cwd: stageRoot });
const digest = createHash('sha256').update(readFileSync(archive)).digest('hex');
writeFileSync(join(root, 'dist', 'SHA256SUMS.txt'), `${digest}  ${basename(archive)}\n`);
console.log(archive);
