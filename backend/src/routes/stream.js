import { Router } from 'express';
import axios from 'axios';
import { buildMovieUrl, buildEpisodeUrl } from '../xtream.js';

const router = Router();

const FORWARD_HEADERS = ['content-type', 'content-length', 'content-range', 'accept-ranges'];

async function proxyStream(req, res, url) {
  const headers = {};
  if (req.headers.range) headers.Range = req.headers.range;

  try {
    const upstream = await axios({
      method: 'GET',
      url,
      responseType: 'stream',
      headers,
      timeout: 0,
      maxRedirects: 5,
    });

    for (const h of FORWARD_HEADERS) {
      if (upstream.headers[h]) res.setHeader(h, upstream.headers[h]);
    }
    // Always advertise range support so browsers can seek
    if (!upstream.headers['accept-ranges']) res.setHeader('Accept-Ranges', 'bytes');

    res.status(upstream.status);
    upstream.data.pipe(res);

    req.on('close', () => upstream.data.destroy());
  } catch (err) {
    if (!res.headersSent) res.status(502).json({ error: err.message });
  }
}

router.get('/movie/:streamId', (req, res) => {
  const url = buildMovieUrl(req.params.streamId, req.query.ext || 'mkv');
  proxyStream(req, res, url);
});

router.get('/episode/:streamId', (req, res) => {
  const url = buildEpisodeUrl(req.params.streamId, req.query.ext || 'mkv');
  proxyStream(req, res, url);
});

export default router;
