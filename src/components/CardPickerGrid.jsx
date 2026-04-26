import React, { useEffect, useRef } from 'react';

const RANKS = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
const SUITS = [
  { symbol: '♠', key: 's', color: 'text-gray-900' },
  { symbol: '♥', key: 'h', color: 'text-red-600' },
  { symbol: '♦', key: 'd', color: 'text-red-600' },
  { symbol: '♣', key: 'c', color: 'text-gray-900' },
];

const SUIT_BY_KEY = Object.fromEntries(SUITS.map(s => [s.key, s]));

const CardPickerGrid = ({ usedCards, onSelect, onClose }) => {
  const bufferRef = useRef('');
  const bufferTimerRef = useRef(null);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      const key = e.key.toLowerCase();

      if (bufferTimerRef.current) clearTimeout(bufferTimerRef.current);
      bufferTimerRef.current = setTimeout(() => { bufferRef.current = ''; }, 1200);

      if (/^[2-9akqjt]$/.test(key)) {
        const rank = key === 't' ? '10' : key.toUpperCase();
        bufferRef.current = rank;
        return;
      }

      if (/^[shdc]$/.test(key) && bufferRef.current) {
        const rank = bufferRef.current;
        const suit = SUIT_BY_KEY[key].symbol;
        const card = `${rank}${suit}`;
        bufferRef.current = '';
        if (!usedCards.includes(card)) {
          onSelect(card);
        }
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
      if (bufferTimerRef.current) clearTimeout(bufferTimerRef.current);
    };
  }, [usedCards, onSelect, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-2xl p-4 max-w-3xl w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-800">Pick a card</h3>
          <span className="text-xs text-gray-500">Type rank + suit (e.g. <kbd className="px-1 bg-gray-100 rounded">a</kbd><kbd className="px-1 bg-gray-100 rounded">h</kbd>) or click — <kbd className="px-1 bg-gray-100 rounded">Esc</kbd> to close</span>
        </div>

        <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(13, minmax(0, 1fr))' }}>
          {SUITS.map(suit => (
            RANKS.map(rank => {
              const card = `${rank}${suit.symbol}`;
              const used = usedCards.includes(card);
              return (
                <button
                  key={card}
                  type="button"
                  disabled={used}
                  onClick={() => onSelect(card)}
                  className={`
                    flex flex-col items-center justify-center
                    p-2 rounded border text-base font-semibold
                    transition-colors
                    ${used
                      ? 'bg-gray-100 text-gray-300 border-gray-200 cursor-not-allowed'
                      : `bg-white ${suit.color} border-gray-300 hover:bg-blue-50 hover:border-blue-500 active:bg-blue-100`
                    }
                  `}
                >
                  <span>{rank}</span>
                  <span className="text-lg leading-none">{suit.symbol}</span>
                </button>
              );
            })
          ))}
        </div>
      </div>
    </div>
  );
};

export default CardPickerGrid;
