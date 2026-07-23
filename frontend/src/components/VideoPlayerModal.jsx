import { useEffect, useRef, useState, useCallback } from 'react';
import { X, AlertTriangle, Subtitles, Volume2, ChevronDown } from 'lucide-react';

function srtToVtt(srt) {
  const vtt = srt
    .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  return `WEBVTT\n\n${vtt.trim()}`;
}

export default function VideoPlayerModal({ title, streamId, extension, type, onClose }) {
  const videoRef = useRef(null);
  const trackRef = useRef(null);
  const subBlobRef = useRef(null);

  const [failed, setFailed] = useState(false);
  const [audioTracks, setAudioTracks] = useState([]);
  const [activeAudio, setActiveAudio] = useState(0);
  const [subtitleLabel, setSubtitleLabel] = useState(null);
  const [showMenu, setShowMenu] = useState(false);

  const src = type === 'episode'
    ? `/api/stream/episode/${streamId}?ext=${extension || 'mkv'}`
    : `/api/stream/movie/${streamId}?ext=${extension || 'mkv'}`;

  // Detect audio tracks after metadata loads
  const onMetadata = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const at = v.audioTracks;
    if (at && at.length > 1) {
      setAudioTracks(Array.from({ length: at.length }, (_, i) => ({
        index: i,
        label: at[i].label || at[i].language || `Track ${i + 1}`,
        language: at[i].language,
      })));
    }
  }, []);

  function switchAudioTrack(idx) {
    const v = videoRef.current;
    if (!v?.audioTracks) return;
    for (let i = 0; i < v.audioTracks.length; i++) {
      v.audioTracks[i].enabled = i === idx;
    }
    setActiveAudio(idx);
    setShowMenu(false);
  }

  function loadSubtitle(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const vtt = file.name.endsWith('.vtt') ? text : srtToVtt(text);

      // Revoke previous blob
      if (subBlobRef.current) URL.revokeObjectURL(subBlobRef.current);
      const blob = new Blob([vtt], { type: 'text/vtt' });
      const blobUrl = URL.createObjectURL(blob);
      subBlobRef.current = blobUrl;

      // Remove old track
      if (trackRef.current) trackRef.current.remove();

      const track = document.createElement('track');
      track.kind = 'subtitles';
      track.label = file.name.replace(/\.(srt|vtt)$/i, '');
      track.default = true;
      track.src = blobUrl;
      videoRef.current?.appendChild(track);
      trackRef.current = track;

      // Activate it
      setTimeout(() => {
        const v = videoRef.current;
        if (v?.textTracks?.[0]) v.textTracks[0].mode = 'showing';
      }, 100);

      setSubtitleLabel(track.label);
      setShowMenu(false);
    };
    reader.readAsText(file);
  }

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') { onClose(); return; }
      const v = videoRef.current;
      if (!v) return;
      if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); v.paused ? v.play() : v.pause(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); v.currentTime += 10; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); v.currentTime -= 10; }
      if (e.key === 'ArrowUp') { e.preventDefault(); v.volume = Math.min(1, v.volume + 0.1); }
      if (e.key === 'ArrowDown') { e.preventDefault(); v.volume = Math.max(0, v.volume - 0.1); }
      if (e.key === 'f' || e.key === 'F') videoRef.current?.requestFullscreen?.();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Cleanup blob on unmount
  useEffect(() => () => { if (subBlobRef.current) URL.revokeObjectURL(subBlobRef.current); }, []);

  return (
    <div className="fixed inset-0 z-[70] bg-black flex flex-col select-none">
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/90 to-transparent pointer-events-none">
        <h3 className="text-white text-sm font-medium truncate max-w-[70%] pointer-events-none">{title}</h3>
        <button onClick={onClose} className="text-white/70 hover:text-white pointer-events-auto ml-4">
          <X size={20} />
        </button>
      </div>

      {/* Video */}
      {!failed && (
        <video
          ref={videoRef}
          src={src}
          controls
          autoPlay
          className="w-full h-full object-contain"
          onLoadedMetadata={onMetadata}
          onError={() => setFailed(true)}
          style={{ background: '#000' }}
        />
      )}

      {/* Error */}
      {failed && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-black">
          <AlertTriangle size={40} className="text-yellow-500" />
          <div className="text-center">
            <p className="text-white font-medium mb-1">Playback failed</p>
            <p className="text-gray-400 text-sm">Browser may not support {extension || 'this format'}.</p>
            <p className="text-gray-500 text-xs mt-1">Try downloading the file instead.</p>
          </div>
          <button onClick={onClose} className="btn-primary mt-2">Close</button>
        </div>
      )}

      {/* Bottom controls overlay */}
      {!failed && (
        <div className="absolute bottom-14 right-4 flex items-center gap-2">
          {/* Audio track switcher */}
          {audioTracks.length > 1 && (
            <div className="relative">
              <button
                onClick={() => setShowMenu((s) => s ? false : 'audio')}
                className="flex items-center gap-1 bg-black/70 hover:bg-black/90 text-white text-xs px-3 py-1.5 rounded-lg transition-colors"
              >
                <Volume2 size={13} />
                {audioTracks[activeAudio]?.label}
                <ChevronDown size={12} />
              </button>
              {showMenu === 'audio' && (
                <div className="absolute bottom-full right-0 mb-1 bg-gray-900 border border-surface-border rounded-lg overflow-hidden min-w-[140px]">
                  {audioTracks.map((t) => (
                    <button
                      key={t.index}
                      onClick={() => switchAudioTrack(t.index)}
                      className={`w-full text-left px-3 py-2 text-xs hover:bg-surface-elevated transition-colors ${t.index === activeAudio ? 'text-indigo-400' : 'text-gray-200'}`}
                    >
                      {t.label}
                      {t.language && t.language !== t.label && <span className="text-gray-500 ml-1">({t.language})</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Subtitle loader */}
          <div className="relative">
            <button
              onClick={() => setShowMenu((s) => s ? false : 'sub')}
              className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg transition-colors ${
                subtitleLabel ? 'bg-indigo-600 text-white' : 'bg-black/70 hover:bg-black/90 text-white'
              }`}
            >
              <Subtitles size={13} />
              {subtitleLabel || 'Subtitles'}
              <ChevronDown size={12} />
            </button>
            {showMenu === 'sub' && (
              <div className="absolute bottom-full right-0 mb-1 bg-gray-900 border border-surface-border rounded-lg overflow-hidden min-w-[180px]">
                <label className="flex items-center gap-2 px-3 py-2 text-xs text-gray-200 hover:bg-surface-elevated cursor-pointer transition-colors">
                  <Subtitles size={13} className="text-indigo-400" />
                  Load SRT / VTT file…
                  <input
                    type="file"
                    accept=".srt,.vtt"
                    className="hidden"
                    onChange={(e) => { if (e.target.files[0]) loadSubtitle(e.target.files[0]); }}
                  />
                </label>
                {subtitleLabel && (
                  <button
                    onClick={() => {
                      const v = videoRef.current;
                      if (v?.textTracks?.[0]) v.textTracks[0].mode = 'hidden';
                      setSubtitleLabel(null);
                      setShowMenu(false);
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-surface-elevated transition-colors"
                  >
                    Remove subtitles
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Keyboard hint */}
      {!failed && (
        <div className="absolute bottom-1 right-4 text-[10px] text-white/20 pointer-events-none">
          Space · ← → seek · ↑ ↓ vol · F fullscreen · Esc close
        </div>
      )}
    </div>
  );
}
