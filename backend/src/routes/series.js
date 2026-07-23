import { Router } from 'express';
import { getDb } from '../db.js';
import * as xtream from '../xtream.js';

const router = Router();

function sendRaw(res, rawJson) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(rawJson);
}

router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const row = db.prepare('SELECT data FROM series_cache WHERE id = 1').get();
    if (row) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(`{"fromCache":true,"data":${row.data}}`);
    }
    const series = await xtream.getSeries();
    const json = JSON.stringify(series);
    db.prepare('INSERT OR REPLACE INTO series_cache (id, data, cached_at) VALUES (1, ?, unixepoch())').run(json);
    res.json({ data: series, fromCache: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/categories', async (req, res) => {
  try {
    const db = getDb();
    const row = db.prepare("SELECT data FROM categories_cache WHERE type = 'series'").get();
    if (row) return sendRaw(res, row.data);
    const cats = await xtream.getSeriesCategories();
    db.prepare("INSERT OR REPLACE INTO categories_cache (type, data) VALUES ('series', ?)").run(JSON.stringify(cats));
    res.json(cats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM series_cache').run();
    db.prepare("DELETE FROM categories_cache WHERE type = 'series'").run();
    const series = await xtream.getSeries();
    const json = JSON.stringify(series);
    db.prepare('INSERT INTO series_cache (id, data, cached_at) VALUES (1, ?, unixepoch())').run(json);
    res.json({ count: series.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const db = getDb();
    const id = parseInt(req.params.id);
    const row = db.prepare('SELECT data FROM series_info_cache WHERE series_id = ?').get(id);
    if (row) return sendRaw(res, row.data);
    const info = await xtream.getSeriesInfo(id);
    db.prepare('INSERT OR REPLACE INTO series_info_cache (series_id, data) VALUES (?, ?)').run(id, JSON.stringify(info));
    res.json(info);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
