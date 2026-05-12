// Floating equity / pot-odds / EV panel. Drag the header to reposition;
// position persists via storage. All styles are inline so Pokernow's CSS
// can't fight us.

import React, { useEffect, useMemo, useState } from 'react';
import { useDraggable } from './draggable';
import { storage } from './storage';
import { getVariant } from './variants';
import { computeEquity } from './equity-engine';

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

  // Recompute equity whenever inputs change.
  const variant = getVariant(snapshot.variant);
  const numOpponents = Math.max(0, (snapshot.numPlayers || 0) - 1);
  const holeKey = snapshot.holeCards.join(',');
  const boardKey = snapshot.board.join(',');

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
  }, [snapshot.variant, holeKey, boardKey, numOpponents, variant]);

  // Derived numbers
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

  const spr = (stack != null && pot != null && pot > 0)
    ? stack / pot
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

      {!collapsed && (
        <div style={{ padding: '8px 12px' }}>
          {!variantSupported && (
            <div style={{ color: COLORS.warn, padding: '4px 0 8px', fontSize: 12 }}>
              {variantLabel} equity not yet implemented (Phase 5).
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
