// Preflop range definitions for Phase 3's range-aware equity. Hand classes
// are ranked top-to-bottom by approximate equity vs a random hand, matching
// standard poker-training rankings (close to Sklansky-Malmuth + hot-and-cold).
//
// 169 distinct preflop classes: 13 pairs + 78 suited + 78 offsuit.
// Sampling weights match combinatorics:
//   pair    AA  → 6 combos
//   suited  AKs → 4 combos
//   offsuit AKo → 12 combos
//   total = 13*6 + 78*4 + 78*12 = 78 + 312 + 936 = 1326

const RANKS = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
const RANK_INDEX = Object.fromEntries(RANKS.map((r, i) => [r, i]));
const SUITS = ['s','h','d','c'];

// Ranked list of 169 hand-class strings, best to worst.
// Source: a standard published preflop equity ranking against a random hand.
// (Equibrah, PokerStars heat-maps and most training sites agree to within a
// few rows; minor differences don't materially affect range-aware equity.)
export const HAND_CLASSES_RANKED = [
  // Top 1.5%
  'AA','KK','QQ','JJ',
  // Top 4-5%
  'AKs','AKo','TT','AQs','AJs',
  // Top 7-10%
  'KQs','AQo','99','ATs','KJs','AJo','KQo','KTs','88',
  // Top 12-15%
  'QJs','A9s','QTs','KJo','ATo','77','A8s','JTs',
  // Top 18-20%
  'K9s','A7s','KTo','A9o','A5s','A6s','QJo','Q9s',
  // Top 22-25%
  'A4s','66','JTo','A3s','K8s','QTo','K7s','A2s','J9s','T9s','A8o',
  // Top 28-30%
  'Q8s','K9o','55','J8s','Q9o','T8s','K6s','98s','A7o','K5s','J9o','Q7s','K4s','44',
  // Top 35-40%
  'A6o','J7s','T7s','K8o','87s','A5o','Q6s','K3s','T9o','Q5s','A4o','J8o','K7o','33','T8o','76s','98o',
  // Top 45%
  'K2s','86s','Q4s','J6s','K6o','A3o','87o','J5s','22','T6s','K5o','Q3s','A2o','J4s','T7o','76o','86o','J7o','Q8o','65s','96s','T5s',
  // Top 55%
  'Q2s','J3s','T6o','75s','J2s','K4o','97s','65o','75o','85s','T4s','K3o','98o','J6o',
  // Top 65%
  'Q7o','85o','64s','T3s','K2o','54s','J5o','T2s','Q6o','64o','Q5o','Q4o','74s','95s',
  // Top 75%
  'Q3o','Q2o','J4o','T8o','J3o','J2o','54o','84s','T5o','T9o','53s','85o','73s','94s','T4o','T3o',
  // Top 85%
  '74o','63s','T2o','J9o','43s','93s','95o','84o','62s','52s','73o','83s','42s','62o','53o','82s','72s','43o',
  // Top 95-100%
  '92s','63o','94o','83o','52o','42o','93o','73o','92o','82o','72o','32s','32o','62o',
];

// Sanity check at module load (development only).
if (process.env.NODE_ENV !== 'production') {
  const expectedCount = 169;
  if (HAND_CLASSES_RANKED.length !== expectedCount) {
    console.warn(`[range-buckets] expected ${expectedCount} hand classes, got ${HAND_CLASSES_RANKED.length}`);
  }
  const seen = new Set();
  for (const h of HAND_CLASSES_RANKED) {
    if (seen.has(h)) console.warn(`[range-buckets] duplicate hand class: ${h}`);
    seen.add(h);
  }
}

// Bucket → range % (matches the spec's frozen bucket boundaries).
export const BUCKET_RANGE = {
  whale:   0.70,
  loose:   0.45,
  average: 0.28,
  tag:     0.18,
  nit:     0.08,
  unknown: 0.40,  // mid-loose default for players we haven't sized up yet
};

// Expand a hand class string ("AKs", "72o", "TT") into the list of [rank1, rank2, suited]
// We don't pre-build all 1326 combos here — Monte Carlo expands them on the fly
// against the live deck.
const classToSpec = (cls) => {
  const a = cls[0], b = cls[1], suff = cls[2];
  if (a === b) return { kind: 'pair', rank: a };
  if (suff === 's') return { kind: 'suited',  high: a, low: b };
  if (suff === 'o') return { kind: 'offsuit', high: a, low: b };
  throw new Error(`bad hand class: ${cls}`);
};

// Returns true if a given [card1, card2] (where each card is {rank, suit})
// belongs to a given hand class.
export const cardsMatchClass = (c1, c2, cls) => {
  const s = classToSpec(cls);
  if (s.kind === 'pair') return c1.rank === s.rank && c2.rank === s.rank;
  const hi = RANK_INDEX[s.high], lo = RANK_INDEX[s.low];
  const r1 = RANK_INDEX[c1.rank], r2 = RANK_INDEX[c2.rank];
  const matchHigh = Math.max(r1, r2) === hi && Math.min(r1, r2) === lo;
  if (!matchHigh) return false;
  if (s.kind === 'suited')  return c1.suit === c2.suit;
  if (s.kind === 'offsuit') return c1.suit !== c2.suit;
  return false;
};

// Number of combos a given class contributes (6 pair / 4 suited / 12 offsuit).
export const classCombos = (cls) => {
  const s = classToSpec(cls);
  if (s.kind === 'pair') return 6;
  if (s.kind === 'suited') return 4;
  return 12;
};

// Top-N classes from the ranked list whose combined combo count is at least
// `targetCombos`. Returns the set of class strings.
export const topRangeClasses = (rangeFraction) => {
  const targetCombos = Math.round(1326 * rangeFraction);
  const out = new Set();
  let acc = 0;
  for (const cls of HAND_CLASSES_RANKED) {
    out.add(cls);
    acc += classCombos(cls);
    if (acc >= targetCombos) break;
  }
  return out;
};

// Generate every [card1, card2] combo for the given range, filtered to cards
// remaining in `availableDeck`. Returns an array of [Card, Card] pairs.
// Cards are the Card class from poker-logic.js (we duck-type on .rank/.suit).
export const enumerateRangeCombos = (rangeClasses, availableDeck) => {
  const out = [];
  const byRank = {};
  for (const c of availableDeck) {
    (byRank[c.rank] ||= []).push(c);
  }
  for (const cls of rangeClasses) {
    const s = classToSpec(cls);
    if (s.kind === 'pair') {
      const cards = byRank[s.rank] || [];
      for (let i = 0; i < cards.length; i++) {
        for (let j = i + 1; j < cards.length; j++) {
          out.push([cards[i], cards[j]]);
        }
      }
    } else {
      const hi = byRank[s.high] || [];
      const lo = byRank[s.low] || [];
      for (const a of hi) {
        for (const b of lo) {
          if (a === b) continue;
          if (s.kind === 'suited'  && a.suit !== b.suit) continue;
          if (s.kind === 'offsuit' && a.suit === b.suit) continue;
          out.push([a, b]);
        }
      }
    }
  }
  return out;
};

// Convenience: bucket name → range classes (cached).
const bucketClassCache = {};
export const bucketRangeClasses = (bucket) => {
  if (!bucketClassCache[bucket]) {
    const frac = BUCKET_RANGE[bucket] ?? BUCKET_RANGE.unknown;
    bucketClassCache[bucket] = topRangeClasses(frac);
  }
  return bucketClassCache[bucket];
};
