// Pure state container with pub/sub. The DOM reader feeds it; the equity
// panel + HUD shells subscribe. Holds the current-hand snapshot only — no
// history, no persistence (history is a non-goal per the spec).

import { readSnapshot } from './dom-reader';

const seatOrderForPlayers = (n) => {
  switch (n) {
    case 2:  return ['BTN/SB', 'BB'];
    case 3:  return ['BTN', 'SB', 'BB'];
    case 4:  return ['BTN', 'SB', 'BB', 'UTG'];
    case 5:  return ['BTN', 'SB', 'BB', 'UTG', 'CO'];
    case 6:  return ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'];
    case 7:  return ['BTN', 'SB', 'BB', 'UTG', 'MP', 'HJ', 'CO'];
    case 8:  return ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'HJ', 'CO'];
    case 9:  return ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'UTG+2', 'MP', 'HJ', 'CO'];
    case 10: return ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'UTG+2', 'UTG+3', 'MP', 'HJ', 'CO'];
    default: return [];
  }
};

const EMPTY_SNAPSHOT = {
  variant: 'nlhe',
  numPlayers: 0,
  bigBlind: null,
  pot: null,
  toCall: null,
  holeCards: [],
  board: [],
  seats: [],         // poker-order (0=BTN). Each: { name, stack, isHero, isDealer, domEl, position }
  heroSeatIndex: null,
  heroPosition: null,
  heroStack: null,
  handId: null,
  updatedAt: 0,
};

let snapshot = { ...EMPTY_SNAPSHOT };
let dealerNameAtHandStart = null;
let lastBoardLen = 0;
let handCounter = 0;
const subscribers = new Set();

const seatsEqual = (a, b) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].name !== b[i].name) return false;
    if (a[i].stack !== b[i].stack) return false;
    if (a[i].isHero !== b[i].isHero) return false;
    if (a[i].isDealer !== b[i].isDealer) return false;
  }
  return true;
};

const cardsEqual = (a, b) => a.length === b.length && a.every((c, i) => c === b[i]);

const snapshotsEquivalent = (a, b) => (
  a.variant === b.variant &&
  a.numPlayers === b.numPlayers &&
  a.bigBlind === b.bigBlind &&
  a.pot === b.pot &&
  a.toCall === b.toCall &&
  a.heroSeatIndex === b.heroSeatIndex &&
  a.heroPosition === b.heroPosition &&
  a.heroStack === b.heroStack &&
  a.handId === b.handId &&
  cardsEqual(a.holeCards, b.holeCards) &&
  cardsEqual(a.board, b.board) &&
  seatsEqual(a.seats, b.seats)
);

const detectHandBoundary = (orderedSeats, boardLen) => {
  const dealer = orderedSeats.find(s => s.isDealer);
  const newDealer = dealer?.name ?? null;

  // Hand resets on (a) dealer name changes OR (b) board went non-empty → empty.
  let isNew = false;
  if (newDealer && newDealer !== dealerNameAtHandStart) isNew = true;
  if (lastBoardLen > 0 && boardLen === 0) isNew = true;

  if (isNew) {
    dealerNameAtHandStart = newDealer;
    handCounter++;
  }
  lastBoardLen = boardLen;
  return handCounter ? `hand-${handCounter}` : null;
};

const buildSnapshot = () => {
  const raw = readSnapshot();
  const orderedRaw = raw.seatsOrdered;
  const numPlayers = orderedRaw.length;

  const positionLabels = seatOrderForPlayers(numPlayers);
  const seats = orderedRaw.map((s, i) => ({
    name: s.name,
    stack: s.stack,
    isHero: s.isHero,
    isDealer: s.isDealer,
    domEl: s.domEl,
    position: positionLabels[i] || `Seat${i}`,
    pokerIndex: i,
  }));

  const heroSeat = seats.find(s => s.isHero) || null;

  const handId = detectHandBoundary(orderedRaw, (raw.board || []).length);

  return {
    variant: raw.variant,
    numPlayers,
    bigBlind: raw.bigBlind,
    pot: raw.pot,
    toCall: raw.toCall,
    holeCards: raw.holeCards || [],
    board: raw.board || [],
    seats,
    heroSeatIndex: heroSeat ? heroSeat.pokerIndex : null,
    heroPosition: heroSeat ? heroSeat.position : null,
    heroStack: heroSeat ? heroSeat.stack : null,
    handId,
    updatedAt: Date.now(),
  };
};

export const getSnapshot = () => snapshot;

export const subscribe = (fn) => {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
};

// Called by the entry point on every (debounced) DOM mutation.
export const refresh = () => {
  let next;
  try {
    next = buildSnapshot();
  } catch (err) {
    console.error('[pokernow-bridge] refresh failed:', err);
    return;
  }
  if (snapshotsEquivalent(snapshot, next)) return;
  const handChanged = snapshot.handId !== next.handId;
  snapshot = next;
  for (const fn of subscribers) {
    try { fn(snapshot, { handChanged }); } catch (err) {
      console.error('[pokernow-bridge] subscriber threw:', err);
    }
  }
};

export const reset = () => {
  snapshot = { ...EMPTY_SNAPSHOT };
  dealerNameAtHandStart = null;
  lastBoardLen = 0;
  handCounter = 0;
};
