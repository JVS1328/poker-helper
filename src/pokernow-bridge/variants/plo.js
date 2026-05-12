// PLO (Pot Limit Omaha) — 4 hole cards, high only, exactly 2 of 4 hole + 3 of 5 board.

import { ploMonteCarloEquity } from './plo-mc';

const variant = {
  id: 'plo',
  label: 'PLO',
  holeCardCount: 4,
  isSplitPot: false,
  supportsEquity: true,

  monteCarloEquity({ hole, board, numOpponents, iterations = 800 }) {
    return ploMonteCarloEquity({
      hole, board, numOpponents,
      holeCardCount: 4,
      isHiLo: false,
      iterations,
    });
  },
};

export default variant;
