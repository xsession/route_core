#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { ProjectService } from './project-service.mjs';
import { createStudioServer } from './http-server.mjs';
import { APPLICATION_NAME, PROJECT_EXTENSION } from './util.mjs';

function parseArguments(argv) {
  const result = { host: '127.0.0.1', port: 0, open: false, project: null };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--open') result.open = true;
    else if (value === '--host') result.host = argv[++index];
    else if (value === '--port') result.port = Number(argv[++index]);
    else if (value === '--project') result.project = argv[++index];
    else if (value === '--help' || value === '-h') {
      console.log(`${APPLICATION_NAME}\n\nUsage:\n  node apps/studio/server/main.mjs [--open] [--port 4173] [--project file${PROJECT_EXTENSION}]\n`);
      process.exit(0);
    }
  }
  if (result.host !== '127.0.0.1' && result.host !== '::1') {
    throw new Error('For offline security the studio may only bind to a loopback address.');
  }
  return result;
}

function openBrowser(url) {
  let command;
  let args;
  if (process.platform === 'win32') {
    command = 'cmd';
    args = ['/c', 'start', '', url];
  } else if (process.platform === 'darwin') {
    command = 'open';
    args = [url];
  } else {
    command = 'xdg-open';
    args = [url];
  }
  const child = spawn(command, args, { detached: true, stdio: 'ignore' });
  child.on('error', () => {});
  child.unref();
}

const options = parseArguments(process.argv.slice(2));
const service = new ProjectService();
service.openInitial(options.project);
const running = await createStudioServer(service, options);
const url = `http://${running.host}:${running.port}/`;
console.log(`${APPLICATION_NAME} ${url}`);
console.log(`Project: ${service.requireProject().path}`);
console.log('Runtime network policy: loopback only; no cloud services or remote assets.');
if (options.open) openBrowser(url);

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  running.server.close(() => {
    service.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 3000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
