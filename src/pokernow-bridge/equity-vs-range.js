// Range-aware Monte Carlo. Each opponent is assigned a range (a set of hand
// classes); per iteration we sample one combo per opponent from the available
// deck, deal remaining board cards, and score. Matches Equibrah's headline
// "equity against the players you're actually facing" approach.

import { parseCard, score7 } from '../poker-logic';
import { enumerateRangeCombos, bucketRangeClasses } from './range-buckets';

const RANKS = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
const SUITS = ['s','h','d','c'];

const buildDeck = () => {
  const out = [];
  for (const r of RANKS) for (const s of SUITS) out.push(parseCard(`${r}${s}`));
  return out;
};

const shuffleInPlace = (arr) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
};

// opponentBuckets: array of bucket names (one per opponent).
// Returns { equity, win, tie, loss, iterations } or null if inputs unusable.
export const calculateRangeEquity = ({
  hole,
  board,
  opponentBuckets,
  iterations = 1000,
}) => {
  const heroHole = (hole || []).map(parseCard).filter(Boolean);
  if (heroHole.length !== 2) return null;
  const boardCards = (board || []).map(parseCard).filter(Boolean);
  if (![0,3,4,5].includes(boardCards.length)) return null;

  const usedKeys = new Set([...heroHole, ...boardCards].map(c => c.key()));
  const remaining = buildDeck().filter(c => !usedKeys.has(c.key()));

  // Precompute each opponent's eligible combos.
  const opponentRanges = opponentBuckets.map(bucket => {
    const classes = bucketRangeClasses(bucket || 'unknown');
    return enumerateRangeCombos(classes, remaining);
  });

  // Fall back to full deck for opponents whose range is empty given the deadcards.
  let fullCombosCache = null;
  const fullCombos = () => {
    if (fullCombosCache) return fullCombosCache;
    const arr = [];
    for (let i = 0; i < remaining.length; i++)
      for (let j = i + 1; j < remaining.length; j++)
        arr.push([remaining[i], remaining[j]]);
    fullCombosCache = arr;
    return arr;
  };
  for (let i = 0; i < opponentRanges.length; i++) {
    if (opponentRanges[i].length === 0) opponentRanges[i] = fullCombos();
  }

  let wins = 0, ties = 0, losses = 0, completed = 0;

  for (let it = 0; it < iterations; it++) {
    const dealtKeys = new Set();
    const oppHands = [];
    let failed = false;

    for (let o = 0; o < opponentRanges.length; o++) {
      const candidates = opponentRanges[o];
      let picked = null;
      for (let tries = 0; tries < 20; tries++) {
        const cand = candidates[Math.floor(Math.random() * candidates.length)];
        if (!dealtKeys.has(cand[0].key()) && !dealtKeys.has(cand[1].key())) {
          picked = cand;
          break;
        }
      }
      if (!picked) { failed = true; break; }
      dealtKeys.add(picked[0].key());
      dealtKeys.add(picked[1].key());
      oppHands.push(picked);
    }
    if (failed) continue;

    const fullCommunity = boardCards.slice();
    const cardsNeeded = 5 - fullCommunity.length;
    const deckForBoard = remaining.filter(c => !dealtKeys.has(c.key()));
    shuffleInPlace(deckForBoard);
    if (deckForBoard.length < cardsNeeded) continue;
    for (let c = 0; c < cardsNeeded; c++) fullCommunity.push(deckForBoard[c]);

    const myScore = score7([...heroHole, ...fullCommunity]);
    let bestOpp = 0;
    for (const opp of oppHands) {
      const s = score7([...opp, ...fullCommunity]);
      if (s > bestOpp) bestOpp = s;
    }

    if (myScore > bestOpp) wins++;
    else if (myScore === bestOpp) ties++;
    else losses++;
    completed++;
  }

  if (completed === 0) return null;
  return {
    equity: (wins + ties / 2) / completed,
    win:    wins / completed,
    tie:    ties / completed,
    loss:   losses / completed,
    iterations: completed,
  };
};
