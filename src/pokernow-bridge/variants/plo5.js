// PLO5 — 5 hole cards, high only, exactly 2 of 5 hole + 3 of 5 board.

import { ploMonteCarloEquity } from './plo-mc';

const variant = {
  id: 'plo5',
  label: 'PLO5',
  holeCardCount: 5,
  isSplitPot: false,
  supportsEquity: true,

  monteCarloEquity({ hole, board, numOpponents, iterations = 600 }) {
    return ploMonteCarloEquity({
      hole, board, numOpponents,
      holeCardCount: 5,
      isHiLo: false,
      iterations,
    });
  },
};

export default variant;
