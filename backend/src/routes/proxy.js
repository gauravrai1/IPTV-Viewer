import { Router } from 'express';
import axios from 'axios';

const router = Router();

// Image proxy — fetches images server-side to bypass CORS/mixed-content issues
router.get('/image', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).end();

  // Only proxy http(s) image URLs
  if (!/^https?:\/\//i.test(url)) return res.status(400).end();

  try {
    const upstream = await axios({
      method: 'GET',
      url,
      responseType: 'stream',
      timeout: 8000,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });

    const ct = upstream.headers['content-type'] || 'image/jpeg';
    if (!ct.startsWith('image/')) return res.status(400).end();

    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'public, max-age=604800'); // browser caches for 7 days
    upstream.data.pipe(res);
  } catch {
    // Return a transparent 1×1 PNG so the browser doesn't show broken image icon
    const blank = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    );
    res.setHeader('Content-Type', 'image/png');
    res.end(blank);
  }
});

export default router;
