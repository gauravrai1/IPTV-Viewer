import { useState, useMemo } from 'react';
import { Search, RefreshCw, AlertCircle } from 'lucide-react';
import { api } from '../api/client.js';
import MovieCard from '../components/MovieCard.jsx';
import ContentModal from '../components/ContentModal.jsx';

const PAGE_SIZE = 60;
const LS_CAT = 'movies_last_cat';
const LS_SORT = 'movies_last_sort';

export default function Movies({ movies = [], categories = [], settings, watchlistSet, onToggleWatchlist, onRefresh }) {
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState(() => localStorage.getItem(LS_CAT) || '');
  const [sort, setSort] = useState(() => localStorage.getItem(LS_SORT) || 'added_desc');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [selectedInfo, setSelectedInfo] = useState(null);

  function handleCatChange(v) { setCatFilter(v); localStorage.setItem(LS_CAT, v); setPage(1); }
  function handleSortChange(v) { setSort(v); localStorage.setItem(LS_SORT, v); setPage(1); }

  async function handleSync() {
    setSyncing(true);
    setSyncError('');
    try {
      await onRefresh();
    } catch (err) {
      setSyncError(err.message);
    } finally {
      setSyncing(false);
    }
  }

  async function handleSelect(movie) {
    setSelected(movie);
    setSelectedInfo(null);
    api.movies.get(movie.stream_id).then(setSelectedInfo).catch(() => {});
  }

  const filtered = useMemo(() => {
    let list = movies;
    if (search) { const q = search.toLowerCase(); list = list.filter((m) => m.name.toLowerCase().includes(q)); }
    if (catFilter) list = list.filter((m) => (m.category_ids || [m.category_id]).map(String).includes(catFilter));
    switch (sort) {
      case 'name_asc': return [...list].sort((a, b) => a.name.localeCompare(b.name));
      case 'name_desc': return [...list].sort((a, b) => b.name.localeCompare(a.name));
      case 'rating': return [...list].sort((a, b) => (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0));
      case 'added_asc': return [...list].sort((a, b) => parseInt(a.added || 0) - parseInt(b.added || 0));
      default: return [...list].sort((a, b) => parseInt(b.added || 0) - parseInt(a.added || 0));
    }
  }, [movies, search, catFilter, sort]);

  const paginated = useMemo(() => filtered.slice(0, page * PAGE_SIZE), [filtered, page]);

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            className="input-field w-full pl-9"
            placeholder="Search movies…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <select className="input-field" value={catFilter} onChange={(e) => handleCatChange(e.target.value)}>
            <option value="">All Categories</option>
            {categories.map((c) => <option key={c.category_id} value={c.category_id}>{c.category_name}</option>)}
          </select>
          <select className="input-field" value={sort} onChange={(e) => handleSortChange(e.target.value)}>
            <option value="added_desc">Newest First</option>
            <option value="added_asc">Oldest First</option>
            <option value="rating">Top Rated</option>
            <option value="name_asc">A → Z</option>
            <option value="name_desc">Z → A</option>
          </select>
          <button onClick={handleSync} disabled={syncing} className="btn-ghost border border-surface-border flex items-center gap-2">
            <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Sync</span>
          </button>
        </div>
      </div>

      <p className="text-sm text-gray-500 mb-4">
        {filtered.length.toLocaleString()} movies{search || catFilter ? ' (filtered)' : ''}
      </p>

      {syncError && (
        <div className="flex items-start gap-3 bg-red-900/20 border border-red-800 rounded-lg p-4 mb-6">
          <AlertCircle size={18} className="text-red-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-red-300 text-sm font-medium">Sync failed</p>
            <p className="text-red-400 text-xs mt-0.5">{syncError}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-3">
        {paginated.map((movie) => (
          <MovieCard
            key={movie.stream_id}
            movie={movie}
            onClick={handleSelect}
            isWatchlisted={watchlistSet?.has(`movie:${movie.stream_id}`)}
            onToggleWatchlist={onToggleWatchlist}
          />
        ))}
      </div>

      {paginated.length === 0 && (
        <div className="text-center py-20 text-gray-500">No movies found</div>
      )}

      {paginated.length < filtered.length && (
        <div className="flex justify-center mt-8">
          <button className="btn-ghost border border-surface-border px-6" onClick={() => setPage((p) => p + 1)}>
            Load more ({(filtered.length - paginated.length).toLocaleString()} remaining)
          </button>
        </div>
      )}

      {selected && (
        <ContentModal
          movie={selected}
          info={selectedInfo}
          settings={settings}
          isWatchlisted={watchlistSet?.has(`movie:${selected.stream_id}`)}
          onToggleWatchlist={onToggleWatchlist}
          onClose={() => { setSelected(null); setSelectedInfo(null); }}
        />
      )}
    </div>
  );
}
