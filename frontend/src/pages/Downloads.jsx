import { X, RefreshCw, CheckCircle, XCircle, Clock, AlertCircle, Trash2, RotateCcw } from 'lucide-react';
import { api } from '../api/client.js';

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatSpeed(bps) {
  if (!bps) return '';
  return `${formatBytes(bps)}/s`;
}

const STATUS_CONFIG = {
  queued: { icon: Clock, color: 'text-gray-400', bg: 'bg-gray-800', label: 'Queued' },
  downloading: { icon: RefreshCw, color: 'text-blue-400', bg: 'bg-blue-900/30', label: 'Downloading' },
  completed: { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-900/20', label: 'Completed' },
  error: { icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-900/20', label: 'Error' },
  cancelled: { icon: XCircle, color: 'text-gray-500', bg: 'bg-surface-elevated', label: 'Cancelled' },
};

export default function Downloads({ downloads }) {
  async function handleRemove(id) {
    await api.downloads.remove(id).catch(console.error);
  }

  async function handleRetry(id) {
    await api.downloads.retry(id).catch(console.error);
  }

  async function handleClearDone() {
    await api.downloads.clear().catch(console.error);
  }

  const active = downloads.filter((d) => ['queued', 'downloading'].includes(d.status));
  const done = downloads.filter((d) => !['queued', 'downloading'].includes(d.status));

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Downloads</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {active.length} active · {done.length} completed
          </p>
        </div>
        {done.length > 0 && (
          <button
            onClick={handleClearDone}
            className="btn-ghost flex items-center gap-2 text-sm border border-surface-border"
          >
            <Trash2 size={14} />
            Clear finished
          </button>
        )}
      </div>

      {downloads.length === 0 && (
        <div className="text-center py-20 text-gray-500">
          <p className="text-4xl mb-3">📥</p>
          <p>No downloads yet</p>
          <p className="text-sm mt-1">Browse movies or TV shows to start downloading</p>
        </div>
      )}

      <div className="space-y-3">
        {downloads.map((dl) => {
          const cfg = STATUS_CONFIG[dl.status] || STATUS_CONFIG.queued;
          const Icon = cfg.icon;
          const isActive = dl.status === 'downloading';
          const canRetry = ['error', 'cancelled'].includes(dl.status);

          return (
            <div key={dl.id} className={`rounded-xl border border-surface-border p-4 ${cfg.bg}`}>
              <div className="flex items-start gap-3">
                <Icon
                  size={18}
                  className={`${cfg.color} mt-0.5 flex-shrink-0 ${isActive ? 'animate-spin' : ''}`}
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{dl.filename}</p>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{dl.save_path}</p>
                    </div>
                    <span className={`badge flex-shrink-0 ${cfg.bg} ${cfg.color} border border-current/20`}>
                      {cfg.label}
                    </span>
                  </div>

                  {/* Progress bar */}
                  {(isActive || dl.status === 'completed') && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                        <span>
                          {formatBytes(dl.downloaded)}
                          {dl.size > 0 ? ` / ${formatBytes(dl.size)}` : ''}
                        </span>
                        <span className="flex items-center gap-2">
                          {isActive && dl.speed > 0 && <span className="text-blue-400">{formatSpeed(dl.speed)}</span>}
                          <span className="font-medium">{Math.round(dl.progress)}%</span>
                        </span>
                      </div>
                      <div className="h-1.5 bg-surface-border rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            dl.status === 'completed' ? 'bg-green-500' : 'bg-indigo-500'
                          }`}
                          style={{ width: `${dl.progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {dl.error && (
                    <p className="text-xs text-red-400 mt-2 bg-red-900/20 rounded px-2 py-1">{dl.error}</p>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 mt-3">
                    {canRetry && (
                      <button
                        onClick={() => handleRetry(dl.id)}
                        className="text-xs btn-ghost border border-surface-border flex items-center gap-1 py-1"
                      >
                        <RotateCcw size={11} />
                        Retry
                      </button>
                    )}
                    <button
                      onClick={() => handleRemove(dl.id)}
                      className="text-xs btn-ghost border border-surface-border flex items-center gap-1 py-1 text-red-400 hover:text-red-300"
                    >
                      <X size={11} />
                      {isActive ? 'Cancel' : 'Remove'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
