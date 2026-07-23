import { useState, useEffect } from 'react';
import { X, Star, Download, Play, Calendar, ChevronDown, ChevronUp, Loader2, Heart } from 'lucide-react';
import { api } from '../api/client.js';
import DownloadConfirmModal from './DownloadConfirmModal.jsx';
import VideoPlayerModal from './VideoPlayerModal.jsx';
import { imgProxy } from '../utils.js';

function pad(n, w = 2) { return String(n).padStart(w, '0'); }

function sanitize(name = '') {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\s+/g, ' ').trim();
}

export default function SeriesModal({ show, settings, isWatchlisted, onToggleWatchlist, onClose }) {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeSeason, setActiveSeason] = useState(null);
  const [expandedEps, setExpandedEps] = useState({});
  const [confirmItem, setConfirmItem] = useState(null);
  const [watchItem, setWatchItem] = useState(null);

  useEffect(() => {
    api.series.get(show.series_id)
      .then((data) => {
        setInfo(data);
        // Default to first season
        const seasons = Object.keys(data.episodes || {}).sort((a, b) => parseInt(a) - parseInt(b));
        if (seasons.length > 0) setActiveSeason(seasons[0]);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [show.series_id]);

  const meta = info?.info || {};
  const cover = imgProxy(show.cover || meta.cover || '');
  const trailer = meta.youtube_trailer || show.youtube_trailer;
  const rating = parseFloat(show.rating_5based || show.rating / 2 || 0).toFixed(1);
  const seasons = Object.keys(info?.episodes || {}).sort((a, b) => parseInt(a) - parseInt(b));

  function buildEpItem(ep, seasonNum) {
    const ext = ep.container_extension || 'mkv';
    const showDir = sanitize(show.name);
    const showsPath = settings?.shows_path || '/downloads/shows';
    const seasonDir = `Season ${pad(parseInt(seasonNum))}`;
    return {
      type: 'episode',
      stream_id: ep.id,
      name: ep.title || `Episode ${ep.episode_num}`,
      extension: ext,
      series_name: show.name,
      season: seasonNum,
      episode: ep.episode_num,
      episode_title: ep.title,
      suggested_path: `${showsPath}/${showDir}/${seasonDir}`,
      filename: `${showDir} - S${pad(seasonNum)}E${pad(ep.episode_num)}${ep.title ? ` - ${sanitize(ep.title)}` : ''}.${ext}`,
    };
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
        <div className="relative bg-surface-card border border-surface-border rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">
          <button onClick={onClose} className="absolute top-4 right-4 btn-ghost p-1 z-10 bg-surface-card rounded-full">
            <X size={18} />
          </button>

          <div className="overflow-y-auto flex-1">
            {/* Header */}
            <div className="flex flex-col md:flex-row gap-0">
              <div className="md:w-48 flex-shrink-0">
                {cover ? (
                  <img src={cover} alt={show.name} className="w-full md:rounded-tl-xl object-cover" style={{ maxHeight: '320px' }} />
                ) : (
                  <div className="w-full h-64 bg-surface-elevated md:rounded-tl-xl flex items-center justify-center text-5xl">📺</div>
                )}
              </div>

              <div className="flex-1 p-6">
                <div className="flex items-start justify-between gap-2 pr-8">
                  <h2 className="text-xl font-bold text-white">{show.name}</h2>
                  <button
                    onClick={() => onToggleWatchlist?.({
                      type: 'series', content_id: show.series_id, name: show.name,
                      cover: show.cover || meta.cover || '',
                      meta: { series_id: show.series_id, rating_5based: show.rating_5based, rating: show.rating, cover: show.cover, youtube_trailer: show.youtube_trailer, genre: show.genre || meta.genre },
                    })}
                    className={`flex-shrink-0 p-1.5 rounded-full transition-colors ${isWatchlisted ? 'text-rose-500' : 'text-gray-500 hover:text-rose-400'}`}
                    title={isWatchlisted ? 'Remove from My List' : 'Add to My List'}
                  >
                    <Heart size={18} fill={isWatchlisted ? 'currentColor' : 'none'} />
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2 mt-2 mb-3">
                  {parseFloat(rating) > 0 && (
                    <span className="badge bg-yellow-900/50 text-yellow-400">
                      <Star size={11} fill="currentColor" />
                      {rating}
                    </span>
                  )}
                  {(meta.releaseDate || show.releaseDate) && (
                    <span className="badge bg-surface-elevated text-gray-300">
                      <Calendar size={11} />
                      {(meta.releaseDate || show.releaseDate).split('-')[0]}
                    </span>
                  )}
                  {(meta.genre || show.genre) && (meta.genre || show.genre).split(',').slice(0, 3).map((g) => (
                    <span key={g} className="badge bg-indigo-900/40 text-indigo-300">{g.trim()}</span>
                  ))}
                </div>

                {(meta.plot || show.plot) && (
                  <p className="text-sm text-gray-300 leading-relaxed line-clamp-4 mb-3">
                    {meta.plot || show.plot}
                  </p>
                )}
                {(meta.cast || show.cast) && (
                  <p className="text-xs text-gray-500 mb-1">
                    <span className="text-gray-400 font-medium">Cast: </span>
                    {(meta.cast || show.cast).split(',').slice(0, 5).join(', ')}
                  </p>
                )}

                {trailer && (
                  <a
                    href={`https://www.youtube.com/watch?v=${trailer}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-2 btn-ghost border border-surface-border"
                  >
                    <Play size={13} fill="currentColor" />
                    Trailer
                  </a>
                )}
              </div>
            </div>

            {/* Episodes */}
            <div className="px-6 pb-6">
              {loading && (
                <div className="flex items-center justify-center py-10 text-gray-500">
                  <Loader2 size={24} className="animate-spin mr-2" />
                  Loading episodes…
                </div>
              )}
              {error && <p className="text-red-400 text-sm py-4">{error}</p>}

              {!loading && !error && seasons.length > 0 && (
                <>
                  {/* Season tabs */}
                  <div className="flex flex-wrap gap-2 mb-4 border-b border-surface-border pb-4">
                    {seasons.map((s) => (
                      <button
                        key={s}
                        onClick={() => setActiveSeason(s)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          activeSeason === s
                            ? 'bg-indigo-600 text-white'
                            : 'bg-surface-elevated text-gray-400 hover:text-white'
                        }`}
                      >
                        Season {s}
                      </button>
                    ))}
                  </div>

                  {/* Episode list */}
                  {activeSeason && (
                    <>
                      <div className="space-y-1 mb-4">
                        {(info.episodes[activeSeason] || []).map((ep) => {
                          const epId = `${activeSeason}-${ep.episode_num}`;
                          const isOpen = expandedEps[epId];
                          return (
                            <div key={epId} className="bg-surface-elevated rounded-lg overflow-hidden">
                              <div
                                className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-white/5 transition-colors"
                                onClick={() => setExpandedEps((p) => ({ ...p, [epId]: !p[epId] }))}
                              >
                                <span className="text-xs font-mono text-indigo-400 w-10 flex-shrink-0">
                                  E{pad(ep.episode_num)}
                                </span>
                                <span className="text-sm text-gray-200 flex-1 line-clamp-1">
                                  {ep.title || `Episode ${ep.episode_num}`}
                                </span>
                                {ep.info?.duration && (
                                  <span className="text-xs text-gray-500 hidden sm:block">{ep.info.duration}</span>
                                )}
                                <div className="flex gap-1 flex-shrink-0">
                                  <button
                                    className="btn-primary text-xs px-2.5 py-1"
                                    title="Watch"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setWatchItem({
                                        title: `${show.name} — S${pad(activeSeason)}E${pad(ep.episode_num)}${ep.title ? ' — ' + ep.title : ''}`,
                                        streamId: ep.id,
                                        extension: ep.container_extension || 'mkv',
                                      });
                                    }}
                                  >
                                    <Play size={12} fill="currentColor" />
                                  </button>
                                  <button
                                    className="bg-surface-border hover:bg-gray-600 text-white rounded-lg px-2.5 py-1 text-xs transition-colors"
                                    title="Download"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setConfirmItem(buildEpItem(ep, activeSeason));
                                    }}
                                  >
                                    <Download size={12} />
                                  </button>
                                </div>
                                {isOpen ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
                              </div>
                              {isOpen && ep.info?.plot && (
                                <div className="px-3 pb-3">
                                  <p className="text-xs text-gray-400 leading-relaxed">{ep.info.plot}</p>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <button
                        className="btn-primary w-full flex items-center justify-center gap-2"
                        onClick={async () => {
                          const episodes = info.episodes[activeSeason] || [];
                          for (const ep of episodes) {
                            const item = buildEpItem(ep, activeSeason);
                            await api.downloads.create({
                              type: item.type,
                              stream_id: item.stream_id,
                              name: item.name,
                              extension: item.extension,
                              series_name: item.series_name,
                              season: item.season,
                              episode: item.episode,
                              episode_title: item.episode_title,
                              save_path: item.suggested_path,
                            }).catch(() => {});
                          }
                        }}
                      >
                        <Download size={14} />
                        Download All — Season {activeSeason} ({(info.episodes[activeSeason] || []).length} episodes)
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {confirmItem && (
        <DownloadConfirmModal
          item={confirmItem}
          onClose={() => setConfirmItem(null)}
        />
      )}

      {watchItem && (
        <VideoPlayerModal
          title={watchItem.title}
          streamId={watchItem.streamId}
          extension={watchItem.extension}
          type="episode"
          onClose={() => setWatchItem(null)}
        />
      )}
    </>
  );
}
