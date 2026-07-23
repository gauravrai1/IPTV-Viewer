import { Router } from 'express';
import { getDb } from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  try {
    const db = getDb();

    const movieRow = db.prepare(
      "SELECT json_array_length(data) AS count FROM movies_cache WHERE id = 1"
    ).get();
    const seriesRow = db.prepare(
      "SELECT json_array_length(data) AS count FROM series_cache WHERE id = 1"
    ).get();
    const movieCatRow = db.prepare(
      "SELECT json_array_length(data) AS count FROM categories_cache WHERE type = 'vod'"
    ).get();
    const seriesCatRow = db.prepare(
      "SELECT json_array_length(data) AS count FROM categories_cache WHERE type = 'series'"
    ).get();
    const dlRow = db.prepare(
      "SELECT COUNT(*) AS count FROM downloads WHERE status IN ('queued','downloading')"
    ).get();

    res.json({
      movies:      { cached: !!movieRow,     count: movieRow?.count ?? 0 },
      series:      { cached: !!seriesRow,    count: seriesRow?.count ?? 0 },
      movieCats:   { cached: !!movieCatRow,  count: movieCatRow?.count ?? 0 },
      seriesCats:  { cached: !!seriesCatRow, count: seriesCatRow?.count ?? 0 },
      activeDownloads: dlRow?.count ?? 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
