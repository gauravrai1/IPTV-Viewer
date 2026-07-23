import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_DIR = process.env.DB_PATH || path.join(__dirname, '../../data');
const DB_FILE = path.join(DB_DIR, 'iptv.db');

let _db;

export function getDb() {
  if (!_db) {
    fs.mkdirSync(DB_DIR, { recursive: true });
    _db = new Database(DB_FILE);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    migrate(_db);
  }
  return _db;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS movies_cache (
      id INTEGER PRIMARY KEY,
      data TEXT NOT NULL,
      cached_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS series_cache (
      id INTEGER PRIMARY KEY,
      data TEXT NOT NULL,
      cached_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS series_info_cache (
      series_id INTEGER PRIMARY KEY,
      data TEXT NOT NULL,
      cached_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS vod_info_cache (
      vod_id INTEGER PRIMARY KEY,
      data TEXT NOT NULL,
      cached_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS categories_cache (
      type TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      cached_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS downloads (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      stream_id INTEGER NOT NULL,
      series_name TEXT,
      season TEXT,
      episode TEXT,
      episode_title TEXT,
      extension TEXT NOT NULL DEFAULT 'mkv',
      save_path TEXT NOT NULL,
      filename TEXT NOT NULL,
      url TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      progress REAL NOT NULL DEFAULT 0,
      size INTEGER NOT NULL DEFAULT 0,
      downloaded INTEGER NOT NULL DEFAULT 0,
      speed REAL NOT NULL DEFAULT 0,
      error TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS watchlist (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('movie', 'series')),
      content_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      cover TEXT NOT NULL DEFAULT '',
      meta TEXT NOT NULL DEFAULT '{}',
      added_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(type, content_id)
    );
  `);

  const moviesPath = process.env.MOVIES_PATH || '/downloads/movies';
  const showsPath = process.env.SHOWS_PATH || '/downloads/shows';

  db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('movies_path', ?)`).run(moviesPath);
  db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('shows_path', ?)`).run(showsPath);
  db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('max_concurrent', '3')`).run();

  // Mark any interrupted downloads as error on startup
  db.prepare(`
    UPDATE downloads SET status = 'error', error = 'Interrupted by server restart'
    WHERE status = 'downloading'
  `).run();
}

export function getSetting(key) {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}
