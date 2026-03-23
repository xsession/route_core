import { Router } from 'express';
import { getDb } from '../db/schema.js';

const router = Router();

// List cables
router.get('/', (req, res) => {
  const db = getDb();
  const { q } = req.query;

  let sql = 'SELECT * FROM cables WHERE 1=1';
  const params: any[] = [];

  if (q && typeof q === 'string') {
    sql += ' AND (name LIKE ? OR part_number LIKE ? OR manufacturer LIKE ?)';
    const pattern = `%${q}%`;
    params.push(pattern, pattern, pattern);
  }

  sql += ' ORDER BY name ASC LIMIT 200';

  const rows = db.prepare(sql).all(...params);
  res.json(rows.map((r: any) => ({ ...r, data: JSON.parse(r.data) })));
});

// Get single cable
router.get('/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM cables WHERE id = ?').get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json({ ...row, data: JSON.parse(row.data) });
});

// Create cable
router.post('/', (req, res) => {
  const { id, name, manufacturer, part_number, conductor_count, data, custom } = req.body;
  if (!id || !name || !conductor_count || !data) {
    return res.status(400).json({ error: 'id, name, conductor_count, and data are required' });
  }

  const db = getDb();
  db.prepare(
    'INSERT INTO cables (id, name, manufacturer, part_number, conductor_count, data, custom) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, name, manufacturer ?? '', part_number ?? '', conductor_count, JSON.stringify(data), custom ? 1 : 0);

  res.status(201).json({ id });
});

// Delete cable
router.delete('/:id', (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM cables WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ deleted: true });
});

export default router;
