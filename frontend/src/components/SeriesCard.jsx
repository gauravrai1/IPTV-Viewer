import { Star, Heart } from 'lucide-react';
import { imgProxy } from '../utils.js';

export default function SeriesCard({ show, onClick, isWatchlisted, onToggleWatchlist }) {
  const rating = parseFloat(show.rating_5based || show.rating / 2 || 0).toFixed(1);
  const cover = imgProxy(show.cover || show.stream_icon || '');

  function handleHeart(e) {
    e.stopPropagation();
    onToggleWatchlist?.({
      type: 'series',
      content_id: show.series_id,
      name: show.name,
      cover: show.cover || show.stream_icon || '',
      meta: {
        series_id: show.series_id,
        rating_5based: show.rating_5based,
        rating: show.rating,
        cover: show.cover,
        youtube_trailer: show.youtube_trailer,
        genre: show.genre,
        plot: show.plot,
        category_ids: show.category_ids,
      },
    });
  }

  return (
    <div className="poster-card group" onClick={() => onClick(show)}>
      {cover ? (
        <img
          src={cover}
          alt={show.name}
          loading="lazy"
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full bg-surface-elevated flex items-center justify-center text-4xl">📺</div>
      )}

      <button
        onClick={handleHeart}
        className={`absolute top-2 right-2 p-1.5 rounded-full transition-all z-10 ${
          isWatchlisted
            ? 'bg-rose-600 text-white opacity-100'
            : 'bg-black/60 text-white opacity-0 group-hover:opacity-100'
        }`}
        title={isWatchlisted ? 'Remove from My List' : 'Add to My List'}
      >
        <Heart size={13} fill={isWatchlisted ? 'currentColor' : 'none'} />
      </button>

      <div className="card-overlay">
        {parseFloat(rating) > 0 && (
          <div className="flex items-center gap-1 text-yellow-400 text-xs mb-1">
            <Star size={11} fill="currentColor" />
            <span className="font-semibold">{rating}</span>
          </div>
        )}
        <p className="text-white text-xs font-medium leading-tight line-clamp-2">{show.name}</p>
      </div>
    </div>
  );
}
