// Per-opponent HUD shells. Phase 2 fills the rows with VPIP / PFR / 3B / AF
// from stat-tracker, color-tints by player-type bucket, and offers a small
// note editor on click.

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { storage } from './storage';
import { computeDisplayStats, classifyBucket, setNote, subscribeStats } from './stat-tracker';

const STORAGE_KEY = 'layout:hud-offsets';

const BUCKET_TINT = {
  whale:   { border: 'rgba(244, 114, 182, 0.85)', label: '#fbcfe8' },  // pink
  loose:   { border: 'rgba(251, 191, 36, 0.85)',  label: '#fde68a' },  // amber
  average: { border: 'rgba(148, 163, 184, 0.6)',  label: '#cbd5e1' },  // slate
  tag:     { border: 'rgba(96, 165, 250, 0.85)',  label: '#bfdbfe' },  // blue
  nit:     { border: 'rgba(52, 211, 153, 0.85)',  label: '#a7f3d0' },  // emerald
  unknown: { border: 'rgba(255, 255, 255, 0.06)', label: '#94a3b8' },
};

const BUCKET_LABEL = {
  whale: 'Whale', loose: 'Loose', average: 'Avg', tag: 'TAG', nit: 'Nit', unknown: '?',
};

const COLORS = {
  bg: 'rgba(10, 14, 20, 0.88)',
  text: '#e2e8f0',
  textDim: '#64748b',
  accent: '#60a5fa',
  warn: '#f59e0b',
};

const loadOffsets = () => storage.get(STORAGE_KEY, {});
const saveOffsets = (o) => storage.set(STORAGE_KEY, o);

const fmtPct = (v) => v == null ? '—' : `${Math.round(v * 100)}`;
const fmtAF = (v) => v == null ? '—' : v === Infinity ? '∞' : v.toFixed(1);

const HudShell = ({ seat, offsets, onCommit, statsVersion }) => {
  const [anchor, setAnchor] = useState(() => {
    const r = seat.domEl.getBoundingClientRect();
    return { x: r.right, y: r.top };
  });

  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');

  useEffect(() => {
    const handler = () => {
      const r = seat.domEl.getBoundingClientRect();
      setAnchor({ x: r.right, y: r.top });
    };
    handler();
    window.addEventListener('resize', handler);
    window.addEventListener('scroll', handler, true);
    return () => {
      window.removeEventListener('resize', handler);
      window.removeEventListener('scroll', handler, true);
    };
  }, [seat.domEl, seat.name, seat.stack]);

  const offset = offsets[seat.pokerIndex] || { dx: 0, dy: 0 };
  const drag = useRef(null);

  const onPointerDown = useCallback((e) => {
    // Only treat as drag if not interacting with the note editor.
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON') return;
    e.preventDefault();
    drag.current = {
      startX: e.clientX, startY: e.clientY,
      baseDx: offset.dx, baseDy: offset.dy,
      moved: false,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, [offset.dx, offset.dy]);

  const onPointerMove = useCallback((e) => {
    if (!drag.current) return;
    const dx = drag.current.baseDx + (e.clientX - drag.current.startX);
    const dy = drag.current.baseDy + (e.clientY - drag.current.startY);
    if (Math.abs(dx - drag.current.baseDx) + Math.abs(dy - drag.current.baseDy) > 3) drag.current.moved = true;
    onCommit(seat.pokerIndex, { dx, dy }, false);
  }, [onCommit, seat.pokerIndex]);

  const onPointerUp = useCallback((e) => {
    if (!drag.current) return;
    const final = drag.current;
    drag.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    const dx = final.baseDx + (e.clientX - final.startX);
    const dy = final.baseDy + (e.clientY - final.startY);
    onCommit(seat.pokerIndex, { dx, dy }, true);
  }, [onCommit, seat.pokerIndex]);

  // Stats — re-read on each statsVersion bump.
  const name = seat.name || `Seat ${seat.pokerIndex}`;
  const ds = seat.name ? computeDisplayStats(seat.name, 5) : { hands: 0, stats: null, profile: { notes: '' } };
  const bucket = ds.stats ? classifyBucket(ds.stats.vpip, ds.hands) : 'unknown';
  const tint = BUCKET_TINT[bucket] || BUCKET_TINT.unknown;

  const beginEditNote = (e) => {
    e.stopPropagation();
    setNoteDraft(ds.profile.notes || '');
    setEditingNote(true);
  };
  const saveNote = () => {
    if (seat.name) setNote(seat.name, noteDraft.trim());
    setEditingNote(false);
  };
  const cancelNote = () => setEditingNote(false);

  const left = anchor.x + offset.dx;
  const top = anchor.y + offset.dy;

  return (
    <div
      style={{
        position: 'fixed', left, top,
        transform: 'translate(-100%, 0)',
        background: COLORS.bg,
        color: COLORS.text,
        border: `1px solid ${tint.border}`,
        borderRadius: 6,
        padding: '4px 8px',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        fontSize: 11,
        minWidth: 110,
        maxWidth: 180,
        userSelect: 'none',
        zIndex: 8500,
        pointerEvents: 'auto',
        cursor: editingNote ? 'auto' : 'grab',
        touchAction: 'none',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      title="Drag to reposition · click name to edit note"
    >
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        borderBottom: `1px solid rgba(255,255,255,0.08)`, paddingBottom: 2, marginBottom: 2,
      }}>
        <span
          onClick={beginEditNote}
          style={{
            fontWeight: 600, color: tint.label,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            maxWidth: 110, cursor: 'pointer',
          }}
        >
          {name}
        </span>
        <span style={{ fontSize: 9, color: COLORS.textDim }}>
          {BUCKET_LABEL[bucket]} · {ds.hands}h
        </span>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0 6px',
        fontSize: 10, color: COLORS.textDim,
      }}>
        <span>VPIP</span><span style={{ textAlign: 'right', color: COLORS.text }}>{fmtPct(ds.stats?.vpip)}</span>
        <span>PFR</span><span style={{ textAlign: 'right', color: COLORS.text }}>{fmtPct(ds.stats?.pfr)}</span>
        <span>3B</span><span style={{ textAlign: 'right', color: COLORS.text }}>{fmtPct(ds.stats?.threeBet)}</span>
        <span>AF</span><span style={{ textAlign: 'right', color: COLORS.text }}>{fmtAF(ds.stats?.af)}</span>
      </div>

      {ds.profile.notes && !editingNote && (
        <div style={{
          marginTop: 4, paddingTop: 3,
          borderTop: '1px solid rgba(255,255,255,0.06)',
          fontSize: 10, color: COLORS.warn,
          maxHeight: 32, overflow: 'hidden',
        }}>
          {ds.profile.notes}
        </div>
      )}

      {editingNote && (
        <div style={{ marginTop: 4, paddingTop: 3, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <textarea
            value={noteDraft}
            autoFocus
            onChange={(e) => setNoteDraft(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              minHeight: 36,
              fontSize: 10,
              background: 'rgba(0,0,0,0.5)',
              color: COLORS.text,
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 3,
              padding: 3,
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginTop: 2 }}>
            <button type="button" onClick={cancelNote}
              style={{ fontSize: 9, background: 'transparent', color: COLORS.textDim, border: 'none', cursor: 'pointer' }}>
              cancel
            </button>
            <button type="button" onClick={saveNote}
              style={{ fontSize: 9, background: COLORS.accent, color: '#0c0c12', border: 'none', borderRadius: 2, padding: '1px 6px', cursor: 'pointer', fontWeight: 600 }}>
              save
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export const HudShells = ({ snapshot }) => {
  const [offsets, setOffsets] = useState(loadOffsets);
  const [statsVersion, setStatsVersion] = useState(0);

  // Re-render when stat-tracker emits a change.
  useEffect(() => subscribeStats(() => setStatsVersion(v => v + 1)), []);

  const commit = useCallback((pokerIndex, off, persist) => {
    setOffsets(prev => {
      const next = { ...prev, [pokerIndex]: off };
      if (persist) saveOffsets(next);
      return next;
    });
  }, []);

  return (
    <>
      {snapshot.seats
        .filter(s => !s.isHero)
        .map(s => (
          <HudShell
            key={`${s.pokerIndex}-${s.name || 'anon'}`}
            seat={s}
            offsets={offsets}
            onCommit={commit}
            statsVersion={statsVersion}
          />
        ))}
    </>
  );
};
