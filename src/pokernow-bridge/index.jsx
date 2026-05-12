// Entry point — runs once when the Tampermonkey bootstrap loads this bundle
// into a Pokernow game page. Sets up the MutationObserver, mounts the React
// overlay root, and pumps state-store updates into the UI.

import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { EquityPanel } from './equity-panel';
import { HudShells } from './hud-shells';
import { PositionBadge } from './position-badge';
import { subscribe, refresh, getSnapshot } from './state-store';
import { findTableRoot, setDebug } from './dom-reader';
import { storage } from './storage';
import { drainNewEvents } from './action-log-reader';
import { applyEvent } from './stat-tracker';

const MOUNT_ID = 'pokernow-bridge-root';
const DEBOUNCE_MS = 200;

const App = () => {
  const [snapshot, setSnapshot] = useState(getSnapshot);

  useEffect(() => subscribe((s) => setSnapshot({ ...s })), []);

  return (
    <>
      <EquityPanel snapshot={snapshot} />
      <PositionBadge snapshot={snapshot} />
      <HudShells snapshot={snapshot} />
    </>
  );
};

const init = () => {
  // Re-entry guard: bootstrap might fire twice if Tampermonkey re-injects.
  if (document.getElementById(MOUNT_ID)) {
    console.warn('[pokernow-bridge] already initialized — skipping re-init');
    return;
  }

  // Schema version check (Phase 1 = "1"). Future migrations can branch here.
  if (storage.version() == null) storage.setVersion('1');

  // Debug toggle (set window.__pokernowBridgeDebug = true in console to enable).
  setDebug(!!window.__pokernowBridgeDebug);

  // Mount root.
  const root = document.createElement('div');
  root.id = MOUNT_ID;
  // Don't intercept clicks on the page itself — children opt-in via their own styles.
  root.style.cssText = 'position:absolute;top:0;left:0;width:0;height:0;pointer-events:none;';
  document.body.appendChild(root);

  // Children with their own background / cursor become pointer-events:auto via
  // their own inline styles, so this wrapper stays click-through everywhere else.
  const innerStyle = document.createElement('style');
  innerStyle.textContent = `
    #${MOUNT_ID} > * { pointer-events: auto; }
  `;
  document.head.appendChild(innerStyle);

  createRoot(root).render(<App />);

  // Initial pass — Pokernow may not be fully rendered yet, but readers are
  // defensive enough to return mostly-empty data on the first frame.
  refresh();

  // Debounced observer. Each tick: drain action-log events into stat-tracker,
  // then refresh state snapshot for the equity / HUD UI.
  let timer = null;
  const tick = () => {
    timer = null;
    try {
      const events = drainNewEvents();
      for (const ev of events) applyEvent(ev);
    } catch (err) {
      console.error('[pokernow-bridge] event drain failed:', err);
    }
    refresh();
  };
  const schedule = () => {
    if (timer) return;
    timer = setTimeout(tick, DEBOUNCE_MS);
  };

  const observerTarget = findTableRoot();
  const observer = new MutationObserver(schedule);
  observer.observe(observerTarget, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });

  // Also refresh on resize so seat anchors recompute.
  window.addEventListener('resize', schedule);

  // Periodic safety refresh — in case the observer misses something subtle
  // (e.g. canvas-rendered chip animations don't always fire mutations).
  setInterval(tick, 2000);

  console.info('[pokernow-bridge] initialized ✓');
};

// document.readyState may already be "complete" if the bootstrap waited.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
