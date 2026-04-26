import React from 'react';

const suitColor = (suit) => (suit === '♥' || suit === '♦' ? 'text-red-600' : 'text-gray-900');

const CardSlot = ({ card, onClick, placeholder = '+', size = 'md' }) => {
  const sizeClasses = {
    sm: 'w-12 h-16 text-base',
    md: 'w-16 h-24 text-2xl',
    lg: 'w-20 h-28 text-3xl',
  }[size];

  const filled = !!card;
  const rank = filled ? card.slice(0, -1) : '';
  const suit = filled ? card.slice(-1) : '';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        ${sizeClasses}
        flex flex-col items-center justify-center
        rounded-lg border-2 font-bold
        transition-colors select-none
        ${filled
          ? `bg-white ${suitColor(suit)} border-gray-300 hover:border-blue-500 shadow-sm`
          : 'bg-gray-50 text-gray-400 border-dashed border-gray-300 hover:border-blue-500 hover:bg-blue-50'
        }
      `}
    >
      {filled ? (
        <>
          <span>{rank}</span>
          <span className="leading-none">{suit}</span>
        </>
      ) : (
        <span className="text-xl text-gray-400">{placeholder}</span>
      )}
    </button>
  );
};

export default CardSlot;
