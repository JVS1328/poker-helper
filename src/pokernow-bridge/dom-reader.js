// Pokernow DOM reader. Every selector lives in SEL below — patch here when
// Pokernow changes their markup. Every reader is defensive: a miss logs to
// console and returns null instead of throwing.
//
// First-run note: these selectors are educated guesses cross-referenced with
// public discussion of PokerNow's structure. Run with `debug: true` in the
// settings panel to see exactly what each reader is finding (and missing).

import { normalizeCard } from '../vlm-client';

const SEL = {
  // Root we observe with MutationObserver
  tableRoot: '.game-main-container, .table-and-chat-container, [class*="game-container"]',

  // Per-seat — Pokernow uses .table-player.table-player-{N} for each seat
  allSeats: '.table-player',
  heroSeat: '.table-player.you-player',
  seatName: '.table-player-name span',
  seatStack: '.table-player-stack .normal-value',
  seatStackFraction: '.table-player-stack .fraction-value',

  // Dealer button — sibling of seats, not inside them. Class .dealer-position-{N}
  // identifies which seat number is the dealer.
  dealerButton: '.dealer-button-ctn',

  // Cards live in .card-container elements; the .card element inside is just
  // the visual face. Face-up cards have class .flipped on the container.
  heroCardEls: '.table-player.you-player .table-player-cards .card-container',
  boardCardEls: '.table-cards .card-container',

  // Pot
  potLabel: '.table-pot-size .add-on-pot-value, .table-pot-size .normal-value, .table-pot-size .value',

  // Action buttons live inside .game-decisions-ctn > .action-buttons. The call
  // button is BUTTON.action-button.call (text contains "Call 400" etc.).
  callButton: '.game-decisions-ctn .action-buttons button.action-button.call, .game-decisions-ctn .action-buttons button.call, .action-buttons .call',

  // Blinds (table title bar) — Pokernow shows two .normal-value spans for SB/BB.
  blindLabel: '.blind-value-ctn .normal-value, .blinds-value, [class*="blind"] .normal-value',

  // Variant label (title)
  variantLabel: '.gameplay-type, [class*="variant"], [class*="game-type"]',
};

let debugMode = false;
export const setDebug = (v) => { debugMode = !!v; };
const miss = (field) => {
  if (debugMode) console.warn(`[pokernow-bridge] selector miss: ${field}`);
  return null;
};

const $$ = (root, sel) => Array.from(root.querySelectorAll(sel));
const $ = (root, sel) => root.querySelector(sel);

// --- Card parsing ---------------------------------------------------------

// Pokernow encodes the card on a .card-container element with classes like:
//   "card-container card-s  card-s-K flipped big"
//   → card-s     suit = spades
//   → card-s-K   suit = spades, rank = K
//   → flipped    card is face-up (visible)
// When a card is face-down or empty, those rank/suit classes are absent.

const RANK_FROM_TEXT = (text) => {
  if (!text) return null;
  const t = text.trim().toUpperCase();
  if (t === '10') return 'T';
  if (/^[2-9TJQKA]$/.test(t)) return t;
  return null;
};

const readCardEl = (containerEl) => {
  if (!containerEl) return null;
  const cls = Array.from(containerEl.classList);

  // Primary path: card-{suit}-{rank} class. Suit comes first, rank second.
  for (const c of cls) {
    const m = c.match(/^card-([hdsc])-(10|[2-9TJQKA])$/i);
    if (m) {
      const suit = m[1].toLowerCase();
      const rank = m[2] === '10' ? 'T' : m[2].toUpperCase();
      return normalizeCard(`${rank}${suit}`);
    }
  }

  // Fallback: rank from .value span, suit from .suit span (not .sub-suit).
  const rankText = containerEl.querySelector('.value')?.textContent;
  const suitText = containerEl.querySelector('.suit:not(.sub-suit)')?.textContent;
  const rank = RANK_FROM_TEXT(rankText?.trim());
  const suit = suitText?.trim()?.toLowerCase();
  if (rank && suit && /^[hdsc]$/.test(suit)) {
    return normalizeCard(`${rank}${suit}`);
  }

  return null;
};

// --- Number parsing -------------------------------------------------------

// "1,234" → 1234. "1.5K" → 1500. "Call $20" → 20. null on garbage.
export const parseAmount = (text) => {
  if (!text) return null;
  const cleaned = text.replace(/[^\d.,KkMm]/g, '');
  if (!cleaned) return null;
  const mult = /[Kk]$/.test(cleaned) ? 1000 : /[Mm]$/.test(cleaned) ? 1_000_000 : 1;
  const num = parseFloat(cleaned.replace(/[KkMm,]/g, ''));
  if (!Number.isFinite(num)) return null;
  return Math.round(num * mult);
};

// --- Public readers -------------------------------------------------------

export const findTableRoot = () => document.querySelector(SEL.tableRoot) || document.body;

export const readVariant = () => {
  const el = document.querySelector(SEL.variantLabel);
  if (!el) return 'nlhe'; // safe default; most Pokernow games are NLHE
  const text = el.textContent?.toLowerCase() || '';
  if (text.includes('plo5') && text.includes('hi')) return 'plo5-hi-lo';
  if (text.includes('plo5')) return 'plo5';
  if (text.includes('plo')  && text.includes('hi')) return 'plo-hi-lo';
  if (text.includes('plo')) return 'plo';
  return 'nlhe';
};

export const readHeroCards = () => {
  const els = $$(document, SEL.heroCardEls);
  if (!els.length) return [];
  const cards = els.map(readCardEl).filter(Boolean);
  // If Pokernow renders 2 face-down placeholders we'll get 0 valid cards back — that's fine.
  return cards;
};

export const readBoard = () => {
  const els = $$(document, SEL.boardCardEls);
  if (!els.length) return [];
  return els.map(readCardEl).filter(Boolean);
};

export const readPot = () => {
  const el = document.querySelector(SEL.potLabel);
  if (!el) return miss('pot');
  return parseAmount(el.textContent);
};

export const readToCall = () => {
  const el = document.querySelector(SEL.callButton);
  if (el) {
    const n = parseAmount(el.textContent);
    if (n != null) return n;
  }
  const buttons = document.querySelectorAll('.game-decisions-ctn .action-buttons button, .game-decisions-ctn .action-buttons [role="button"]');
  for (const b of buttons) {
    const txt = b.textContent || '';
    if (/\bcall\b/i.test(txt)) {
      const n = parseAmount(txt);
      if (n != null) return n;
    }
  }
  return 0; // no call button visible = nothing owed (check is free)
};

// True when the hero has actionable buttons in front of them — i.e., it's
// hero's turn. We look for any action button (call/check/fold/raise/bet) inside
// .game-decisions-ctn .action-buttons.
export const readHeroToAct = () => {
  const buttons = document.querySelectorAll('.game-decisions-ctn .action-buttons button, .game-decisions-ctn .action-buttons [role="button"]');
  if (!buttons.length) return false;
  for (const b of buttons) {
    if (b.offsetParent === null) continue; // hidden via display:none / detached
    const cls = Array.from(b.classList);
    if (cls.some(c => /^(call|check|fold|raise|bet|all-?in|all\s*in)$/i.test(c))) return true;
    const txt = (b.textContent || '').toLowerCase();
    if (/\b(call|check|fold|raise|bet|all[\s-]?in)\b/.test(txt)) return true;
  }
  return false;
};

export const readBigBlind = () => {
  const el = document.querySelector(SEL.blindLabel);
  if (!el) return miss('bigBlind');
  // Blinds usually render as "1 / 2" — grab the larger number.
  const matches = el.textContent?.match(/[\d.]+/g);
  if (!matches?.length) return null;
  const nums = matches.map(parseFloat).filter(n => Number.isFinite(n));
  return nums.length ? Math.max(...nums) : null;
};

// Extract Pokernow's seat number from a seat element's class list.
// Seats have a class like "table-player-1", "table-player-5" — that's the
// stable seat ID Pokernow uses to position the dealer button.
const seatNumberFromEl = (el) => {
  for (const c of el.classList) {
    const m = c.match(/^table-player-(\d+)$/);
    if (m) return parseInt(m[1], 10);
  }
  return null;
};

// Returns the seat number where the dealer button is sitting this hand, or null.
const readDealerSeatNumber = () => {
  const btn = document.querySelector(SEL.dealerButton);
  if (!btn) return null;
  for (const c of btn.classList) {
    const m = c.match(/^dealer-position-(\d+)$/);
    if (m) return parseInt(m[1], 10);
  }
  return null;
};

// Returns array of seat snapshots in DOM order (NOT poker order).
export const readSeats = () => {
  const els = $$(document, SEL.allSeats);
  const dealerSeatNum = readDealerSeatNumber();
  return els.map((el, i) => {
    const nameEl = el.querySelector(SEL.seatName);
    const stackEl = el.querySelector(SEL.seatStack);
    const seatNum = seatNumberFromEl(el);
    return {
      domEl: el,
      name: nameEl?.textContent?.trim() || null,
      stack: parseAmount(stackEl?.textContent),
      isHero: el.classList.contains('you-player'),
      isDealer: seatNum != null && seatNum === dealerSeatNum,
      isFolded: el.classList.contains('fold'),
      seatNum,
      domOrderIndex: i,
    };
  });
};

// Walks seats clockwise starting from the dealer to produce poker-order seats.
// poker-order: 0 = BTN, 1 = SB, 2 = BB, 3 = UTG, ... (matches PokerUI.jsx).
// Pokernow lays out seats in fixed positions; clockwise order in DOM is not
// guaranteed, so we use the angle of each seat element around the table center.
export const orderSeatsClockwiseFromDealer = (seats) => {
  if (!seats.length) return [];
  // Compute table center as the centroid of all seat rects.
  let cx = 0, cy = 0;
  const rects = seats.map(s => s.domEl.getBoundingClientRect());
  for (const r of rects) { cx += r.left + r.width / 2; cy += r.top + r.height / 2; }
  cx /= seats.length; cy /= seats.length;

  // Compute angle for each seat in [0, 2π), with 0 at "12 o'clock" growing clockwise.
  const withAngle = seats.map((s, i) => {
    const r = rects[i];
    const x = r.left + r.width / 2 - cx;
    const y = r.top  + r.height / 2 - cy;
    // atan2(x, -y) puts 12 o'clock at 0 and grows clockwise.
    let a = Math.atan2(x, -y);
    if (a < 0) a += Math.PI * 2;
    return { ...s, angle: a };
  });

  // Find dealer.
  const dealer = withAngle.find(s => s.isDealer);
  if (!dealer) {
    // No dealer chip visible (e.g. between hands). Return DOM order.
    return withAngle.sort((a, b) => a.angle - b.angle);
  }
  // Sort clockwise starting from dealer.
  return withAngle
    .map(s => ({ ...s, rel: (s.angle - dealer.angle + Math.PI * 2) % (Math.PI * 2) }))
    .sort((a, b) => a.rel - b.rel);
};

// --- Top-level snapshot ---------------------------------------------------

// Returns a partial Snapshot (the State store fills in derived fields).
export const readSnapshot = () => {
  const rawSeats = readSeats();
  const ordered = orderSeatsClockwiseFromDealer(rawSeats);

  return {
    variant: readVariant(),
    holeCards: readHeroCards(),
    board: readBoard(),
    pot: readPot(),
    toCall: readToCall(),
    heroToAct: readHeroToAct(),
    bigBlind: readBigBlind(),
    seatsRaw: rawSeats,
    seatsOrdered: ordered, // ordered[0] is BTN, ordered[1] is SB, etc.
  };
};
