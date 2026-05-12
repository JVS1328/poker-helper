# Pokernow bridge — Phase 1: equity overlay + HUD shells

## Goal

Bring real-time equity / pot-odds information onto `pokernow.com/games/*` without leaving the page, and stand up the per-seat overlay framework that Phase 2+ will fill with opponent stats. Long-term target is feature parity with Equibrah Pro / "PokerNow HUD & Odds Calculator" Chrome extension. Phase 1 is the foundation; later phases add HUD stats, hand history, replayer, range analysis.

User constraint: **no Chrome extension**. The whole thing rides on a single Tampermonkey userscript.

## Scope

In (Phase 1):
- Tampermonkey bootstrap userscript that loads the main bundle from GitHub Pages.
- Bundle that, when loaded into a Pokernow game page, reads the table state from the DOM live.
- Floating, draggable equity / pot-odds panel showing: equity %, pot odds, required equity to call, SPR, EV of call.
- Per-opponent HUD overlay **shells** anchored to each seat — drag-positionable, resizable, persisted layout. No stats inside yet (placeholders only).
- Hero badge anchored to the user's own seat showing position name (BTN / SB / etc.).

Out (Phase 1, deferred to later phases):
- VPIP / PFR / 3-bet / AF / fold-to-3bet / W$SD / WTSD / etc. — Phase 2.
- Game-log polling and per-hand action recording — Phase 2 (the data source for HUD stats).
- Color-coded player types, manual notes — Phase 2.
- Hand history database, replayer — Phase 3.
- Range estimation, equity-vs-range, hand filters — Phase 4.
- Multi-table aggregation, cloud sync — Phase 5 (cloud sync requires a backend, out of scope entirely for now).

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│  pokernow.com/games/<id>  (user's browser tab)                           │
│                                                                          │
│  Tampermonkey bootstrap (committed to repo, installed once by user)      │
│    └─► fetches and evals: JVS1328.github.io/poker-helper/pokernow-bridge │
│                                       /bundle.js?v=<hash>                │
│                                                                          │
│  Main bundle (built from src/pokernow-bridge/, deployed alongside the    │
│  existing React app):                                                    │
│                                                                          │
│   ┌────────────┐   ┌─────────────┐   ┌─────────────────────┐             │
│   │ dom-reader │──►│ state-store │──►│ equity-panel        │             │
│   └────────────┘   └─────────────┘   │ (floating, draggable)│             │
│        ▲                  │          └─────────────────────┘             │
│        │                  │                                              │
│   MutationObserver        ├─────────►┌─────────────────────┐             │
│   on table root           │          │ hud-shells          │             │
│   + 200ms debounce        │          │ (one per opponent   │             │
│                           │          │  seat, anchored)    │             │
│                           │          └─────────────────────┘             │
│                           │                                              │
│                           └─────────►┌─────────────────────┐             │
│                                      │ hero-position-badge │             │
│                                      └─────────────────────┘             │
│                                                                          │
│  Persistent state: GM_setValue / GM_getValue                             │
│   • layout (panel position, HUD offsets per seat slot, opacity)          │
│   • settings (which stats slots to show, debug toggle)                   │
└──────────────────────────────────────────────────────────────────────────┘
```

Key decoupling rules:
- `dom-reader` knows about Pokernow's DOM but nothing about UI.
- `state-store` is pure JS — no DOM, no UI. Phase 2's stat tracker subscribes to it the same way the equity panel does.
- `equity-panel` and `hud-shells` are UI consumers — each subscribes to `state-store` and renders.
- The bundle does not depend on the existing React app at runtime, but **does** import card / hand-evaluator / equity math from `src/poker-logic.js` at build time.

## Components

### 1. Tampermonkey bootstrap (`tampermonkey/pokernow-bridge.user.js`)

~50 lines. Pure loader.

```js
// ==UserScript==
// @name         Pokernow Bridge
// @namespace    https://github.com/JVS1328/poker-helper
// @match        https://www.pokernow.com/games/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// ==/UserScript==

(function () {
  const BUNDLE = 'https://JVS1328.github.io/poker-helper/pokernow-bridge/bundle.js';
  const s = document.createElement('script');
  s.src = `${BUNDLE}?t=${Date.now()}`;          // cache-bust during dev; switch to ?v=<hash> for release
  s.onerror = () => console.error('[Pokernow Bridge] failed to load bundle');
  document.head.appendChild(s);
  // Expose GM_* to the bundle through a CustomEvent shim or window.__pokernowBridgeHost.
})();
```

The bundle reads/writes persistent state by talking to a small `storage-host` API the userscript exposes (since `GM_setValue` is not directly available from a `<script>` tag).

### 2. DOM reader (`src/pokernow-bridge/dom-reader.js`)

Reads, defensively, from the Pokernow DOM. Single selector table at the top, one read function per field. Each returns `null` on failure (never throws).

Initial selector guesses (must be verified against a real game on first run — see Open Questions):

```js
const SEL = {
  tableRoot:      '.table-and-chat-container, .game-container',
  heroSeat:       '.table-player.you-player',
  heroCards:      '.table-player.you-player .table-player-cards .card',
  allSeats:       '.table-player',
  seatNameInSeat: '.table-player-name span',
  seatStackInSeat:'.table-player-stack .normal-value',
  dealerChip:     '.dealer-position-img, .dealer-button',
  boardCards:     '.table-cards .card',
  potLabel:       '.table-pot-size .add-on-pot-value, .table-pot-size .value',
  callButton:     '.action-buttons .call .value, .game-decisions-ctn .call .amount',
  blindLabel:     '.blind-value-ctn .normal-value, .blinds-value',
};
```

Card parsing: Pokernow renders each card as a rank text node + a suit class (e.g. `card-h`, `suit-d`). Reader concatenates rank text with the suit-class letter, then normalizes through the existing `normalizeCard()` from `src/vlm-client.js` so the bundle emits the same `"Ah"`-style strings the rest of the codebase uses.

### 3. State store (`src/pokernow-bridge/state-store.js`)

Pure JS. Holds the current snapshot:

```ts
type Snapshot = {
  handId: string | null;                    // stable per-hand identifier; advances when dealer seat changes OR board resets
  heroSeatIndex: number | null;             // index into seatOrderForPlayers(numPlayers)
  numPlayers: number | null;
  bigBlind: number | null;
  pot: number | null;
  toCall: number | null;
  stack: number | null;
  holeCards: string[];                      // [] when face-down / preflop / folded
  board: string[];                          // 0, 3, 4, or 5
  seats: Array<{
    index: number;                          // 0 = button, 1 = SB, ..., clockwise
    name: string | null;
    stack: number | null;
    isHero: boolean;
    isDealer: boolean;
    domEl: HTMLElement;                     // for anchoring HUD shells
  }>;
  updatedAt: number;
};
```

Subscribers register with `store.subscribe(fn)` and get called whenever a meaningful field changes. The store handles its own change-detection (deep-equal on a per-field basis) so consumers don't re-render on no-op reads.

Hand boundary detection: `handId` advances when the dealer chip moves to a new seat OR when the board resets from non-empty to empty. On `handId` change, the store fires a `handReset` event before applying new state. Subscribers can react (e.g. equity panel clears, HUD shells refresh).

Note on purity: the store holds DOM references (`seats[i].domEl`) so HUD shells can anchor without a separate seat-element registry. This is a pragmatic compromise — the store remains free of *render* logic, even though it isn't entirely DOM-free.

### 4. Equity panel (`src/pokernow-bridge/equity-panel.jsx`)

Floating draggable panel. Defaults to top-right of viewport. Position persisted in GM storage.

Shows:
- **Equity %** — Monte Carlo from current hole cards vs. (numPlayers − 1) random opponents on the current board. Reuses the math in `src/poker-logic.js`. Computed in a Web Worker (see Phase 1 implementation notes) so it doesn't jank the page during 1000+ iterations.
- **Pot odds** — `toCall / (pot + toCall)`. Displayed as a %.
- **Required equity** — same as pot odds, just relabeled in the "vs. call" framing.
- **SPR** — `effectiveStack / pot` where effective = min(hero stack, largest other stack). Phase 1 simplification: use `hero stack / pot` until Phase 2 reads opponent stacks reliably.
- **EV of call (estimate)** — `equity × (pot + toCall) − (1 − equity) × toCall`.
- A small status line: "Reading… / Live / Lost connection to table DOM" so the user knows the bridge is alive.

UI library: render with React (already in repo) to keep code style consistent. The bundle does not need react-scripts at runtime — Phase 1 build step is just `esbuild` to a single IIFE bundle.

### 5. HUD shells (`src/pokernow-bridge/hud-shells.jsx`)

One floating div anchored to each opponent seat. Phase 1 content:
- Player name (read from DOM, falls back to "Seat N").
- A small "0 hands tracked" placeholder.
- 4 blank stat rows pre-allocated, hidden when empty. Phase 2 fills these with VPIP / PFR / AF / 3-bet.

Anchoring strategy:
- On every state update (debounced), recompute `getBoundingClientRect()` for each seat element.
- HUD shell position = seat top-right corner + user-saved offset `{dx, dy}` (per-seat-index, persisted).
- Drag handler updates `{dx, dy}` and persists.
- Re-anchor on window `resize` and on Pokernow's internal table animation completion (we detect this by listening to `transitionend` on the table root).

z-index: high enough to sit above the table but below modals (`z-index: 9000`). Hero seat does **not** get a HUD shell — gets a small position-name badge instead (BTN / SB / BB / etc., colored by [PokerUI.jsx](../src/components/PokerUI.jsx)'s existing `BUCKET_COLOR` palette).

### 6. Storage host shim (in the userscript)

The bundle can't call `GM_setValue` directly from a script tag. The userscript registers `window.__pokernowBridgeStorage = { get, set, delete }` that proxies to `GM_setValue`/`GM_getValue`/`GM_deleteValue` via `unsafeWindow` exposure. The bundle uses this single object for all persistence. Keys are namespaced: `pokernow-bridge:<topic>:<sub>`.

## Storage schema (Phase 1)

```
pokernow-bridge:layout:equity-panel  →  { x, y, collapsed }
pokernow-bridge:layout:hud-offsets   →  { [seatIdx]: { dx, dy } }
pokernow-bridge:settings             →  { debug, statsVisible: { vpip, pfr, ... } }
pokernow-bridge:version              →  "1"  (for future migration)
```

Phase 2 will add `pokernow-bridge:opponents:<playerName>` per-villain action histories. The Phase 1 schema is set up to leave that namespace untouched.

## Build & deployment

- New folder: `src/pokernow-bridge/`.
- New build script: `npm run build:bridge` → runs `esbuild src/pokernow-bridge/index.jsx --bundle --format=iife --target=es2020 --outfile=build/pokernow-bridge/bundle.js`.
- `npm run deploy` already publishes `build/` to GitHub Pages, so the bundle ends up at `JVS1328.github.io/poker-helper/pokernow-bridge/bundle.js`.
- The userscript file `tampermonkey/pokernow-bridge.user.js` lives in the repo and gets linked from the README for install. Tampermonkey can be configured to auto-update from the raw GitHub URL.
- esbuild is added as a devDependency. We don't disturb react-scripts which still builds the main app.

## Selectors and DOM-drift defense

Because Pokernow can change their markup any time, the design treats DOM coupling as a known liability:
- Every selector lives in one table at the top of `dom-reader.js`.
- Every reader logs `[pokernow-bridge] selector miss: <field>` to console on failure and continues. Nothing throws.
- The `debug` setting (toggled from a hidden corner of the equity panel) enables verbose logging of every read.
- An in-page status line says "DOM read OK · last 200 ms ago" so the user spots a regression immediately.

## Open questions / risks

- **Selectors are educated guesses.** The first implementation step is to load the example game (`pokernow.com/games/pglp-nFIzwoN_CChqiwRyEH5F`) in DevTools and walk through every selector, fixing the table at the top of `dom-reader.js`. Until that's done the Phase 1 code is "compiles, doesn't yet read anything."
- **Equity Monte Carlo speed.** A 1000-iteration sim with 5 opponents may take 30–80 ms on a slow laptop. Running it in a Web Worker prevents UI jank. If even that's too slow, we fall back to fewer iterations preflop (where exact preflop equity tables also exist) and increase postflop.
- **Web Worker inside a userscript bundle.** Workers need a separate script URL; the easiest path is `new Worker(URL.createObjectURL(new Blob([workerSrc], {type:'text/javascript'})))`. The worker source is bundled into the main bundle as a string. Acceptable; just need to test on Firefox + Chrome.
- **Pokernow may serve different DOM in different game modes** (cash vs. tournament, regular vs. fast-fold). Phase 1 targets the common cash-game DOM; tournament-specific tweaks can wait.
- **The pot value during chip animations.** Pokernow animates chips into the pot over ~1 s; the reported pot during the animation may temporarily lag. The 200 ms debounce smooths this somewhat; if it's still noisy we read the pot from the action log endpoint in Phase 2 instead.
- **GitHub Pages CSP / framing.** Loading `bundle.js` via `<script src>` (not iframe) is unaffected by GitHub Pages' framing headers. No issue expected.

## Hooks for Phase 2+

Phase 1 deliberately leaves these seams so Phase 2 is purely additive:
- `state-store` exposes a `subscribe(fn)` API; Phase 2's stat tracker is a new subscriber.
- HUD shells render a 4-row stat grid that's empty in Phase 1; Phase 2 fills rows by name.
- The storage namespace `pokernow-bridge:opponents:*` is reserved.
- A new module `src/pokernow-bridge/log-poller.js` is anticipated for Phase 2 to poll `/games/<id>/log` for authoritative action data.
