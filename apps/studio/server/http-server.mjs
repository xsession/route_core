import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { availableExports, generateExport } from './exporters.mjs';

const publicDirectory = fileURLToPath(new URL('../public/', import.meta.url));
const maximumBodyBytes = 24 * 1024 * 1024;
const indexHtml = readFileSync(join(publicDirectory, 'index.html'), 'utf8');
const importMapSource = indexHtml.match(/<script\b[^>]*\btype=["']importmap["'][^>]*>([\s\S]*?)<\/script>/iu)?.[1];
if (importMapSource === undefined) throw new Error('The application import map is missing from index.html.');
const importMapCspHash = `sha256-${createHash('sha256').update(importMapSource).digest('base64')}`;

const mediaTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.png', 'image/png'],
  ['.ico', 'image/x-icon'],
  ['.map', 'application/json; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
]);

function securityHeaders(response) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  response.setHeader(
    'Content-Security-Policy',
    `default-src 'self'; script-src 'self' '${importMapCspHash}'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' data: blob:; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`,
  );
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
}

function jsonResponse(response, status, value) {
  const body = `${JSON.stringify(value)}\n`;
  securityHeaders(response);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  response.end(body);
}

function errorResponse(response, error, status = 400) {
  const message = error instanceof Error ? error.message : String(error);
  jsonResponse(response, status, { error: message });
}

function readBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    let length = 0;
    const chunks = [];
    request.on('data', (chunk) => {
      length += chunk.length;
      if (length > maximumBodyBytes) {
        rejectBody(new Error(`Request body exceeds ${maximumBodyBytes} bytes.`));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (!chunks.length) {
        resolveBody({});
        return;
      }
      try {
        resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        rejectBody(new Error('Request body must be valid JSON.'));
      }
    });
    request.on('error', rejectBody);
  });
}

function readRawBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    let length = 0;
    const chunks = [];
    request.on('data', (chunk) => {
      length += chunk.length;
      if (length > maximumBodyBytes) {
        rejectBody(new Error(`Request body exceeds ${maximumBodyBytes} bytes.`));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolveBody(Buffer.concat(chunks)));
    request.on('error', rejectBody);
  });
}

function routeId(pathname, prefix, suffix = '') {
  if (!pathname.startsWith(prefix) || (suffix && !pathname.endsWith(suffix))) return null;
  const end = suffix ? pathname.length - suffix.length : pathname.length;
  const value = pathname.slice(prefix.length, end);
  return value && !value.includes('/') ? decodeURIComponent(value) : null;
}

async function handleApi(service, request, response, url) {
  const project = () => service.requireProject();
  const method = request.method || 'GET';
  const path = url.pathname;

  if (method === 'GET' && path === '/api/health') {
    jsonResponse(response, 200, { ok: true, offline: true, projectOpen: Boolean(service.project) });
    return true;
  }
  if (method === 'GET' && path === '/api/bootstrap') {
    jsonResponse(response, 200, service.bootstrap());
    return true;
  }
  if (method === 'GET' && path === '/api/project/workspace') {
    jsonResponse(response, 200, project().getWorkspace());
    return true;
  }
  if (method === 'POST' && path === '/api/projects/new') {
    jsonResponse(response, 201, service.createProject(await readBody(request)));
    return true;
  }
  if (method === 'POST' && path === '/api/projects/open') {
    const body = await readBody(request);
    jsonResponse(response, 200, service.openProject(body.path));
    return true;
  }
  if (method === 'POST' && path === '/api/projects/pin') {
    const body = await readBody(request);
    service.appDatabase.setProjectPinned(body.path, Boolean(body.pinned));
    jsonResponse(response, 200, { recentProjects: service.appDatabase.listRecentProjects() });
    return true;
  }
  if (method === 'PATCH' && path === '/api/project/meta') {
    jsonResponse(response, 200, project().updateMeta(await readBody(request)));
    return true;
  }
  if (method === 'GET' && path === '/api/project/document') {
    jsonResponse(response, 200, project().loadEditorDocument({
      modelId: url.searchParams.get('modelId') || undefined,
      pageId: url.searchParams.get('pageId') || undefined,
      viewKind: url.searchParams.get('viewKind') || undefined,
    }));
    return true;
  }
  if (method === 'PUT' && path === '/api/project/document') {
    jsonResponse(response, 200, project().saveEditorDocument(await readBody(request)));
    return true;
  }
  if (method === 'POST' && path === '/api/project/assets') {
    const mediaType = String(request.headers['content-type'] || 'application/octet-stream').slice(0, 200);
    jsonResponse(response, 201, project().saveEmbeddedAsset({
      modelId: url.searchParams.get('modelId') || undefined,
      data: await readRawBody(request),
      mediaType,
      originalFilename: url.searchParams.get('filename') || undefined,
      entityKind: url.searchParams.get('entityKind') || 'design_model',
      entityId: url.searchParams.get('entityId') || undefined,
      role: url.searchParams.get('role') || 'attachment',
    }));
    return true;
  }
  const assetId = routeId(path, '/api/project/assets/');
  if (method === 'GET' && assetId) {
    const asset = project().getEmbeddedAsset(assetId);
    securityHeaders(response);
    response.writeHead(200, {
      'Content-Type': asset.mediaType,
      'Content-Length': asset.byteLength,
      'Cache-Control': 'no-store',
    });
    response.end(asset.data);
    return true;
  }
  if (method === 'POST' && path === '/api/project/import-editor') {
    const body = await readBody(request);
    jsonResponse(response, 200, project().saveEditorDocument({
      ...body,
      document: body.document,
      reason: body.reason || 'import editor document',
    }));
    return true;
  }
  if (method === 'POST' && path === '/api/project/select-view') {
    const body = await readBody(request);
    const state = project().setWorkspaceState({
      activeModelId: body.modelId,
      activePageId: body.pageId,
      activeViewKind: body.viewKind,
      viewportState: body.viewportState || {},
      selectedEntities: [],
    });
    const editor = project().loadEditorDocument(state);
    jsonResponse(response, 200, { workspace: state, editor, drawingElements: project().listDrawingElements(editor.modelId, editor.pageId) });
    return true;
  }
  if (method === 'POST' && path === '/api/project/checkpoint') {
    jsonResponse(response, 200, project().checkpoint());
    return true;
  }
  if (method === 'GET' && path === '/api/project/integrity') {
    jsonResponse(response, 200, project().integrityCheck());
    return true;
  }
  if (method === 'GET' && path === '/api/project/commands') {
    jsonResponse(response, 200, project().getCommandLog(
      Number(url.searchParams.get('limit') || 100),
      url.searchParams.get('modelId') || undefined,
    ));
    return true;
  }
  const restoreCommandSequence = routeId(path, '/api/project/commands/', '/restore');
  if (method === 'POST' && restoreCommandSequence) {
    const result = project().restoreCommand(Number(restoreCommandSequence));
    jsonResponse(response, 200, { result, workspace: project().getWorkspace() });
    return true;
  }
  if (method === 'GET' && path === '/api/project/revisions') {
    jsonResponse(response, 200, project().listRevisions(url.searchParams.get('modelId') || undefined));
    return true;
  }
  if (method === 'POST' && path === '/api/project/revisions') {
    jsonResponse(response, 201, project().createRevision(await readBody(request)));
    return true;
  }
  const restoreRevisionId = routeId(path, '/api/project/revisions/', '/restore');
  if (method === 'POST' && restoreRevisionId) {
    const result = project().restoreRevision(restoreRevisionId);
    jsonResponse(response, 200, { result, workspace: project().getWorkspace() });
    return true;
  }
  if (method === 'POST' && path === '/api/project/generate-assembly') {
    jsonResponse(response, 201, project().generateAssembly(await readBody(request)));
    return true;
  }
  if (method === 'GET' && path === '/api/project/drawing-elements') {
    jsonResponse(response, 200, project().listDrawingElements(
      url.searchParams.get('modelId') || undefined,
      url.searchParams.get('pageId') || undefined,
    ));
    return true;
  }
  if (method === 'PUT' && path === '/api/project/drawing-elements') {
    jsonResponse(response, 200, project().saveDrawingElement(await readBody(request)));
    return true;
  }
  const drawingElementId = routeId(path, '/api/project/drawing-elements/');
  if (method === 'DELETE' && drawingElementId) {
    jsonResponse(response, 200, { deleted: project().deleteDrawingElement(drawingElementId) });
    return true;
  }
  if (method === 'POST' && path === '/api/project/assembly-sync/preview') {
    const body = await readBody(request);
    jsonResponse(response, 200, project().previewAssemblySync(body.assemblyModelId));
    return true;
  }
  if (method === 'POST' && path === '/api/project/assembly-sync/apply') {
    const body = await readBody(request);
    jsonResponse(response, 200, project().applyAssemblySync(body.syncRecordId));
    return true;
  }
  if (method === 'GET' && path === '/api/project/bom') {
    jsonResponse(response, 200, project().listBomItems(url.searchParams.get('modelId') || undefined));
    return true;
  }
  if (method === 'PUT' && path === '/api/project/bom') {
    jsonResponse(response, 200, project().saveBomItem(await readBody(request)));
    return true;
  }
  const bomId = routeId(path, '/api/project/bom/');
  if (method === 'DELETE' && bomId) {
    jsonResponse(response, 200, { deleted: project().deleteBomItem(bomId) });
    return true;
  }
  if (method === 'GET' && path === '/api/library/components') {
    jsonResponse(response, 200, service.appDatabase.listComponents(url.searchParams.get('q') || ''));
    return true;
  }
  if (method === 'PUT' && path === '/api/library/components') {
    jsonResponse(response, 200, service.appDatabase.saveComponent(await readBody(request)));
    return true;
  }
  const componentId = routeId(path, '/api/library/components/');
  if (method === 'DELETE' && componentId) {
    jsonResponse(response, 200, { deleted: service.appDatabase.deleteComponent(componentId) });
    return true;
  }
  if (method === 'GET' && path === '/api/library/cables') {
    jsonResponse(response, 200, service.appDatabase.listCables(url.searchParams.get('q') || ''));
    return true;
  }
  if (method === 'PUT' && path === '/api/library/cables') {
    jsonResponse(response, 200, service.appDatabase.saveCable(await readBody(request)));
    return true;
  }
  const cableId = routeId(path, '/api/library/cables/');
  if (method === 'DELETE' && cableId) {
    jsonResponse(response, 200, { deleted: service.appDatabase.deleteCable(cableId) });
    return true;
  }
  if (method === 'GET' && path === '/api/settings') {
    jsonResponse(response, 200, service.appDatabase.getSettings());
    return true;
  }
  if (method === 'PUT' && path === '/api/settings') {
    jsonResponse(response, 200, service.appDatabase.setSettings(await readBody(request)));
    return true;
  }
  if (method === 'GET' && path === '/api/exports') {
    jsonResponse(response, 200, availableExports());
    return true;
  }
  const exportFormat = routeId(path, '/api/export/');
  if (method === 'GET' && exportFormat) {
    const output = generateExport(project(), exportFormat, {
      modelId: url.searchParams.get('modelId') || undefined,
      pageId: url.searchParams.get('pageId') || undefined,
      viewKind: url.searchParams.get('viewKind') || undefined,
      showGrid: url.searchParams.get('showGrid') === 'true',
      showDiagnostics: url.searchParams.get('showDiagnostics') === 'true',
    });
    securityHeaders(response);
    response.writeHead(200, {
      'Content-Type': output.mediaType,
      'Content-Disposition': `attachment; filename="${output.filename.replaceAll('"', '')}"`,
      'Content-Length': Buffer.byteLength(output.body),
      'Cache-Control': 'no-store',
    });
    response.end(output.body);
    return true;
  }
  return false;
}


function isUnsafeStaticPath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return true;
  }
  if (decoded.includes('\0') || decoded.includes('\\')) return true;
  return decoded.split('/').some((segment) => segment === '..');
}

function shouldUseSpaFallback(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return false;
  }
  return !extname(decoded) && !decoded.startsWith('/api/');
}

function staticPath(pathname) {
  const decoded = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
  const candidate = resolve(publicDirectory, `.${normalize(decoded)}`);
  const rel = relative(publicDirectory, candidate);
  if (rel.startsWith('..') || rel.includes(`..${process.platform === 'win32' ? '\\' : '/'}`)) return null;
  return candidate;
}

function serveStatic(request, response, pathname) {
  const filePath = staticPath(pathname);
  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) return false;
  const stats = statSync(filePath);
  securityHeaders(response);
  response.writeHead(200, {
    'Content-Type': mediaTypes.get(extname(filePath).toLowerCase()) || 'application/octet-stream',
    'Content-Length': stats.size,
    'Cache-Control': filePath.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600',
    'Last-Modified': stats.mtime.toUTCString(),
  });
  if (request.method === 'HEAD') response.end();
  else createReadStream(filePath).pipe(response);
  return true;
}

export function createStudioServer(service, options = {}) {
  const host = options.host || '127.0.0.1';
  const port = Number(options.port || 0);
  const server = createServer(async (request, response) => {
    const url = new URL(request.url || '/', `http://${host}`);
    try {
      if (url.pathname.startsWith('/api/')) {
        if (!(await handleApi(service, request, response, url))) errorResponse(response, new Error('API route not found.'), 404);
        return;
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        errorResponse(response, new Error('Method not allowed.'), 405);
        return;
      }
      if (isUnsafeStaticPath(url.pathname)) {
        errorResponse(response, new Error('Static path not found.'), 404);
        return;
      }
      if (!serveStatic(request, response, url.pathname)) {
        if (!shouldUseSpaFallback(url.pathname)) {
          errorResponse(response, new Error('Static asset not found.'), 404);
          return;
        }
        if (!serveStatic(request, response, '/index.html')) errorResponse(response, new Error('Application assets are missing.'), 500);
      }
    } catch (error) {
      const status = error?.code === 'ENOENT' ? 404 : 400;
      errorResponse(response, error, status);
    }
  });

  return new Promise((resolveServer, rejectServer) => {
    server.once('error', rejectServer);
    server.listen(port, host, () => {
      const address = server.address();
      resolveServer({
        server,
        host,
        port: typeof address === 'object' && address ? address.port : port,
      });
    });
  });
}
