import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { getDb, getSetting } from './db.js';
import { broadcast } from './events.js';
import * as xtream from './xtream.js';

// Xtream panels don't report file sizes in their listings, so sizes are
// measured with HEAD / 1-byte Range probes against the media URLs and cached
// in the media_sizes table. "sample" mode probes a subset per category and
// the summary extrapolates from averages; "full" mode measures every item.
const MOVIE_SAMPLE_PER_CATEGORY = 15;
const SERIES_INFO_SAMPLE_PER_CATEGORY = 8;
const EPISODE_SAMPLE_PER_CATEGORY = 12;
const PROBE_CONCURRENCY = 5;
const SERIES_INFO_CONCURRENCY = 2;
const PROBE_TIMEOUT_MS = 20000;

const state = {
  running: false,
  cancelled: false,
  mode: null,
  scope: null,
  phase: null,      // 'movies' | 'series-info' | 'episodes'
  done: 0,
  total: 0,
  failed: 0,
  error: null,
  startedAt: null,
  finishedAt: null,
};

export function getJobState() {
  const { cancelled, ...pub } = state;
  return pub;
}

export function cancelAnalysis() {
  if (state.running) state.cancelled = true;
}

function emit() {
  broadcast('storage', { job: getJobState() });
}

let lastEmit = 0;
function emitThrottled() {
  const now = Date.now();
  if (now - lastEmit >= 500) {
    lastEmit = now;
    emit();
  }
}

// ---------------------------------------------------------------------------
// Catalog access (cache-first, same tables the movies/series routes use)

async function loadMovies() {
  const db = getDb();
  const row = db.prepare('SELECT data FROM movies_cache WHERE id = 1').get();
  if (row) return JSON.parse(row.data);
  const movies = await xtream.getVodStreams();
  db.prepare('INSERT OR REPLACE INTO movies_cache (id, data, cached_at) VALUES (1, ?, unixepoch())')
    .run(JSON.stringify(movies));
  return movies;
}

async function loadSeries() {
  const db = getDb();
  const row = db.prepare('SELECT data FROM series_cache WHERE id = 1').get();
  if (row) return JSON.parse(row.data);
  const series = await xtream.getSeries();
  db.prepare('INSERT OR REPLACE INTO series_cache (id, data, cached_at) VALUES (1, ?, unixepoch())')
    .run(JSON.stringify(series));
  return series;
}

async function loadCategories(type) {
  const db = getDb();
  const row = db.prepare('SELECT data FROM categories_cache WHERE type = ?').get(type);
  if (row) {
    try { return JSON.parse(row.data); } catch { return []; }
  }
  try {
    const cats = type === 'vod' ? await xtream.getVodCategories() : await xtream.getSeriesCategories();
    db.prepare('INSERT OR REPLACE INTO categories_cache (type, data) VALUES (?, ?)').run(type, JSON.stringify(cats));
    return cats;
  } catch {
    return [];
  }
}

function getCachedSeriesInfoIds() {
  return new Set(getDb().prepare('SELECT series_id FROM series_info_cache').all().map((r) => r.series_id));
}

function getCachedSeriesInfo(seriesId) {
  const row = getDb().prepare('SELECT data FROM series_info_cache WHERE series_id = ?').get(seriesId);
  if (!row) return null;
  try { return JSON.parse(row.data); } catch { return null; }
}

async function fetchSeriesInfo(seriesId) {
  const info = await xtream.getSeriesInfo(seriesId);
  getDb().prepare('INSERT OR REPLACE INTO series_info_cache (series_id, data) VALUES (?, ?)')
    .run(seriesId, JSON.stringify(info));
  return info;
}

function episodesOf(info) {
  // info.episodes is usually {"1": [...], "2": [...]} keyed by season; some
  // panels return an array of season arrays instead.
  const eps = info?.episodes;
  if (!eps) return [];
  const seasons = Array.isArray(eps) ? eps : Object.values(eps);
  return seasons.flat().filter(Boolean);
}

// ---------------------------------------------------------------------------
// Size probing

async function probeSize(url) {
  try {
    const r = await axios.head(url, { timeout: PROBE_TIMEOUT_MS, validateStatus: (s) => s < 400 });
    const len = parseInt(r.headers['content-length'] || '0', 10);
    if (len > 0) return len;
  } catch {}
  // Some servers reject HEAD — fall back to a 1-byte ranged GET.
  try {
    const r = await axios.get(url, {
      timeout: PROBE_TIMEOUT_MS,
      headers: { Range: 'bytes=0-0' },
      responseType: 'stream',
      validateStatus: (s) => s === 206 || s === 200,
    });
    r.data.destroy();
    if (r.status === 206) {
      const m = /\/(\d+)\s*$/.exec(r.headers['content-range'] || '');
      if (m) return parseInt(m[1], 10);
    }
    return parseInt(r.headers['content-length'] || '0', 10);
  } catch {}
  return 0;
}

function saveSize(kind, itemId, parentId, size) {
  getDb().prepare(`
    INSERT OR REPLACE INTO media_sizes (kind, item_id, parent_id, size, checked_at)
    VALUES (?, ?, ?, ?, unixepoch())
  `).run(kind, itemId, parentId, size);
}

async function runPool(items, concurrency, worker) {
  let idx = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (idx < items.length && !state.cancelled) {
      const item = items[idx++];
      try {
        await worker(item);
      } catch {
        state.failed++;
      }
      state.done++;
      emitThrottled();
    }
  });
  await Promise.all(runners);
}

// ---------------------------------------------------------------------------
// Analysis job

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function measuredIds(kind) {
  return new Set(getDb().prepare('SELECT item_id FROM media_sizes WHERE kind = ? AND size > 0').all(kind)
    .map((r) => r.item_id));
}

export async function startAnalysis({ mode = 'sample', type = null, categoryId = null } = {}) {
  if (state.running) throw new Error('An analysis is already running');

  Object.assign(state, {
    running: true, cancelled: false, mode, phase: null,
    scope: { type, categoryId }, done: 0, total: 0, failed: 0,
    error: null, startedAt: Date.now(), finishedAt: null,
  });
  emit();

  // Fire and forget — progress goes out over SSE.
  runAnalysis({ mode, type, categoryId })
    .catch((err) => { state.error = err.message; })
    .finally(() => {
      state.running = false;
      state.finishedAt = Date.now();
      emit();
    });

  return getJobState();
}

async function runAnalysis({ mode, type, categoryId }) {
  const catFilter = (item) => categoryId == null || String(item.category_id) === String(categoryId);

  // ---- Movies ----
  if (type !== 'series') {
    state.phase = 'movies';
    const movies = (await loadMovies()).filter(catFilter);
    const known = measuredIds('movie');
    let targets = movies.filter((m) => !known.has(Number(m.stream_id)));

    if (mode === 'sample') {
      const byCat = new Map();
      for (const m of targets) {
        const key = String(m.category_id ?? '?');
        if (!byCat.has(key)) byCat.set(key, []);
        byCat.get(key).push(m);
      }
      targets = [];
      const measuredPerCat = new Map();
      for (const m of movies) {
        if (known.has(Number(m.stream_id))) {
          const key = String(m.category_id ?? '?');
          measuredPerCat.set(key, (measuredPerCat.get(key) || 0) + 1);
        }
      }
      for (const [key, list] of byCat) {
        const want = Math.max(0, MOVIE_SAMPLE_PER_CATEGORY - (measuredPerCat.get(key) || 0));
        targets.push(...shuffle(list).slice(0, want));
      }
    }

    state.total += targets.length;
    emit();

    await runPool(targets, PROBE_CONCURRENCY, async (m) => {
      const ext = m.container_extension || 'mkv';
      const size = await probeSize(xtream.buildMovieUrl(m.stream_id, ext));
      if (size > 0) saveSize('movie', Number(m.stream_id), null, size);
      else state.failed++;
    });
  }

  if (state.cancelled || type === 'movie') return;

  // ---- Series info (episode counts come from get_series_info) ----
  state.phase = 'series-info';
  const series = (await loadSeries()).filter(catFilter);
  const cachedInfo = getCachedSeriesInfoIds();
  let infoTargets = series.filter((s) => !cachedInfo.has(Number(s.series_id)));

  if (mode === 'sample') {
    const byCat = new Map();
    for (const s of infoTargets) {
      const key = String(s.category_id ?? '?');
      if (!byCat.has(key)) byCat.set(key, []);
      byCat.get(key).push(s);
    }
    const cachedPerCat = new Map();
    for (const s of series) {
      if (cachedInfo.has(Number(s.series_id))) {
        const key = String(s.category_id ?? '?');
        cachedPerCat.set(key, (cachedPerCat.get(key) || 0) + 1);
      }
    }
    infoTargets = [];
    for (const [key, list] of byCat) {
      const want = Math.max(0, SERIES_INFO_SAMPLE_PER_CATEGORY - (cachedPerCat.get(key) || 0));
      infoTargets.push(...shuffle(list).slice(0, want));
    }
  }

  state.total += infoTargets.length;
  emit();

  await runPool(infoTargets, SERIES_INFO_CONCURRENCY, async (s) => {
    await fetchSeriesInfo(Number(s.series_id));
  });

  if (state.cancelled) return;

  // ---- Episodes ----
  state.phase = 'episodes';
  const knownEps = measuredIds('episode');
  const epTargetsByCat = new Map();
  const measuredEpsPerCat = new Map();

  for (const s of series) {
    const sid = Number(s.series_id);
    const info = getCachedSeriesInfo(sid);
    if (!info) continue;
    const key = String(s.category_id ?? '?');
    for (const ep of episodesOf(info)) {
      const epId = Number(ep.id);
      if (!epId) continue;

      // Some panels report the file size directly in episode info — harvest
      // it for free instead of probing.
      const freeSize = parseInt(ep?.info?.size ?? ep?.size ?? 0, 10);
      if (!knownEps.has(epId) && freeSize > 0) {
        saveSize('episode', epId, sid, freeSize);
        knownEps.add(epId);
      }

      if (knownEps.has(epId)) {
        measuredEpsPerCat.set(key, (measuredEpsPerCat.get(key) || 0) + 1);
      } else {
        if (!epTargetsByCat.has(key)) epTargetsByCat.set(key, []);
        epTargetsByCat.get(key).push({ ep, sid });
      }
    }
  }

  let epTargets = [];
  if (mode === 'sample') {
    for (const [key, list] of epTargetsByCat) {
      const want = Math.max(0, EPISODE_SAMPLE_PER_CATEGORY - (measuredEpsPerCat.get(key) || 0));
      epTargets.push(...shuffle(list).slice(0, want));
    }
  } else {
    epTargets = [...epTargetsByCat.values()].flat();
  }

  state.total += epTargets.length;
  emit();

  await runPool(epTargets, PROBE_CONCURRENCY, async ({ ep, sid }) => {
    const ext = ep.container_extension || 'mkv';
    const size = await probeSize(xtream.buildEpisodeUrl(ep.id, ext));
    if (size > 0) saveSize('episode', Number(ep.id), sid, size);
    else state.failed++;
  });
}

// ---------------------------------------------------------------------------
// Summary

function diskInfo(dirPath) {
  if (!dirPath) return null;
  try {
    const s = fs.statfsSync(dirPath);
    return { path: dirPath, total: s.blocks * s.bsize, free: s.bavail * s.bsize };
  } catch {
    return { path: dirPath, total: 0, free: 0 };
  }
}

function dirSize(dir) {
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile()) {
        try { total += fs.statSync(p).size; } catch {}
      }
    }
  }
  return total;
}

function avg(sum, count) {
  return count > 0 ? sum / count : 0;
}

export async function buildSummary() {
  const db = getDb();
  const movies = await loadMovies();
  const series = await loadSeries();
  const movieCats = await loadCategories('vod');
  const seriesCats = await loadCategories('series');

  const watchlist = db.prepare('SELECT type, content_id FROM watchlist').all();
  const likedMovies = new Set(watchlist.filter((w) => w.type === 'movie').map((w) => Number(w.content_id)));
  const likedSeries = new Set(watchlist.filter((w) => w.type === 'series').map((w) => Number(w.content_id)));

  const movieSizes = new Map(
    db.prepare("SELECT item_id, size FROM media_sizes WHERE kind = 'movie' AND size > 0").all()
      .map((r) => [r.item_id, r.size]),
  );
  const epSizeRows = db.prepare("SELECT item_id, parent_id, size FROM media_sizes WHERE kind = 'episode' AND size > 0").all();

  const catName = (cats, id) => cats.find((c) => String(c.category_id) === String(id))?.category_name
    || (id == null ? 'Uncategorized' : `Category ${id}`);

  // ---- Movies ----
  const movieCatMap = new Map();
  let mMeasuredBytes = 0;
  let mMeasuredCount = 0;
  for (const m of movies) {
    const key = String(m.category_id ?? '?');
    if (!movieCatMap.has(key)) {
      movieCatMap.set(key, {
        id: m.category_id ?? null, name: catName(movieCats, m.category_id),
        items: 0, measured: 0, measuredBytes: 0,
        likedItems: 0, likedMeasured: 0, likedMeasuredBytes: 0,
      });
    }
    const c = movieCatMap.get(key);
    c.items++;
    const size = movieSizes.get(Number(m.stream_id));
    const liked = likedMovies.has(Number(m.stream_id));
    if (liked) c.likedItems++;
    if (size) {
      c.measured++;
      c.measuredBytes += size;
      mMeasuredBytes += size;
      mMeasuredCount++;
      if (liked) { c.likedMeasured++; c.likedMeasuredBytes += size; }
    }
  }

  const globalMovieAvg = avg(mMeasuredBytes, mMeasuredCount);
  const movieCategories = [...movieCatMap.values()].map((c) => {
    const catAvg = c.measured > 0 ? c.measuredBytes / c.measured : globalMovieAvg;
    return {
      ...c,
      avgBytes: catAvg,
      estBytes: c.measuredBytes + (c.items - c.measured) * catAvg,
      likedEstBytes: c.likedMeasuredBytes + (c.likedItems - c.likedMeasured) * catAvg,
      coverage: c.items > 0 ? c.measured / c.items : 0,
    };
  }).sort((a, b) => b.estBytes - a.estBytes);

  // ---- Series ----
  // Map measured episodes to their series for per-category and per-series math.
  const epsBySeries = new Map();
  for (const r of epSizeRows) {
    if (!epsBySeries.has(r.parent_id)) epsBySeries.set(r.parent_id, { count: 0, bytes: 0 });
    const e = epsBySeries.get(r.parent_id);
    e.count++;
    e.bytes += r.size;
  }

  const cachedInfoIds = getCachedSeriesInfoIds();
  const epCountBySeries = new Map();
  for (const s of series) {
    const sid = Number(s.series_id);
    if (!cachedInfoIds.has(sid)) continue;
    const info = getCachedSeriesInfo(sid);
    if (info) epCountBySeries.set(sid, episodesOf(info).length);
  }

  let sMeasuredBytes = 0;
  let sMeasuredCount = 0;
  for (const e of epsBySeries.values()) { sMeasuredBytes += e.bytes; sMeasuredCount += e.count; }
  const globalEpAvg = avg(sMeasuredBytes, sMeasuredCount);

  let knownEpCountsSum = 0;
  let knownEpCountsSeries = 0;
  for (const n of epCountBySeries.values()) { knownEpCountsSum += n; knownEpCountsSeries++; }
  const globalAvgEpisodes = avg(knownEpCountsSum, knownEpCountsSeries);

  const seriesCatMap = new Map();
  for (const s of series) {
    const key = String(s.category_id ?? '?');
    if (!seriesCatMap.has(key)) {
      seriesCatMap.set(key, {
        id: s.category_id ?? null, name: catName(seriesCats, s.category_id),
        series: 0, seriesWithInfo: 0, knownEpisodes: 0,
        measuredEpisodes: 0, measuredBytes: 0,
        likedSeries: 0, likedKnownSeries: 0, likedKnownEpisodes: 0, likedMeasuredBytes: 0, likedMeasuredEpisodes: 0,
      });
    }
    const c = seriesCatMap.get(key);
    const sid = Number(s.series_id);
    c.series++;
    const liked = likedSeries.has(sid);
    if (liked) c.likedSeries++;
    if (epCountBySeries.has(sid)) {
      c.seriesWithInfo++;
      c.knownEpisodes += epCountBySeries.get(sid);
      if (liked) { c.likedKnownSeries++; c.likedKnownEpisodes += epCountBySeries.get(sid); }
    }
    const measured = epsBySeries.get(sid);
    if (measured) {
      c.measuredEpisodes += measured.count;
      c.measuredBytes += measured.bytes;
      if (liked) { c.likedMeasuredEpisodes += measured.count; c.likedMeasuredBytes += measured.bytes; }
    }
  }

  const seriesCategories = [...seriesCatMap.values()].map((c) => {
    const catAvgEpisodes = c.seriesWithInfo > 0 ? c.knownEpisodes / c.seriesWithInfo : globalAvgEpisodes;
    const catEpAvg = c.measuredEpisodes > 0 ? c.measuredBytes / c.measuredEpisodes : globalEpAvg;
    const episodesEst = c.knownEpisodes + (c.series - c.seriesWithInfo) * catAvgEpisodes;
    const likedEpisodesEst = c.likedKnownEpisodes + (c.likedSeries - c.likedKnownSeries) * catAvgEpisodes;
    return {
      ...c,
      avgEpisodesPerSeries: catAvgEpisodes,
      avgEpisodeBytes: catEpAvg,
      episodesEst,
      estBytes: c.measuredBytes + Math.max(0, episodesEst - c.measuredEpisodes) * catEpAvg,
      likedEpisodesEst,
      likedEstBytes: c.likedMeasuredBytes + Math.max(0, likedEpisodesEst - c.likedMeasuredEpisodes) * catEpAvg,
      coverage: c.series > 0 ? c.seriesWithInfo / c.series : 0,
    };
  }).sort((a, b) => b.estBytes - a.estBytes);

  const sum = (arr, f) => arr.reduce((t, x) => t + f(x), 0);

  const moviesPath = getSetting('movies_path');
  const showsPath = getSetting('shows_path');

  return {
    generatedAt: Date.now(),
    job: getJobState(),
    disk: { movies: diskInfo(moviesPath), shows: diskInfo(showsPath) },
    downloadedBytes: {
      movies: moviesPath ? dirSize(moviesPath) : 0,
      shows: showsPath ? dirSize(showsPath) : 0,
    },
    movies: {
      totalItems: movies.length,
      measuredItems: mMeasuredCount,
      avgItemBytes: globalMovieAvg,
      estTotalBytes: sum(movieCategories, (c) => c.estBytes),
      watchlist: {
        items: likedMovies.size,
        estBytes: sum(movieCategories, (c) => c.likedEstBytes),
      },
      categories: movieCategories,
    },
    series: {
      totalSeries: series.length,
      seriesWithInfo: knownEpCountsSeries,
      measuredEpisodes: sMeasuredCount,
      avgEpisodeBytes: globalEpAvg,
      avgEpisodesPerSeries: globalAvgEpisodes,
      episodesEst: sum(seriesCategories, (c) => c.episodesEst),
      estTotalBytes: sum(seriesCategories, (c) => c.estBytes),
      watchlist: {
        series: likedSeries.size,
        estBytes: sum(seriesCategories, (c) => c.likedEstBytes),
      },
      categories: seriesCategories,
    },
  };
}
