import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '../../..', 'data', 'route_core.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
  }
  return db;
}

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS harnesses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      version INTEGER DEFAULT 1,
      author TEXT DEFAULT '',
      data TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS components (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      manufacturer TEXT DEFAULT '',
      part_number TEXT DEFAULT '',
      category TEXT NOT NULL,
      type TEXT NOT NULL,
      data TEXT NOT NULL,
      custom INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cables (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      manufacturer TEXT DEFAULT '',
      part_number TEXT DEFAULT '',
      conductor_count INTEGER NOT NULL,
      data TEXT NOT NULL,
      custom INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_components_category ON components(category);
    CREATE INDEX IF NOT EXISTS idx_components_manufacturer ON components(manufacturer);
    CREATE INDEX IF NOT EXISTS idx_cables_manufacturer ON cables(manufacturer);
  `);
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
