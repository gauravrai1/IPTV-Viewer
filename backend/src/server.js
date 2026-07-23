import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb } from './db.js';
import moviesRouter from './routes/movies.js';
import seriesRouter from './routes/series.js';
import downloadsRouter from './routes/downloads.js';
import settingsRouter from './routes/settings.js';
import proxyRouter from './routes/proxy.js';
import streamRouter from './routes/stream.js';
import watchlistRouter from './routes/watchlist.js';
import statusRouter from './routes/status.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/movies', moviesRouter);
app.use('/api/series', seriesRouter);
app.use('/api/downloads', downloadsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/proxy', proxyRouter);
app.use('/api/stream', streamRouter);
app.use('/api/watchlist', watchlistRouter);
app.use('/api/status', statusRouter);

app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
  getDb(); // init DB on startup
});
