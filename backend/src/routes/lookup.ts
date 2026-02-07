import { Router } from 'express';
import { getSession, setSession } from '../utils/sessions.js';
import { lookupWinesBatch } from '../services/wine-lookup.js';
import { calculateMarkup, calculateValueScore } from '../services/value-calculator.js';

const router = Router();

router.post('/:sessionId', async (req, res) => {
  const session = getSession(req.params.sessionId);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  if (session.status === 'looking_up') {
    res.status(409).json({ error: 'Lookup already in progress' });
    return;
  }

  session.status = 'looking_up';
  setSession(session);

  // Return immediately, do lookups in background
  res.json({ message: 'Lookup started', sessionId: session.id });

  try {
    const pendingWines = session.wines.filter(w => w.lookupStatus === 'pending');

    // Smaller batches with web search (each batch does multiple web searches)
    const BATCH_SIZE = 10;
    const batches: typeof pendingWines[] = [];
    for (let i = 0; i < pendingWines.length; i += BATCH_SIZE) {
      batches.push(pendingWines.slice(i, i + BATCH_SIZE));
    }

    console.log(`Looking up ${pendingWines.length} wines in ${batches.length} parallel batches`);

    // Run up to 3 batches in parallel for speed
    const MAX_PARALLEL = 3;
    for (let groupStart = 0; groupStart < batches.length; groupStart += MAX_PARALLEL) {
      const group = batches.slice(groupStart, groupStart + MAX_PARALLEL);

      const batchPromises = group.map((batch, idx) => {
        const batchNum = groupStart + idx + 1;
        console.log(`  Starting batch ${batchNum}/${batches.length} (${batch.length} wines)`);
        return lookupWinesBatch(batch, session.currency);
      });

      const groupResults = await Promise.all(batchPromises);

      // Apply results from all parallel batches
      for (let bIdx = 0; bIdx < group.length; bIdx++) {
        const batch = group[bIdx];
        const results = groupResults[bIdx];

        for (let i = 0; i < batch.length; i++) {
          const wine = batch[i];
          const data = results[i];

          if (data) {
            wine.retailPriceAvg = data.retailPriceAvg;
            wine.retailPriceMin = data.retailPriceMin;
            wine.criticScore = data.criticScore;
            wine.communityScore = data.communityScore;
            wine.communityReviewCount = data.communityReviewCount;

            // Generate links for user to verify
            const searchName = encodeURIComponent(wine.name.replace(/ /g, '+'));
            wine.wineSearcherUrl = `https://www.wine-searcher.com/find/${searchName}${wine.vintage ? '/' + wine.vintage : ''}`;
            wine.cellarTrackerUrl = `https://www.cellartracker.com/list.html?szSearch=${encodeURIComponent(wine.name + (wine.vintage ? ' ' + wine.vintage : ''))}`;

            // Calculate derived values
            if (wine.retailPriceAvg) {
              wine.markupPercent = Math.round(calculateMarkup(wine.restaurantPrice, wine.retailPriceAvg));
            }

            wine.valueScore = calculateValueScore(
              wine.restaurantPrice,
              wine.retailPriceAvg,
              wine.criticScore,
              wine.communityScore
            );

            // Determine lookup status
            if (wine.retailPriceAvg || wine.communityScore) {
              wine.lookupStatus = wine.retailPriceAvg && wine.communityScore ? 'found' : 'partial';
            } else {
              wine.lookupStatus = 'not_found';
            }
          } else {
            wine.lookupStatus = 'not_found';
          }
        }
      }

      // Persist after each parallel group so polling sees progress
      setSession(session);
    }

    session.status = 'complete';
    setSession(session);
    console.log('Lookup complete for session', session.id);
  } catch (err) {
    console.error('Lookup error:', err);
    session.status = 'error';
    session.error = (err as Error).message;
    setSession(session);
  }
});

export default router;
