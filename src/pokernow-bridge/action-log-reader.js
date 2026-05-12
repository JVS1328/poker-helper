// Action source for Phase 2 stat tracking. Pokernow doesn't render its full
// action log inline (it's hidden behind a "Log / Ledger" button), but each
// seat exposes the latest action on the current street via a small
// `.table-player-bet-value` element. We diff that across ticks to derive
// structured events.
//
// Signals consumed:
//   - .table-player-bet-value text inside each seat → per-player action this street
//   - .table-player fold class transitions             → FOLD events
//   - board card count transitions (0/3/4/5)           → FLOP / TURN / RIVER
//   - dealer-button position changes / board reset      → NEW_HAND

const SEL = {
  allSeats: '.table-player',
  seatNum: /^table-player-(\d+)$/,
  seatName: '.table-player-name span',
  betValue: '.table-player-bet-value',
  boardCardEls: '.table-cards .card-container',
  dealerButton: '.dealer-button-ctn',
};

export const EVENTS = {
  POST_SB:   'post-sb',
  POST_BB:   'post-bb',
  POST_ANTE: 'post-ante',
  POST_DEAD: 'post-dead',
  FOLD:      'fold',
  CHECK:     'check',
  CALL:      'call',
  BET:       'bet',
  RAISE:     'raise',
  ALL_IN:    'all-in',
  SHOW:      'show',
  WIN:       'win',
  NEW_HAND:  'new-hand',
  FLOP:      'flop',
  TURN:      'turn',
  RIVER:     'river',
  SHOWDOWN:  'showdown',
  UNKNOWN:   'unknown',
};

// Parse the per-seat bet-value text into an event. Pokernow uses short strings:
//   "check", "fold", "call 50", "bet 100", "raise 200", "raise to 200",
//   "all in", "all-in", "SB 25", "BB 50", "post 50", "ante 5"
const parseBetValue = (text) => {
  if (!text) return null;
  const t = text.trim().toLowerCase();
  if (!t) return null;

  if (/^check\b/.test(t)) return { type: EVENTS.CHECK };
  if (/^fold\b/.test(t)) return { type: EVENTS.FOLD };

  // all-in is checked before bet/raise because "all in 200" contains a number too.
  if (/all[\s-]*in/.test(t)) {
    const m = t.match(/(\d[\d.,]*)/);
    return { type: EVENTS.ALL_IN, amount: m ? parseFloat(m[1].replace(/,/g, '')) : null };
  }

  let m;
  if ((m = t.match(/^(?:small blind|sb)\s*(?:of\s*)?(\d[\d.,]*)?/))) {
    return { type: EVENTS.POST_SB, amount: m[1] ? parseFloat(m[1].replace(/,/g, '')) : null };
  }
  if ((m = t.match(/^(?:big blind|bb)\s*(?:of\s*)?(\d[\d.,]*)?/))) {
    return { type: EVENTS.POST_BB, amount: m[1] ? parseFloat(m[1].replace(/,/g, '')) : null };
  }
  if ((m = t.match(/^(?:ante)\s*(?:of\s*)?(\d[\d.,]*)?/))) {
    return { type: EVENTS.POST_ANTE, amount: m[1] ? parseFloat(m[1].replace(/,/g, '')) : null };
  }
  if ((m = t.match(/^(?:missed|dead).*?(\d[\d.,]*)?/))) {
    return { type: EVENTS.POST_DEAD, amount: m[1] ? parseFloat(m[1].replace(/,/g, '')) : null };
  }
  if ((m = t.match(/^raises?\s*(?:to\s*)?(\d[\d.,]*)/))) {
    return { type: EVENTS.RAISE, amount: parseFloat(m[1].replace(/,/g, '')) };
  }
  if ((m = t.match(/^bets?\s*(\d[\d.,]*)/))) {
    return { type: EVENTS.BET, amount: parseFloat(m[1].replace(/,/g, '')) };
  }
  if ((m = t.match(/^calls?\s*(\d[\d.,]*)?/))) {
    return { type: EVENTS.CALL, amount: m[1] ? parseFloat(m[1].replace(/,/g, '')) : null };
  }
  // Single number = "post" of some kind. Default to bet.
  if ((m = t.match(/^(\d[\d.,]*)$/))) {
    return { type: EVENTS.BET, amount: parseFloat(m[1].replace(/,/g, '')) };
  }
  return { type: EVENTS.UNKNOWN, raw: text };
};

// Per-seat state we remember across ticks, keyed by Pokernow seat number.
// Reset on hand boundary so each new hand starts clean.
let seatState = {}; // { seatNum: { name, betText, folded, lastEventEmitted } }
let lastBoardLen = 0;
let lastDealerSeatNum = null;
let everSeenDealer = false;

// Reset internal state — call when we detect a hand boundary externally.
export const resetSeen = () => {
  seatState = {};
  lastBoardLen = 0;
};

const findContainer = () => document.body; // we scan the whole document
export const readLogContainer = findContainer; // kept for compatibility

const seatNumFromEl = (el) => {
  for (const c of el.classList) {
    const m = c.match(SEL.seatNum);
    if (m) return parseInt(m[1], 10);
  }
  return null;
};

const dealerSeatNum = () => {
  const btn = document.querySelector(SEL.dealerButton);
  if (!btn) return null;
  for (const c of btn.classList) {
    const m = c.match(/^dealer-position-(\d+)$/);
    if (m) return parseInt(m[1], 10);
  }
  return null;
};

// Snapshot every tick; diff against previous to emit events. Returns the
// list of new events since the last call.
export const drainNewEvents = () => {
  const events = [];
  const seats = document.querySelectorAll(SEL.allSeats);
  if (!seats.length) return events;

  // 1) Detect hand boundary: dealer button moved OR board cleared after being non-empty.
  const curDealer = dealerSeatNum();
  const curBoardLen = document.querySelectorAll(SEL.boardCardEls).length;

  let handBoundary = false;
  if (curDealer != null) {
    if (!everSeenDealer) {
      lastDealerSeatNum = curDealer;
      everSeenDealer = true;
    } else if (curDealer !== lastDealerSeatNum) {
      handBoundary = true;
      lastDealerSeatNum = curDealer;
    }
  }
  if (lastBoardLen > 0 && curBoardLen === 0) handBoundary = true;

  if (handBoundary) {
    events.push({ type: EVENTS.NEW_HAND });
    // Don't wipe seatState — that would cause the next tick to "first-sight" every
    // seat and silently drop the first action (typically the SB/BB posts that fire
    // concurrently with the dealer-button move). Instead, reset per-seat tracking
    // so the NEXT bet-value change emits normally, even if the change is from "" to
    // "SB 25" in the same tick as the hand boundary.
    for (const num of Object.keys(seatState)) {
      seatState[num].lastEventEmitted = '';
      seatState[num].folded = false;
      seatState[num].betText = '';
    }
  }

  // 2) Detect street transitions from board card count.
  if (!handBoundary) {
    if (lastBoardLen < 3 && curBoardLen >= 3) events.push({ type: EVENTS.FLOP });
    else if (lastBoardLen < 4 && curBoardLen >= 4) events.push({ type: EVENTS.TURN });
    else if (lastBoardLen < 5 && curBoardLen >= 5) events.push({ type: EVENTS.RIVER });
  }
  lastBoardLen = curBoardLen;

  // 3) Per-seat: detect new bet-value text + new fold state.
  for (const seatEl of seats) {
    const seatNum = seatNumFromEl(seatEl);
    if (seatNum == null) continue;

    const nameEl = seatEl.querySelector(SEL.seatName);
    const name = nameEl?.textContent?.trim() || null;
    if (!name) continue;

    const betEl = seatEl.querySelector(SEL.betValue);
    const betText = betEl?.textContent?.trim() || '';
    const folded = seatEl.classList.contains('fold');

    const prev = seatState[seatNum];

    if (!prev) {
      seatState[seatNum] = { name, betText, folded, lastEventEmitted: betText };
      // Don't emit on first-sight — only on transitions.
      continue;
    }

    // Update name in case it changed (rare).
    prev.name = name;

    // Fold transition.
    if (folded && !prev.folded) {
      events.push({ type: EVENTS.FOLD, player: name, raw: 'fold (class)' });
    }
    prev.folded = folded;

    // Bet-value text transition.
    if (betText && betText !== prev.lastEventEmitted) {
      const parsed = parseBetValue(betText);
      if (parsed && parsed.type !== EVENTS.UNKNOWN) {
        events.push({ ...parsed, player: name, raw: betText });
      }
      prev.lastEventEmitted = betText;
    } else if (!betText && prev.lastEventEmitted) {
      // bet-value cleared — likely a new street wiping per-player displays.
      // Don't emit anything; the street event already fired above.
      prev.lastEventEmitted = '';
    }
    prev.betText = betText;
  }

  // 4) Forget seats that disappeared (player left mid-session, rare).
  const seenNums = new Set();
  for (const seatEl of seats) {
    const n = seatNumFromEl(seatEl);
    if (n != null) seenNums.add(n);
  }
  for (const n of Object.keys(seatState)) {
    if (!seenNums.has(parseInt(n, 10))) delete seatState[n];
  }

  return events;
};
