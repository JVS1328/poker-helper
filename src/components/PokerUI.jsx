import React, { useState } from 'react';
import { PokerLogic, parseCard } from '../poker-logic';

const pokerLogic = new PokerLogic();

const PokerUI = () => {
  const [playerCards, setPlayerCards] = useState(['', '']);
  const [communityCards, setCommunityCards] = useState(['', '', '', '', '']);
  const [position, setPosition] = useState('early');
  const [numPlayers, setNumPlayers] = useState(6);
  const [potSize, setPotSize] = useState(0);
  const [currentBet, setCurrentBet] = useState(0);
  const [stackSize, setStackSize] = useState(1000);
  const [decision, setDecision] = useState(null);

  const suits = ['♠', '♥', '♦', '♣'];
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

  const calculateDecision = () => {
    const holeCards = playerCards
      .map(parseCard)
      .filter(card => card !== null);
      
    const tableCards = communityCards
      .map(parseCard)
      .filter(card => card !== null);
    
    if (holeCards.length !== 2) {
      alert('Please select both hole cards');
      return;
    }

    const result = pokerLogic.getDecision(
      holeCards,
      tableCards,
      position,
      numPlayers,
      potSize,
      currentBet,
      stackSize
    );
    
    setDecision(result);
  };

  return (
    <div className="p-4 max-w-4xl mx-auto bg-white shadow-lg rounded-lg">
      <div className="space-y-6">
        <div className="flex items-center space-x-2 border-b pb-4">
          <span className="text-4xl">🎴</span>
          <h1 className="text-2xl font-bold text-gray-800">Poker Decision Helper</h1>
        </div>

        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-700">Your Hand</h2>
          <div className="flex space-x-2">
            {playerCards.map((card, i) => (
              <select
                key={i}
                className="p-2 border rounded bg-white hover:border-blue-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                value={card}
                onChange={(e) => {
                  const newCards = [...playerCards];
                  newCards[i] = e.target.value;
                  setPlayerCards(newCards);
                }}
              >
                <option value="">Select card {i + 1}</option>
                {ranks.map(rank => 
                  suits.map(suit => (
                    <option key={`${rank}${suit}`} value={`${rank}${suit}`}>
                      {rank}{suit}
                    </option>
                  ))
                )}
              </select>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-700">Community Cards</h2>
          <div className="flex flex-wrap gap-2">
            {communityCards.map((card, i) => (
              <select
                key={i}
                className="p-2 border rounded bg-white hover:border-blue-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                value={card}
                onChange={(e) => {
                  const newCards = [...communityCards];
                  newCards[i] = e.target.value;
                  setCommunityCards(newCards);
                }}
              >
                <option value="">Select card {i + 1}</option>
                {ranks.map(rank => 
                  suits.map(suit => (
                    <option key={`${rank}${suit}`} value={`${rank}${suit}`}>
                      {rank}{suit}
                    </option>
                  ))
                )}
              </select>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-gray-700">Position</h2>
            <select
              className="p-2 border rounded w-full bg-white hover:border-blue-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
            >
              <option value="early">Early</option>
              <option value="middle">Middle</option>
              <option value="late">Late</option>
              <option value="blind">Blind</option>
            </select>
          </div>

          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-gray-700">Number of Players</h2>
            <input
              type="number"
              className="p-2 border rounded w-full hover:border-blue-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              value={numPlayers}
              onChange={(e) => setNumPlayers(Number(e.target.value))}
              min={2}
              max={9}
            />
          </div>

          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-gray-700">Pot Size</h2>
            <input
              type="number"
              className="p-2 border rounded w-full hover:border-blue-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              value={potSize}
              onChange={(e) => setPotSize(Number(e.target.value))}
              min={0}
            />
          </div>

          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-gray-700">Current Bet</h2>
            <input
              type="number"
              className="p-2 border rounded w-full hover:border-blue-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              value={currentBet}
              onChange={(e) => setCurrentBet(Number(e.target.value))}
              min={0}
            />
          </div>

          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-gray-700">Your Stack</h2>
            <input
              type="number"
              className="p-2 border rounded w-full hover:border-blue-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              value={stackSize}
              onChange={(e) => setStackSize(Number(e.target.value))}
              min={0}
            />
          </div>
        </div>

        <button
          className="w-full bg-blue-500 text-white p-3 rounded hover:bg-blue-600 transition-colors"
          onClick={calculateDecision}
        >
          Calculate Best Move
        </button>

        {decision && (
          <div className="mt-4 p-4 bg-gray-50 border rounded-lg">
            <div className="flex items-center space-x-2">
              <span className="text-xl">💭</span>
              <h3 className="text-lg font-semibold text-gray-800">Recommended Action</h3>
            </div>
            <p className="mt-2 text-lg text-gray-700">
              {decision.action} {decision.amount > 0 ? `$${decision.amount}` : ''}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PokerUI;