import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultCableLibrary, defaultComponentLibrary } from './sample-data.mjs';
import { appHome, nowIso, sha256 } from './util.mjs';

export class AppDatabase {
  constructor(databaseDir) {
    this.path = join(databaseDir || appHome(), 'application.sqlite');
    this.database = new DatabaseSync(this.path);
    const schemaPath = new URL('../../../database/application.sql', import.meta.url);
    this.database.exec(readFileSync(schemaPath, 'utf8'));
    this.seedDefaults();
  }

  close() {
    this.database.close();
  }

  seedDefaults() {
    const now = nowIso();
    const componentStatement = this.database.prepare(`
      INSERT OR IGNORE INTO library_component(
        id, name, category, manufacturer, part_number, tags_json,
        definition_json, content_hash, created_at, modified_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of defaultComponentLibrary()) {
      const json = JSON.stringify(item.component);
      componentStatement.run(
        item.id,
        item.name,
        item.category,
        item.manufacturer,
        item.partNumber,
        JSON.stringify(item.tags),
        json,
        sha256(json),
        now,
        now,
      );
    }

    const cableStatement = this.database.prepare(`
      INSERT OR IGNORE INTO library_cable(
        id, name, manufacturer, part_number, tags_json,
        definition_json, content_hash, created_at, modified_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of defaultCableLibrary()) {
      const json = JSON.stringify(item.definition);
      cableStatement.run(
        item.id,
        item.name,
        item.manufacturer,
        item.partNumber,
        JSON.stringify(item.tags),
        json,
        sha256(json),
        now,
        now,
      );
    }
  }

  getSettings() {
    const rows = this.database.prepare('SELECT key, value_json FROM setting ORDER BY key').all();
    const settings = {};
    for (const row of rows) settings[row.key] = JSON.parse(row.value_json);
    return settings;
  }

  setSettings(values) {
    const statement = this.database.prepare(`
      INSERT INTO setting(key, value_json, modified_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, modified_at = excluded.modified_at
    `);
    const now = nowIso();
    this.database.exec('BEGIN IMMEDIATE');
    try {
      for (const [key, value] of Object.entries(values || {})) {
        statement.run(key, JSON.stringify(value), now);
      }
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
    return this.getSettings();
  }

  recordRecentProject(meta, path) {
    this.database.prepare(`
      INSERT INTO recent_project(path, project_uuid, name, last_opened_at, pinned, missing)
      VALUES (?, ?, ?, ?, COALESCE((SELECT pinned FROM recent_project WHERE path = ?), 0), 0)
      ON CONFLICT(path) DO UPDATE SET
        project_uuid = excluded.project_uuid,
        name = excluded.name,
        last_opened_at = excluded.last_opened_at,
        missing = 0
    `).run(path, meta.project_uuid, meta.name, nowIso(), path);
  }

  listRecentProjects() {
    const rows = this.database.prepare(`
      SELECT path, project_uuid, name, last_opened_at, pinned, missing
      FROM recent_project
      ORDER BY pinned DESC, last_opened_at DESC
      LIMIT 30
    `).all();
    const updateMissing = this.database.prepare('UPDATE recent_project SET missing = ? WHERE path = ?');
    return rows.map((row) => {
      const missing = !existsSync(row.path);
      if (missing !== Boolean(row.missing)) updateMissing.run(missing ? 1 : 0, row.path);
      return { ...row, pinned: Boolean(row.pinned), missing };
    });
  }

  setProjectPinned(path, pinned) {
    this.database.prepare('UPDATE recent_project SET pinned = ? WHERE path = ?').run(pinned ? 1 : 0, path);
  }

  listComponents(query = '') {
    const normalized = String(query).trim().toLowerCase();
    const rows = normalized
      ? this.database.prepare(`
          SELECT * FROM library_component
          WHERE lower(name) LIKE ? OR lower(category) LIKE ? OR lower(tags_json) LIKE ?
          ORDER BY category, name
        `).all(`%${normalized}%`, `%${normalized}%`, `%${normalized}%`)
      : this.database.prepare('SELECT * FROM library_component ORDER BY category, name').all();
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      manufacturer: row.manufacturer,
      partNumber: row.part_number,
      tags: JSON.parse(row.tags_json),
      component: JSON.parse(row.definition_json),
      modifiedAt: row.modified_at,
    }));
  }

  saveComponent(item) {
    const now = nowIso();
    const json = JSON.stringify(item.component);
    this.database.prepare(`
      INSERT INTO library_component(
        id, name, category, manufacturer, part_number, tags_json,
        definition_json, content_hash, created_at, modified_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        category = excluded.category,
        manufacturer = excluded.manufacturer,
        part_number = excluded.part_number,
        tags_json = excluded.tags_json,
        definition_json = excluded.definition_json,
        content_hash = excluded.content_hash,
        modified_at = excluded.modified_at
    `).run(
      item.id,
      item.name,
      item.category || 'custom',
      item.manufacturer || '',
      item.partNumber || '',
      JSON.stringify(item.tags || []),
      json,
      sha256(json),
      now,
      now,
    );
    return this.listComponents().find((entry) => entry.id === item.id);
  }

  deleteComponent(id) {
    return this.database.prepare('DELETE FROM library_component WHERE id = ?').run(id).changes > 0;
  }

  listCables(query = '') {
    const normalized = String(query).trim().toLowerCase();
    const rows = normalized
      ? this.database.prepare(`
          SELECT * FROM library_cable
          WHERE lower(name) LIKE ? OR lower(part_number) LIKE ? OR lower(tags_json) LIKE ?
          ORDER BY name
        `).all(`%${normalized}%`, `%${normalized}%`, `%${normalized}%`)
      : this.database.prepare('SELECT * FROM library_cable ORDER BY name').all();
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      manufacturer: row.manufacturer,
      partNumber: row.part_number,
      tags: JSON.parse(row.tags_json),
      definition: JSON.parse(row.definition_json),
      modifiedAt: row.modified_at,
    }));
  }

  saveCable(item) {
    const now = nowIso();
    const json = JSON.stringify(item.definition);
    this.database.prepare(`
      INSERT INTO library_cable(
        id, name, manufacturer, part_number, tags_json,
        definition_json, content_hash, created_at, modified_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        manufacturer = excluded.manufacturer,
        part_number = excluded.part_number,
        tags_json = excluded.tags_json,
        definition_json = excluded.definition_json,
        content_hash = excluded.content_hash,
        modified_at = excluded.modified_at
    `).run(
      item.id,
      item.name,
      item.manufacturer || '',
      item.partNumber || '',
      JSON.stringify(item.tags || []),
      json,
      sha256(json),
      now,
      now,
    );
    return this.listCables().find((entry) => entry.id === item.id);
  }

  deleteCable(id) {
    return this.database.prepare('DELETE FROM library_cable WHERE id = ?').run(id).changes > 0;
  }
}
