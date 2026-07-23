import { Router } from 'express';
import { randomUUID } from 'crypto';
import { getDb } from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  const rows = getDb().prepare('SELECT * FROM watchlist ORDER BY added_at DESC').all();
  res.json(rows.map((r) => ({ ...r, meta: JSON.parse(r.meta) })));
});

router.post('/', (req, res) => {
  const { type, content_id, name, cover, meta = {} } = req.body;
  if (!type || !content_id || !name) {
    return res.status(400).json({ error: 'type, content_id and name are required' });
  }
  const db = getDb();
  const existing = db.prepare('SELECT id FROM watchlist WHERE type = ? AND content_id = ?').get(type, content_id);
  if (existing) return res.status(409).json({ error: 'Already in watchlist', id: existing.id });

  const id = randomUUID();
  db.prepare(`
    INSERT INTO watchlist (id, type, content_id, name, cover, meta) VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, type, content_id, name, cover || '', JSON.stringify(meta));

  res.status(201).json(db.prepare('SELECT * FROM watchlist WHERE id = ?').get(id));
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT id FROM watchlist WHERE id = ? OR (type = ? AND content_id = ?)').get(
    req.params.id, req.params.id, parseInt(req.params.id) || 0,
  );
  if (!row) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM watchlist WHERE id = ?').run(row.id);
  res.json({ ok: true });
});

// Delete by type+content_id (more convenient from frontend)
router.delete('/by/:type/:contentId', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM watchlist WHERE type = ? AND content_id = ?')
    .run(req.params.type, parseInt(req.params.contentId));
  res.json({ ok: true });
});

export default router;
