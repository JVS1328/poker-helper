// =====================================================================
// Cards
// =====================================================================

const RANK_VALUES = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
const RANK_LABELS = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: 'T', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const SUITS = ['♠', '♥', '♦', '♣'];

class Card {
  constructor(rank, suit) {
    this.rank = rank;
    this.suit = suit;
    this.value = RANK_VALUES[rank];
  }
  key() { return `${this.rank}${this.suit}`; }
}

export const parseCard = (cardStr) => {
  if (!cardStr) return null;
  const rank = cardStr.slice(0, -1);
  const suit = cardStr.slice(-1);
  return new Card(rank, suit);
};

const buildDeck = () => {
  const deck = [];
  for (const rank of Object.keys(RANK_VALUES)) {
    for (const suit of SUITS) deck.push(new Card(rank, suit));
  }
  return deck;
};

// =====================================================================
// Hand evaluator (proper 5-card scoring; 7-card = max of all 21 combos)
// =====================================================================

export const HandRank = {
  HIGH_CARD: 0, PAIR: 1, TWO_PAIR: 2, THREE_OF_KIND: 3, STRAIGHT: 4,
  FLUSH: 5, FULL_HOUSE: 6, FOUR_OF_KIND: 7, STRAIGHT_FLUSH: 8, ROYAL_FLUSH: 9
};

const HAND_RANK_NAME = {
  0: 'high card', 1: 'pair', 2: 'two pair', 3: 'three of a kind', 4: 'straight',
  5: 'flush', 6: 'full house', 7: 'four of a kind', 8: 'straight flush', 9: 'royal flush'
};

// Encode (rank, kicker1, kicker2, ...) into a single comparable integer.
// Each slot uses 4 bits (max value 14 = 0xE). Top slot is the rank category.
const encode = (rank, ...kickers) => {
  let v = rank;
  for (let i = 0; i < 5; i++) {
    v = v * 16 + (kickers[i] ?? 0);
  }
  return v;
};

// Highest straight in `sortedDescUnique` (no duplicates, descending). Returns top card or 0.
const checkStraight = (sortedDescUnique) => {
  // Add wheel: if A present, treat as 1 too
  const ranks = sortedDescUnique.includes(14)
    ? [...sortedDescUnique, 1]
    : sortedDescUnique;
  for (let i = 0; i <= ranks.length - 5; i++) {
    if (ranks[i] - ranks[i + 4] === 4) return ranks[i];
  }
  return 0;
};

// Score a 5-card hand. Higher = better.
const score5 = (cards) => {
  const values = cards.map(c => c.value);
  const suits = cards.map(c => c.suit);
  const sortedDesc = [...values].sort((a, b) => b - a);
  const uniqueDesc = [...new Set(sortedDesc)];

  const counts = {};
  for (const v of values) counts[v] = (counts[v] || 0) + 1;
  // Sort groups by count desc, then value desc
  const groups = Object.entries(counts)
    .map(([v, c]) => ({ value: +v, count: c }))
    .sort((a, b) => b.count - a.count || b.value - a.value);

  const isFlush = suits.every(s => s === suits[0]);
  const straightHigh = checkStraight(uniqueDesc);

  if (isFlush && straightHigh) {
    return straightHigh === 14
      ? encode(HandRank.ROYAL_FLUSH, 14)
      : encode(HandRank.STRAIGHT_FLUSH, straightHigh);
  }
  if (groups[0].count === 4) return encode(HandRank.FOUR_OF_KIND, groups[0].value, groups[1].value);
  if (groups[0].count === 3 && groups[1].count === 2) return encode(HandRank.FULL_HOUSE, groups[0].value, groups[1].value);
  if (isFlush) return encode(HandRank.FLUSH, ...sortedDesc);
  if (straightHigh) return encode(HandRank.STRAIGHT, straightHigh);
  if (groups[0].count === 3) return encode(HandRank.THREE_OF_KIND, groups[0].value, groups[1].value, groups[2].value);
  if (groups[0].count === 2 && groups[1].count === 2) return encode(HandRank.TWO_PAIR, groups[0].value, groups[1].value, groups[2].value);
  if (groups[0].count === 2) return encode(HandRank.PAIR, groups[0].value, groups[1].value, groups[2].value, groups[3].value);
  return encode(HandRank.HIGH_CARD, ...sortedDesc);
};

export const score7 = (cards) => {
  if (cards.length === 5) return score5(cards);
  if (cards.length < 5) return 0;
  let best = 0;
  for (let i = 0; i < cards.length - 4; i++) {
    for (let j = i + 1; j < cards.length - 3; j++) {
      for (let k = j + 1; k < cards.length - 2; k++) {
        for (let l = k + 1; l < cards.length - 1; l++) {
          for (let m = l + 1; m < cards.length; m++) {
            const s = score5([cards[i], cards[j], cards[k], cards[l], cards[m]]);
            if (s > best) best = s;
          }
        }
      }
    }
  }
  return best;
};

const handCategoryFromScore = (score) => Math.floor(score / 16 ** 5);

// =====================================================================
// Monte Carlo equity
// =====================================================================

const shuffleInPlace = (arr) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
};

export const calculateEquity = (holeCards, communityCards, numOpponents, iterations = 1200) => {
  if (holeCards.length !== 2 || numOpponents < 1) {
    return { equity: 0, win: 0, tie: 0, loss: 0, iterations: 0 };
  }
  const usedKeys = new Set([...holeCards, ...communityCards].map(c => c.key()));
  const remaining = buildDeck().filter(c => !usedKeys.has(c.key()));
  const cardsToDeal = 5 - communityCards.length;

  let wins = 0;
  let ties = 0;
  let losses = 0;

  for (let iter = 0; iter < iterations; iter++) {
    const deck = remaining.slice();
    shuffleInPlace(deck);

    const opponents = [];
    let pos = 0;
    for (let o = 0; o < numOpponents; o++) {
      opponents.push([deck[pos++], deck[pos++]]);
    }
    const fullCommunity = communityCards.slice();
    for (let c = 0; c < cardsToDeal; c++) fullCommunity.push(deck[pos++]);

    const myScore = score7([...holeCards, ...fullCommunity]);
    let bestOpp = 0;
    for (const opp of opponents) {
      const s = score7([...opp, ...fullCommunity]);
      if (s > bestOpp) bestOpp = s;
    }

    if (myScore > bestOpp) wins++;
    else if (myScore === bestOpp) ties++;
    else losses++;
  }

  return {
    equity: (wins + ties / 2) / iterations,
    win: wins / iterations,
    tie: ties / iterations,
    loss: losses / iterations,
    iterations,
  };
};

// =====================================================================
// Preflop ranges
// =====================================================================

// Convert hole cards to standard notation: 'AA', 'AKs', 'AKo'
export const handToNotation = (holeCards) => {
  const [a, b] = [...holeCards].sort((x, y) => y.value - x.value);
  const ah = RANK_LABELS[a.value];
  const bh = RANK_LABELS[b.value];
  if (a.value === b.value) return ah + bh;
  return ah + bh + (a.suit === b.suit ? 's' : 'o');
};

// Standard 6-max opening ranges (slightly tightened for casual / unknown opponents).
// Build incrementally: each later seat opens everything earlier seats do plus more.

const OPEN_UTG = [
  '77', '88', '99', 'TT', 'JJ', 'QQ', 'KK', 'AA',
  'AKs', 'AQs', 'AJs', 'ATs', 'A9s',
  'KQs', 'KJs', 'KTs',
  'QJs', 'QTs',
  'JTs',
  'AKo', 'AQo', 'AJo', 'KQo',
];

const OPEN_MP = [
  ...OPEN_UTG,
  '66',
  'A8s', 'A7s', 'A6s', 'A5s',
  'K9s', 'Q9s', 'J9s', 'T9s', '98s',
  'ATo', 'KJo',
];

const OPEN_HJ = [
  ...OPEN_MP,
  '55', '44',
  'A4s', 'A3s', 'A2s',
  'K8s', 'K7s',
  'Q8s', 'J8s', 'T8s', '97s', '87s',
  'A9o', 'KTo', 'QJo',
];

const OPEN_CO = [
  ...OPEN_HJ,
  '33', '22',
  'K6s', 'K5s',
  'Q7s', 'Q6s',
  'J7s', 'T7s', '96s', '86s', '76s', '65s',
  'A8o', 'A7o', 'K9o', 'QTo', 'JTo',
];

const OPEN_BTN = [
  ...OPEN_CO,
  'K4s', 'K3s', 'K2s',
  'Q5s', 'Q4s', 'Q3s', 'Q2s',
  'J6s', 'J5s', 'J4s', 'J3s', 'J2s',
  'T6s', 'T5s', 'T4s', '95s', '85s', '75s', '64s', '54s',
  'A6o', 'A5o', 'A4o', 'A3o', 'A2o',
  'K8o', 'K7o', 'K6o',
  'Q9o', 'J9o', 'T9o', '98o',
];

const OPEN_SB = [
  // SB plays a bit tighter than BTN since it's OOP and acts first postflop
  ...OPEN_HJ,
  'K6s', 'Q7s', 'J7s', 'T7s', '76s', '65s', '54s',
  'A8o', 'A7o', 'KTo', 'QJo', 'JTo',
];

const OPEN_RANGES = {
  'UTG': new Set(OPEN_UTG),
  'UTG+1': new Set(OPEN_UTG),
  'UTG+2': new Set(OPEN_MP),
  'MP': new Set(OPEN_MP),
  'HJ': new Set(OPEN_HJ),
  'CO': new Set(OPEN_CO),
  'BTN': new Set(OPEN_BTN),
  'BTN/SB': new Set(OPEN_BTN), // heads-up
  'SB': new Set(OPEN_SB),
  // BB doesn't open — no one to open vs.
  'BB': new Set(),
};

// Hands you'd 3-bet (re-raise) facing a single open
const RANGE_3BET = new Set([
  'AA', 'KK', 'QQ', 'JJ',
  'AKs', 'AKo', 'AQs',
]);

// Hands you'd flat-call a single open (already filtered to in-range hands)
const RANGE_CALL_RAISE = new Set([
  'TT', '99', '88', '77', '66', '55',
  'AQo', 'AJs', 'ATs', 'A9s', 'A5s', 'A4s', 'A3s', 'A2s',
  'KQs', 'KJs', 'KTs', 'KQo',
  'QJs', 'QTs', 'JTs', 'T9s', '98s', '87s', '76s', '65s',
]);

// Hands you'd 4-bet facing a 3-bet
const RANGE_4BET = new Set(['AA', 'KK', 'AKs', 'AKo']);

// Hands you'd flat-call a 3-bet
const RANGE_CALL_3BET = new Set([
  'QQ', 'JJ', 'TT',
  'AQs',
]);

// =====================================================================
// Decision logic
// =====================================================================

// Seat name → coarse position bucket (only used for fallback messaging)
const seatBucket = (seat) => {
  if (seat === 'SB' || seat === 'BB' || seat === 'BTN/SB') return 'blind';
  if (seat === 'BTN' || seat === 'CO') return 'late';
  if (seat === 'HJ' || seat === 'MP') return 'middle';
  return 'early';
};

const getPreflopDecision = ({ holeCards, seat, numPlayers, potSize, currentBet, stackSize, bigBlind }) => {
  const hand = handToNotation(holeCards);
  const bb = bigBlind > 0 ? bigBlind : 1;
  const toCallBB = currentBet / bb;
  const isHeadsUp = numPlayers === 2;

  // Detect action state from how much it costs to play
  let state;
  if (toCallBB < 0.01) state = 'checked'; // BB with no raise, or already in pot
  else if (toCallBB <= 1.5) state = 'limp'; // unraised pot, just BB to call
  else if (toCallBB <= 4.5) state = 'open'; // someone raised
  else if (toCallBB <= 13) state = '3bet'; // someone 3-bet
  else state = '4bet';

  const openRange = OPEN_RANGES[seat] ?? new Set();
  const inOpenRange = openRange.has(hand);

  // Standardized sizing helpers (returns chips)
  const openSize = Math.round(3 * bb); // 3 BB open
  const threeBetSize = Math.max(Math.round(currentBet * 3), Math.round(9 * bb));
  const fourBetSize = Math.max(Math.round(currentBet * 2.3), Math.round(22 * bb));

  if (state === 'checked' || state === 'limp') {
    if (inOpenRange) {
      const sizing = state === 'limp' ? Math.round(openSize + currentBet) : openSize;
      return {
        action: 'Raise', amount: sizing,
        reasoning: `${hand} is in the opening range from ${seat}. Standard ${state === 'limp' ? 'iso-raise' : 'open'} ~3 BB.`,
      };
    }
    if (state === 'checked') {
      return { action: 'Check', amount: 0, reasoning: `${hand} not in opening range — check for free.` };
    }
    return { action: 'Fold', amount: 0, reasoning: `${hand} is below the opening range from ${seat}.` };
  }

  if (state === 'open') {
    if (RANGE_3BET.has(hand)) {
      return {
        action: 'Raise', amount: threeBetSize,
        reasoning: `${hand} 3-bets for value vs. an open. Size ~3× their raise.`,
      };
    }
    if (RANGE_CALL_RAISE.has(hand)) {
      return {
        action: 'Call', amount: currentBet,
        reasoning: `${hand} flat-calls the open from ${seat} — playable but not strong enough to 3-bet.`,
      };
    }
    if (isHeadsUp && openRange.has(hand)) {
      return {
        action: 'Call', amount: currentBet,
        reasoning: `Heads-up — ${hand} is wide enough to defend.`,
      };
    }
    if (seat === 'BB' && toCallBB <= 3.5 && openRange.has(hand)) {
      // BB defends wider when getting a price
      return {
        action: 'Call', amount: currentBet,
        reasoning: `BB defending ${hand} — getting a price (${toCallBB.toFixed(1)} BB to call).`,
      };
    }
    return {
      action: 'Fold', amount: 0,
      reasoning: `${hand} is too weak to call a raise from ${seat} (${seatBucket(seat)} position).`,
    };
  }

  if (state === '3bet') {
    if (RANGE_4BET.has(hand)) {
      return {
        action: 'Raise', amount: fourBetSize,
        reasoning: `${hand} 4-bets for value vs. a 3-bet. Sizing ~2.3× their 3-bet.`,
      };
    }
    if (RANGE_CALL_3BET.has(hand)) {
      return {
        action: 'Call', amount: currentBet,
        reasoning: `${hand} calls the 3-bet to set-mine / play in position.`,
      };
    }
    return {
      action: 'Fold', amount: 0,
      reasoning: `${hand} is too thin against a 3-bet — fold.`,
    };
  }

  // 4-bet+ — only AA / KK continue, everything else folds
  if (hand === 'AA' || hand === 'KK') {
    return {
      action: 'Raise', amount: Math.round(currentBet * 2.2),
      reasoning: `${hand} jams or 5-bets vs. a 4-bet — premium for stacks.`,
    };
  }
  if (hand === 'AKs' || hand === 'AKo') {
    return {
      action: 'Call', amount: currentBet,
      reasoning: `${hand} calls a 4-bet for set/pair value.`,
    };
  }
  return { action: 'Fold', amount: 0, reasoning: `${hand} folds vs. a 4-bet.` };
};

const getPostflopDecision = ({ holeCards, communityCards, numPlayers, potSize, currentBet, stackSize, equityResult }) => {
  const equity = equityResult.equity;
  const numOpponents = numPlayers - 1;
  const myScore = score7([...holeCards, ...communityCards]);
  const handCat = handCategoryFromScore(myScore);
  const handName = HAND_RANK_NAME[handCat] || 'hand';
  const potOdds = currentBet > 0 ? currentBet / (potSize + currentBet) : 0;
  const spr = potSize > 0 ? stackSize / potSize : Infinity;
  const equityPct = (equity * 100).toFixed(0);

  // No bet to call — bet/check decision
  if (currentBet === 0) {
    if (equity > 0.7) {
      const size = Math.min(Math.round(potSize * 0.75), stackSize);
      return {
        action: 'Raise', amount: size,
        reasoning: `${handName} with ${equityPct}% equity vs. ${numOpponents} — value bet 3/4 pot.`,
      };
    }
    if (equity > 0.5 && spr < 4) {
      const size = Math.min(Math.round(potSize * 0.5), stackSize);
      return {
        action: 'Raise', amount: size,
        reasoning: `${handName} ${equityPct}% equity, low SPR — bet for value/protection.`,
      };
    }
    if (equity > 0.45 && numOpponents <= 2) {
      const size = Math.min(Math.round(potSize * 0.5), stackSize);
      return {
        action: 'Raise', amount: size,
        reasoning: `${handName} ${equityPct}% equity heads/3-up — thin value bet.`,
      };
    }
    return {
      action: 'Check', amount: 0,
      reasoning: `${handName} ${equityPct}% equity vs. ${numOpponents} — check, not strong enough to bet.`,
    };
  }

  // Facing a bet: compare equity to pot odds (with a small buffer for being out of position / multiway)
  const requiredEquity = potOdds + (numOpponents > 1 ? 0.05 : 0.02);

  // Strong: raise for value
  if (equity > 0.75) {
    const size = Math.min(Math.round(currentBet * 2.5 + potSize * 0.5), stackSize);
    return {
      action: 'Raise', amount: size,
      reasoning: `${handName} ${equityPct}% equity — raise for value.`,
    };
  }

  // Decent + getting a good price
  if (equity > requiredEquity) {
    return {
      action: 'Call', amount: currentBet,
      reasoning: `${handName} ${equityPct}% equity beats the price (need ${(requiredEquity * 100).toFixed(0)}%).`,
    };
  }

  return {
    action: 'Fold', amount: 0,
    reasoning: `${handName} only ${equityPct}% equity vs. ${(requiredEquity * 100).toFixed(0)}% needed — fold.`,
  };
};

export class PokerLogic {
  getDecision(holeCards, communityCards, seat, numPlayers, potSize, currentBet, stackSize, bigBlind = 2) {
    const numOpponents = Math.max(1, numPlayers - 1);
    const equityResult = calculateEquity(holeCards, communityCards, numOpponents);
    return this.getDecisionFromEquity(holeCards, communityCards, seat, numPlayers, potSize, currentBet, stackSize, bigBlind, equityResult);
  }

  // Same as getDecision but accepts a pre-computed equityResult instead of
  // running its own Monte Carlo. Lets the Pokernow bridge feed in
  // equity-vs-estimated-ranges (Phase 3) so postflop recommendations use
  // contextually accurate equity instead of vs-random.
  getDecisionFromEquity(holeCards, communityCards, seat, numPlayers, potSize, currentBet, stackSize, bigBlind, equityResult) {
    const ctx = { holeCards, communityCards, seat, numPlayers, potSize, currentBet, stackSize, bigBlind, equityResult };
    const base = communityCards.length === 0
      ? getPreflopDecision(ctx)
      : getPostflopDecision(ctx);
    return { ...base, equity: equityResult.equity, equityIterations: equityResult.iterations };
  }
}
