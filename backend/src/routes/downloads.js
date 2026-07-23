import { Router } from 'express';
import { randomUUID } from 'crypto';
import path from 'path';
import { getDb, getSetting } from '../db.js';
import { addClient, removeClient, broadcast } from '../events.js';
import { cancelDownload, processQueue } from '../downloader.js';
import * as xtream from '../xtream.js';

const router = Router();

function sanitize(name) {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\s+/g, ' ').trim();
}

function pad(n, width = 2) {
  return String(n).padStart(width, '0');
}

// SSE stream for real-time download updates
router.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Send current downloads as initial state
  const downloads = getDb().prepare('SELECT * FROM downloads ORDER BY created_at DESC').all();
  res.write(`data: ${JSON.stringify({ event: 'init', downloads })}\n\n`);

  addClient(res);

  const heartbeat = setInterval(() => {
    try { res.write(': ping\n\n'); } catch { clearInterval(heartbeat); }
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    removeClient(res);
  });
});

router.get('/', (req, res) => {
  const downloads = getDb().prepare('SELECT * FROM downloads ORDER BY created_at DESC').all();
  res.json(downloads);
});

router.post('/', async (req, res) => {
  const { type, stream_id, name, extension, series_name, season, episode, episode_title, save_path } = req.body;

  if (!type || !stream_id || !name || !extension) {
    return res.status(400).json({ error: 'Missing required fields: type, stream_id, name, extension' });
  }

  const db = getDb();

  // Check if already downloading/queued
  const existing = db.prepare(`
    SELECT id, status FROM downloads WHERE stream_id = ? AND status IN ('queued', 'downloading')
  `).get(stream_id);
  if (existing) {
    return res.status(409).json({ error: 'Already queued or downloading', existing });
  }

  let downloadUrl, savePath, filename;

  if (type === 'movie') {
    downloadUrl = xtream.buildMovieUrl(stream_id, extension);
    const movieDir = sanitize(name);
    savePath = save_path || path.join(getSetting('movies_path'), movieDir);
    filename = `${sanitize(name)}.${extension}`;
  } else if (type === 'episode') {
    downloadUrl = xtream.buildEpisodeUrl(stream_id, extension);
    const showDir = sanitize(series_name || name);
    const seasonDir = `Season ${pad(parseInt(season || 1))}`;
    savePath = save_path || path.join(getSetting('shows_path'), showDir, seasonDir);
    const epCode = `S${pad(season)}E${pad(episode)}`;
    const title = episode_title ? ` - ${sanitize(episode_title)}` : '';
    filename = `${sanitize(series_name || name)} - ${epCode}${title}.${extension}`;
  } else {
    return res.status(400).json({ error: 'type must be movie or episode' });
  }

  const id = randomUUID();
  db.prepare(`
    INSERT INTO downloads
      (id, type, name, stream_id, series_name, season, episode, episode_title, extension, save_path, filename, url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, type, name, stream_id, series_name || null, season || null, episode || null,
    episode_title || null, extension, savePath, filename, downloadUrl);

  const download = db.prepare('SELECT * FROM downloads WHERE id = ?').get(id);
  broadcast('added', download);
  processQueue();

  res.status(201).json(download);
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  const dl = db.prepare('SELECT * FROM downloads WHERE id = ?').get(req.params.id);
  if (!dl) return res.status(404).json({ error: 'Not found' });

  if (dl.status === 'downloading') {
    cancelDownload(dl.id);
  }

  db.prepare('DELETE FROM downloads WHERE id = ?').run(req.params.id);
  broadcast('removed', { id: req.params.id });
  res.json({ ok: true });
});

router.post('/:id/retry', (req, res) => {
  const db = getDb();
  const dl = db.prepare('SELECT * FROM downloads WHERE id = ?').get(req.params.id);
  if (!dl) return res.status(404).json({ error: 'Not found' });
  if (!['error', 'cancelled'].includes(dl.status)) {
    return res.status(400).json({ error: 'Can only retry error or cancelled downloads' });
  }

  db.prepare(`
    UPDATE downloads SET status = 'queued', progress = 0, downloaded = 0, speed = 0, error = NULL, updated_at = unixepoch()
    WHERE id = ?
  `).run(dl.id);

  broadcast('update', { id: dl.id, status: 'queued', progress: 0, downloaded: 0 });
  processQueue();

  res.json(db.prepare('SELECT * FROM downloads WHERE id = ?').get(dl.id));
});

router.delete('/', (req, res) => {
  const { status } = req.query;
  const db = getDb();
  if (status) {
    db.prepare('DELETE FROM downloads WHERE status = ?').run(status);
  } else {
    db.prepare("DELETE FROM downloads WHERE status NOT IN ('queued', 'downloading')").run();
  }
  broadcast('cleared', {});
  res.json({ ok: true });
});

export default router;
