import { useState } from 'react';
import { X, Star, Download, Play, Calendar, Heart, Monitor, Volume2 } from 'lucide-react';
import DownloadConfirmModal from './DownloadConfirmModal.jsx';
import VideoPlayerModal from './VideoPlayerModal.jsx';
import { imgProxy } from '../utils.js';

function TechBadge({ label, value }) {
  if (!value) return null;
  return (
    <span className="badge bg-surface-elevated text-gray-400 font-mono">
      {label}: {value}
    </span>
  );
}

export default function ContentModal({ movie, info, settings, isWatchlisted, onToggleWatchlist, onClose }) {
  const [confirmItem, setConfirmItem] = useState(null);
  const [watching, setWatching] = useState(false);

  const trailer = info?.info?.youtube_trailer || movie.trailer;
  const overview = info?.info?.plot || info?.info?.description || '';
  const year = info?.info?.releasedate?.split('-')[0] || '';
  const cast = info?.info?.cast || '';
  const director = info?.info?.director || '';
  const genre = info?.info?.genre || '';
  const runtime = info?.info?.duration || '';
  const cover = imgProxy(movie.stream_icon || movie.cover || info?.info?.movie_image || '');
  const rating = parseFloat(movie.rating_5based || movie.rating / 2 || 0).toFixed(1);
  const ext = movie.container_extension || 'mkv';

  // Technical info from VOD info
  const videoInfo = info?.info?.video;
  const audioInfo = info?.info?.audio;
  const resolution = videoInfo ? `${videoInfo.width}×${videoInfo.height}` : null;
  const videoCodec = videoInfo?.codec_name?.toUpperCase();
  const audioCodec = audioInfo?.codec_name?.toUpperCase();
  const audioChannels = audioInfo?.channels ? (audioInfo.channels === 6 ? '5.1' : audioInfo.channels === 8 ? '7.1' : `${audioInfo.channels}ch`) : null;
  const audioLang = audioInfo?.language || audioInfo?.tags?.language;

  function queueDownload() {
    const name = movie.name;
    const sanitized = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\s+/g, ' ').trim();
    const moviesPath = settings?.movies_path || '/downloads/movies';
    setConfirmItem({ type: 'movie', stream_id: movie.stream_id, name, extension: ext, suggested_path: `${moviesPath}/${sanitized}`, filename: `${sanitized}.${ext}` });
  }

  function handleHeart() {
    onToggleWatchlist?.({
      type: 'movie', content_id: movie.stream_id, name: movie.name,
      cover: movie.stream_icon || movie.cover || '',
      meta: { stream_id: movie.stream_id, rating_5based: movie.rating_5based, rating: movie.rating, container_extension: ext, stream_icon: movie.stream_icon, trailer: movie.trailer },
    });
  }

  if (watching) {
    return <VideoPlayerModal title={movie.name} streamId={movie.stream_id} extension={ext} type="movie" onClose={() => setWatching(false)} />;
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
        <div className="relative bg-surface-card border border-surface-border rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl">
          <button onClick={onClose} className="absolute top-4 right-4 btn-ghost p-1 z-10 bg-surface-card rounded-full"><X size={18} /></button>

          <div className="flex flex-col md:flex-row">
            <div className="md:w-52 flex-shrink-0">
              {cover
                ? <img src={cover} alt={movie.name} className="w-full md:rounded-l-xl object-cover" style={{ maxHeight: '390px' }} />
                : <div className="w-full h-64 md:h-full bg-surface-elevated md:rounded-l-xl flex items-center justify-center text-5xl">🎬</div>
              }
            </div>

            <div className="flex-1 p-6">
              <div className="flex items-start justify-between gap-2 pr-8">
                <h2 className="text-xl font-bold text-white leading-tight">{movie.name}</h2>
                <button
                  onClick={handleHeart}
                  className={`flex-shrink-0 p-1.5 rounded-full transition-colors ${isWatchlisted ? 'text-rose-500' : 'text-gray-500 hover:text-rose-400'}`}
                  title={isWatchlisted ? 'Remove from My List' : 'Add to My List'}
                >
                  <Heart size={18} fill={isWatchlisted ? 'currentColor' : 'none'} />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 mt-2 mb-4">
                {parseFloat(rating) > 0 && <span className="badge bg-yellow-900/50 text-yellow-400"><Star size={11} fill="currentColor" />{rating}</span>}
                {year && <span className="badge bg-surface-elevated text-gray-300"><Calendar size={11} />{year}</span>}
                {runtime && <span className="badge bg-surface-elevated text-gray-300">{runtime}</span>}
                {genre && genre.split(',').slice(0, 3).map((g) => <span key={g} className="badge bg-indigo-900/40 text-indigo-300">{g.trim()}</span>)}
              </div>

              {overview && <p className="text-sm text-gray-300 leading-relaxed mb-4 line-clamp-5">{overview}</p>}
              {cast && <p className="text-xs text-gray-500 mb-1"><span className="text-gray-400 font-medium">Cast: </span>{cast.split(',').slice(0, 5).join(', ')}</p>}
              {director && <p className="text-xs text-gray-500 mb-3"><span className="text-gray-400 font-medium">Director: </span>{director}</p>}

              {/* Technical info */}
              {(resolution || videoCodec || audioCodec || audioLang) && (
                <div className="flex flex-wrap gap-1.5 mb-4">
                  <TechBadge label={<><Monitor size={10} className="inline mr-0.5" /></>} value={resolution} />
                  <TechBadge label="Video" value={videoCodec} />
                  <TechBadge label="Audio" value={audioCodec ? `${audioCodec}${audioChannels ? ' ' + audioChannels : ''}` : null} />
                  {audioLang && <span className="badge bg-surface-elevated text-gray-400"><Volume2 size={10} /> {audioLang.toUpperCase()}</span>}
                </div>
              )}

              <div className="flex flex-wrap gap-2 mt-2">
                <button onClick={() => setWatching(true)} className="btn-primary flex items-center gap-2">
                  <Play size={14} fill="currentColor" />Watch
                </button>
                <button onClick={queueDownload} className="btn-ghost flex items-center gap-2 border border-surface-border">
                  <Download size={14} />Download
                </button>
                {trailer && (
                  <a href={`https://www.youtube.com/watch?v=${trailer}`} target="_blank" rel="noopener noreferrer"
                    className="btn-ghost flex items-center gap-2 border border-surface-border text-red-400 hover:text-red-300">
                    <Play size={14} />Trailer
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {confirmItem && <DownloadConfirmModal item={confirmItem} onClose={() => setConfirmItem(null)} />}
    </>
  );
}
