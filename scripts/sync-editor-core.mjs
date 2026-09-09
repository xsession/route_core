#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'references', 'editor-core', 'editor-core');
const packageTarget = join(root, 'packages', 'harness-editor-core', 'dist');
const vendorTarget = join(root, 'apps', 'studio', 'public', 'vendor', 'editor-core');

const requiredFiles = ['index.js', 'index.d.ts', 'performance-engine.js', 'adaptive-spatial.js', 'svg.js'];

function replaceDirectory(target) {
  rmSync(target, { recursive: true, force: true });
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target, { recursive: true });
}

export function syncEditorCore({ packageOnly = false } = {}) {
  for (const name of requiredFiles) {
    if (!existsSync(join(source, name))) {
      throw new Error(`editor-core submodule is incomplete (${name} is missing). Run: git submodule update --init --recursive`);
    }
  }
  replaceDirectory(packageTarget);
  if (!packageOnly) replaceDirectory(vendorTarget);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  syncEditorCore({ packageOnly: process.argv.includes('--package-only') });
  console.log(`Synchronized editor-core from ${source}`);
}
