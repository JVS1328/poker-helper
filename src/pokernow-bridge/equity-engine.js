// Async equity calculator. Wraps the variant's monteCarloEquity. Lets the
// caller fire requests freely — we coalesce so only the latest request's
// result is delivered, and we use queueMicrotask + setTimeout(0) to yield
// to the browser so the UI doesn't jank during the simulation.

import { getVariant } from './variants';

let nextId = 0;
let inflightId = null;

// Run iterations in small batches with setTimeout-yields between batches so
// the main thread can repaint. ~1200 iters at 200/batch ≈ 6 yields per calc.
const BATCH = 200;
const PHASE1_ITERATIONS = 1200;

const runBatched = (variant, opts, onProgress) => new Promise((resolve, reject) => {
  const total = opts.iterations || PHASE1_ITERATIONS;
  let done = 0;
  let wins = 0, ties = 0, losses = 0;

  const tick = () => {
    const thisBatch = Math.min(BATCH, total - done);
    let r;
    try {
      r = variant.monteCarloEquity({ ...opts, iterations: thisBatch });
    } catch (err) {
      reject(err);
      return;
    }
    if (!r || r.equity == null) {
      // Stub variant or invalid input.
      resolve(r);
      return;
    }
    wins   += Math.round(r.win   * thisBatch);
    ties   += Math.round(r.tie   * thisBatch);
    losses += Math.round(r.loss  * thisBatch);
    done   += thisBatch;
    if (onProgress) onProgress(done / total);

    if (done >= total) {
      resolve({
        equity: (wins + ties / 2) / done,
        win: wins / done,
        tie: ties / done,
        loss: losses / done,
        iterations: done,
      });
      return;
    }
    setTimeout(tick, 0);
  };

  setTimeout(tick, 0);
});

// Returns the latest equity computation result, or null if this request was
// superseded by a newer one or inputs are invalid.
export const computeEquity = async ({ variantId, hole, board, numOpponents }) => {
  const variant = getVariant(variantId);
  if (!variant || !variant.supportsEquity) {
    return { equity: null, reason: 'variant-not-implemented', variantId };
  }
  if (!hole || hole.length !== variant.holeCardCount) return null;
  if (numOpponents < 1) return null;

  const myId = ++nextId;
  inflightId = myId;
  const result = await runBatched(variant, { hole, board, numOpponents });
  if (inflightId !== myId) return null; // a newer request raced us — drop
  return result;
};
