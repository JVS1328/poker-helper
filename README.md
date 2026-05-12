# Poker Decision Helper

A React-based real-time poker assistant. Pick your hole cards, deal the streets as the hand plays out, and get recommended actions backed by Monte Carlo equity simulation and per-seat preflop range tables.

Built for online cash games — fast input, no "Calculate" button, sane defaults that persist across sessions.

## Features

### Decision engine
- **Per-seat preflop ranges** — separate opening ranges for UTG, MP, HJ, CO, BTN, SB; auto-detects whether you're opening, facing a raise, facing a 3-bet, or facing a 4-bet by comparing `currentBet` to the big blind, then picks from the appropriate range (open / 3-bet / call-raise / 4-bet).
- **Real bet sizing** — opens at 3 BB, 3-bets ~3× the prior raise, 4-bets ~2.3× the 3-bet, postflop value bets sized off pot odds and equity.
- **Monte Carlo equity** — 1200 simulations of your hand vs. random opponent hands, run on every state change. Shown as a live `Equity: XX.X%` next to the recommendation.
- **Postflop decisions vs. pot odds** — calls when equity beats the price (with a multiway buffer), raises when equity is high, folds when it isn't.
- **Proper 7-card hand evaluator** — scores all 21 five-card combinations from your 2 hole + up to 5 community cards. Wheel straights (A-2-3-4-5) and same-card straight-flush detection both handled correctly.

### UI
- **Single-screen layout** — everything visible at once, no modal flow.
- **Auto-recalculating decision panel** — updates instantly as you change any input.
- **52-card grid picker** — click a slot, click a card. Used cards are greyed out. Picker auto-advances to the next empty slot.
- **Type-to-pick** — with the picker open, type rank+suit (`a` then `h` → A♥) instead of clicking.
- **Progressive street reveal** — start preflop, then "Deal Flop" reveals 3 slots, "Deal Turn" reveals 1, etc.
- **Seat rotation** — pressing `n` (new hand) clears the cards *and* rotates your seat to the next one automatically. Reversible direction (toggle whether `n` rotates forward or backward).
- **Position help panel** — `?` button next to "Seat" expands an inline guide showing every seat for your player count, what bucket each maps to, and a one-line description.
- **Persistence** — player count, seat, big blind, stack size, and rotation direction all persist in `localStorage` across reloads.

### Keyboard shortcuts
| Key | Action |
| --- | --- |
| `n` | New hand (clears cards + pot, rotates seat) |
| `f` | Deal Flop |
| `t` | Deal Turn |
| `r` | Deal River |
| `Esc` | Close card picker |
| `<rank><suit>` (in picker) | e.g., `a` then `h` to pick A♥ |

## Quick usage

1. Pick your 2 hole cards (click slot → click card, or type the card).
2. Set the **Seat** (your seat this hand — UTG, BTN, etc.).
3. Set **Players** (still in the hand), **Big Blind**, **Pot** (chips in the middle), **To Call** (chips you need to put in to stay), and **Your Stack**.
4. Read the recommendation. Act.
5. When the flop comes, press `f` and click the 3 board cards. Update **Pot** and **To Call** to reflect the new street's action. Read the new recommendation.
6. Repeat for turn (`t`) and river (`r`).
7. Press `n` for the next hand — your seat rotates one over automatically.

## Inputs reference

| Field | What it is | When to update |
| --- | --- | --- |
| Seat | Your seat this hand (BTN, SB, BB, UTG, etc.) | Auto-rotates on `n`; manual `←` / `→` if you skip a hand |
| Players | Players still in the hand (not folded) | When someone folds |
| Big Blind | Big blind chip amount | Once per game (e.g., 2 for $1/$2) |
| Pot | Total chips in the middle | After each round of betting |
| To Call | Chips you'd need to add to stay | Each time the action gets to you |
| Your Stack | Your remaining chips | Mostly persists — adjust if you reload chips |

## Position guide (auto-derived from seat + player count)

The dropdown shows specific seats; the engine internally maps them to one of four buckets used in the decision logic:

- **late** — BTN, CO
- **middle** — HJ, MP
- **early** — UTG, UTG+1, UTG+2
- **blind** — SB, BB (or BTN/SB heads-up)

Acting later in the betting round = strictly better. The engine plays much tighter from early/blind seats and much looser from late seats.

## Caveats (standalone React UI)

- **Equity is vs. random hands**, not vs. opponent ranges. Real opponents don't show up with 7-2 offsuit, so the displayed equity is slightly optimistic. Useful as a sanity check, not gospel. *The Pokernow Bridge (below) addresses this with range-aware equity once HUD data exists.*
- **No opponent modeling** — the tool doesn't know who's tight, loose, or bluffing. It plays "honest" recommendations only. *The Pokernow Bridge adds opponent-type classification (Whale/Loose/Average/TAG/Nit) and feeds it into preflop ranges + postflop equity.*
- **No bluffing / semi-bluff raise logic** — strong draws are evaluated by their raw equity but won't be recommended as bluff-raises.
- **Preflop ranges are ~6-max defaults** — feel a bit loose for tight 9-handed games. Adjust your `Players` accordingly.
- **No bet-sizing tell adjustments or IP/OOP buffer in the standalone UI.** These live in the decision engine but require additional context the standalone UI doesn't pass — the Pokernow Bridge passes them automatically.

## Technical stack
- React 18 (Create React App)
- Tailwind CSS 3
- JavaScript ES6+
- No backend, no external API — equity sim runs in-browser

## Project structure
```
src/
├── components/
│   ├── PokerUI.jsx          # Main UI: state, layout, keyboard shortcuts
│   ├── CardPickerGrid.jsx   # 52-card modal picker with type-to-select
│   └── CardSlot.jsx         # Reusable card slot button
├── poker-logic.js           # Hand evaluator, equity sim, range tables, decision engine
├── App.js
└── index.css                # Tailwind imports
```

## Setup

```bash
npm install
npm start
```

Opens at <http://localhost:3000/poker-helper>.

To build for deployment:
```bash
npm run build
```

## Deployment

Configured for GitHub Pages:
```bash
npm run deploy
```

`npm run deploy` runs both `npm run build` (React app) and `npm run build:bridge` (Pokernow userscript bundle) before publishing, so the userscript at `tampermonkey/pokernow-bridge.user.js` always loads the latest matching bundle from `JVS1328.github.io/poker-helper/pokernow-bridge/bundle.js`.

---

## Pokernow Bridge

A Tampermonkey userscript that injects a live equity / pot-odds panel, per-opponent HUD shells (VPIP / PFR / 3-bet / AF + player-type bucket coloring + notes), and a range-aware equity mode onto `pokernow.com/games/*` tables. Supports NLHE, PLO, PLO5, PLO Hi/Lo, and PLO5 Hi/Lo.

### Install (production — bundle loaded from GitHub Pages)

1. Install [Tampermonkey](https://www.tampermonkey.net/) in your browser.
2. Open [tampermonkey/pokernow-bridge.user.js](tampermonkey/pokernow-bridge.user.js) on GitHub and click the **Raw** button — Tampermonkey prompts to install.
3. Open any Pokernow game (`https://www.pokernow.com/games/<id>`). The helper appears in the upper-left as a draggable panel; per-opponent HUD shells anchor to each seat.

### Run it locally (no deployment needed)

For testing before pushing — produces a single self-contained `.user.js` file that has the whole bundle inlined. Edit code, rebuild, re-install.

```bash
npm install                              # if you haven't already
npm run build:bridge:userscript          # one-shot build
# or:
npm run dev:bridge                       # rebuild on save
```

The output lands at `build/pokernow-bridge/pokernow-bridge.user.js`. To install:

1. Open Tampermonkey's dashboard (icon in toolbar → Dashboard).
2. Drag the `pokernow-bridge.user.js` file onto the dashboard, **or** click the `+` ("Create a new script") tab → paste the file's contents → save.
3. Tampermonkey shows the script's metadata block and asks to install — confirm.
4. Open a Pokernow game. Press F12 to confirm `[pokernow-bridge] initialized ✓` in the console.

After code changes: re-run `npm run build:bridge:userscript` and re-install (Tampermonkey detects the version match and prompts to update). For a faster loop, use `npm run dev:bridge` to keep esbuild watching, then just re-drag the file each rebuild — or use `@require file:///absolute/path/to/bundle.js` if you've enabled "Allow access to file URLs" for Tampermonkey in `chrome://extensions`.

The local userscript is **unminified with inline sourcemaps**, so Pokernow's DevTools step into the original `src/pokernow-bridge/*.jsx` files when you debug.

### What you get

- **Action recommendation (Fold / Check / Call / Raise + sizing + reasoning)** — gated to only appear when it's actually your turn to act (action buttons visible). Reuses the standalone decision engine plus the Pokernow-only context below.
- **Live equity %** — Monte Carlo, updates as community cards appear, colored green when you beat pot odds and red when you don't.
- **Pot odds, required equity, EV of call, SPR** — the standard derived numbers. SPR uses the **effective stack** (min of hero and deepest non-folded opponent), matching what the decision engine sees.
- **Range-aware equity (`vs rng` toggle)** — flip to compute equity against each opponent's *estimated range* (Whale 70% / Loose 45% / Average 28% / TAG 18% / Nit 8%) based on their live HUD stats. Opponents without enough hands default to the "unknown" 40% bucket — still tighter and more honest than vs-random's effective 100% range. The active equity is fed into the recommendation engine too, so the action label also tightens on marginal hands.
- **Position badge** — BTN / SB / BB / UTG / etc., color-coded, anchored over your seat.
- **HUD shells** — per-opponent boxes showing live VPIP / PFR / 3-bet / AF / hand count, color-tinted by player bucket (Whale pink / Loose amber / TAG blue / Nit emerald). Click the player's name to add or edit a personal note. Folded opponents dim to 45% opacity.
- **Multi-table sync** — stats persist across all your Pokernow tabs via Tampermonkey storage with cross-tab change listeners; an opponent playing at multiple of your tables aggregates into one profile in real-time.
- **Variants** — NLHE (browser-side Monte Carlo, ~1200 iters), PLO and PLO5 (high), PLO Hi/Lo and PLO5 Hi/Lo (8-or-better split-pot logic). PLO variants run fewer iterations because of the larger combination space — no server-side fallback (project constraint).
- **Drag-to-position + persistent layout** — drag the panel header or any HUD shell; positions persist.

### Pokernow-aware decision context

When the bridge calls the decision engine, it passes a context object the standalone React UI can't observe. Each of these moves the recommendation closer to elite play:

- **Position awareness (IP vs OOP).** Hero acting last postflop (BTN among non-folded) gets a smaller required-equity buffer (+2%); acting earlier (OOP) gets +6%. Multiway pots add +3% per extra opponent. Reasoning text shows the position tag.
- **Effective stack for SPR & commitment.** `min(hero stack, deepest non-folded opponent stack) / pot`. Prevents the "I have 5,000 chips so my SPR is huge" misreading when your opponent is sitting on 800.
- **Bet-sizing tells.** Required equity adjusts to villain's bet-relative-to-pot:
  - ≤ 33% pot → −2% (small bets often weak/marginal, call wider)
  - 33–66% → ±0 (standard cbet)
  - 66–100% → +3% (value-leaning)
  - > 100% → +6% required + raise-for-value threshold bumps to 80% equity (don't raise into polarized overbet ranges)
- **Opponent-type-aware preflop ranges.**
  - *Steal mode* (all opponents at the table are nits / TAGs): opens widen from CO/BTN/SB to include A2o+, K-suited, suited 1-gappers, etc. Reasoning shows "(steal — blinds are tight)".
  - *Tighten mode* (LAGs / whales present): opens contract to top ~12% only.
  - *3-bet sizing*: facing a Whale or Loose opener, 3-bet range expands for value (adds JJ / TT / AQo / AJs). Facing a Nit, contracts to premium only (AA / KK / QQ / AKs / AKo) — nits don't fold to light 3-bets.
- **Range-aware equity vs whichever bucket each villain is in.** Drives postflop decisions when `vs rng` is on (Phase 3). On marginal hands like K-high heads-up, the recommendation correctly says "check" against a TAG range where vs-random would have said "thin value raise".

The panel footer surfaces what's currently in play: `IP` / `OOP` tag, "Their bet is 19% pot (small — weak)" sizing note, 🎯 "Steal-friendly table" or ⚠ "LAGs behind" banner preflop.

### Debug

In the browser console:
```js
window.__pokernowBridgeDebug = true;
```
then reload — every DOM selector miss logs to the console. Useful if Pokernow's markup changes and a field stops reading.

### Phase status

| Phase | Feature | Status |
|---|---|---|
| 1 | DOM reader, equity / pot-odds panel, HUD shells, position badge, variant abstraction | ✅ done |
| 2 | Opponent action tracking via per-seat bet-value diffing → VPIP / PFR / 3-bet / fold-to-3bet / c-bet / fold-to-cbet / AF / WTSD / W$SD / limps in shells; player notes; bucket coloring | ✅ done |
| 3 | Equity vs. **estimated range per opponent** using HUD-stat-driven Whale/Loose/Average/TAG/Nit buckets | ✅ done |
| 4 | Multi-table aggregation (cross-tab listener on opponent profiles) | ✅ done |
| 5 | PLO / PLO5 / PLO Hi-Lo / PLO5 Hi-Lo evaluators | ✅ done |
| 6 | Decision engine accuracy: IP/OOP buffer, effective-stack SPR, bet-sizing tells, opponent-type-aware preflop ranges, range-aware equity feeding the recommendation | ✅ done |

Explicit non-goals: hand history / replayer, LLM "AI coach" features, cloud sync.

See [docs/superpowers/specs/2026-05-11-pokernow-bridge-phase1-design.md](docs/superpowers/specs/2026-05-11-pokernow-bridge-phase1-design.md) for the full design.
