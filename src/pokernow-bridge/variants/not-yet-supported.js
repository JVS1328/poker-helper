// Stub variant for PLO / PLO5 / Hi-Lo variants until Phase 5 ships their
// evaluators. Satisfies the Variant interface so the rest of the bundle
// renders normally — the equity panel just shows "variant not supported".

export const makeStub = (id, label, holeCardCount, isSplitPot) => ({
  id,
  label,
  holeCardCount,
  isSplitPot,
  supportsEquity: false,

  monteCarloEquity() {
    return { equity: null, reason: 'variant-not-implemented' };
  },
});

export default makeStub;
