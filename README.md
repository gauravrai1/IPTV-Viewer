# IPTV Downloader

A self-hosted web portal for browsing and downloading content from an Xtream Codes IPTV provider. Designed for homelab deployment via Docker Compose.

Credentials never leave the server — all Xtream API calls, image fetching, and video streaming are proxied through the backend.

---

## Disclaimer

This project is only an interface — it does not host, provide, or distribute any media content itself. It simply connects to an Xtream Codes provider that **you** supply credentials for.

Streaming or downloading content you do not have the legal right to access is not supported, and users are expected to refrain from doing so. You are solely responsible for ensuring your use of this software, and the IPTV provider you connect it to, complies with applicable laws in your jurisdiction.

---

## Stack

| Layer | Tech |
|-------|------|
| Backend | Node.js 20 · Express · better-sqlite3 |
| Frontend | React 18 · Vite · Tailwind CSS |
| Reverse proxy | nginx (inside the frontend container) |
| Container | Docker Compose |

---

## Quick start

### 1. Configure

```bash
cp .env.example .env
nano .env
```

| Variable | Description |
|----------|-------------|
| `XTREAM_URL` | Provider base URL, e.g. `http://provider.example.com:8080` |
| `XTREAM_USERNAME` | Your Xtream Codes username |
| `XTREAM_PASSWORD` | Your Xtream Codes password |
| `MOVIES_HOST_PATH` | Absolute path on the **host** where movies will be saved |
| `SHOWS_HOST_PATH` | Absolute path on the **host** where TV shows will be saved |
| `PORT` | Port to expose the web UI on (default: `8080`) |

### 2. Build & run

```bash
docker compose up -d --build
```

Open `http://<homelab-ip>:8080` in a browser.

### 3. Subsequent starts

```bash
docker compose up -d
```

No rebuild needed unless you update the code.

---

## Features

### Initialization screen
On first load an initialization screen tracks each data source (Movies, TV Shows, Movie categories, Show categories) individually with live status. Items already in the local cache load instantly; items not yet cached are fetched live from the provider (can take up to a minute). Failed items can be retried individually or skipped.

### Movies page
- Poster grid with lazy-loaded images (server-side image proxy keeps credentials hidden)
- Real-time client-side search — no extra round-trips
- Filter by category · sort by newest / oldest / rating / A–Z
- Last-used category and sort order are remembered across sessions
- Click a card → detail modal: poster, rating, genre, cast, director, overview, trailer link
- **Watch** button → full in-browser video player
- **Download** button → editable save path preview before confirming

### TV Shows page
- Same grid, search, filter, and sort as Movies
- Click a card → fetches full series info (seasons + episode list)
- Season tabs with per-episode plot, Watch, and Download buttons
- **Download All** button for an entire season
- Files saved in Plex/Jellyfin-compatible naming

### In-browser video player
- Full-screen overlay with native HTML5 video
- Keyboard shortcuts: `Space` play/pause · `←/→` seek 10 s · `↑/↓` volume · `F` fullscreen · `Esc` close
- Audio track switcher (when the stream carries multiple audio tracks)
- Subtitle support: upload an `.srt` file — converted to WebVTT in-browser and applied automatically
- Video seeking works correctly via Range header forwarding through the stream proxy

### My List
- Heart button on every movie card and show card (appears on hover, red when saved)
- Heart button also in detail modals
- Dedicated **My List** page with All / Movies / TV Shows tabs
- Watchlist survives page reloads (stored in SQLite)

### Downloads page
- Live progress bars via SSE — no polling
- Shows speed, downloaded / total bytes, percentage
- Cancel active downloads · retry failed · clear finished

### Settings (gear icon in navbar)
- Change movies path and shows path at runtime
- Change max concurrent downloads (default: 3)
- All settings persisted in SQLite

### Sync
- Catalog data is cached in SQLite indefinitely — no automatic expiry
- Use the **Sync** button on Movies or TV Shows pages to force a fresh fetch from the provider

---

## File naming

**Movies**
```
{MOVIES_PATH}/{Movie Name}/{Movie Name}.mkv
```

**TV episodes**
```
{SHOWS_PATH}/{Show Name}/Season 01/{Show Name} - S01E03 - Episode Title.mkv
```

Both conventions are Jellyfin / Plex compatible for automatic metadata matching.

---

## Directory structure

```
iptv/
├── backend/
│   ├── src/
│   │   ├── server.js          # Express entry point
│   │   ├── db.js              # SQLite init, schema, WAL mode
│   │   ├── xtream.js          # Xtream Codes API client
│   │   ├── downloader.js      # Concurrent streaming download manager
│   │   ├── events.js          # SSE broadcast helper
│   │   └── routes/
│   │       ├── movies.js      # GET /api/movies  (list, categories, detail, refresh)
│   │       ├── series.js      # GET /api/series  (list, categories, detail, refresh)
│   │       ├── downloads.js   # /api/downloads   (CRUD + SSE event stream)
│   │       ├── settings.js    # GET/PUT /api/settings
│   │       ├── proxy.js       # GET /api/proxy/image  (server-side image fetch)
│   │       ├── stream.js      # GET /api/stream/movie/:id  /episode/:id
│   │       ├── watchlist.js   # /api/watchlist  (CRUD)
│   │       └── status.js      # GET /api/status  (cache health check)
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.jsx            # Root: data orchestration, SSE, watchlist state
│   │   ├── api/client.js      # Typed fetch wrapper for all API endpoints
│   │   ├── utils.js           # imgProxy() helper
│   │   ├── components/
│   │   │   ├── InitLoader.jsx          # Boot screen with per-source status tracking
│   │   │   ├── Navbar.jsx              # Nav links with active-download + watchlist badges
│   │   │   ├── SettingsModal.jsx       # Paths + concurrency settings
│   │   │   ├── MovieCard.jsx           # Poster card with hover heart button
│   │   │   ├── SeriesCard.jsx          # Same for shows
│   │   │   ├── ContentModal.jsx        # Movie detail, Watch, Download, watchlist
│   │   │   ├── SeriesModal.jsx         # Show detail: seasons, episodes, Watch, Download
│   │   │   ├── VideoPlayerModal.jsx    # HTML5 player with subtitles + audio tracks
│   │   │   └── DownloadConfirmModal.jsx # Save path preview + editable path
│   │   └── pages/
│   │       ├── Movies.jsx     # Movie grid (data from App props)
│   │       ├── TVShows.jsx    # Show grid (data from App props)
│   │       ├── Watchlist.jsx  # Saved items: All / Movies / TV Shows tabs
│   │       └── Downloads.jsx  # Download queue with live progress
│   ├── nginx.conf             # Reverse proxy to backend; proxy_buffering off for SSE
│   └── Dockerfile             # Multi-stage: Vite build → nginx
├── data/                      # SQLite DB (auto-created, persisted via Docker volume)
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## Development (without Docker)

**Backend**
```bash
cd backend
npm install
# Create backend/.env with your credentials (see .env.example for field names)
node src/server.js
# Listening on http://localhost:3001
```

**Frontend** (separate terminal)
```bash
cd frontend
npm install
npm run dev
# Vite dev server on http://localhost:5173, proxies /api → :3001
```

---

## Volumes

| Container path | Configured by |
|----------------|---------------|
| `/data` | Hardcoded — always `./data` on the host |
| `/downloads/movies` | `MOVIES_HOST_PATH` in `.env` |
| `/downloads/shows` | `SHOWS_HOST_PATH` in `.env` |

---

## Troubleshooting

**"XTREAM_URL, XTREAM_USERNAME, and XTREAM_PASSWORD must be set"**
→ Ensure `.env` exists in the project root and `docker compose up` is run from the same directory.

**Initialization screen stuck on "Fetching from provider…"**
→ The provider is slow or unreachable. Check connectivity:
```bash
docker compose exec backend wget -q -O- \
  "$XTREAM_URL/player_api.php?username=$XTREAM_USERNAME&password=$XTREAM_PASSWORD&action=get_vod_streams" \
  | head -c 200
```

**Images not loading**
→ The image proxy (`/api/proxy/image`) fetches images server-side. If images are blank, check `docker compose logs backend` for proxy errors.

**Video playback fails or seeking doesn't work**
→ Confirm the stream URL is reachable from inside the backend container. The stream proxy forwards `Range` headers, so seeking requires the upstream to support them.

**Downloads fail immediately**
→ Verify `MOVIES_HOST_PATH` / `SHOWS_HOST_PATH` exist on the host and Docker has write permission.
→ Check `docker compose logs backend` for the exact error.

**SSE progress not updating**
→ Nginx is configured with `proxy_buffering off`. If you have an additional reverse proxy in front (Traefik, Caddy, etc.), ensure request buffering is disabled there too.
