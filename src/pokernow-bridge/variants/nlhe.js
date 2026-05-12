// NLHE variant — wraps the existing equity engine from src/poker-logic.js.
// Cards arrive as normalized strings like "Ah", "Td"; we parse them into
// the Card objects calculateEquity expects.

import { calculateEquity, parseCard } from '../../poker-logic';

const parseAll = (cardStrings) => {
  const out = [];
  for (const s of cardStrings) {
    const c = parseCard(s);
    if (!c) return null;
    out.push(c);
  }
  return out;
};

const variant = {
  id: 'nlhe',
  label: 'NLHE',
  holeCardCount: 2,
  isSplitPot: false,
  supportsEquity: true,

  // Returns { equity, win, tie, loss, iterations } or null if inputs are unusable.
  monteCarloEquity({ hole, board, numOpponents, iterations = 1200 }) {
    if (!Array.isArray(hole) || hole.length !== 2) return null;
    if (numOpponents < 1) return null;
    const parsedHole = parseAll(hole);
    if (!parsedHole) return null;
    const parsedBoard = parseAll(board || []);
    if (!parsedBoard) return null;
    if (parsedBoard.length !== 0 && parsedBoard.length !== 3 && parsedBoard.length !== 4 && parsedBoard.length !== 5) {
      return null;
    }
    return calculateEquity(parsedHole, parsedBoard, numOpponents, iterations);
  },
};

export default variant;
