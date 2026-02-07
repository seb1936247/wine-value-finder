import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import { upload } from '../utils/file-handler.js';
import { parseWineList } from '../services/claude-parser.js';
import { getSession, setSession } from '../utils/sessions.js';
import type { WineValueResult, SessionData } from '../types/wine.js';

const router = Router();

router.post('/', upload.single('winelist'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  const sessionId = uuidv4();
  const session: SessionData = {
    id: sessionId,
    wines: [],
    currency: 'USD',
    status: 'parsing',
    createdAt: new Date(),
  };
  setSession(session);

  // Return session ID immediately, parse in background
  res.json({ sessionId });

  try {
    const parseResult = await parseWineList(req.file.path);

    const wines: WineValueResult[] = parseResult.wines.map(w => ({
      ...w,
      retailPriceAvg: null,
      retailPriceMin: null,
      criticScore: null,
      communityScore: null,
      communityReviewCount: null,
      lookupStatus: 'pending',
      wineSearcherUrl: null,
      cellarTrackerUrl: null,
      markupPercent: null,
      valueScore: null,
    }));

    const updated = getSession(sessionId);
    if (updated) {
      updated.wines = wines;
      updated.currency = parseResult.currency;
      updated.status = 'parsed';
      setSession(updated);
    }
  } catch (err) {
    console.error('Parsing error:', err);
    const updated = getSession(sessionId);
    if (updated) {
      updated.status = 'error';
      updated.error = (err as Error).message;
      setSession(updated);
    }
  } finally {
    // Clean up uploaded file
    try {
      fs.unlinkSync(req.file.path);
    } catch { /* ignore */ }
  }
});

export default router;
