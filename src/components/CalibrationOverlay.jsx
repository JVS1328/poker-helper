import React, { useEffect, useRef, useState, useCallback } from 'react';
import { startCapture, isActive, getVideoElement, getSourceSize } from '../screen-capture';

const REGION_LIST = [
  { key: 'hole',  label: 'Hole cards', color: 'rgba(59, 130, 246, 0.85)',  bg: 'rgba(59, 130, 246, 0.2)' },
  { key: 'board', label: 'Board',      color: 'rgba(16, 185, 129, 0.85)',  bg: 'rgba(16, 185, 129, 0.2)' },
  { key: 'pot',   label: 'Pot',        color: 'rgba(245, 158, 11, 0.85)',  bg: 'rgba(245, 158, 11, 0.2)' },
  { key: 'stack', label: 'Your stack', color: 'rgba(244, 63, 94, 0.85)',   bg: 'rgba(244, 63, 94, 0.2)' },
];

const normalizeRect = (a, b) => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
};

const CalibrationOverlay = ({ initialRegions, onSave, onCancel }) => {
  const containerRef = useRef(null);
  const videoSlotRef = useRef(null);
  const videoRef = useRef(null);
  const [regions, setRegions] = useState(() => ({ ...(initialRegions || {}) }));
  const [activeKey, setActiveKey] = useState(REGION_LIST[0].key);
  const [drag, setDrag] = useState(null); // { startCss, currentCss }
  const [error, setError] = useState('');
  const [, forceTick] = useState(0);

  // Mount the shared <video> element into the modal so the user sees the stream.
  useEffect(() => {
    const v = getVideoElement();
    const slot = videoSlotRef.current;
    videoRef.current = v;
    if (slot && v.parentElement !== slot) {
      v.style.display = 'block';
      v.style.width = '100%';
      v.style.height = 'auto';
      v.style.maxHeight = '70vh';
      v.style.objectFit = 'contain';
      slot.appendChild(v);
    }
    return () => {
      if (v && v.parentElement === slot) slot.removeChild(v);
    };
  }, []);

  // If capture isn't running yet, kick it off.
  useEffect(() => {
    if (!isActive()) {
      startCapture().catch(err => setError(err.message || 'Could not start screen capture.'));
    }
  }, []);

  // Re-render once the stream metadata loads (so we know videoWidth/Height).
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onLoaded = () => forceTick(t => t + 1);
    v.addEventListener('loadedmetadata', onLoaded);
    v.addEventListener('resize', onLoaded);
    return () => {
      v.removeEventListener('loadedmetadata', onLoaded);
      v.removeEventListener('resize', onLoaded);
    };
  }, []);

  // Returns the rendered <video> rectangle inside its bounding box, accounting
  // for object-fit: contain letterboxing.
  const getRenderedBox = useCallback(() => {
    const v = videoRef.current;
    if (!v) return null;
    const rect = v.getBoundingClientRect();
    const { width: srcW, height: srcH } = getSourceSize();
    if (!srcW || !srcH || !rect.width || !rect.height) return null;
    const cssRatio = rect.width / rect.height;
    const srcRatio = srcW / srcH;
    let renderedW, renderedH, offsetX, offsetY;
    if (cssRatio > srcRatio) {
      renderedH = rect.height;
      renderedW = rect.height * srcRatio;
      offsetX = (rect.width - renderedW) / 2;
      offsetY = 0;
    } else {
      renderedW = rect.width;
      renderedH = rect.width / srcRatio;
      offsetX = 0;
      offsetY = (rect.height - renderedH) / 2;
    }
    return { rect, renderedW, renderedH, offsetX, offsetY };
  }, []);

  // Convert mouse-event CSS coords → fractional coords (0-1) of the source frame.
  const cssToFraction = useCallback((cssX, cssY) => {
    const box = getRenderedBox();
    if (!box) return { x: 0, y: 0 };
    const localX = cssX - box.rect.left - box.offsetX;
    const localY = cssY - box.rect.top - box.offsetY;
    return {
      x: Math.max(0, Math.min(1, localX / box.renderedW)),
      y: Math.max(0, Math.min(1, localY / box.renderedH)),
    };
  }, [getRenderedBox]);

  // Convert a fractional region → CSS pixel rect for drawing the overlay.
  const fractionToCss = useCallback((region) => {
    if (!region) return null;
    const box = getRenderedBox();
    if (!box) return null;
    return {
      left: box.offsetX + region.x * box.renderedW,
      top: box.offsetY + region.y * box.renderedH,
      width: region.w * box.renderedW,
      height: region.h * box.renderedH,
    };
  }, [getRenderedBox]);

  const handlePointerDown = (e) => {
    if (!isActive()) return;
    const startCss = { x: e.clientX, y: e.clientY };
    setDrag({ startCss, currentCss: startCss });
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const handlePointerMove = (e) => {
    if (!drag) return;
    setDrag(d => d ? { ...d, currentCss: { x: e.clientX, y: e.clientY } } : d);
  };
  const handlePointerUp = (e) => {
    if (!drag) return;
    const a = cssToFraction(drag.startCss.x, drag.startCss.y);
    const b = cssToFraction(e.clientX, e.clientY);
    const rect = normalizeRect(a, b);
    setDrag(null);
    // Reject tiny rects (treat as accidental click). Threshold is fractional —
    // 0.5% of the source's smaller dimension.
    if (rect.w < 0.005 || rect.h < 0.005) return;
    setRegions(r => ({ ...r, [activeKey]: rect }));
    const nextUnset = REGION_LIST.find(r => r.key !== activeKey && !regions[r.key]);
    if (nextUnset) setActiveKey(nextUnset.key);
  };

  const clearRegion = (key) => setRegions(r => {
    const next = { ...r };
    delete next[key];
    return next;
  });

  const allSet = REGION_LIST.every(r => regions[r.key]);
  const dragRectCss = drag ? (() => {
    const a = drag.startCss;
    const b = drag.currentCss;
    return {
      left: Math.min(a.x, b.x),
      top: Math.min(a.y, b.y),
      width: Math.abs(a.x - b.x),
      height: Math.abs(a.y - b.y),
    };
  })() : null;

  const containerRect = containerRef.current?.getBoundingClientRect();

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold text-gray-800">Calibrate screen-read regions</h2>
          <button onClick={onCancel} className="text-gray-500 hover:text-gray-800 text-xl leading-none">×</button>
        </div>

        <div className="p-4 border-b bg-gray-50 text-sm text-gray-700">
          <p className="mb-2">
            Pick a region label below, then click and drag on the preview to draw its box. Repeat for all four. You can redraw any box by selecting it again.
          </p>
          <div className="flex flex-wrap gap-2">
            {REGION_LIST.map(r => {
              const set = !!regions[r.key];
              const active = activeKey === r.key;
              return (
                <button
                  key={r.key}
                  onClick={() => setActiveKey(r.key)}
                  className={`px-3 py-1.5 rounded border-2 text-sm font-medium transition
                    ${active ? 'ring-2 ring-offset-1 ring-blue-400' : ''}
                    ${set ? 'bg-white' : 'bg-gray-100 text-gray-500'}`}
                  style={{ borderColor: r.color }}
                >
                  <span style={{ color: r.color }}>●</span>{' '}
                  {r.label} {set ? <span className="text-xs text-gray-400">✓</span> : <span className="text-xs">(not set)</span>}
                  {set && (
                    <span
                      role="button"
                      onClick={(e) => { e.stopPropagation(); clearRegion(r.key); }}
                      className="ml-2 text-xs text-gray-400 hover:text-red-600"
                    >clear</span>
                  )}
                </button>
              );
            })}
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>

        <div ref={containerRef} className="relative flex-1 overflow-auto bg-gray-900 select-none">
          <div ref={videoSlotRef} className="relative" />
          <div
            className="absolute inset-0 cursor-crosshair"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            style={{ touchAction: 'none' }}
          >
            {REGION_LIST.map(r => {
              const region = regions[r.key];
              if (!region) return null;
              const css = fractionToCss(region);
              if (!css) return null;
              return (
                <div
                  key={r.key}
                  className="absolute border-2 pointer-events-none"
                  style={{
                    left: css.left, top: css.top, width: css.width, height: css.height,
                    borderColor: r.color, background: r.bg,
                  }}
                >
                  <span
                    className="absolute -top-5 left-0 px-1 text-xs font-semibold rounded text-white"
                    style={{ background: r.color }}
                  >
                    {r.label}
                  </span>
                </div>
              );
            })}
            {dragRectCss && containerRect && (
              <div
                className="absolute border-2 border-dashed pointer-events-none"
                style={{
                  left: dragRectCss.left - containerRect.left,
                  top: dragRectCss.top - containerRect.top,
                  width: dragRectCss.width,
                  height: dragRectCss.height,
                  borderColor: REGION_LIST.find(r => r.key === activeKey)?.color || 'white',
                  background: 'rgba(255,255,255,0.1)',
                }}
              />
            )}
          </div>
        </div>

        <div className="p-4 border-t flex items-center justify-between">
          <span className="text-xs text-gray-500">
            {allSet ? 'All regions set.' : `Currently drawing: ${REGION_LIST.find(r => r.key === activeKey)?.label}`}
          </span>
          <div className="space-x-2">
            <button onClick={onCancel} className="px-3 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-100">
              Cancel
            </button>
            <button
              onClick={() => onSave(regions)}
              disabled={!allSet}
              className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CalibrationOverlay;
