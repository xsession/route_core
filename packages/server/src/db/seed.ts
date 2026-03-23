import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb, closeDb } from '../db/schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function seedDatabase(): void {
  const db = getDb();

  // Check if already seeded
  const count = (db.prepare('SELECT COUNT(*) as c FROM components').get() as any).c;
  if (count > 0) {
    console.log(`Database already has ${count} components, skipping seed.`);
    return;
  }

  const seedPath = resolve(__dirname, '../../../..', 'data', 'seed', 'connectors.json');
  const raw = readFileSync(seedPath, 'utf-8');
  const components = JSON.parse(raw);

  const insert = db.prepare(
    'INSERT OR IGNORE INTO components (id, name, manufacturer, part_number, category, type, data, custom) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );

  const tx = db.transaction(() => {
    for (const comp of components) {
      insert.run(
        comp.id,
        comp.name,
        comp.manufacturer ?? '',
        comp.partNumber ?? '',
        comp.category,
        comp.type ?? 'free_hanging',
        JSON.stringify(comp),
        comp.custom ? 1 : 0
      );
    }
  });

  tx();
  console.log(`Seeded ${components.length} components into database.`);
}

// Run directly
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  // Ensure data directory exists
  const dataDir = resolve(__dirname, '../../../..', 'data');
  mkdirSync(dataDir, { recursive: true });
  seedDatabase();
  closeDb();
}
