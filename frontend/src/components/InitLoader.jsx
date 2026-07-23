import { CheckCircle, XCircle, Loader2, Tv, Film, Tag, AlertTriangle, RefreshCw } from 'lucide-react';

const ICONS = {
  movies:    <Film size={16} className="text-indigo-400" />,
  series:    <Tv size={16} className="text-indigo-400" />,
  movieCats: <Tag size={16} className="text-indigo-400" />,
  seriesCats:<Tag size={16} className="text-indigo-400" />,
};

const LABELS = {
  movies:    'Movies',
  series:    'TV Shows',
  movieCats: 'Movie categories',
  seriesCats:'Show categories',
};

function StatusIcon({ status }) {
  if (status === 'done')    return <CheckCircle size={16} className="text-green-400 flex-shrink-0" />;
  if (status === 'error')   return <XCircle size={16} className="text-red-400 flex-shrink-0" />;
  if (status === 'loading') return <Loader2 size={16} className="animate-spin text-indigo-400 flex-shrink-0" />;
  return <div className="w-4 h-4 rounded-full border border-gray-700 flex-shrink-0" />;
}

function StatusLabel({ item }) {
  if (item.status === 'done') {
    return (
      <span className="text-green-400 text-xs">
        {item.fromCache ? 'Loaded from cache' : 'Fetched from provider'}
        {item.count > 0 && ` · ${item.count.toLocaleString()} items`}
      </span>
    );
  }
  if (item.status === 'error') {
    return <span className="text-red-400 text-xs truncate max-w-[260px]">{item.error}</span>;
  }
  if (item.status === 'loading') {
    return (
      <span className="text-indigo-400 text-xs">
        {item.fromCache ? 'Loading from cache…' : 'Fetching from provider…'}
      </span>
    );
  }
  return <span className="text-gray-600 text-xs">Waiting…</span>;
}

export default function InitLoader({ items, onRetry, onContinue }) {
  const keys = ['movies', 'series', 'movieCats', 'seriesCats'];
  const total = keys.length;
  const done = keys.filter(k => items[k]?.status === 'done').length;
  const errors = keys.filter(k => items[k]?.status === 'error');
  const isLoading = keys.some(k => ['idle', 'loading'].includes(items[k]?.status));
  const allFinished = !isLoading;
  const hasErrors = errors.length > 0;
  const criticalError = items.movies?.status === 'error' || items.series?.status === 'error';

  const progressPct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="fixed inset-0 bg-surface z-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 mb-4">
            <Tv size={32} className="text-indigo-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">IPTV Downloader</h1>
          <p className="text-gray-500 text-sm mt-1">
            {isLoading ? 'Initializing your library…' : hasErrors ? 'Some items failed to load' : 'Ready!'}
          </p>
        </div>

        {/* Items */}
        <div className="bg-surface-card border border-surface-border rounded-xl overflow-hidden mb-4">
          {keys.map((key, i) => {
            const item = items[key] || { status: 'idle' };
            return (
              <div
                key={key}
                className={`flex items-center gap-3 px-4 py-3 ${i < keys.length - 1 ? 'border-b border-surface-border' : ''}`}
              >
                <div className="flex-shrink-0">{ICONS[key]}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-200 font-medium">{LABELS[key]}</p>
                  <StatusLabel item={item} />
                </div>
                <StatusIcon status={item.status} />
              </div>
            );
          })}
        </div>

        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex justify-between text-xs text-gray-500 mb-1.5">
            <span>{done} of {total} loaded</span>
            <span>{progressPct}%</span>
          </div>
          <div className="h-1.5 bg-surface-border rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Info / actions */}
        {isLoading && (
          <div className="flex items-start gap-2 bg-surface-elevated rounded-lg px-3 py-2.5">
            <AlertTriangle size={14} className="text-yellow-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-gray-400">
              Items not in local cache are fetched live from your provider — this can take up to a minute.
              Subsequent loads use the cache and are instant.
            </p>
          </div>
        )}

        {allFinished && !hasErrors && (
          <div className="flex items-center gap-2 bg-green-900/20 border border-green-800/40 rounded-lg px-3 py-2.5">
            <CheckCircle size={14} className="text-green-400 flex-shrink-0" />
            <p className="text-xs text-green-300">All data loaded successfully. Launching…</p>
          </div>
        )}

        {allFinished && hasErrors && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2.5">
              <XCircle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-red-300 font-medium">
                  {errors.length} item{errors.length > 1 ? 's' : ''} failed to load
                </p>
                <p className="text-xs text-red-500 mt-0.5">
                  {criticalError
                    ? 'Movie or TV Show data could not be fetched. Check your Xtream credentials and provider URL.'
                    : 'Category data failed — you can still browse without filters.'}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={onRetry} className="btn-ghost flex-1 flex items-center justify-center gap-2 border border-surface-border">
                <RefreshCw size={14} />
                Retry failed
              </button>
              <button onClick={onContinue} className="btn-primary flex-1">
                Continue anyway
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
