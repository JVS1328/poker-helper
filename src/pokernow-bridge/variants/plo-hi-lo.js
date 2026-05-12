// PLO Hi-Lo (8 or better) — 4 hole cards, split pot between best high and
// best qualifying low. Uses the standard Ace-to-5, 8-or-better low ranking.

import { ploMonteCarloEquity } from './plo-mc';

const variant = {
  id: 'plo-hi-lo',
  label: 'PLO Hi/Lo',
  holeCardCount: 4,
  isSplitPot: true,
  supportsEquity: true,

  monteCarloEquity({ hole, board, numOpponents, iterations = 700 }) {
    return ploMonteCarloEquity({
      hole, board, numOpponents,
      holeCardCount: 4,
      isHiLo: true,
      iterations,
    });
  },
};

export default variant;
