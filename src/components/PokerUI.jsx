import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { PokerLogic, parseCard } from '../poker-logic';
import CardPickerGrid from './CardPickerGrid';
import CardSlot from './CardSlot';

const pokerLogic = new PokerLogic();

const PERSIST_KEY = 'poker-helper:settings';

// Seat order starting from the button, going clockwise (which matches how
// the button moves between hands — so cycling this list = next hand's seat).
const seatOrderForPlayers = (n) => {
  switch (n) {
    case 2: return ['BTN/SB', 'BB'];
    case 3: return ['BTN', 'SB', 'BB'];
    case 4: return ['BTN', 'SB', 'BB', 'UTG'];
    case 5: return ['BTN', 'SB', 'BB', 'UTG', 'CO'];
    case 6: return ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'];
    case 7: return ['BTN', 'SB', 'BB', 'UTG', 'MP', 'HJ', 'CO'];
    case 8: return ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'HJ', 'CO'];
    case 9: return ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'UTG+2', 'MP', 'HJ', 'CO'];
    default: return ['BTN', 'SB', 'BB', 'UTG'];
  }
};

const seatToBucket = (seat) => {
  if (seat === 'SB' || seat === 'BB' || seat === 'BTN/SB') return 'blind';
  if (seat === 'BTN' || seat === 'CO') return 'late';
  if (seat === 'HJ' || seat === 'MP') return 'middle';
  return 'early'; // UTG, UTG+1, UTG+2
};

const SEAT_GLOSSARY = {
  'BTN': 'Button — dealer chip. Best seat: acts last postflop.',
  'BTN/SB': 'Button + Small Blind (heads-up). Acts first preflop, second postflop.',
  'SB': 'Small Blind. Posts half a blind, acts first postflop.',
  'BB': 'Big Blind. Posts full blind, acts second postflop.',
  'UTG': 'Under the Gun. First to act preflop — many players still behind.',
  'UTG+1': 'One seat left of UTG. Still early.',
  'UTG+2': 'Two seats left of UTG.',
  'MP': 'Middle Position.',
  'HJ': 'Hijack — two seats right of the button.',
  'CO': 'Cutoff — one right of the button. Second-best seat.',
};

const BUCKET_COLOR = {
  late: 'text-emerald-700 bg-emerald-100',
  middle: 'text-amber-700 bg-amber-100',
  early: 'text-orange-700 bg-orange-100',
  blind: 'text-rose-700 bg-rose-100',
};

const loadPersisted = () => {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const PokerUI = () => {
  const persisted = useMemo(() => loadPersisted(), []);

  const [holeCards, setHoleCards] = useState(['', '']);
  const [communityCards, setCommunityCards] = useState(['', '', '', '', '']);
  const [revealedStreets, setRevealedStreets] = useState(0);
  const [numPlayers, setNumPlayers] = useState(persisted?.numPlayers ?? 6);
  const [seatIndex, setSeatIndex] = useState(persisted?.seatIndex ?? 0);
  const [stackSize, setStackSize] = useState(persisted?.stackSize ?? 1000);
  const [bigBlind, setBigBlind] = useState(persisted?.bigBlind ?? 2);
  const [rotateForward, setRotateForward] = useState(persisted?.rotateForward ?? true);
  const [potSize, setPotSize] = useState(persisted?.bigBlind ? Math.round(persisted.bigBlind * 1.5) : 3);
  const [currentBet, setCurrentBet] = useState(persisted?.bigBlind ?? 2);
  const [pickerSlot, setPickerSlot] = useState(null);
  const [showPositionHelp, setShowPositionHelp] = useState(false);

  // Clamp seatIndex when numPlayers shrinks
  useEffect(() => {
    if (seatIndex >= numPlayers) setSeatIndex(numPlayers - 1);
  }, [numPlayers, seatIndex]);

  const seatOrder = useMemo(() => seatOrderForPlayers(numPlayers), [numPlayers]);
  const currentSeat = seatOrder[seatIndex] ?? seatOrder[0];
  const positionBucket = seatToBucket(currentSeat);

  // Persist
  useEffect(() => {
    try {
      localStorage.setItem(
        PERSIST_KEY,
        JSON.stringify({ numPlayers, seatIndex, stackSize, bigBlind, rotateForward })
      );
    } catch { /* ignore */ }
  }, [numPlayers, seatIndex, stackSize, bigBlind, rotateForward]);

  const allUsedCards = useMemo(
    () => [...holeCards, ...communityCards.slice(0, revealedStreets)].filter(Boolean),
    [holeCards, communityCards, revealedStreets]
  );

  const pickerUsedCards = useMemo(() => {
    if (!pickerSlot) return allUsedCards;
    const current = pickerSlot.type === 'hole'
      ? holeCards[pickerSlot.index]
      : communityCards[pickerSlot.index];
    return allUsedCards.filter(c => c !== current);
  }, [allUsedCards, pickerSlot, holeCards, communityCards]);

  const decision = useMemo(() => {
    const parsedHole = holeCards.map(parseCard).filter(Boolean);
    if (parsedHole.length !== 2) return null;
    const parsedCommunity = communityCards.slice(0, revealedStreets).map(parseCard).filter(Boolean);
    if (parsedCommunity.length !== revealedStreets) return null;
    return pokerLogic.getDecision(
      parsedHole, parsedCommunity, currentSeat, numPlayers, potSize, currentBet, stackSize, bigBlind
    );
  }, [holeCards, communityCards, revealedStreets, currentSeat, numPlayers, potSize, currentBet, stackSize, bigBlind]);

  const findNextEmpty = useCallback((type, fromIndex) => {
    if (type === 'hole') {
      for (let i = fromIndex + 1; i < 2; i++) if (!holeCards[i]) return i;
      for (let i = 0; i < 2; i++) if (!holeCards[i] && i !== fromIndex) return i;
      return -1;
    }
    for (let i = fromIndex + 1; i < revealedStreets; i++) if (!communityCards[i]) return i;
    for (let i = 0; i < revealedStreets; i++) if (!communityCards[i] && i !== fromIndex) return i;
    return -1;
  }, [holeCards, communityCards, revealedStreets]);

  const handleSelectCard = useCallback((card) => {
    if (!pickerSlot) return;
    if (pickerSlot.type === 'hole') {
      const next = [...holeCards];
      next[pickerSlot.index] = card;
      setHoleCards(next);
    } else {
      const next = [...communityCards];
      next[pickerSlot.index] = card;
      setCommunityCards(next);
    }
    const nextIndex = findNextEmpty(pickerSlot.type, pickerSlot.index);
    if (nextIndex === -1) setPickerSlot(null);
    else setPickerSlot({ type: pickerSlot.type, index: nextIndex });
  }, [pickerSlot, holeCards, communityCards, findNextEmpty]);

  const newHand = useCallback(() => {
    setHoleCards(['', '']);
    setCommunityCards(['', '', '', '', '']);
    setRevealedStreets(0);
    // Reset pot/bet to the blinds (SB + BB), and "to call" = the BB
    setPotSize(Math.round(bigBlind * 1.5));
    setCurrentBet(bigBlind);
    setPickerSlot(null);
    setSeatIndex(prev => (prev + (rotateForward ? 1 : -1) + numPlayers) % numPlayers);
  }, [numPlayers, bigBlind, rotateForward]);

  const rotateSeatBy = useCallback((delta) => {
    setSeatIndex(prev => (prev + delta + numPlayers) % numPlayers);
  }, [numPlayers]);

  const dealFlop = useCallback(() => { if (revealedStreets === 0) setRevealedStreets(3); }, [revealedStreets]);
  const dealTurn = useCallback(() => { if (revealedStreets === 3) setRevealedStreets(4); }, [revealedStreets]);
  const dealRiver = useCallback(() => { if (revealedStreets === 4) setRevealedStreets(5); }, [revealedStreets]);

  // Refs so the keydown handler doesn't re-bind every render
  const refs = useRef({ newHand, dealFlop, dealTurn, dealRiver });
  useEffect(() => { refs.current = { newHand, dealFlop, dealTurn, dealRiver }; });

  useEffect(() => {
    const handleKey = (e) => {
      if (pickerSlot) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key.toLowerCase()) {
        case 'n': e.preventDefault(); refs.current.newHand(); break;
        case 'f': e.preventDefault(); refs.current.dealFlop(); break;
        case 't': e.preventDefault(); refs.current.dealTurn(); break;
        case 'r': e.preventDefault(); refs.current.dealRiver(); break;
        default: break;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [pickerSlot]);

  const openPicker = (type, index) => setPickerSlot({ type, index });

  const renderCommunitySlots = () => {
    const labels = ['Flop', 'Flop', 'Flop', 'Turn', 'River'];
    const slots = [];
    for (let i = 0; i < revealedStreets; i++) {
      slots.push(
        <div key={i} className="flex flex-col items-center">
          <span className="text-xs text-gray-500 mb-1">{labels[i]}</span>
          <CardSlot card={communityCards[i]} onClick={() => openPicker('community', i)} />
        </div>
      );
    }
    return slots;
  };

  const handReady = holeCards[0] && holeCards[1];
  const decisionColor = decision
    ? decision.action === 'Fold' ? 'text-red-600 bg-red-50 border-red-200'
    : decision.action === 'Check' ? 'text-gray-700 bg-gray-100 border-gray-300'
    : decision.action === 'Call' ? 'text-blue-700 bg-blue-50 border-blue-200'
    : 'text-green-700 bg-green-50 border-green-200'
    : '';

  return (
    <div className="p-4 max-w-5xl mx-auto bg-white shadow-lg rounded-lg">
      <div className="space-y-6">
        <div className="flex items-center justify-between border-b pb-4">
          <div className="flex items-center space-x-2">
            <span className="text-3xl">🎴</span>
            <h1 className="text-2xl font-bold text-gray-800">Poker Decision Helper</h1>
          </div>
          <button
            type="button"
            onClick={newHand}
            className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded border border-gray-300 text-gray-700"
            title="New hand — rotates your seat (n)"
          >
            New hand <kbd className="ml-1 px-1 py-0.5 bg-white rounded text-xs border">n</kbd>
          </button>
        </div>

        {/* Decision panel */}
        <div className={`p-4 rounded-lg border-2 ${decision ? decisionColor : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
          {!handReady && <p className="text-base">Pick your hole cards to see a recommendation.</p>}
          {handReady && decision && (
            <div>
              <div className="flex items-baseline space-x-3 flex-wrap">
                <span className="text-3xl font-bold">{decision.action}</span>
                {decision.amount > 0 && <span className="text-2xl font-semibold">${decision.amount}</span>}
                {typeof decision.equity === 'number' && (
                  <span className="ml-auto text-sm font-medium opacity-70">
                    Equity: <span className="font-bold">{(decision.equity * 100).toFixed(1)}%</span>
                    <span className="opacity-60"> vs. {numPlayers - 1} opp</span>
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm opacity-80">{decision.reasoning}</p>
            </div>
          )}
        </div>

        {/* Cards row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-2">Your Hand</h2>
            <div className="flex space-x-3">
              {[0, 1].map(i => (
                <CardSlot key={i} card={holeCards[i]} onClick={() => openPicker('hole', i)} />
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-2">Community</h2>
            {revealedStreets === 0 ? (
              <p className="text-sm text-gray-500 italic">Preflop — deal the flop when ready.</p>
            ) : (
              <div className="flex space-x-2">{renderCommunitySlots()}</div>
            )}
          </div>
        </div>

        {/* Street controls */}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={dealFlop}
            disabled={revealedStreets !== 0 || !handReady}
            className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
          >
            Deal Flop <kbd className="ml-1 px-1 py-0.5 bg-white/20 rounded text-xs">f</kbd>
          </button>
          <button
            type="button"
            onClick={dealTurn}
            disabled={revealedStreets !== 3}
            className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
          >
            Deal Turn <kbd className="ml-1 px-1 py-0.5 bg-white/20 rounded text-xs">t</kbd>
          </button>
          <button
            type="button"
            onClick={dealRiver}
            disabled={revealedStreets !== 4}
            className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
          >
            Deal River <kbd className="ml-1 px-1 py-0.5 bg-white/20 rounded text-xs">r</kbd>
          </button>
        </div>

        {/* Inputs row */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-gray-600 uppercase">Seat</label>
              <button
                type="button"
                onClick={() => setShowPositionHelp(s => !s)}
                className="text-xs px-1.5 py-0.5 rounded border border-gray-300 text-gray-500 hover:bg-gray-100"
                title="What do these positions mean?"
              >
                ?
              </button>
            </div>
            <div className="flex items-center space-x-1">
              <button
                type="button"
                onClick={() => rotateSeatBy(-1)}
                className="px-2 py-2 bg-gray-100 hover:bg-gray-200 rounded border border-gray-300 text-gray-600"
                title="Previous seat"
              >
                ←
              </button>
              <select
                className="p-2 border rounded flex-1 bg-white hover:border-blue-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                value={seatIndex}
                onChange={(e) => setSeatIndex(Number(e.target.value))}
              >
                {seatOrder.map((seat, i) => (
                  <option key={seat} value={i}>{seat}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => rotateSeatBy(1)}
                className="px-2 py-2 bg-gray-100 hover:bg-gray-200 rounded border border-gray-300 text-gray-600"
                title="Next seat"
              >
                →
              </button>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${BUCKET_COLOR[positionBucket]}`}>
                {positionBucket} position
              </span>
              <button
                type="button"
                onClick={() => setRotateForward(f => !f)}
                className="text-xs text-gray-500 hover:text-gray-700 hover:underline"
                title={`Pressing 'n' rotates ${rotateForward ? 'forward (next seat)' : 'backward (previous seat)'} — click to flip`}
              >
                n: {rotateForward ? '→' : '←'}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Players</label>
            <input
              type="number"
              className="p-2 border rounded w-full hover:border-blue-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              value={numPlayers}
              onChange={(e) => setNumPlayers(Number(e.target.value))}
              min={2}
              max={9}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase mb-1" title="Big Blind size in chips — used to size raises">Big Blind</label>
            <input
              type="number"
              className="p-2 border rounded w-full hover:border-blue-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              value={bigBlind}
              onChange={(e) => setBigBlind(Number(e.target.value))}
              min={1}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Pot</label>
            <input
              type="number"
              className="p-2 border rounded w-full hover:border-blue-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              value={potSize}
              onChange={(e) => setPotSize(Number(e.target.value))}
              min={0}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">To Call</label>
            <input
              type="number"
              className="p-2 border rounded w-full hover:border-blue-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              value={currentBet}
              onChange={(e) => setCurrentBet(Number(e.target.value))}
              min={0}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Your Stack</label>
            <input
              type="number"
              className="p-2 border rounded w-full hover:border-blue-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              value={stackSize}
              onChange={(e) => setStackSize(Number(e.target.value))}
              min={0}
            />
          </div>
        </div>

        {/* Position help panel */}
        {showPositionHelp && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-gray-800">Positions ({numPlayers}-handed)</h3>
              <button
                type="button"
                onClick={() => setShowPositionHelp(false)}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                close
              </button>
            </div>
            <p className="text-xs text-gray-600 mb-3">
              Position = how late you act. Acting later is a big advantage. Press <kbd className="px-1 bg-white rounded border">n</kbd> for a new hand and your seat rotates one to the next position automatically.
            </p>
            <div className="space-y-1">
              {seatOrder.map((seat, i) => {
                const bucket = seatToBucket(seat);
                const isCurrent = i === seatIndex;
                return (
                  <div
                    key={seat}
                    className={`flex items-baseline space-x-2 px-2 py-1 rounded ${isCurrent ? 'bg-white ring-1 ring-blue-400' : ''}`}
                  >
                    <span className="font-mono font-semibold w-16 text-gray-800">{seat}</span>
                    <span className={`px-1.5 py-0.5 text-xs rounded ${BUCKET_COLOR[bucket]}`}>{bucket}</span>
                    <span className="text-xs text-gray-600">{SEAT_GLOSSARY[seat] ?? ''}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="text-xs text-gray-500 border-t pt-3">
          <span className="font-semibold">Shortcuts:</span>{' '}
          <kbd className="px-1 bg-gray-100 rounded border">n</kbd> new hand (rotates seat) ·{' '}
          <kbd className="px-1 bg-gray-100 rounded border">f</kbd> flop ·{' '}
          <kbd className="px-1 bg-gray-100 rounded border">t</kbd> turn ·{' '}
          <kbd className="px-1 bg-gray-100 rounded border">r</kbd> river ·{' '}
          in picker, type rank+suit (e.g.{' '}
          <kbd className="px-1 bg-gray-100 rounded border">a</kbd>
          <kbd className="px-1 bg-gray-100 rounded border">h</kbd>{' '}
          for A♥)
        </div>
      </div>

      {pickerSlot && (
        <CardPickerGrid
          usedCards={pickerUsedCards}
          onSelect={handleSelectCard}
          onClose={() => setPickerSlot(null)}
        />
      )}
    </div>
  );
};

export default PokerUI;
