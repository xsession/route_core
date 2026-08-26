import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';

export const APP_VERSION = '0.4.0';
export const PRODUCT_NAME = 'RouteCore';
export const APPLICATION_NAME = 'RouteCore Offline Studio';
export const PROJECT_EXTENSION = '.routecore';
export const LEGACY_PROJECT_EXTENSIONS = Object.freeze(['.ohcad']);
export const PROJECT_EXTENSIONS = Object.freeze([PROJECT_EXTENSION, ...LEGACY_PROJECT_EXTENSIONS]);

export function nowIso() {
  return new Date().toISOString();
}

export function createId(prefix) {
  return `${prefix}-${randomUUID()}`;
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function ensureDirectory(path) {
  mkdirSync(path, { recursive: true });
  return path;
}

export function ensureParent(path) {
  ensureDirectory(dirname(path));
  return path;
}

export function slugify(value) {
  const normalized = String(value || 'project')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return normalized || 'project';
}

function defaultAppHomePath() {
  const preferred = join(homedir(), '.routecore');
  const legacy = join(homedir(), '.ohcad-offline-studio');
  return !existsSync(preferred) && existsSync(legacy) ? legacy : preferred;
}

export function appHome() {
  const configured = process.env.ROUTECORE_HOME || process.env.OHCAD_HOME;
  return ensureDirectory(resolve(configured || defaultAppHomePath()));
}

export function projectsDirectory() {
  return ensureDirectory(join(appHome(), 'projects'));
}

export function defaultProjectPath(name) {
  return join(projectsDirectory(), `${slugify(name)}${PROJECT_EXTENSION}`);
}

export function hasSupportedProjectExtension(path) {
  const extension = extname(String(path || '')).toLowerCase();
  return PROJECT_EXTENSIONS.includes(extension);
}

export function stripProjectExtension(path) {
  const filename = basename(String(path || ''));
  const extension = extname(filename).toLowerCase();
  return PROJECT_EXTENSIONS.includes(extension) ? filename.slice(0, -extension.length) : filename;
}

export function safeJsonParse(value, fallback = undefined) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function normalizeProjectPath(input, fallbackName = 'Untitled Harness') {
  if (!input) return defaultProjectPath(fallbackName);
  const absolute = resolve(String(input));
  return hasSupportedProjectExtension(absolute) ? absolute : `${absolute}${PROJECT_EXTENSION}`;
}

export function clampNumber(value, minimum, maximum, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, number));
}
