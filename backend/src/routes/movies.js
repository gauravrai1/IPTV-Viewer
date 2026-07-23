import { Router } from 'express';
import { getDb } from '../db.js';
import * as xtream from '../xtream.js';

const router = Router();

// Send cached JSON string directly — skips the expensive parse→stringify round trip
function sendCachedJson(res, rawJson, extra = '') {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(`{"fromCache":true,"data":${rawJson}${extra}}`);
}

router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const row = db.prepare('SELECT data FROM movies_cache WHERE id = 1').get();
    if (row) return sendCachedJson(res, row.data);
    const movies = await xtream.getVodStreams();
    const json = JSON.stringify(movies);
    db.prepare('INSERT OR REPLACE INTO movies_cache (id, data, cached_at) VALUES (1, ?, unixepoch())').run(json);
    res.json({ data: movies, fromCache: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/categories', async (req, res) => {
  try {
    const db = getDb();
    const row = db.prepare("SELECT data FROM categories_cache WHERE type = 'vod'").get();
    if (row) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(row.data);
    }
    const cats = await xtream.getVodCategories();
    db.prepare("INSERT OR REPLACE INTO categories_cache (type, data) VALUES ('vod', ?)").run(JSON.stringify(cats));
    res.json(cats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM movies_cache').run();
    db.prepare("DELETE FROM categories_cache WHERE type = 'vod'").run();
    const movies = await xtream.getVodStreams();
    const json = JSON.stringify(movies);
    db.prepare('INSERT INTO movies_cache (id, data, cached_at) VALUES (1, ?, unixepoch())').run(json);
    res.json({ count: movies.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const db = getDb();
    const id = parseInt(req.params.id);
    const row = db.prepare('SELECT data FROM vod_info_cache WHERE vod_id = ?').get(id);
    if (row) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(row.data);
    }
    const info = await xtream.getVodInfo(id);
    db.prepare('INSERT OR REPLACE INTO vod_info_cache (vod_id, data) VALUES (?, ?)').run(id, JSON.stringify(info));
    res.json(info);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
