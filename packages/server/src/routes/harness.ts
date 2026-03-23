import { Router } from 'express';
import { getDb } from '../db/schema.js';

const router = Router();

// List all harnesses
router.get('/', (_req, res) => {
  const db = getDb();
  const rows = db.prepare(
    'SELECT id, name, description, version, author, created_at, updated_at FROM harnesses ORDER BY updated_at DESC'
  ).all();
  res.json(rows);
});

// Get a single harness
router.get('/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM harnesses WHERE id = ?').get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json({ ...row, data: JSON.parse(row.data) });
});

// Create a new harness
router.post('/', (req, res) => {
  const { id, name, description, version, author, data } = req.body;
  if (!id || !name || !data) {
    return res.status(400).json({ error: 'id, name, and data are required' });
  }

  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO harnesses (id, name, description, version, author, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, name, description ?? '', version ?? 1, author ?? '', JSON.stringify(data), now, now);

  res.status(201).json({ id });
});

// Update a harness
router.put('/:id', (req, res) => {
  const { name, description, version, data } = req.body;
  const db = getDb();
  const now = new Date().toISOString();

  const result = db.prepare(
    'UPDATE harnesses SET name = COALESCE(?, name), description = COALESCE(?, description), version = COALESCE(?, version), data = COALESCE(?, data), updated_at = ? WHERE id = ?'
  ).run(name, description, version, data ? JSON.stringify(data) : null, now, req.params.id);

  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ updated: true });
});

// Delete a harness
router.delete('/:id', (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM harnesses WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ deleted: true });
});

export default router;
