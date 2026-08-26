#!/usr/bin/env node
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { ProjectDatabase } from '../apps/studio/server/project-database.mjs';

let output = resolve('dist/RouteCore-Demonstration.routecore');
for (let index = 2; index < process.argv.length; index += 1) {
  if (process.argv[index] === '--output') output = resolve(process.argv[index + 1]);
}
if (existsSync(output)) rmSync(output, { force: true });
const project = ProjectDatabase.create(output, {
  name: 'RouteCore Demonstration',
  description: 'Offline-first wiring harness CAD demonstration project.',
  organization: 'RouteCore',
  template: 'sample',
});
try {
  project.createRevision({
    modelId: project.getWorkspaceState().activeModelId,
    name: 'Initial demonstration',
    message: 'Generated reference project with components, wires, routing patterns, labels, and local persistence.',
    lifecycleState: 'draft',
  });
  const integrity = project.integrityCheck();
  if (!integrity.ok) throw new Error('Generated demonstration project failed integrity verification.');
  console.log(output);
} finally {
  project.close();
}
