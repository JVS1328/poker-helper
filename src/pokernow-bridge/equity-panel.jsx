// Floating equity / pot-odds / EV panel. Drag the header to reposition;
// position persists via storage. All styles are inline so Pokernow's CSS
// can't fight us.

import React, { useEffect, useMemo, useState } from 'react';
import { useDraggable } from './draggable';
import { storage } from './storage';
import { getVariant } from './variants';
import { computeEquity } from './equity-engine';
import { computeDisplayStats, classifyBucket, subscribeStats } from './stat-tracker';
import { PokerLogic, parseCard } from '../poker-logic';

const pokerLogic = new PokerLogic();

const COLORS = {
  bg: 'rgba(20, 24, 30, 0.92)',
  bgHeader: 'rgba(10, 14, 20, 0.95)',
  border: 'rgba(255, 255, 255, 0.08)',
  text: '#e6e9ef',
  textDim: '#9aa3b2',
  good: '#34d399',
  warn: '#fbbf24',
  bad:  '#f87171',
  accent: '#60a5fa',
};

const Row = ({ label, value, valueColor, hint }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '4px 0' }}>
    <span style={{ color: COLORS.textDim, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
    <span style={{ color: valueColor || COLORS.text, fontSize: 16, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
      {value}
      {hint && <span style={{ color: COLORS.textDim, fontSize: 10, marginLeft: 6, fontWeight: 400 }}>{hint}</span>}
    </span>
  </div>
);

const fmtPct = (v) => v == null || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(1)}%`;
const fmtChips = (v) => v == null || !Number.isFinite(v) ? '—' : v.toLocaleString();
const fmtEV = (v) => v == null || !Number.isFinite(v) ? '—' :
  (v >= 0 ? `+${Math.round(v).toLocaleString()}` : Math.round(v).toLocaleString());

export const EquityPanel = ({ snapshot }) => {
  const [collapsed, setCollapsed] = useState(() => storage.get('layout:equity-panel', {}).collapsed || false);
  const [equity, setEquity] = useState(null);
  const [computing, setComputing] = useState(false);
  const [equityMode, setEquityMode] = useState(() => storage.get('settings:equityMode', 'random'));
  const [, setStatsTick] = useState(0);

  useEffect(() => subscribeStats(() => setStatsTick(t => t + 1)), []);

  const toggleMode = () => {
    setEquityMode(m => {
      const next = m === 'random' ? 'ranges' : 'random';
      storage.set('settings:equityMode', next);
      return next;
    });
  };

  const initial = useMemo(() => {
    const saved = storage.get('layout:equity-panel', {});
    return { x: saved.x ?? 24, y: saved.y ?? 96 };
  }, []);

  const { pos, handleProps } = useDraggable({
    initialPos: initial,
    onCommit: (p) => storage.set('layout:equity-panel', { ...storage.get('layout:equity-panel', {}), x: p.x, y: p.y }),
  });

  const toggleCollapsed = () => {
    setCollapsed(c => {
      const next = !c;
      storage.set('layout:equity-panel', { ...storage.get('layout:equity-panel', {}), collapsed: next });
      return next;
    });
  };

  // Recompute equity whenever inputs change. Use numInHand (excludes folded
  // players) so equity reflects the actual decision you're facing.
  const variant = getVariant(snapshot.variant);
  const numOpponents = Math.max(0, (snapshot.numInHand || snapshot.numPlayers || 0) - 1);
  const holeKey = snapshot.holeCards.join(',');
  const boardKey = snapshot.board.join(',');

  // Build opponent buckets from stats (in poker-order, skipping hero AND folded seats).
  const opponentBuckets = useMemo(() => {
    return snapshot.seats
      .filter(s => !s.isHero && !s.isFolded && s.name)
      .map(s => {
        const ds = computeDisplayStats(s.name, 5);
        return ds.stats ? classifyBucket(ds.stats.vpip, ds.hands) : 'unknown';
      });
  }, [snapshot.seats.map(s => `${s.name}:${s.isFolded ? 'F' : 'L'}`).join('|'), snapshot.handId]);

  // Range mode works as long as variant is NLHE. With no HUD data, each
  // opponent defaults to the 'unknown' bucket (40% range — a sensible
  // mid-loose default that's still more honest than vs-random's effectively-
  // 100% range). As HUD data accumulates, individual opponents get tighter
  // or wider ranges based on their actual VPIP.
  const effectiveMode = equityMode === 'ranges' && snapshot.variant === 'nlhe' ? 'ranges' : 'random';

  useEffect(() => {
    let cancelled = false;
    if (!variant) { setEquity(null); return; }
    if (!variant.supportsEquity) {
      setEquity({ equity: null, reason: 'variant-not-implemented' });
      return;
    }
    if (!snapshot.holeCards || snapshot.holeCards.length !== variant.holeCardCount) {
      setEquity(null);
      return;
    }
    if (numOpponents < 1) { setEquity(null); return; }

    setComputing(true);
    computeEquity({
      variantId: snapshot.variant,
      hole: snapshot.holeCards,
      board: snapshot.board,
      numOpponents,
      opponentBuckets: effectiveMode === 'ranges' ? opponentBuckets : null,
    }).then(r => {
      if (cancelled) return;
      setEquity(r);
      setComputing(false);
    }).catch(err => {
      if (cancelled) return;
      console.error('[pokernow-bridge] equity compute failed:', err);
      setComputing(false);
    });
    return () => { cancelled = true; };
  }, [snapshot.variant, holeKey, boardKey, numOpponents, variant, effectiveMode, opponentBuckets.join('|')]);

  // Effective stack for SPR — min of hero's stack and the deepest non-folded
  // opponent. SPR using the deeper of the two understates commitment in a
  // way that can mislead postflop decisions.
  const effectiveStack = useMemo(() => {
    const others = snapshot.seats.filter(s => !s.isHero && !s.isFolded);
    if (!others.length) return snapshot.heroStack || 0;
    const maxOther = others.reduce((m, s) => Math.max(m, s.stack || 0), 0);
    return Math.min(snapshot.heroStack || 0, maxOther || (snapshot.heroStack || 0));
  }, [snapshot.seats, snapshot.heroStack]);

  // Position relative to remaining opponents. Postflop, the BTN (pokerIndex 0)
  // acts last; otherwise the highest pokerIndex still in the hand. We compare
  // hero's effective action order to the max to determine IP.
  const heroIsIP = useMemo(() => {
    const inHand = snapshot.seats.filter(s => !s.isFolded);
    if (inHand.length <= 1) return true;
    const hero = inHand.find(s => s.isHero);
    if (!hero) return false;
    const actionOrder = s => s.pokerIndex === 0 ? Number.MAX_SAFE_INTEGER : s.pokerIndex;
    const maxAO = Math.max(...inHand.map(actionOrder));
    return actionOrder(hero) === maxAO;
  }, [snapshot.seats]);

  // Villain bet-sizing tell. `pot` from Pokernow includes the chips committed
  // this street (animations carry chips to the pot). Pot-at-time-of-bet ≈
  // displayed pot − their bet. betSizing = bet / pot_before_bet.
  const betSizing = useMemo(() => {
    const p = snapshot.pot;
    const bet = snapshot.toCall;
    if (!p || !bet || p <= bet) return null;
    return bet / (p - bet);
  }, [snapshot.pot, snapshot.toCall]);

  // Derived display numbers (depend on effectiveStack defined above).
  const pot = snapshot.pot;
  const toCall = snapshot.toCall;
  const stack = snapshot.heroStack;

  const potOdds = (pot != null && toCall != null && toCall > 0)
    ? toCall / (pot + toCall)
    : null;

  const eq = equity?.equity ?? null;
  const ev = (eq != null && pot != null && toCall != null)
    ? eq * (pot + toCall) - (1 - eq) * toCall
    : null;

  const sprStack = (effectiveStack > 0) ? effectiveStack : stack;
  const spr = (sprStack != null && pot != null && pot > 0)
    ? sprStack / pot
    : null;

  // Color the equity number relative to pot odds.
  let equityColor = COLORS.text;
  if (eq != null && potOdds != null) {
    if (eq > potOdds + 0.05) equityColor = COLORS.good;
    else if (eq < potOdds - 0.05) equityColor = COLORS.bad;
    else equityColor = COLORS.warn;
  }

  const variantLabel = variant?.label || 'Unknown';
  const variantSupported = variant?.supportsEquity;

  // Table looseness from HUD buckets — drives stealFriendly / tightenForLAG.
  // Average bucket score over non-hero non-folded opponents. Scale: nit=0,
  // tag=1, average=2, unknown=2, loose=3, whale=4.
  const tableLooseness = useMemo(() => {
    const buckets = opponentBuckets;
    if (!buckets.length) return 2;
    const W = { whale: 4, loose: 3, average: 2, tag: 1, nit: 0, unknown: 2 };
    return buckets.reduce((s, b) => s + (W[b] ?? 2), 0) / buckets.length;
  }, [opponentBuckets]);

  // Steal-friendly when the table is dominated by nits/tags (looseness < 1).
  // Tighten when LAGs / whales are present (looseness > 2.7).
  // Only applies preflop opens (CO/BTN/SB). Otherwise unused.
  const stealFriendly = tableLooseness < 1.0;
  const tightenForLAG = tableLooseness > 2.7;

  // The bucket of the preflop opener (used to size 3-bet ranges). We approximate
  // "opener" as the most recently-not-yet-folded player whose stack went down by
  // > BB — but we don't track that yet. As a proxy, if we're facing an open
  // (toCall ≈ 2-4 BB preflop), the average of the non-hero, non-folded buckets
  // approximates the opener-type pressure. For now, just hand the engine a
  // single bucket label derived from the same looseness metric.
  const openerBucket = useMemo(() => {
    if (snapshot.board.length > 0) return undefined;
    if (snapshot.toCall <= 0) return undefined;
    const bb = snapshot.bigBlind || 2;
    if (snapshot.toCall < bb * 1.5) return undefined; // limp / no real open
    if (tableLooseness < 1) return 'nit';
    if (tableLooseness < 1.7) return 'tag';
    if (tableLooseness < 2.7) return 'average';
    if (tableLooseness < 3.3) return 'loose';
    return 'whale';
  }, [tableLooseness, snapshot.toCall, snapshot.bigBlind, snapshot.board.length]);

  // Decision recommendation — reuses the standalone React app's engine. NLHE
  // only; only shown when it's hero's actual turn to act. Now also threads
  // through: heroIsIP, effectiveStack, betSizing, stealFriendly, tightenForLAG,
  // openerBucket — see PokerLogic.getDecisionFromEquity for what each affects.
  const decision = useMemo(() => {
    if (snapshot.variant !== 'nlhe') return null;
    if (snapshot.heroFolded) return null;
    if (!snapshot.heroToAct) return null;
    const parsedHole = snapshot.holeCards.map(parseCard).filter(Boolean);
    if (parsedHole.length !== 2) return null;
    const parsedBoard = snapshot.board.map(parseCard).filter(Boolean);
    if (parsedBoard.length !== snapshot.board.length) return null;
    if (!snapshot.heroPosition) return null;
    const numForDecision = Math.max(2, snapshot.numInHand || snapshot.numPlayers || 2);
    const pot = snapshot.pot ?? 0;
    const call = snapshot.toCall ?? 0;
    const stack = snapshot.heroStack ?? 0;
    const bb = snapshot.bigBlind ?? 2;

    const context = {
      heroIsIP, effectiveStack, betSizing,
      stealFriendly, tightenForLAG, openerBucket,
    };

    // Preflop: use range tables (+ context for steal/tighten/opener-bucket).
    // Engine's preflop logic ignores equity but uses the other context flags.
    if (parsedBoard.length === 0) {
      try {
        return pokerLogic.getDecisionFromEquity(
          parsedHole, parsedBoard, snapshot.heroPosition, numForDecision, pot, call, stack, bb,
          { equity: 0, iterations: 0 },
          context,
        );
      } catch (e) { return null; }
    }

    // Postflop: feed pre-computed equity (range-aware when toggle is on).
    // Fall back to engine's own MC if our equity isn't ready yet.
    if (equity && equity.equity != null) {
      try {
        return pokerLogic.getDecisionFromEquity(
          parsedHole, parsedBoard, snapshot.heroPosition, numForDecision, pot, call, stack, bb,
          { equity: equity.equity, iterations: equity.iterations || 1000 },
          context,
        );
      } catch (e) { return null; }
    }
    try {
      return pokerLogic.getDecision(parsedHole, parsedBoard, snapshot.heroPosition, numForDecision, pot, call, stack, bb);
    } catch (e) {
      return null;
    }
  }, [
    snapshot.variant, holeKey, boardKey, snapshot.heroPosition,
    snapshot.numInHand, snapshot.numPlayers, snapshot.pot, snapshot.toCall,
    snapshot.heroStack, snapshot.bigBlind, snapshot.heroFolded, snapshot.heroToAct,
    equity?.equity, equity?.mode,
    heroIsIP, effectiveStack, betSizing, stealFriendly, tightenForLAG, openerBucket,
  ]);

  const actionColors = {
    Fold:  { bg: 'rgba(248, 113, 113, 0.15)', border: COLORS.bad,    label: COLORS.bad },
    Check: { bg: 'rgba(148, 163, 184, 0.15)', border: '#94a3b8',     label: '#cbd5e1' },
    Call:  { bg: 'rgba(96, 165, 250, 0.18)',  border: COLORS.accent, label: COLORS.accent },
    Raise: { bg: 'rgba(52, 211, 153, 0.18)',  border: COLORS.good,   label: COLORS.good },
    Bet:   { bg: 'rgba(52, 211, 153, 0.18)',  border: COLORS.good,   label: COLORS.good },
  };
  const actC = decision ? (actionColors[decision.action] || actionColors.Check) : null;

  return (
    <div
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        width: 280,
        background: COLORS.bg,
        color: COLORS.text,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        boxShadow: '0 6px 24px rgba(0,0,0,0.4)',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        fontSize: 13,
        userSelect: 'none',
        zIndex: 9000,
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        {...handleProps}
        style={{
          ...handleProps.style,
          background: COLORS.bgHeader,
          padding: '8px 12px',
          borderTopLeftRadius: 8,
          borderTopRightRadius: 8,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: `1px solid ${COLORS.border}`,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 12, letterSpacing: 0.4 }}>
          🎴 Pokernow Helper · <span style={{ color: COLORS.accent }}>{variantLabel}</span>
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); toggleMode(); }}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              background: effectiveMode === 'ranges' ? 'rgba(96,165,250,0.2)' : 'transparent',
              border: `1px solid ${effectiveMode === 'ranges' ? COLORS.accent : COLORS.border}`,
              color: effectiveMode === 'ranges' ? COLORS.accent : COLORS.textDim,
              cursor: 'pointer',
              fontSize: 9,
              padding: '1px 5px',
              borderRadius: 3,
              letterSpacing: 0.5,
              textTransform: 'uppercase',
              fontWeight: 600,
            }}
            title={equityMode === 'ranges'
              ? (effectiveMode === 'ranges' ? 'Equity vs estimated ranges — click to switch to vs random' : 'Range mode on but no classified opponents yet — using random')
              : 'Equity vs random hands — click to switch to vs estimated ranges (requires HUD data)'}
          >
            vs {effectiveMode === 'ranges' ? 'rng' : 'rand'}
          </button>
          <button
            type="button"
            onClick={toggleCollapsed}
            style={{
              background: 'transparent',
              border: 'none',
              color: COLORS.textDim,
              cursor: 'pointer',
              fontSize: 14,
              padding: '0 4px',
            }}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? '▸' : '▾'}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div style={{ padding: '8px 12px' }}>
          {!variantSupported && (
            <div style={{ color: COLORS.warn, padding: '4px 0 8px', fontSize: 12 }}>
              {variantLabel} equity not yet implemented (Phase 5).
            </div>
          )}

          {/* Action recommendation — NLHE only. The decision engine reuses the
              same logic the standalone helper uses for picking Fold/Call/Raise. */}
          {decision && actC && (
            <div style={{
              background: actC.bg,
              border: `1px solid ${actC.border}`,
              borderRadius: 6,
              padding: '8px 10px',
              marginBottom: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 22, fontWeight: 700, color: actC.label, letterSpacing: 0.5 }}>
                  {decision.action}
                </span>
                {decision.amount > 0 && (
                  <span style={{ fontSize: 18, fontWeight: 600, color: COLORS.text, fontVariantNumeric: 'tabular-nums' }}>
                    {fmtChips(decision.amount)}
                  </span>
                )}
                {effectiveMode === 'ranges' && snapshot.board.length > 0 && (
                  <span style={{
                    marginLeft: 'auto', fontSize: 9, color: COLORS.accent,
                    border: `1px solid ${COLORS.accent}`,
                    padding: '0 4px', borderRadius: 3,
                    textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600,
                  }} title="Recommendation uses equity vs estimated opponent ranges">
                    rng
                  </span>
                )}
              </div>
              {decision.reasoning && (
                <div style={{ marginTop: 4, fontSize: 10, color: COLORS.textDim, lineHeight: 1.35 }}>
                  {decision.reasoning}
                </div>
              )}
            </div>
          )}
          {snapshot.heroFolded && (
            <div style={{
              background: 'rgba(148, 163, 184, 0.1)',
              border: `1px solid ${COLORS.border}`,
              borderRadius: 6,
              padding: '6px 10px',
              marginBottom: 8,
              fontSize: 11,
              color: COLORS.textDim,
              fontStyle: 'italic',
            }}>
              You folded this hand. Stats keep tracking.
            </div>
          )}

          <Row
            label="Equity"
            value={fmtPct(eq)}
            valueColor={equityColor}
            hint={computing ? '…' : equity?.iterations ? `${equity.iterations} sims` : ''}
          />
          <Row label="Pot odds" value={fmtPct(potOdds)} />
          <Row label="EV of call" value={fmtEV(ev)} valueColor={ev != null && ev > 0 ? COLORS.good : ev != null ? COLORS.bad : COLORS.text} />
          <Row label="SPR" value={spr == null ? '—' : spr.toFixed(1)} />

          <div style={{ borderTop: `1px solid ${COLORS.border}`, marginTop: 6, paddingTop: 6, fontSize: 10, color: COLORS.textDim }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Pot {fmtChips(pot)} · To call {fmtChips(toCall)}</span>
              <span>Stack {fmtChips(stack)}</span>
            </div>
            <div style={{ marginTop: 4 }}>
              {snapshot.heroPosition && <span>You: {snapshot.heroPosition}</span>}
              {snapshot.numPlayers ? <span> · {snapshot.numPlayers}-handed</span> : null}
              {snapshot.heroToAct && snapshot.board.length > 0 && (
                <span> · {heroIsIP ? 'IP' : 'OOP'}</span>
              )}
              {effectiveMode === 'ranges' && (
                <span> · vs {opponentBuckets.map(b => b[0].toUpperCase()).join('')}</span>
              )}
            </div>
            {(stealFriendly || tightenForLAG) && snapshot.board.length === 0 && (
              <div style={{ marginTop: 2, color: stealFriendly ? COLORS.good : COLORS.warn }}>
                {stealFriendly ? '🎯 Steal-friendly table (nits behind)' : '⚠ LAGs behind — tightening opens'}
              </div>
            )}
            {betSizing != null && (
              <div style={{ marginTop: 2 }}>
                Their bet is {Math.round(betSizing * 100)}% pot
                {betSizing > 1.0 ? ' (overbet — polarized)' :
                 betSizing > 0.66 ? ' (big — value-leaning)' :
                 betSizing < 0.34 ? ' (small — often weak)' : ''}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
