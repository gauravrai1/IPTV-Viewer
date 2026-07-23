import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { getDb, getSetting } from './db.js';
import { broadcast } from './events.js';

const active = new Map();

export function getMaxConcurrent() {
  return parseInt(getSetting('max_concurrent') || '3', 10);
}

export async function processQueue() {
  const db = getDb();
  const running = db.prepare(`SELECT COUNT(*) as n FROM downloads WHERE status = 'downloading'`).get().n;
  const slots = getMaxConcurrent() - running;
  if (slots <= 0) return;

  const queued = db.prepare(`
    SELECT * FROM downloads WHERE status = 'queued' ORDER BY created_at ASC LIMIT ?
  `).all(slots);

  for (const dl of queued) {
    runDownload(dl);
  }
}

async function runDownload(download) {
  const db = getDb();

  db.prepare(`UPDATE downloads SET status = 'downloading', updated_at = unixepoch() WHERE id = ?`)
    .run(download.id);
  broadcast('update', { id: download.id, status: 'downloading' });

  const controller = new AbortController();
  active.set(download.id, controller);

  const filePath = path.join(download.save_path, download.filename);

  try {
    fs.mkdirSync(download.save_path, { recursive: true });

    const response = await axios({
      method: 'GET',
      url: download.url,
      responseType: 'stream',
      signal: controller.signal,
      timeout: 0,
    });

    const totalSize = parseInt(response.headers['content-length'] || '0', 10);
    if (totalSize > 0) {
      db.prepare(`UPDATE downloads SET size = ? WHERE id = ?`).run(totalSize, download.id);
    }

    let downloaded = 0;
    let lastTick = Date.now();
    let bytesAtLastTick = 0;

    const updateProgress = db.prepare(`
      UPDATE downloads SET downloaded = ?, progress = ?, speed = ?, updated_at = unixepoch() WHERE id = ?
    `);

    response.data.on('data', (chunk) => {
      downloaded += chunk.length;
      const now = Date.now();
      const elapsed = (now - lastTick) / 1000;

      if (elapsed >= 1) {
        const speed = (downloaded - bytesAtLastTick) / elapsed;
        const progress = totalSize > 0 ? Math.min((downloaded / totalSize) * 100, 100) : 0;
        updateProgress.run(downloaded, progress, speed, download.id);
        broadcast('progress', { id: download.id, downloaded, size: totalSize, progress, speed });
        lastTick = now;
        bytesAtLastTick = downloaded;
      }
    });

    const writer = fs.createWriteStream(filePath);
    await new Promise((resolve, reject) => {
      response.data.on('error', reject);
      writer.on('error', reject);
      writer.on('finish', resolve);
      response.data.pipe(writer);
    });

    db.prepare(`
      UPDATE downloads SET status = 'completed', progress = 100, downloaded = ?, updated_at = unixepoch() WHERE id = ?
    `).run(downloaded, download.id);
    broadcast('update', { id: download.id, status: 'completed', progress: 100, downloaded });

  } catch (err) {
    try { fs.unlinkSync(filePath); } catch {}

    if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED' || err.name === 'AbortError') {
      db.prepare(`UPDATE downloads SET status = 'cancelled', updated_at = unixepoch() WHERE id = ?`).run(download.id);
      broadcast('update', { id: download.id, status: 'cancelled' });
    } else {
      db.prepare(`UPDATE downloads SET status = 'error', error = ?, updated_at = unixepoch() WHERE id = ?`)
        .run(err.message, download.id);
      broadcast('update', { id: download.id, status: 'error', error: err.message });
    }
  } finally {
    active.delete(download.id);
    processQueue();
  }
}

export function cancelDownload(id) {
  const ctrl = active.get(id);
  if (ctrl) ctrl.abort();
}
