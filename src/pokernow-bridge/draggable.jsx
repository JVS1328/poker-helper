// Tiny drag hook for floating overlay elements. No external deps — pointer
// events on a header element, position persisted by the caller.

import React, { useState, useRef, useEffect, useCallback } from 'react';

export const useDraggable = ({ initialPos, onCommit }) => {
  const [pos, setPos] = useState(initialPos || { x: 24, y: 24 });
  const dragging = useRef(null);

  const onPointerDown = useCallback((e) => {
    e.preventDefault();
    dragging.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseX: pos.x,
      baseY: pos.y,
    };
    e.target.setPointerCapture?.(e.pointerId);
  }, [pos.x, pos.y]);

  const onPointerMove = useCallback((e) => {
    if (!dragging.current) return;
    const dx = e.clientX - dragging.current.startX;
    const dy = e.clientY - dragging.current.startY;
    setPos({
      x: Math.max(0, dragging.current.baseX + dx),
      y: Math.max(0, dragging.current.baseY + dy),
    });
  }, []);

  const onPointerUp = useCallback((e) => {
    if (!dragging.current) return;
    dragging.current = null;
    e.target.releasePointerCapture?.(e.pointerId);
    if (onCommit) onCommit(pos);
  }, [pos, onCommit]);

  // Mirror state if parent updates initialPos (e.g. on storage load).
  useEffect(() => {
    if (initialPos) setPos(initialPos);
  }, [initialPos?.x, initialPos?.y]);

  return {
    pos,
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      style: { cursor: 'grab', touchAction: 'none' },
    },
  };
};
