import { useState, useEffect, useRef, useMemo } from 'react';
import {
  HardDrive, RefreshCw, Film, Tv, Heart, Database, CheckCircle2,
  AlertTriangle, XCircle, Search, Loader2,
} from 'lucide-react';
import { api } from '../api/client.js';

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

const PHASE_LABELS = {
  movies: 'Measuring movie file sizes',
  'series-info': 'Fetching series episode lists',
  episodes: 'Measuring episode file sizes',
};

function AccuracyBadge({ coverage }) {
  if (coverage >= 1) {
    return (
      <span className="badge bg-green-900/30 text-green-400 border border-green-500/20">
        <CheckCircle2 size={11} /> exact
      </span>
    );
  }
  return (
    <span className="badge bg-surface-elevated text-gray-400 border border-surface-border" title="Estimate extrapolated from sampled file sizes">
      ~ {Math.round(coverage * 100)}% sampled
    </span>
  );
}

function StatCard({ icon: Icon, label, value, sub, accent = 'text-indigo-400' }) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface-card p-4">
      <div className="flex items-center gap-2 text-xs text-gray-500 uppercase tracking-wide">
        <Icon size={14} className={accent} />
        {label}
      </div>
      <p className="text-2xl font-bold text-white mt-2">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

function FitRow({ label, icon: Icon, bytes, budget }) {
  const fits = budget > 0 && bytes <= budget;
  const pct = budget > 0 ? Math.min((bytes / budget) * 100, 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="flex items-center gap-2 text-gray-300">
          {Icon && <Icon size={14} className="text-gray-500" />}
          {label}
        </span>
        <span className="flex items-center gap-2">
          <span className="text-gray-400 text-xs">{formatBytes(bytes)}</span>
          {budget > 0 && (fits ? (
            <span className="badge bg-green-900/30 text-green-400">fits</span>
          ) : (
            <span className="badge bg-amber-900/30 text-amber-400">needs +{formatBytes(bytes - budget)}</span>
          ))}
        </span>
      </div>
      <div className="h-1.5 bg-surface-border rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${fits ? 'bg-green-500' : 'bg-amber-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function Storage({ job }) {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [budgetGb, setBudgetGb] = useState('');
  const prevRunning = useRef(false);

  async function load() {
    setLoading(true);
    try {
      setSummary(await api.storage.summary());
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // Refresh the numbers whenever an analysis run finishes
  useEffect(() => {
    if (prevRunning.current && job && !job.running) load();
    prevRunning.current = !!job?.running;
  }, [job]);

  const running = job?.running ?? summary?.job?.running ?? false;

  async function analyze(opts) {
    try { await api.storage.analyze(opts); } catch (e) { console.error(e); }
  }

  const freeSpace = useMemo(() => {
    const d = summary?.disk;
    if (!d) return 0;
    const m = d.movies || { free: 0, total: 0 };
    const s = d.shows || { free: 0, total: 0 };
    // Same free/total values almost certainly means both paths share one disk
    const sameDisk = m.total === s.total && m.free === s.free;
    return sameDisk ? m.free : m.free + s.free;
  }, [summary]);

  const budget = budgetGb !== '' && !Number.isNaN(parseFloat(budgetGb))
    ? parseFloat(budgetGb) * 1024 ** 3
    : freeSpace;

  if (loading && !summary) {
    return (
      <div className="text-center py-20 text-gray-500">
        <Loader2 size={32} className="animate-spin mx-auto mb-3" />
        <p>Crunching storage numbers…</p>
      </div>
    );
  }

  if (error && !summary) {
    return (
      <div className="text-center py-20 text-gray-500">
        <AlertTriangle size={32} className="mx-auto mb-3 text-amber-400" />
        <p className="text-red-400 text-sm mb-4">{error}</p>
        <button onClick={load} className="btn-primary">Retry</button>
      </div>
    );
  }

  const { movies, series, disk, downloadedBytes } = summary;
  const everything = movies.estTotalBytes + series.estTotalBytes;
  const myList = movies.watchlist.estBytes + series.watchlist.estBytes;
  const downloaded = (downloadedBytes?.movies || 0) + (downloadedBytes?.shows || 0);
  const nothingMeasured = movies.measuredItems === 0 && series.measuredEpisodes === 0;

  const maxMovieCat = Math.max(1, ...movies.categories.map((c) => c.estBytes));
  const maxSeriesCat = Math.max(1, ...series.categories.map((c) => c.estBytes));

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <HardDrive size={20} className="text-indigo-400" />
            Storage Analysis
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Estimates from sampled file sizes — use “Measure all” on a category for exact numbers
          </p>
        </div>
        <div className="flex gap-2">
          {running ? (
            <button onClick={() => api.storage.cancel().catch(console.error)} className="btn-ghost border border-surface-border flex items-center gap-2">
              <XCircle size={14} /> Cancel
            </button>
          ) : (
            <button onClick={() => analyze({ mode: 'sample' })} className="btn-primary flex items-center gap-2">
              <Search size={14} />
              {nothingMeasured ? 'Analyze library' : 'Refine estimates'}
            </button>
          )}
          <button onClick={load} disabled={loading} className="btn-ghost border border-surface-border p-2" title="Refresh">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Analysis progress */}
      {running && (
        <div className="rounded-xl border border-indigo-500/30 bg-indigo-900/10 p-4 mb-6">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-indigo-300 flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" />
              {PHASE_LABELS[job?.phase] || 'Analyzing…'}
            </span>
            <span className="text-gray-400 text-xs">
              {job?.done ?? 0} / {job?.total ?? '?'} checked{job?.failed > 0 ? ` · ${job.failed} unreachable` : ''}
            </span>
          </div>
          <div className="h-1.5 bg-surface-border rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-500"
              style={{ width: `${job?.total > 0 ? Math.min((job.done / job.total) * 100, 100) : 0}%` }}
            />
          </div>
        </div>
      )}

      {nothingMeasured && !running && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-900/10 p-4 mb-6 text-sm text-amber-300 flex items-center gap-3">
          <AlertTriangle size={18} className="flex-shrink-0" />
          <span>
            No file sizes measured yet, so totals below are unknown. Run <b>Analyze library</b> to sample
            file sizes from your provider (a quick pass takes a few minutes and doesn't download anything).
          </span>
        </div>
      )}

      {/* Overview cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard
          icon={Database}
          label="Entire library"
          value={formatBytes(everything)}
          sub={`${movies.totalItems.toLocaleString()} movies · ${series.totalSeries.toLocaleString()} shows (~${Math.round(series.episodesEst).toLocaleString()} episodes)`}
        />
        <StatCard
          icon={Heart}
          label="My List"
          value={formatBytes(myList)}
          sub={`${movies.watchlist.items} movies · ${series.watchlist.series} shows`}
          accent="text-rose-400"
        />
        <StatCard
          icon={HardDrive}
          label="Free disk space"
          value={formatBytes(freeSpace)}
          sub={disk?.movies?.total > 0 ? `of ${formatBytes(disk.movies.total)} total` : 'disk not reachable'}
          accent="text-green-400"
        />
        <StatCard
          icon={CheckCircle2}
          label="Already downloaded"
          value={formatBytes(downloaded)}
          sub={`${formatBytes(downloadedBytes?.movies || 0)} movies · ${formatBytes(downloadedBytes?.shows || 0)} shows`}
          accent="text-blue-400"
        />
      </div>

      {/* Planner */}
      <div className="rounded-xl border border-surface-border bg-surface-card p-4 mb-8">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wide">Will it fit?</h2>
          <label className="flex items-center gap-2 text-xs text-gray-400">
            Plan against
            <input
              type="number"
              min="0"
              placeholder={(freeSpace / 1024 ** 3).toFixed(0)}
              value={budgetGb}
              onChange={(e) => setBudgetGb(e.target.value)}
              className="input-field w-24 py-1 text-right"
            />
            GB
            {budgetGb !== '' && (
              <button onClick={() => setBudgetGb('')} className="text-indigo-400 hover:text-indigo-300">
                use free space
              </button>
            )}
          </label>
        </div>
        <div className="space-y-4">
          <FitRow label="My List only" icon={Heart} bytes={myList} budget={budget} />
          <FitRow label="All movies" icon={Film} bytes={movies.estTotalBytes} budget={budget} />
          <FitRow label="All shows (every season & episode)" icon={Tv} bytes={series.estTotalBytes} budget={budget} />
          <FitRow label="Everything" icon={Database} bytes={everything} budget={budget} />
        </div>
        {everything > 0 && budget > 0 && (
          <p className="text-xs text-gray-500 mt-4">
            {budget >= everything
              ? 'Your budget covers the entire library.'
              : `This budget covers about ${Math.round((budget / everything) * 100)}% of the entire library — the category tables below show where the space goes so you can pick what to keep.`}
          </p>
        )}
      </div>

      {/* Movies */}
      <CategorySection
        title="Movies"
        icon={Film}
        headline={`${formatBytes(movies.estTotalBytes)} · ${movies.totalItems.toLocaleString()} movies · avg ${formatBytes(movies.avgItemBytes)}/movie`}
        watchlistLine={`My List: ${formatBytes(movies.watchlist.estBytes)} (${movies.watchlist.items} movies)`}
        columns={['Category', 'Items', 'Avg / item', 'My List', 'Est. total', 'Accuracy', '']}
        rows={movies.categories.map((c) => ({
          key: `m-${c.id}`,
          name: c.name,
          cells: [
            c.items.toLocaleString(),
            formatBytes(c.avgBytes),
            c.likedItems > 0 ? `${formatBytes(c.likedEstBytes)} (${c.likedItems})` : '—',
            formatBytes(c.estBytes),
          ],
          coverage: c.coverage,
          barPct: (c.estBytes / maxMovieCat) * 100,
          onDeep: () => analyze({ mode: 'full', type: 'movie', category_id: c.id }),
          deepDone: c.coverage >= 1,
        }))}
        running={running}
      />

      {/* Shows */}
      <CategorySection
        title="TV Shows"
        icon={Tv}
        headline={`${formatBytes(series.estTotalBytes)} · ${series.totalSeries.toLocaleString()} shows · ~${Math.round(series.episodesEst).toLocaleString()} episodes · avg ${formatBytes(series.avgEpisodeBytes)}/episode`}
        watchlistLine={`My List: ${formatBytes(series.watchlist.estBytes)} (${series.watchlist.series} shows, all seasons & episodes)`}
        columns={['Category', 'Shows', 'Est. episodes', 'Avg / episode', 'My List', 'Est. total', 'Accuracy', '']}
        rows={series.categories.map((c) => ({
          key: `s-${c.id}`,
          name: c.name,
          cells: [
            c.series.toLocaleString(),
            Math.round(c.episodesEst).toLocaleString(),
            formatBytes(c.avgEpisodeBytes),
            c.likedSeries > 0 ? `${formatBytes(c.likedEstBytes)} (${c.likedSeries})` : '—',
            formatBytes(c.estBytes),
          ],
          coverage: c.coverage,
          barPct: (c.estBytes / maxSeriesCat) * 100,
          onDeep: () => analyze({ mode: 'full', type: 'series', category_id: c.id }),
          deepDone: c.coverage >= 1,
        }))}
        running={running}
      />
    </div>
  );
}

function CategorySection({ title, icon: Icon, headline, watchlistLine, columns, rows, running }) {
  return (
    <div className="mb-8">
      <div className="mb-3">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Icon size={18} className="text-indigo-400" />
          {title}
        </h2>
        <p className="text-sm text-gray-400 mt-0.5">{headline}</p>
        <p className="text-sm text-rose-400/90 mt-0.5 flex items-center gap-1.5">
          <Heart size={12} /> {watchlistLine}
        </p>
      </div>

      <div className="rounded-xl border border-surface-border overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="text-left text-xs text-gray-500 uppercase tracking-wide border-b border-surface-border bg-surface-card">
              {columns.map((c, i) => (
                <th key={i} className={`px-3 py-2 font-medium ${i > 0 ? 'text-right' : ''}`}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-surface-border/50 last:border-0 hover:bg-surface-elevated/50">
                <td className="px-3 py-2 min-w-[180px]">
                  <p className="text-gray-200 truncate max-w-[260px]" title={r.name}>{r.name}</p>
                  <div className="h-1 bg-surface-border rounded-full overflow-hidden mt-1.5 max-w-[260px]">
                    <div className="h-full bg-indigo-500/70 rounded-full" style={{ width: `${Math.max(r.barPct, 1)}%` }} />
                  </div>
                </td>
                {r.cells.map((cell, i) => (
                  <td key={i} className={`px-3 py-2 text-right text-gray-300 ${i === r.cells.length - 1 ? 'font-medium text-white' : ''}`}>
                    {cell}
                  </td>
                ))}
                <td className="px-3 py-2 text-right"><AccuracyBadge coverage={r.coverage} /></td>
                <td className="px-3 py-2 text-right">
                  {!r.deepDone && (
                    <button
                      onClick={r.onDeep}
                      disabled={running}
                      className="text-xs btn-ghost border border-surface-border py-1 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Measure every file in this category for exact numbers"
                    >
                      Measure all
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
