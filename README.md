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

## Caveats

- **Equity is vs. random hands**, not vs. opponent ranges. Real opponents don't show up with 7-2 offsuit, so the displayed equity is slightly optimistic. Useful as a sanity check, not gospel.
- **No opponent modeling** — the tool doesn't know who's tight, loose, or bluffing. It plays "honest" recommendations only.
- **No bluffing / semi-bluff raise logic** — strong draws are evaluated by their raw equity but won't be recommended as bluff-raises.
- **Preflop ranges are ~6-max defaults** — feel a bit loose for tight 9-handed games. Adjust your `Players` accordingly.

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
