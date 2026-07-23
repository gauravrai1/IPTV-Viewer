import { useState } from 'react';
import { X, Save, FolderOpen } from 'lucide-react';
import { api } from '../api/client.js';

export default function SettingsModal({ settings, onSave, onClose }) {
  const [form, setForm] = useState({
    movies_path: settings?.movies_path || '',
    shows_path: settings?.shows_path || '',
    max_concurrent: settings?.max_concurrent || '3',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.settings.update(form);
      onSave?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface-card border border-surface-border rounded-xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-white">Settings</h2>
          <button onClick={onClose} className="btn-ghost p-1"><X size={18} /></button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Movies Download Path</label>
            <input
              className="input-field w-full"
              value={form.movies_path}
              onChange={(e) => setForm({ ...form, movies_path: e.target.value })}
              placeholder="/downloads/movies"
            />
            <p className="text-xs text-gray-500 mt-1">Container-internal path (must be inside a mounted volume)</p>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">TV Shows Download Path</label>
            <input
              className="input-field w-full"
              value={form.shows_path}
              onChange={(e) => setForm({ ...form, shows_path: e.target.value })}
              placeholder="/downloads/shows"
            />
            <p className="text-xs text-gray-500 mt-1">Container-internal path (must be inside a mounted volume)</p>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Max Concurrent Downloads</label>
            <select
              className="input-field w-full"
              value={form.max_concurrent}
              onChange={(e) => setForm({ ...form, max_concurrent: e.target.value })}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={String(n)}>{n}</option>
              ))}
            </select>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
              <Save size={15} />
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
