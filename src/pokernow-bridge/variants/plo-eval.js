// PLO / PLO5 hand evaluators. The PLO rule that distinguishes these from
// NLHE: you must use EXACTLY 2 hole cards + EXACTLY 3 board cards.
//
// We export a single `scorePLOHigh(hole, board)` that enumerates 2-of-hole
// combinations × 3-of-board combinations and returns the best score using
// the standard 5-card scorer from poker-logic.js.
//
// For Hi-Lo (8-or-better), `scorePLOLow` returns either a comparable low-hand
// value or null (no qualifying low). Lower is BETTER for the low score, so we
// invert to compare uniformly (higher = better) by returning `LOW_MAX - rawLow`.

import { score7 } from '../../poker-logic';

// All 2-of-N combos for N in {4, 5}.
const COMBO_2 = {
  4: [[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]],
  5: [[0,1],[0,2],[0,3],[0,4],[1,2],[1,3],[1,4],[2,3],[2,4],[3,4]],
};

// All 3-of-5 board combos.
const COMBO_3_OF_5 = [
  [0,1,2],[0,1,3],[0,1,4],[0,2,3],[0,2,4],[0,3,4],
  [1,2,3],[1,2,4],[1,3,4],
  [2,3,4],
];

// score5 isn't exported from poker-logic.js, but score7 accepts 5 cards too —
// it returns score5 directly when given 5. So we use score7 with exactly 5.
const score5 = (cards) => score7(cards);

export const scorePLOHigh = (holeCards, boardCards) => {
  if (!holeCards || (holeCards.length !== 4 && holeCards.length !== 5)) return 0;
  if (!boardCards || boardCards.length < 3) return 0;

  const holeCombos = COMBO_2[holeCards.length];
  // Use first 5 board cards only (river state). On flop/turn the MC dealer
  // is responsible for filling out the board before calling this.
  if (boardCards.length !== 5) return 0;

  let best = 0;
  for (const [h1, h2] of holeCombos) {
    for (const [b1, b2, b3] of COMBO_3_OF_5) {
      const five = [holeCards[h1], holeCards[h2], boardCards[b1], boardCards[b2], boardCards[b3]];
      const s = score5(five);
      if (s > best) best = s;
    }
  }
  return best;
};

// --- Low-hand evaluation (Ace-to-5, 8-or-better) -------------------------
// Standard "California" / "Eight or better" rules: low hand is 5 cards all
// ranked 8 or below (no pair, A counts as 1). Straights and flushes don't
// count against the low. Best low is A-2-3-4-5 ("wheel").
//
// We represent a low hand as a 5-digit number: high card (smallest is best),
// then next-highest, etc. e.g. A-2-3-4-5 → 54321 → return as `100000 - 54321`
// so larger = better (uniform with high-hand scoring).

const lowRank = (rank) => {
  // A=1, 2..8 = 2..8; anything 9+ disqualifies.
  if (rank === 'A') return 1;
  const n = parseInt(rank, 10);
  if (Number.isFinite(n) && n >= 2 && n <= 8) return n;
  return null; // 9, T, J, Q, K → disqualified
};

const evalLow5 = (cards) => {
  const lows = cards.map(c => lowRank(c.rank));
  if (lows.some(l => l === null)) return null;
  const seen = new Set(lows);
  if (seen.size !== 5) return null; // must be 5 distinct ranks
  // Sort descending (worst first) — best low has lowest top card.
  const sorted = [...lows].sort((a,b) => b - a);
  // Encode: 5-digit number, top card in highest place.
  let val = 0;
  for (const r of sorted) val = val * 10 + r;
  // Invert so smaller raw = larger comparable value.
  return 100000 - val;
};

export const scorePLOLow = (holeCards, boardCards) => {
  if (!holeCards || (holeCards.length !== 4 && holeCards.length !== 5)) return null;
  if (!boardCards || boardCards.length !== 5) return null;

  const holeCombos = COMBO_2[holeCards.length];
  let best = null;
  for (const [h1, h2] of holeCombos) {
    for (const [b1, b2, b3] of COMBO_3_OF_5) {
      const five = [holeCards[h1], holeCards[h2], boardCards[b1], boardCards[b2], boardCards[b3]];
      const s = evalLow5(five);
      if (s != null && (best == null || s > best)) best = s;
    }
  }
  return best;
};
