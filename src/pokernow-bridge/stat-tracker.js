// Per-opponent stat tracker. Consumes events from action-log-reader and
// maintains a per-hand transcript; at the end of each hand we tally
// counters into persistent per-player profiles stored in GM storage.
//
// Stats produced (per opponent):
//   hands                 — # of hands the player participated in
//   vpip                  — Voluntarily Put $ In Pot (%) — open-limp/call/raise preflop
//   pfr                   — PreFlop Raise (%)
//   threeBet              — 3-bet %, given the opportunity (faced an open raise, didn't act yet)
//   foldTo3Bet            — folded to 3-bet given that we opened
//   cBet                  — c-bet flop %, given preflop aggressor + saw flop
//   foldToCBet            — folded to c-bet given we were preflop caller + faced one
//   af                    — Aggression Factor: (bets + raises) / calls postflop
//   wtsd                  — Went To ShowDown (%)
//   wsd                   — Won at ShowDown (%) — of hands where we went to SD
//   limp                  — % of voluntary preflop entries that are limps
//
// Numerator and denominator (`*_opp`) live in storage so the percentages stay
// honest as more data comes in.

import { storage } from './storage';
import { EVENTS } from './action-log-reader';

const STORAGE_PREFIX = 'opponents';

// Cross-tab sync: when another Pokernow tab updates an opponent profile
// (because the same player is at multiple of our open tables), our HUD
// should refresh. We register the listener at module load — there's
// exactly one of these per bundle instance.
let crossTabReady = false;
const ensureCrossTabSubscription = () => {
  if (crossTabReady) return;
  crossTabReady = true;
  try {
    storage.subscribePrefix(STORAGE_PREFIX, (key, oldV, newV, remote) => {
      if (!remote) return; // own-tab writes are notified via notifyChange already
      const playerName = key.slice(STORAGE_PREFIX.length + 1);
      for (const fn of subscribers) {
        try { fn(playerName); } catch (e) { console.error('[stat-tracker] cross-tab subscriber threw', e); }
      }
    });
  } catch (e) {
    console.warn('[stat-tracker] cross-tab subscription unavailable:', e?.message || e);
  }
};

const blankProfile = () => ({
  hands_opp: 0, hands: 0,
  vpip_opp: 0, vpip: 0,
  pfr_opp: 0, pfr: 0,
  threeBet_opp: 0, threeBet: 0,
  foldTo3Bet_opp: 0, foldTo3Bet: 0,
  cBet_opp: 0, cBet: 0,
  foldToCBet_opp: 0, foldToCBet: 0,
  af_bets_raises: 0, af_calls: 0,
  wtsd_opp: 0, wtsd: 0,
  wsd_opp: 0, wsd: 0,
  limps_opp: 0, limps: 0,
  notes: '',
  updatedAt: 0,
});

const loadProfile = (name) => {
  const stored = storage.get(`${STORAGE_PREFIX}:${name}`, null);
  return stored ? { ...blankProfile(), ...stored } : blankProfile();
};

const saveProfile = (name, profile) => {
  storage.set(`${STORAGE_PREFIX}:${name}`, { ...profile, updatedAt: Date.now() });
};

// ---------- Hand transcript ----------------------------------------------

const newTranscript = () => ({
  street: 'preflop',
  players: {},        // name -> { actions: { preflop: [], flop: [], turn: [], river: [] }, stillIn, postedBlind, showed, wonAmount }
  preflopRaiseCount: 0,
  preflopOpener: null,        // first raiser preflop
  preflopThreeBetter: null,   // second raiser preflop (3-bettor)
  flopAggressor: null,        // first bettor on the flop
  flopFacedBet: new Set(),    // players who faced a bet on flop
  endedShowdown: false,
});

let transcript = newTranscript();
const subscribers = new Set();

export const subscribeStats = (fn) => {
  ensureCrossTabSubscription();
  subscribers.add(fn);
  return () => subscribers.delete(fn);
};

const notifyChange = (name) => {
  for (const fn of subscribers) {
    try { fn(name); } catch (e) { console.error('[stat-tracker] subscriber threw', e); }
  }
};

const ensurePlayer = (name) => {
  if (!transcript.players[name]) {
    transcript.players[name] = {
      actions: { preflop: [], flop: [], turn: [], river: [] },
      stillIn: true,
      postedBlind: false,
      showed: false,
      wonAmount: 0,
    };
  }
  return transcript.players[name];
};

const pushAction = (name, type, amount) => {
  const p = ensurePlayer(name);
  const street = transcript.street;
  if (!p.actions[street]) p.actions[street] = [];
  p.actions[street].push({ type, amount });
};

// ---------- Tally a completed hand ---------------------------------------

export const tallyHand = () => {
  for (const [name, p] of Object.entries(transcript.players)) {
    // Was this player actually dealt in? They had to post a blind OR take a preflop action.
    const preflopActions = p.actions.preflop || [];
    const dealtIn = p.postedBlind || preflopActions.length > 0;
    if (!dealtIn) continue;

    const profile = loadProfile(name);
    profile.hands_opp += 1; profile.hands += 1;

    // VPIP — any voluntary action (call/bet/raise/all-in) preflop excluding blind posts.
    const voluntary = preflopActions.filter(a =>
      a.type === EVENTS.CALL || a.type === EVENTS.BET ||
      a.type === EVENTS.RAISE || a.type === EVENTS.ALL_IN
    );
    profile.vpip_opp += 1;
    if (voluntary.length > 0) profile.vpip += 1;

    // PFR — any RAISE (or BET, treating opening bet as raise) preflop.
    profile.pfr_opp += 1;
    const raisedPreflop = preflopActions.some(a =>
      a.type === EVENTS.RAISE || a.type === EVENTS.BET
    );
    if (raisedPreflop) profile.pfr += 1;

    // Limp — open-limp = first voluntary action was a CALL (no raise before).
    if (voluntary.length > 0) {
      profile.limps_opp += 1;
      const firstVol = voluntary[0];
      const indexOfFirstVol = preflopActions.indexOf(firstVol);
      const earlierRaise = preflopActions.slice(0, indexOfFirstVol).some(a =>
        a.type === EVENTS.RAISE || a.type === EVENTS.BET);
      if (firstVol.type === EVENTS.CALL && !earlierRaise) profile.limps += 1;
    }

    // 3-bet opportunity = there was already a RAISE before this player's
    // first voluntary preflop action.
    const firstActionIdx = preflopActions.findIndex(a =>
      a.type !== EVENTS.POST_SB && a.type !== EVENTS.POST_BB &&
      a.type !== EVENTS.POST_ANTE && a.type !== EVENTS.POST_DEAD);
    if (firstActionIdx !== -1) {
      const before = preflopActions.slice(0, firstActionIdx);
      const wasOpenRaiseBefore = before.some(a => a.type === EVENTS.RAISE || a.type === EVENTS.BET);
      if (wasOpenRaiseBefore) {
        profile.threeBet_opp += 1;
        const first = preflopActions[firstActionIdx];
        if (first.type === EVENTS.RAISE || first.type === EVENTS.BET) profile.threeBet += 1;
      }
    }

    // Fold-to-3bet: this player opened preflop AND then folded to a 3-bet.
    if (transcript.preflopOpener === name && transcript.preflopThreeBetter && transcript.preflopThreeBetter !== name) {
      profile.foldTo3Bet_opp += 1;
      const foldedAfter3Bet = preflopActions.some(a => a.type === EVENTS.FOLD);
      if (foldedAfter3Bet) profile.foldTo3Bet += 1;
    }

    // C-bet: preflop aggressor saw the flop and bet.
    const sawFlop = (p.actions.flop || []).length > 0;
    if (transcript.preflopOpener === name && sawFlop) {
      profile.cBet_opp += 1;
      const betOnFlop = (p.actions.flop || []).some(a => a.type === EVENTS.BET || a.type === EVENTS.RAISE);
      if (betOnFlop) profile.cBet += 1;
    }

    // Fold-to-cbet: player was preflop caller (not opener), and on the flop
    // faced a bet and folded.
    const wasPreflopCaller = voluntary.length > 0 && transcript.preflopOpener !== name;
    if (wasPreflopCaller && transcript.flopAggressor && transcript.flopAggressor !== name && transcript.flopFacedBet.has(name)) {
      profile.foldToCBet_opp += 1;
      const flopFold = (p.actions.flop || []).some(a => a.type === EVENTS.FOLD);
      if (flopFold) profile.foldToCBet += 1;
    }

    // Aggression Factor — postflop only. Bets+raises in numerator, calls in denominator.
    for (const street of ['flop', 'turn', 'river']) {
      for (const a of (p.actions[street] || [])) {
        if (a.type === EVENTS.BET || a.type === EVENTS.RAISE) profile.af_bets_raises += 1;
        else if (a.type === EVENTS.CALL) profile.af_calls += 1;
      }
    }

    // WTSD — went to showdown (saw river AND showed cards OR the hand reached showdown
    // with this player still in).
    if (transcript.endedShowdown) {
      // Approximation: anyone who acted on the river and didn't fold.
      const riverActs = p.actions.river || [];
      const foldedRiver = riverActs.some(a => a.type === EVENTS.FOLD);
      const tookRiverAction = riverActs.length > 0;
      if (tookRiverAction || p.showed) {
        profile.wtsd_opp += 1;
        if (!foldedRiver) {
          profile.wtsd += 1;
          // W$SD — won the showdown.
          profile.wsd_opp += 1;
          if (p.wonAmount > 0) profile.wsd += 1;
        }
      }
    }

    saveProfile(name, profile);
    notifyChange(name);
  }
};

// ---------- Apply incoming events ----------------------------------------

export const applyEvent = (ev) => {
  const t = transcript;
  const name = ev.player;

  switch (ev.type) {
    case EVENTS.NEW_HAND: {
      // Boundary — tally previous hand, reset.
      tallyHand();
      transcript = newTranscript();
      return;
    }

    case EVENTS.POST_SB:
    case EVENTS.POST_BB:
    case EVENTS.POST_ANTE:
    case EVENTS.POST_DEAD: {
      const p = ensurePlayer(name);
      p.postedBlind = true;
      pushAction(name, ev.type, ev.amount);
      return;
    }

    case EVENTS.FLOP: t.street = 'flop'; return;
    case EVENTS.TURN: t.street = 'turn'; return;
    case EVENTS.RIVER: t.street = 'river'; return;
    case EVENTS.SHOWDOWN: t.endedShowdown = true; return;

    case EVENTS.FOLD: {
      const p = ensurePlayer(name);
      p.stillIn = false;
      pushAction(name, ev.type);
      return;
    }

    case EVENTS.CHECK:
    case EVENTS.CALL: {
      pushAction(name, ev.type, ev.amount);
      // On flop, mark this player as having faced a bet if there was a prior bet/raise.
      if (t.street === 'flop' && ev.type === EVENTS.CALL) t.flopFacedBet.add(name);
      return;
    }

    case EVENTS.BET:
    case EVENTS.RAISE:
    case EVENTS.ALL_IN: {
      pushAction(name, ev.type, ev.amount);
      if (t.street === 'preflop' && ev.type !== EVENTS.ALL_IN) {
        if (t.preflopRaiseCount === 0) t.preflopOpener = name;
        else if (t.preflopRaiseCount === 1 && t.preflopThreeBetter == null) t.preflopThreeBetter = name;
        t.preflopRaiseCount += 1;
      }
      if (t.street === 'flop' && (ev.type === EVENTS.BET || ev.type === EVENTS.RAISE)) {
        if (!t.flopAggressor) t.flopAggressor = name;
        // Anyone who hadn't already bet on this flop is now facing a bet.
        for (const other of Object.keys(t.players)) {
          if (other !== name) t.flopFacedBet.add(other);
        }
      }
      return;
    }

    case EVENTS.SHOW: {
      const p = ensurePlayer(name);
      p.showed = true;
      return;
    }

    case EVENTS.WIN: {
      const p = ensurePlayer(name);
      p.wonAmount += (ev.amount || 0);
      return;
    }

    default: return;
  }
};

// ---------- Public read API ----------------------------------------------

export const getProfile = (name) => loadProfile(name);

// Pct helpers — `n/d` with N/A when sample too small.
export const pct = (n, d, minSamples = 0) => {
  if (!d || d < minSamples) return null;
  return n / d;
};

// Returns a render-friendly stat block.
export const computeDisplayStats = (name, minHands = 5) => {
  const p = loadProfile(name);
  if (p.hands < minHands) {
    return { hands: p.hands, stats: null, profile: p };
  }
  return {
    hands: p.hands,
    stats: {
      vpip:        pct(p.vpip, p.vpip_opp),
      pfr:         pct(p.pfr, p.pfr_opp),
      threeBet:    pct(p.threeBet, p.threeBet_opp, 3),
      foldTo3Bet:  pct(p.foldTo3Bet, p.foldTo3Bet_opp, 3),
      cBet:        pct(p.cBet, p.cBet_opp, 3),
      foldToCBet:  pct(p.foldToCBet, p.foldToCBet_opp, 3),
      af:          (p.af_calls > 0) ? (p.af_bets_raises / p.af_calls) : (p.af_bets_raises > 0 ? Infinity : null),
      wtsd:        pct(p.wtsd, p.wtsd_opp),
      wsd:         pct(p.wsd, p.wsd_opp, 3),
      limps:       pct(p.limps, p.limps_opp),
    },
    profile: p,
  };
};

// Classify into Whale / Loose / Average / TAG / Nit using the spec's bucket thresholds.
export const classifyBucket = (vpip, hands) => {
  if (hands == null || hands < 15 || vpip == null) return 'unknown';
  const v = vpip * 100;
  if (v >= 55) return 'whale';
  if (v >= 35) return 'loose';
  if (v >= 22) return 'average';
  if (v >= 14) return 'tag';
  return 'nit';
};

export const setNote = (name, note) => {
  const p = loadProfile(name);
  p.notes = note;
  saveProfile(name, p);
  notifyChange(name);
};
