import { NavLink } from 'react-router-dom';
import { Film, Tv, Download, Settings, Heart } from 'lucide-react';
import { useState } from 'react';
import SettingsModal from './SettingsModal.jsx';

export default function Navbar({ activeDownloads, watchlistCount, settings, onSettingsSaved }) {
  const [showSettings, setShowSettings] = useState(false);

  const linkClass = ({ isActive }) =>
    `btn-ghost flex items-center gap-2 relative ${isActive ? 'text-white bg-surface-elevated' : ''}`;

  return (
    <>
      <nav className="bg-surface-card border-b border-surface-border sticky top-0 z-40">
        <div className="container mx-auto px-4 max-w-screen-2xl flex items-center gap-6 h-14">
          <span className="text-white font-bold text-lg tracking-tight flex items-center gap-2 flex-shrink-0">
            <Tv size={20} className="text-indigo-400" />
            <span className="hidden sm:inline">IPTV Downloader</span>
          </span>

          <div className="flex items-center gap-1 flex-1">
            <NavLink to="/movies" className={linkClass}>
              <Film size={16} />
              <span className="hidden sm:inline">Movies</span>
            </NavLink>
            <NavLink to="/shows" className={linkClass}>
              <Tv size={16} />
              <span className="hidden sm:inline">TV Shows</span>
            </NavLink>
            <NavLink to="/watchlist" className={linkClass}>
              <Heart size={16} />
              <span className="hidden sm:inline">My List</span>
              {watchlistCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-rose-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold leading-none">
                  {watchlistCount > 9 ? '9+' : watchlistCount}
                </span>
              )}
            </NavLink>
            <NavLink to="/downloads" className={linkClass}>
              <Download size={16} />
              <span className="hidden sm:inline">Downloads</span>
              {activeDownloads > 0 && (
                <span className="absolute -top-1 -right-1 bg-indigo-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold leading-none">
                  {activeDownloads > 9 ? '9+' : activeDownloads}
                </span>
              )}
            </NavLink>
          </div>

          <button onClick={() => setShowSettings(true)} className="btn-ghost p-2" title="Settings">
            <Settings size={16} />
          </button>
        </div>
      </nav>

      {showSettings && (
        <SettingsModal settings={settings} onSave={onSettingsSaved} onClose={() => setShowSettings(false)} />
      )}
    </>
  );
}
