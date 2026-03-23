import { Router } from 'express';
import { getDb } from '../db/schema.js';

const router = Router();

// List components with optional filtering
router.get('/', (req, res) => {
  const db = getDb();
  const { category, manufacturer, q } = req.query;

  let sql = 'SELECT * FROM components WHERE 1=1';
  const params: any[] = [];

  if (category) {
    sql += ' AND category = ?';
    params.push(category);
  }
  if (manufacturer) {
    sql += ' AND manufacturer = ?';
    params.push(manufacturer);
  }
  if (q && typeof q === 'string') {
    sql += ' AND (name LIKE ? OR part_number LIKE ? OR manufacturer LIKE ?)';
    const pattern = `%${q}%`;
    params.push(pattern, pattern, pattern);
  }

  sql += ' ORDER BY name ASC LIMIT 200';

  const rows = db.prepare(sql).all(...params);
  res.json(rows.map((r: any) => ({ ...r, data: JSON.parse(r.data) })));
});

// Get single component
router.get('/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM components WHERE id = ?').get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json({ ...row, data: JSON.parse(row.data) });
});

// Create component
router.post('/', (req, res) => {
  const { id, name, manufacturer, part_number, category, type, data, custom } = req.body;
  if (!id || !name || !category || !data) {
    return res.status(400).json({ error: 'id, name, category, and data are required' });
  }

  const db = getDb();
  db.prepare(
    'INSERT INTO components (id, name, manufacturer, part_number, category, type, data, custom) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, name, manufacturer ?? '', part_number ?? '', category, type ?? 'free_hanging', JSON.stringify(data), custom ? 1 : 0);

  res.status(201).json({ id });
});

// Update component
router.put('/:id', (req, res) => {
  const { name, manufacturer, part_number, category, type, data } = req.body;
  const db = getDb();

  const result = db.prepare(
    'UPDATE components SET name = COALESCE(?, name), manufacturer = COALESCE(?, manufacturer), part_number = COALESCE(?, part_number), category = COALESCE(?, category), type = COALESCE(?, type), data = COALESCE(?, data) WHERE id = ?'
  ).run(name, manufacturer, part_number, category, type, data ? JSON.stringify(data) : null, req.params.id);

  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ updated: true });
});

// Delete component
router.delete('/:id', (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM components WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ deleted: true });
});

// Get distinct manufacturers
router.get('/meta/manufacturers', (_req, res) => {
  const db = getDb();
  const rows = db.prepare("SELECT DISTINCT manufacturer FROM components WHERE manufacturer != '' ORDER BY manufacturer").all();
  res.json(rows.map((r: any) => r.manufacturer));
});

// Get distinct categories
router.get('/meta/categories', (_req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT DISTINCT category FROM components ORDER BY category').all();
  res.json(rows.map((r: any) => r.category));
});

export default router;
