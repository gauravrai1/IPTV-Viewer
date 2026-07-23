import { useState } from 'react';
import { Heart, Film, Tv } from 'lucide-react';
import { imgProxy } from '../utils.js';
import { api } from '../api/client.js';
import ContentModal from '../components/ContentModal.jsx';
import SeriesModal from '../components/SeriesModal.jsx';

export default function Watchlist({ watchlist, watchlistSet, onToggleWatchlist, settings }) {
  const [filter, setFilter] = useState('all');
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [selectedMovieInfo, setSelectedMovieInfo] = useState(null);
  const [selectedShow, setSelectedShow] = useState(null);

  const filtered = watchlist.filter((w) => filter === 'all' || w.type === filter);

  function openItem(item) {
    if (item.type === 'movie') {
      const m = { ...item.meta, name: item.name, stream_icon: item.cover };
      setSelectedMovie(m);
      setSelectedMovieInfo(null);
      api.movies.get(item.content_id).then(setSelectedMovieInfo).catch(() => {});
    } else {
      const s = { ...item.meta, name: item.name, cover: item.cover };
      setSelectedShow(s);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Heart size={20} className="text-rose-500" fill="currentColor" />
            My List
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{watchlist.length} saved</p>
        </div>
        <div className="flex gap-1">
          {['all', 'movie', 'series'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                filter === f ? 'bg-indigo-600 text-white' : 'btn-ghost border border-surface-border'
              }`}
            >
              {f === 'all' ? 'All' : f === 'movie' ? 'Movies' : 'TV Shows'}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-24 text-gray-500">
          <Heart size={40} className="mx-auto mb-3 text-gray-700" />
          <p className="font-medium">
            {watchlist.length === 0 ? 'Your list is empty' : 'No items match this filter'}
          </p>
          <p className="text-sm mt-1">Click the heart icon on any movie or TV show to save it here.</p>
        </div>
      )}

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-3">
        {filtered.map((item) => {
          const cover = imgProxy(item.cover);
          const rating = parseFloat(item.meta?.rating_5based || item.meta?.rating / 2 || 0).toFixed(1);
          return (
            <div
              key={item.id}
              className="poster-card group cursor-pointer"
              onClick={() => openItem(item)}
            >
              {cover ? (
                <img src={cover} alt={item.name} loading="lazy" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-surface-elevated flex items-center justify-center text-4xl">
                  {item.type === 'movie' ? '🎬' : '📺'}
                </div>
              )}

              {/* Remove heart */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleWatchlist({ type: item.type, content_id: item.content_id, name: item.name, cover: item.cover, meta: item.meta });
                }}
                className="absolute top-2 right-2 p-1.5 rounded-full bg-rose-600 text-white opacity-0 group-hover:opacity-100 transition-opacity z-10"
                title="Remove from My List"
              >
                <Heart size={13} fill="currentColor" />
              </button>

              <div className="card-overlay">
                <div className="flex items-center gap-1 mb-1">
                  {item.type === 'series'
                    ? <Tv size={10} className="text-indigo-400" />
                    : <Film size={10} className="text-indigo-400" />}
                  {parseFloat(rating) > 0 && (
                    <span className="text-yellow-400 text-xs font-semibold">{rating}</span>
                  )}
                </div>
                <p className="text-white text-xs font-medium leading-tight line-clamp-2">{item.name}</p>
              </div>
            </div>
          );
        })}
      </div>

      {selectedMovie && (
        <ContentModal
          movie={selectedMovie}
          info={selectedMovieInfo}
          settings={settings}
          isWatchlisted={watchlistSet?.has(`movie:${selectedMovie.stream_id}`)}
          onToggleWatchlist={onToggleWatchlist}
          onClose={() => { setSelectedMovie(null); setSelectedMovieInfo(null); }}
        />
      )}
      {selectedShow && (
        <SeriesModal
          show={selectedShow}
          settings={settings}
          isWatchlisted={watchlistSet?.has(`series:${selectedShow.series_id}`)}
          onToggleWatchlist={onToggleWatchlist}
          onClose={() => setSelectedShow(null)}
        />
      )}
    </div>
  );
}
