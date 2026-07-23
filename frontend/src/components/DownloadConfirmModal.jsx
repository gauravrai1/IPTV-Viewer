import { useState } from 'react';
import { X, Download, FolderOpen, Pencil } from 'lucide-react';
import { api } from '../api/client.js';

export default function DownloadConfirmModal({ item, onClose, onQueued }) {
  const [savePath, setSavePath] = useState(item.suggested_path);
  const [editingPath, setEditingPath] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleDownload() {
    setLoading(true);
    setError('');
    try {
      const payload = {
        type: item.type,
        stream_id: item.stream_id,
        name: item.name,
        extension: item.extension,
        save_path: savePath,
      };
      if (item.type === 'episode') {
        payload.series_name = item.series_name;
        payload.season = item.season;
        payload.episode = item.episode;
        payload.episode_title = item.episode_title;
      }
      const dl = await api.downloads.create(payload);
      onQueued?.(dl);
      onClose();
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80" onClick={onClose} />
      <div className="relative bg-surface-card border border-surface-border rounded-xl w-full max-w-lg p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <Download size={16} className="text-indigo-400" />
            Confirm Download
          </h3>
          <button onClick={onClose} className="btn-ghost p-1"><X size={16} /></button>
        </div>

        <div className="space-y-4">
          <div className="bg-surface-elevated rounded-lg p-3">
            <p className="text-xs text-gray-400 mb-1">Content</p>
            <p className="text-sm text-white font-medium">{item.name}</p>
            {item.type === 'episode' && (
              <p className="text-xs text-gray-400 mt-1">
                {item.series_name} — S{String(item.season).padStart(2,'0')}E{String(item.episode).padStart(2,'0')}
                {item.episode_title ? ` — ${item.episode_title}` : ''}
              </p>
            )}
            <p className="text-xs text-indigo-400 mt-1">{item.filename}</p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-400 flex items-center gap-1">
                <FolderOpen size={12} />
                Save to
              </label>
              <button
                className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                onClick={() => setEditingPath(!editingPath)}
              >
                <Pencil size={11} />
                {editingPath ? 'Done' : 'Edit'}
              </button>
            </div>
            {editingPath ? (
              <input
                className="input-field w-full text-xs"
                value={savePath}
                onChange={(e) => setSavePath(e.target.value)}
                autoFocus
              />
            ) : (
              <div className="bg-surface-elevated rounded-lg px-3 py-2">
                <code className="text-xs text-gray-300 break-all">{savePath}</code>
              </div>
            )}
          </div>

          <div className="bg-surface-elevated rounded-lg px-3 py-2">
            <p className="text-xs text-gray-400">Full path</p>
            <code className="text-xs text-gray-300 break-all">{savePath}/{item.filename}</code>
          </div>

          {error && (
            <div className="bg-red-900/30 border border-red-700 rounded-lg px-3 py-2">
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="btn-ghost flex-1">Cancel</button>
            <button onClick={handleDownload} disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-2">
              <Download size={14} />
              {loading ? 'Queueing…' : 'Download'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
