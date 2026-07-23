import { Router } from 'express';
import { getDb } from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  const rows = getDb().prepare('SELECT key, value FROM settings').all();
  const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  res.json(settings);
});

router.put('/', (req, res) => {
  const db = getDb();
  const allowed = ['movies_path', 'shows_path', 'max_concurrent'];
  const update = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');

  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      update.run(key, String(req.body[key]));
    }
  }

  const rows = db.prepare('SELECT key, value FROM settings').all();
  res.json(Object.fromEntries(rows.map((r) => [r.key, r.value])));
});

export default router;
