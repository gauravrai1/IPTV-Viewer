import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { getDb, getSetting } from './db.js';
import { broadcast } from './events.js';

const active = new Map();

// Automatic retry for transient network failures (connection reset, stalled
// stream, etc.). Each attempt resumes from the bytes already on disk.
const MAX_ATTEMPTS = 5;
const RETRY_BASE_DELAY_MS = 3000;
// Abort an attempt if no data arrives for this long; the retry loop then
// resumes from where the stream stalled.
const STALL_TIMEOUT_MS = 60000;

export function getMaxConcurrent() {
  return parseInt(getSetting('max_concurrent') || '3', 10);
}

export function partPath(download) {
  return path.join(download.save_path, `${download.filename}.part`);
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

function isCancelled(err) {
  return err.name === 'CanceledError' || err.code === 'ERR_CANCELED' || err.name === 'AbortError';
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      const err = new Error('Cancelled');
      err.name = 'AbortError';
      reject(err);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function attemptDownload(download, tmpPath, controller) {
  const db = getDb();

  let startByte = 0;
  try { startByte = fs.statSync(tmpPath).size; } catch {}

  const headers = {};
  if (startByte > 0) {
    headers.Range = `bytes=${startByte}-`;
  }

  const response = await axios({
    method: 'GET',
    url: download.url,
    responseType: 'stream',
    signal: controller.signal,
    timeout: 0,
    headers,
    validateStatus: (s) => s === 200 || s === 206,
  });

  let totalSize;
  if (startByte > 0 && response.status === 206) {
    // Resuming: total size comes from Content-Range ("bytes 123-999/1000")
    const match = /\/(\d+)\s*$/.exec(response.headers['content-range'] || '');
    totalSize = match
      ? parseInt(match[1], 10)
      : startByte + parseInt(response.headers['content-length'] || '0', 10);
  } else {
    // Fresh download, or the server ignored our Range header and sent the
    // whole file — either way we must write from byte 0.
    startByte = 0;
    totalSize = parseInt(response.headers['content-length'] || '0', 10);
  }

  if (totalSize > 0) {
    db.prepare(`UPDATE downloads SET size = ? WHERE id = ?`).run(totalSize, download.id);
  }

  let downloaded = startByte;
  let lastTick = Date.now();
  let bytesAtLastTick = downloaded;

  const updateProgress = db.prepare(`
    UPDATE downloads SET downloaded = ?, progress = ?, speed = ?, updated_at = unixepoch() WHERE id = ?
  `);

  // Sync progress with what's actually on disk (resumed bytes, or 0 on a
  // fresh start) so the UI reflects reality immediately.
  const initialProgress = totalSize > 0 ? Math.min((downloaded / totalSize) * 100, 100) : 0;
  updateProgress.run(downloaded, initialProgress, 0, download.id);
  broadcast('progress', { id: download.id, downloaded, size: totalSize, progress: initialProgress, speed: 0 });

  let stallTimer;
  const resetStallTimer = () => {
    clearTimeout(stallTimer);
    stallTimer = setTimeout(() => {
      response.data.destroy(new Error(`Stream stalled (no data for ${STALL_TIMEOUT_MS / 1000}s)`));
    }, STALL_TIMEOUT_MS);
  };
  resetStallTimer();

  response.data.on('data', (chunk) => {
    resetStallTimer();
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

  const writer = fs.createWriteStream(tmpPath, startByte > 0 ? { flags: 'a' } : { flags: 'w' });
  try {
    await new Promise((resolve, reject) => {
      response.data.on('error', reject);
      writer.on('error', reject);
      writer.on('finish', resolve);
      response.data.pipe(writer);
    });
  } finally {
    clearTimeout(stallTimer);
    writer.destroy();
  }

  // If the server told us the size, treat a short body as a failed attempt so
  // the retry loop resumes it instead of marking a truncated file complete.
  if (totalSize > 0 && downloaded < totalSize) {
    throw new Error(`Connection closed early (got ${downloaded} of ${totalSize} bytes)`);
  }

  return downloaded;
}

async function runDownload(download) {
  const db = getDb();

  db.prepare(`UPDATE downloads SET status = 'downloading', error = NULL, updated_at = unixepoch() WHERE id = ?`)
    .run(download.id);
  broadcast('update', { id: download.id, status: 'downloading' });

  const controller = new AbortController();
  active.set(download.id, controller);

  const filePath = path.join(download.save_path, download.filename);
  const tmpPath = partPath(download);

  try {
    fs.mkdirSync(download.save_path, { recursive: true });

    let downloaded;
    let attempt = 0;
    while (true) {
      try {
        downloaded = await attemptDownload(download, tmpPath, controller);
        break;
      } catch (err) {
        if (isCancelled(err)) throw err;
        attempt++;
        if (attempt >= MAX_ATTEMPTS) throw err;
        broadcast('update', {
          id: download.id,
          status: 'downloading',
          error: `${err.message} — retrying (${attempt}/${MAX_ATTEMPTS - 1})`,
        });
        await sleep(RETRY_BASE_DELAY_MS * attempt, controller.signal);
      }
    }

    fs.renameSync(tmpPath, filePath);

    db.prepare(`
      UPDATE downloads SET status = 'completed', progress = 100, downloaded = ?, speed = 0, error = NULL, updated_at = unixepoch() WHERE id = ?
    `).run(downloaded, download.id);
    broadcast('update', { id: download.id, status: 'completed', progress: 100, downloaded });

  } catch (err) {
    if (isCancelled(err)) {
      try { fs.unlinkSync(tmpPath); } catch {}
      db.prepare(`UPDATE downloads SET status = 'cancelled', speed = 0, updated_at = unixepoch() WHERE id = ?`).run(download.id);
      broadcast('update', { id: download.id, status: 'cancelled' });
    } else {
      // Keep the .part file so a retry resumes instead of starting over.
      db.prepare(`UPDATE downloads SET status = 'error', error = ?, speed = 0, updated_at = unixepoch() WHERE id = ?`)
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
