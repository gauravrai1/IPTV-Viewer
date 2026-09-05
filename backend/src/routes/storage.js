import { Router } from 'express';
import { buildSummary, startAnalysis, cancelAnalysis, getJobState } from '../storage.js';

const router = Router();

router.get('/summary', async (req, res) => {
  try {
    res.json(await buildSummary());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/status', (req, res) => {
  res.json(getJobState());
});

// Start an analysis run.
// body: { mode: 'sample' | 'full', type?: 'movie' | 'series', category_id?: string }
router.post('/analyze', async (req, res) => {
  try {
    const { mode, type, category_id } = req.body || {};
    const job = await startAnalysis({
      mode: mode === 'full' ? 'full' : 'sample',
      type: type || null,
      categoryId: category_id ?? null,
    });
    res.status(202).json(job);
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

router.post('/cancel', (req, res) => {
  cancelAnalysis();
  res.json(getJobState());
});

export default router;
