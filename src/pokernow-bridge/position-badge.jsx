// Small position label anchored to the hero seat (BTN / SB / BB / etc.).
// Color-coded by position bucket — matches the palette PokerUI.jsx uses.

import React, { useEffect, useState } from 'react';

const BUCKET_COLOR = {
  late:   { bg: 'rgba(16, 185, 129, 0.95)', text: '#022c22' },
  middle: { bg: 'rgba(245, 158, 11, 0.95)', text: '#3f2304' },
  early:  { bg: 'rgba(249, 115, 22, 0.95)', text: '#3a1605' },
  blind:  { bg: 'rgba(244, 63, 94, 0.95)',  text: '#3f0712' },
};

const seatToBucket = (seat) => {
  if (seat === 'SB' || seat === 'BB' || seat === 'BTN/SB') return 'blind';
  if (seat === 'BTN' || seat === 'CO') return 'late';
  if (seat === 'HJ' || seat === 'MP') return 'middle';
  return 'early';
};

export const PositionBadge = ({ snapshot }) => {
  const heroSeat = snapshot.seats.find(s => s.isHero);
  const [anchor, setAnchor] = useState(null);

  useEffect(() => {
    if (!heroSeat) { setAnchor(null); return; }
    const refresh = () => {
      const r = heroSeat.domEl.getBoundingClientRect();
      setAnchor({ x: r.left + r.width / 2, y: r.top - 14 });
    };
    refresh();
    window.addEventListener('resize', refresh);
    window.addEventListener('scroll', refresh, true);
    return () => {
      window.removeEventListener('resize', refresh);
      window.removeEventListener('scroll', refresh, true);
    };
  }, [heroSeat?.domEl, heroSeat?.position]);

  if (!heroSeat || !anchor || !heroSeat.position) return null;

  const bucket = seatToBucket(heroSeat.position);
  const color = BUCKET_COLOR[bucket];

  return (
    <div
      style={{
        position: 'fixed',
        left: anchor.x,
        top: anchor.y,
        transform: 'translate(-50%, -100%)',
        background: color.bg,
        color: color.text,
        padding: '2px 8px',
        borderRadius: 999,
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.5,
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        zIndex: 8600,
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      {heroSeat.position}
    </div>
  );
};
