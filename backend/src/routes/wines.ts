import { Router } from 'express';
import { getSession, setSession } from '../utils/sessions.js';

const router = Router();

// Get session wines
router.get('/:sessionId', (req, res) => {
  const session = getSession(req.params.sessionId);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  res.json(session);
});

// Edit a wine entry
router.put('/:sessionId/:index', (req, res) => {
  const session = getSession(req.params.sessionId);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const index = parseInt(req.params.index);
  if (isNaN(index) || index < 0 || index >= session.wines.length) {
    res.status(400).json({ error: 'Invalid wine index' });
    return;
  }

  const { name, producer, vintage, restaurantPrice } = req.body;
  const wine = session.wines[index];

  if (name !== undefined) wine.name = name;
  if (producer !== undefined) wine.producer = producer;
  if (vintage !== undefined) wine.vintage = vintage;
  if (restaurantPrice !== undefined) wine.restaurantPrice = restaurantPrice;

  // Reset lookup data so it can be re-fetched
  wine.retailPriceAvg = null;
  wine.retailPriceMin = null;
  wine.criticScore = null;
  wine.communityScore = null;
  wine.communityReviewCount = null;
  wine.lookupStatus = 'pending';
  wine.wineSearcherUrl = null;
  wine.cellarTrackerUrl = null;
  wine.markupPercent = null;
  wine.valueScore = null;

  setSession(session);
  res.json(session);
});

// Export as CSV
router.get('/:sessionId/export', (req, res) => {
  const session = getSession(req.params.sessionId);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const headers = [
    'Wine Name', 'Producer', 'Vintage', 'Region', 'Grape',
    'Restaurant Price', 'Retail Avg Price', 'Markup %',
    'Critic Score', 'Community Score', 'Value Score',
    'Wine-Searcher URL', 'CellarTracker URL',
  ];

  const rows = session.wines.map(w => [
    `"${w.name.replace(/"/g, '""')}"`,
    `"${w.producer.replace(/"/g, '""')}"`,
    w.vintage ?? 'NV',
    `"${w.region.replace(/"/g, '""')}"`,
    `"${w.grapeVariety.replace(/"/g, '""')}"`,
    w.restaurantPrice,
    w.retailPriceAvg ?? '',
    w.markupPercent !== null ? w.markupPercent.toFixed(0) : '',
    w.criticScore ?? '',
    w.communityScore ?? '',
    w.valueScore ?? '',
    w.wineSearcherUrl ?? '',
    w.cellarTrackerUrl ?? '',
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=wine-values.csv');
  res.send(csv);
});

export default router;
