import { Star, Heart } from 'lucide-react';
import { imgProxy } from '../utils.js';

export default function MovieCard({ movie, onClick, isWatchlisted, onToggleWatchlist }) {
  const rating = parseFloat(movie.rating_5based || movie.rating / 2 || 0).toFixed(1);
  const icon = imgProxy(movie.stream_icon || movie.cover || '');

  function handleHeart(e) {
    e.stopPropagation();
    onToggleWatchlist?.({
      type: 'movie',
      content_id: movie.stream_id,
      name: movie.name,
      cover: movie.stream_icon || movie.cover || '',
      meta: {
        stream_id: movie.stream_id,
        rating_5based: movie.rating_5based,
        rating: movie.rating,
        container_extension: movie.container_extension,
        stream_icon: movie.stream_icon,
        trailer: movie.trailer,
        category_ids: movie.category_ids,
      },
    });
  }

  return (
    <div className="poster-card group" onClick={() => onClick(movie)}>
      {icon ? (
        <img
          src={icon}
          alt={movie.name}
          loading="lazy"
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full bg-surface-elevated flex items-center justify-center text-4xl">🎬</div>
      )}

      {/* Heart button — always visible when watchlisted, else on hover */}
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
        <p className="text-white text-xs font-medium leading-tight line-clamp-2">{movie.name}</p>
      </div>
    </div>
  );
}
