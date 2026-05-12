// Shared Monte Carlo runner for PLO-family variants. Differs from NLHE in
// (a) hole card count (4 or 5), (b) PLO scoring (exactly 2 hole + 3 board),
// (c) optional Hi-Lo split-pot accounting.

import { parseCard } from '../../poker-logic';
import { scorePLOHigh, scorePLOLow } from './plo-eval';

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

// hole: string[] of length holeCardCount
// board: string[] of length 0, 3, 4, or 5
// numOpponents: integer >= 1
// holeCardCount: 4 or 5
// isHiLo: bool
// iterations: int
export const ploMonteCarloEquity = ({ hole, board, numOpponents, holeCardCount, isHiLo, iterations = 1000 }) => {
  const heroHole = (hole || []).map(parseCard).filter(Boolean);
  if (heroHole.length !== holeCardCount) return null;
  const boardCards = (board || []).map(parseCard).filter(Boolean);
  if (![0,3,4,5].includes(boardCards.length)) return null;
  if (numOpponents < 1) return null;

  const usedKeys = new Set([...heroHole, ...boardCards].map(c => c.key()));
  const remaining = buildDeck().filter(c => !usedKeys.has(c.key()));

  let wins = 0, ties = 0, losses = 0;        // high-side accounting (treated as win share)
  let halfWins = 0;                          // Hi-Lo: count scoops + half-pots correctly
  let completed = 0;

  // For Hi-Lo we track scoops vs splits; the final equity is the share of pots won.
  let scoopShare = 0; // accumulator of share-of-pot per iteration

  for (let it = 0; it < iterations; it++) {
    const deck = remaining.slice();
    shuffleInPlace(deck);
    let pos = 0;

    // Deal opponents.
    const opps = [];
    for (let o = 0; o < numOpponents; o++) {
      const oppHole = [];
      for (let c = 0; c < holeCardCount; c++) oppHole.push(deck[pos++]);
      opps.push(oppHole);
    }

    // Deal remaining board.
    const fullBoard = boardCards.slice();
    const need = 5 - fullBoard.length;
    for (let c = 0; c < need; c++) fullBoard.push(deck[pos++]);

    // High side.
    const myHigh = scorePLOHigh(heroHole, fullBoard);
    let bestOppHigh = 0;
    let nOppMatchHigh = 0;
    for (const opp of opps) {
      const s = scorePLOHigh(opp, fullBoard);
      if (s > bestOppHigh) { bestOppHigh = s; nOppMatchHigh = 1; }
      else if (s === bestOppHigh) nOppMatchHigh++;
    }

    let highShare; // hero's share of the high half of pot
    if (myHigh > bestOppHigh) highShare = 1;
    else if (myHigh < bestOppHigh) highShare = 0;
    else {
      // Hero ties with `nOppMatchHigh` opponents.
      highShare = 1 / (nOppMatchHigh + 1);
    }

    if (!isHiLo) {
      // High-only: count wins/ties/losses traditionally.
      if (highShare === 1) wins++;
      else if (highShare === 0) losses++;
      else { ties++; }
      scoopShare += highShare; // for equity calc
      completed++;
      continue;
    }

    // Hi-Lo branch.
    const myLow = scorePLOLow(heroHole, fullBoard);
    const oppLows = opps.map(o => scorePLOLow(o, fullBoard));
    const anyLowQualifies = (myLow != null) || oppLows.some(v => v != null);

    let lowShare;
    if (!anyLowQualifies) {
      // No qualifying low → high takes the whole pot.
      lowShare = highShare;
    } else {
      // Compute share of low half.
      const validLows = [myLow, ...oppLows].filter(v => v != null);
      const bestLow = Math.max(...validLows);
      if (myLow == null || myLow < bestLow) {
        lowShare = 0;
      } else {
        // hero ties with however many also have bestLow.
        const tiedCount = validLows.filter(v => v === bestLow).length;
        lowShare = 1 / tiedCount;
      }
    }

    // Equity-share for hero this iteration: 0.5 * highShare + 0.5 * lowShare
    // (if low qualifies). If no low qualifies, highShare already accounts.
    const share = anyLowQualifies ? (0.5 * highShare + 0.5 * lowShare) : highShare;
    scoopShare += share;
    if (share === 1) wins++;
    else if (share === 0) losses++;
    else ties++; // partial pot — counted as "tie" in the win/tie/loss view

    completed++;
  }

  if (completed === 0) return null;

  return {
    equity: scoopShare / completed,
    win:    wins   / completed,
    tie:    ties   / completed,
    loss:   losses / completed,
    iterations: completed,
  };
};
