// Reads Pokernow's in-page action log (the chat-like scrolling list of
// "Alice raised to 50", "Bob folded", etc.) and emits structured events.
//
// We avoid relying on a server-side game-log endpoint because (a) auth, and
// (b) it may not be publicly accessible mid-game. The on-page log is what
// the user can see anyway, so reading the same content is honest.

const SEL = {
  // The chat / history pane. Pokernow renders log lines under one of these
  // depending on layout — fall back through them.
  logContainer: '.logs-container, .game-logs, .chat-container .messages, [class*="log"]',
  logLine: '.log-line, .log-message, .message, [class*="log-line"]',
};

// Action event types we recognize.
export const EVENTS = {
  POST_SB: 'post-sb',
  POST_BB: 'post-bb',
  POST_ANTE: 'post-ante',
  POST_DEAD: 'post-dead',
  FOLD: 'fold',
  CHECK: 'check',
  CALL: 'call',
  BET: 'bet',
  RAISE: 'raise',
  ALL_IN: 'all-in',
  SHOW: 'show',
  WIN: 'win',
  NEW_HAND: 'new-hand',
  FLOP: 'flop',
  TURN: 'turn',
  RIVER: 'river',
  SHOWDOWN: 'showdown',
  UNKNOWN: 'unknown',
};

// Parse one log line into a structured event. Returns null if the line is
// just chat / system noise we don't care about.
const RE = {
  // "Player ABC posts a small blind of 1"
  postSB:   /^"?(.+?)"?\s+posts?\s+(?:a\s+)?small\s+blind(?:\s+of)?\s+([\d.,]+)/i,
  postBB:   /^"?(.+?)"?\s+posts?\s+(?:a\s+)?big\s+blind(?:\s+of)?\s+([\d.,]+)/i,
  postAnte: /^"?(.+?)"?\s+posts?\s+(?:an?\s+)?ante(?:\s+of)?\s+([\d.,]+)/i,
  postDead: /^"?(.+?)"?\s+posts?\s+(?:a\s+)?missed\s+(?:big\s+)?blind(?:\s+of)?\s+([\d.,]+)/i,
  fold:     /^"?(.+?)"?\s+fold/i,
  check:    /^"?(.+?)"?\s+check/i,
  // "X calls 50" / "X calls"
  call:     /^"?(.+?)"?\s+calls?(?:\s+([\d.,]+))?/i,
  // "X bets 25"
  bet:      /^"?(.+?)"?\s+bets?\s+([\d.,]+)/i,
  // "X raises to 75"
  raise:    /^"?(.+?)"?\s+raises?\s+(?:to\s+)?([\d.,]+)/i,
  // "X goes all in with 200" / "X is all-in"
  allIn:    /^"?(.+?)"?\s+(?:goes?\s+all[\s-]*in|is\s+all[\s-]*in)(?:\s+with\s+([\d.,]+))?/i,
  // "X shows As Kh" / "X mucks"
  show:     /^"?(.+?)"?\s+shows?\b/i,
  // "X wins 240" / "X collected 240 from the pot"
  win:      /^"?(.+?)"?\s+(?:wins?|collect(?:ed|s))\s+([\d.,]+)/i,
  // Street markers
  newHand:  /(?:starting|new)\s+hand|hand\s+#?\d+/i,
  flop:     /^flop:|the\s+flop\s+is/i,
  turn:     /^turn:|the\s+turn\s+is/i,
  river:    /^river:|the\s+river\s+is/i,
  showdown: /showdown|reveals?\s+cards/i,
};

const num = (s) => {
  if (!s) return null;
  const n = parseFloat(s.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : null;
};

export const parseLogLine = (text) => {
  if (!text) return null;
  const t = text.replace(/\s+/g, ' ').trim();
  let m;

  if ((m = t.match(RE.postSB)))   return { type: EVENTS.POST_SB,   player: m[1], amount: num(m[2]) };
  if ((m = t.match(RE.postBB)))   return { type: EVENTS.POST_BB,   player: m[1], amount: num(m[2]) };
  if ((m = t.match(RE.postAnte))) return { type: EVENTS.POST_ANTE, player: m[1], amount: num(m[2]) };
  if ((m = t.match(RE.postDead))) return { type: EVENTS.POST_DEAD, player: m[1], amount: num(m[2]) };
  if ((m = t.match(RE.fold)))     return { type: EVENTS.FOLD,      player: m[1] };
  if ((m = t.match(RE.check)))    return { type: EVENTS.CHECK,     player: m[1] };
  if ((m = t.match(RE.raise)))    return { type: EVENTS.RAISE,     player: m[1], amount: num(m[2]) };
  if ((m = t.match(RE.bet)))      return { type: EVENTS.BET,       player: m[1], amount: num(m[2]) };
  if ((m = t.match(RE.call)))     return { type: EVENTS.CALL,      player: m[1], amount: num(m[2]) };
  if ((m = t.match(RE.allIn)))    return { type: EVENTS.ALL_IN,    player: m[1], amount: num(m[2]) };
  if ((m = t.match(RE.show)))     return { type: EVENTS.SHOW,      player: m[1] };
  if ((m = t.match(RE.win)))      return { type: EVENTS.WIN,       player: m[1], amount: num(m[2]) };

  if (RE.flop.test(t))     return { type: EVENTS.FLOP };
  if (RE.turn.test(t))     return { type: EVENTS.TURN };
  if (RE.river.test(t))    return { type: EVENTS.RIVER };
  if (RE.showdown.test(t)) return { type: EVENTS.SHOWDOWN };
  if (RE.newHand.test(t))  return { type: EVENTS.NEW_HAND };

  return null;
};

// Track which log lines we've already processed so we only emit new events.
let seenKeys = new Set();
let lastFlush = 0;

const lineKey = (el, text) => {
  // Pokernow doesn't put stable IDs on log lines, so we hash element index
  // within the container + text. Good enough — if the user clears chat the
  // worst case is we'd re-emit old events (we reset seenKeys on hand boundary).
  const parent = el.parentElement;
  const idx = parent ? Array.from(parent.children).indexOf(el) : -1;
  return `${idx}::${text.slice(0, 80)}`;
};

const findContainer = () => document.querySelector(SEL.logContainer);

export const readLogContainer = () => findContainer();

// Returns the list of newly-seen events since the last call.
export const drainNewEvents = () => {
  const container = findContainer();
  if (!container) return [];
  const lines = container.querySelectorAll(SEL.logLine);
  if (!lines.length) return [];

  const events = [];
  for (const el of lines) {
    const text = el.textContent?.trim();
    if (!text) continue;
    const key = lineKey(el, text);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    const ev = parseLogLine(text);
    if (ev) events.push({ ...ev, raw: text });
  }

  // Prune seenKeys periodically so it doesn't grow forever (Pokernow can
  // produce hundreds of log lines per session). Keep last 500.
  if (seenKeys.size > 500 && Date.now() - lastFlush > 30_000) {
    const toKeep = Array.from(seenKeys).slice(-300);
    seenKeys = new Set(toKeep);
    lastFlush = Date.now();
  }

  return events;
};

export const resetSeen = () => { seenKeys = new Set(); };
