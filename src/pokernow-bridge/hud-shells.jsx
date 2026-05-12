// Per-opponent HUD shells. One floating box anchored to each opponent seat's
// position. Phase 1 = name + placeholder rows; Phase 2 fills the rows with
// VPIP / PFR / AF / 3-bet.

import React, { useEffect, useState, useCallback } from 'react';
import { storage } from './storage';

const STORAGE_KEY = 'layout:hud-offsets';

const COLORS = {
  bg: 'rgba(10, 14, 20, 0.85)',
  border: 'rgba(255, 255, 255, 0.06)',
  text: '#cbd5e1',
  textDim: '#64748b',
  accent: '#60a5fa',
};

const loadOffsets = () => storage.get(STORAGE_KEY, {});
const saveOffsets = (o) => storage.set(STORAGE_KEY, o);

const HudShell = ({ seat, offsets, onCommit }) => {
  // Anchor: top-right of the seat's bounding rect.
  const [anchor, setAnchor] = useState(() => {
    const r = seat.domEl.getBoundingClientRect();
    return { x: r.right, y: r.top };
  });

  // Recompute anchor on resize and on every state update from parent (it
  // re-mounts/re-renders us on each store push, so we just re-read here).
  useEffect(() => {
    const r = seat.domEl.getBoundingClientRect();
    setAnchor({ x: r.right, y: r.top });
    const handler = () => {
      const rr = seat.domEl.getBoundingClientRect();
      setAnchor({ x: rr.right, y: rr.top });
    };
    window.addEventListener('resize', handler);
    window.addEventListener('scroll', handler, true);
    return () => {
      window.removeEventListener('resize', handler);
      window.removeEventListener('scroll', handler, true);
    };
  }, [seat.domEl, seat.name, seat.stack]);

  const offset = offsets[seat.pokerIndex] || { dx: 0, dy: 0 };
  const drag = React.useRef(null);

  const onPointerDown = useCallback((e) => {
    e.preventDefault();
    drag.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseDx: offset.dx,
      baseDy: offset.dy,
    };
    e.target.setPointerCapture?.(e.pointerId);
  }, [offset.dx, offset.dy]);

  const onPointerMove = useCallback((e) => {
    if (!drag.current) return;
    const dx = drag.current.baseDx + (e.clientX - drag.current.startX);
    const dy = drag.current.baseDy + (e.clientY - drag.current.startY);
    onCommit(seat.pokerIndex, { dx, dy }, false);
  }, [onCommit, seat.pokerIndex]);

  const onPointerUp = useCallback((e) => {
    if (!drag.current) return;
    const final = drag.current;
    drag.current = null;
    e.target.releasePointerCapture?.(e.pointerId);
    const dx = final.baseDx + (e.clientX - final.startX);
    const dy = final.baseDy + (e.clientY - final.startY);
    onCommit(seat.pokerIndex, { dx, dy }, true);
  }, [onCommit, seat.pokerIndex]);

  const left = anchor.x + offset.dx;
  const top  = anchor.y + offset.dy;

  return (
    <div
      style={{
        position: 'fixed',
        left,
        top,
        transform: 'translate(-100%, 0)', // hang off the right edge of the seat
        background: COLORS.bg,
        color: COLORS.text,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 6,
        padding: '4px 8px',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        fontSize: 11,
        minWidth: 90,
        userSelect: 'none',
        zIndex: 8500,
        pointerEvents: 'auto',
        cursor: 'grab',
        touchAction: 'none',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      title="Drag to reposition"
    >
      <div style={{
        fontWeight: 600,
        color: COLORS.accent,
        borderBottom: `1px solid ${COLORS.border}`,
        paddingBottom: 2,
        marginBottom: 2,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        maxWidth: 130,
      }}>
        {seat.name || `Seat ${seat.pokerIndex}`}
      </div>
      <div style={{ color: COLORS.textDim, fontSize: 10 }}>
        {seat.position} · 0 hands
      </div>
      {/* Phase 2 fills these rows. Empty placeholders so the visual footprint
          matches what users will see later. */}
      <div style={{ marginTop: 4, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0 6px', fontSize: 10, color: COLORS.textDim }}>
        <span>VPIP</span><span style={{ textAlign: 'right' }}>—</span>
        <span>PFR</span><span style={{ textAlign: 'right' }}>—</span>
        <span>3B</span><span style={{ textAlign: 'right' }}>—</span>
        <span>AF</span><span style={{ textAlign: 'right' }}>—</span>
      </div>
    </div>
  );
};

export const HudShells = ({ snapshot }) => {
  const [offsets, setOffsets] = useState(loadOffsets);

  const commit = useCallback((pokerIndex, off, persist) => {
    setOffsets(prev => {
      const next = { ...prev, [pokerIndex]: off };
      if (persist) saveOffsets(next);
      return next;
    });
  }, []);

  // One shell per opponent seat (not the hero).
  return (
    <>
      {snapshot.seats
        .filter(s => !s.isHero)
        .map(s => (
          <HudShell key={`${s.pokerIndex}-${s.name || 'anon'}`} seat={s} offsets={offsets} onCommit={commit} />
        ))}
    </>
  );
};
