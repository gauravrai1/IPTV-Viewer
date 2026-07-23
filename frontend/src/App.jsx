import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Navbar from './components/Navbar.jsx';
import Movies from './pages/Movies.jsx';
import TVShows from './pages/TVShows.jsx';
import Downloads from './pages/Downloads.jsx';
import Watchlist from './pages/Watchlist.jsx';
import InitLoader from './components/InitLoader.jsx';
import { api } from './api/client.js';

const IDLE = { status: 'idle', count: 0, fromCache: false, error: null };

function makeItems() {
  return { movies: { ...IDLE }, series: { ...IDLE }, movieCats: { ...IDLE }, seriesCats: { ...IDLE } };
}

export default function App() {
  const [initItems, setInitItems] = useState(makeItems);
  const [initialized, setInitialized] = useState(false);
  const [downloads, setDownloads] = useState([]);
  const [settings, setSettings] = useState(null);
  const [watchlist, setWatchlist] = useState([]);

  // Core data — managed here so pages never re-fetch on navigation
  const [movies, setMovies] = useState([]);
  const [series, setSeries] = useState([]);
  const [movieCats, setMovieCats] = useState([]);
  const [seriesCats, setSeriesCats] = useState([]);

  const loadingRef = useRef(false);

  const patch = useCallback((key, update) => {
    setInitItems(prev => ({ ...prev, [key]: { ...prev[key], ...update } }));
  }, []);

  const loadAll = useCallback(async (keys = ['movies', 'series', 'movieCats', 'seriesCats']) => {
    if (loadingRef.current) return;
    loadingRef.current = true;

    // Pre-check what's already cached so we can show "from cache" vs "fetching live"
    const statusData = await api.status.get().catch(() => null);

    const tasks = [];

    if (keys.includes('movies')) {
      patch('movies', { status: 'loading', fromCache: statusData?.movies?.cached ?? false });
      tasks.push(
        api.movies.list()
          .then(({ data }) => {
            setMovies(data);
            patch('movies', { status: 'done', count: data.length, fromCache: statusData?.movies?.cached ?? true });
          })
          .catch(e => patch('movies', { status: 'error', error: e.message }))
      );
    }

    if (keys.includes('series')) {
      patch('series', { status: 'loading', fromCache: statusData?.series?.cached ?? false });
      tasks.push(
        api.series.list()
          .then(({ data }) => {
            setSeries(data);
            patch('series', { status: 'done', count: data.length, fromCache: statusData?.series?.cached ?? true });
          })
          .catch(e => patch('series', { status: 'error', error: e.message }))
      );
    }

    if (keys.includes('movieCats')) {
      patch('movieCats', { status: 'loading', fromCache: statusData?.movieCats?.cached ?? false });
      tasks.push(
        api.movies.categories()
          .then(data => {
            setMovieCats(data);
            patch('movieCats', { status: 'done', count: data.length });
          })
          .catch(e => patch('movieCats', { status: 'error', error: e.message }))
      );
    }

    if (keys.includes('seriesCats')) {
      patch('seriesCats', { status: 'loading', fromCache: statusData?.seriesCats?.cached ?? false });
      tasks.push(
        api.series.categories()
          .then(data => {
            setSeriesCats(data);
            patch('seriesCats', { status: 'done', count: data.length });
          })
          .catch(e => patch('seriesCats', { status: 'error', error: e.message }))
      );
    }

    await Promise.allSettled(tasks);
    loadingRef.current = false;
  }, [patch]);

  // Initial boot
  useEffect(() => {
    api.settings.get().then(setSettings).catch(() => {});
    api.watchlist.list().then(setWatchlist).catch(() => {});
    loadAll();
  }, [loadAll]);

  // Auto-advance once everything is done/error
  useEffect(() => {
    const vals = Object.values(initItems);
    const allFinished = vals.every(v => v.status === 'done' || v.status === 'error');
    if (allFinished && !initialized) {
      // Small delay so "Ready!" flash is visible
      const t = setTimeout(() => setInitialized(true), 600);
      return () => clearTimeout(t);
    }
  }, [initItems, initialized]);

  function handleRetry() {
    const failedKeys = Object.entries(initItems)
      .filter(([, v]) => v.status === 'error')
      .map(([k]) => k);
    setInitItems(prev => {
      const next = { ...prev };
      failedKeys.forEach(k => { next[k] = { ...IDLE }; });
      return next;
    });
    loadingRef.current = false; // allow retry to proceed
    loadAll(failedKeys);
  }

  // Watchlist helpers
  const watchlistSet = useMemo(
    () => new Set(watchlist.map(w => `${w.type}:${w.content_id}`)),
    [watchlist],
  );

  const toggleWatchlist = useCallback(async (item) => {
    const key = `${item.type}:${item.content_id}`;
    if (watchlistSet.has(key)) {
      await api.watchlist.remove(item.type, item.content_id).catch(console.error);
      setWatchlist(prev => prev.filter(w => !(w.type === item.type && w.content_id === item.content_id)));
    } else {
      const added = await api.watchlist.add(item).catch(console.error);
      if (added) setWatchlist(prev => [{ ...added, meta: item.meta }, ...prev]);
    }
  }, [watchlistSet]);

  // Refresh helpers passed to pages
  const refreshMovies = useCallback(async () => {
    await api.movies.refresh();
    const { data } = await api.movies.list();
    setMovies(data);
    const cats = await api.movies.categories().catch(() => movieCats);
    setMovieCats(cats);
  }, [movieCats]);

  const refreshSeries = useCallback(async () => {
    await api.series.refresh();
    const { data } = await api.series.list();
    setSeries(data);
    const cats = await api.series.categories().catch(() => seriesCats);
    setSeriesCats(cats);
  }, [seriesCats]);

  const refreshSettings = useCallback(() => {
    api.settings.get().then(setSettings).catch(console.error);
  }, []);

  // SSE for download progress
  useEffect(() => {
    const es = new EventSource('/api/downloads/events');
    es.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.event === 'init') { setDownloads(msg.downloads); return; }
      if (msg.event === 'added') { setDownloads(p => [msg, ...p.filter(d => d.id !== msg.id)]); return; }
      if (msg.event === 'removed') { setDownloads(p => p.filter(d => d.id !== msg.id)); return; }
      if (msg.event === 'cleared') { setDownloads(p => p.filter(d => ['queued','downloading'].includes(d.status))); return; }
      if (msg.event === 'update' || msg.event === 'progress') {
        setDownloads(p => p.map(d => d.id === msg.id ? { ...d, ...msg } : d));
      }
    };
    return () => es.close();
  }, []);

  const activeCount = downloads.filter(d => ['queued','downloading'].includes(d.status)).length;

  // Show loader until initialized
  if (!initialized) {
    return (
      <InitLoader
        items={initItems}
        onRetry={handleRetry}
        onContinue={() => setInitialized(true)}
      />
    );
  }

  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col">
        <Navbar
          activeDownloads={activeCount}
          watchlistCount={watchlist.length}
          settings={settings}
          onSettingsSaved={refreshSettings}
        />
        <main className="flex-1 container mx-auto px-4 py-6 max-w-screen-2xl">
          <Routes>
            <Route path="/" element={<Navigate to="/movies" replace />} />
            <Route path="/movies" element={
              <Movies
                movies={movies}
                categories={movieCats}
                settings={settings}
                watchlistSet={watchlistSet}
                onToggleWatchlist={toggleWatchlist}
                onRefresh={refreshMovies}
              />
            } />
            <Route path="/shows" element={
              <TVShows
                shows={series}
                categories={seriesCats}
                settings={settings}
                watchlistSet={watchlistSet}
                onToggleWatchlist={toggleWatchlist}
                onRefresh={refreshSeries}
              />
            } />
            <Route path="/watchlist" element={
              <Watchlist
                watchlist={watchlist}
                watchlistSet={watchlistSet}
                onToggleWatchlist={toggleWatchlist}
                settings={settings}
              />
            } />
            <Route path="/downloads" element={<Downloads downloads={downloads} />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
