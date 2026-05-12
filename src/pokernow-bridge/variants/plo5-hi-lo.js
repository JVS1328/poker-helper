// PLO5 Hi-Lo — 5 hole cards, split pot. Slowest variant; iterations dropped
// to keep the in-browser sim responsive (no server fallback per project constraint).

import { ploMonteCarloEquity } from './plo-mc';

const variant = {
  id: 'plo5-hi-lo',
  label: 'PLO5 Hi/Lo',
  holeCardCount: 5,
  isSplitPot: true,
  supportsEquity: true,

  monteCarloEquity({ hole, board, numOpponents, iterations = 500 }) {
    return ploMonteCarloEquity({
      hole, board, numOpponents,
      holeCardCount: 5,
      isHiLo: true,
      iterations,
    });
  },
};

export default variant;
