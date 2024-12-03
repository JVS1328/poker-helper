export const HandRank = {
  HIGH_CARD: 1,
  PAIR: 2,
  TWO_PAIR: 3,
  THREE_OF_KIND: 4,
  STRAIGHT: 5,
  FLUSH: 6,
  FULL_HOUSE: 7,
  FOUR_OF_KIND: 8,
  STRAIGHT_FLUSH: 9,
  ROYAL_FLUSH: 10
};

class Card {
  constructor(rank, suit) {
    this.rank = rank;
    this.suit = suit;
    this.value = this.getRankValue(rank);
  }

  getRankValue(rank) {
    const values = { 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
    return values[rank] || parseInt(rank);
  }
}

export class PokerLogic {
  constructor() {
    this.positionWeights = {
      'early': 0.7,
      'middle': 0.85,
      'late': 1.0,
      'blind': 0.6
    };
  }

  isPocketPair(holeCards) {
    return holeCards[0].value === holeCards[1].value;
  }

  isSuited(holeCards) {
    return holeCards[0].suit === holeCards[1].suit;
  }

  isConnected(holeCards) {
    return Math.abs(holeCards[0].value - holeCards[1].value) === 1;
  }

  evaluateHand(holeCards, communityCards) {
    const allCards = [...holeCards, ...communityCards];
    const ranks = allCards.map(card => card.value);
    const suits = allCards.map(card => card.suit);

    const rankFreq = {};
    const suitFreq = {};
    ranks.forEach(r => rankFreq[r] = (rankFreq[r] || 0) + 1);
    suits.forEach(s => suitFreq[s] = (suitFreq[s] || 0) + 1);

    const isFlush = Object.values(suitFreq).some(count => count >= 5);
    
    const uniqueRanks = [...new Set(ranks)].sort((a, b) => a - b);
    let isStraight = false;
    for (let i = 0; i <= uniqueRanks.length - 5; i++) {
      if (uniqueRanks[i + 4] - uniqueRanks[i] === 4) {
        isStraight = true;
        break;
      }
    }

    const frequencies = Object.values(rankFreq).sort((a, b) => b - a);
    
    if (isFlush && isStraight) {
      const maxRank = Math.max(...ranks);
      return maxRank === 14 ? 
        { rank: HandRank.ROYAL_FLUSH, strength: 1.0 } :
        { rank: HandRank.STRAIGHT_FLUSH, strength: 0.95 };
    }

    if (frequencies[0] === 4) return { rank: HandRank.FOUR_OF_KIND, strength: 0.9 };
    if (frequencies[0] === 3 && frequencies[1] === 2) return { rank: HandRank.FULL_HOUSE, strength: 0.85 };
    if (isFlush) return { rank: HandRank.FLUSH, strength: 0.8 };
    if (isStraight) return { rank: HandRank.STRAIGHT, strength: 0.75 };
    if (frequencies[0] === 3) return { rank: HandRank.THREE_OF_KIND, strength: 0.7 };
    if (frequencies[0] === 2 && frequencies[1] === 2) return { rank: HandRank.TWO_PAIR, strength: 0.6 };
    if (frequencies[0] === 2) return { rank: HandRank.PAIR, strength: 0.5 };
    
    return { rank: HandRank.HIGH_CARD, strength: 0.3 };
  }

  getPreflopDecision(holeCards, position, numPlayers, potSize, currentBet, stackSize) {
    const h1 = holeCards[0].value;
    const h2 = holeCards[1].value;
    const isPair = this.isPocketPair(holeCards);
    const isSuited = this.isSuited(holeCards);
    const isConnected = this.isConnected(holeCards);
    
    // Premium pairs (AA, KK, QQ)
    if (isPair && h1 >= 12) {
      return { action: 'Raise', amount: Math.floor(potSize * 4) };
    }

    // Medium-high pairs (JJ-88)
    if (isPair && h1 >= 8) {
      return position === 'early' ? 
        { action: 'Call', amount: currentBet } :
        { action: 'Raise', amount: Math.floor(potSize * 2.5) };
    }

    // Small pairs (77-22)
    if (isPair && h1 < 8) {
      if (position === 'late' && numPlayers <= 4) {
        return { action: 'Call', amount: currentBet };
      }
      const setPotOdds = currentBet / (stackSize * 0.1);
      return setPotOdds <= 0.15 ? 
        { action: 'Call', amount: currentBet } :
        { action: 'Fold', amount: 0 };
    }

    // Premium unpaired (AK, AQs, KQs)
    if ((h1 >= 13 && h2 >= 12) || (h1 >= 14 && h2 >= 11 && isSuited)) {
      return { action: 'Raise', amount: Math.floor(potSize * 3) };
    }

    // Strong Ax hands
    if (h1 === 14 || h2 === 14) {
      const otherCard = h1 === 14 ? h2 : h1;
      if (otherCard >= 10 || isSuited) {
        return position === 'early' ?
          { action: 'Call', amount: currentBet } :
          { action: 'Raise', amount: Math.floor(potSize * 2) };
      }
      if (position === 'late') {
        return { action: 'Call', amount: currentBet };
      }
    }

    // Suited connectors (JTs-54s)
    if (isConnected && isSuited && Math.min(h1, h2) >= 4) {
      return position === 'late' ?
        { action: 'Call', amount: currentBet } :
        { action: 'Fold', amount: 0 };
    }

    // Broadway cards (KQ, KJ, QJ)
    if (h1 >= 11 && h2 >= 11) {
      return position === 'late' ?
        { action: 'Call', amount: currentBet } :
        { action: 'Fold', amount: 0 };
    }

    // Position-based speculative hands
    if (position === 'late' && isSuited && Math.min(h1, h2) >= 9) {
      return { action: 'Call', amount: currentBet };
    }

    return { action: 'Fold', amount: 0 };
  }

  getPostFlopDecision(handStrength, position, numPlayers, potSize, currentBet, stackSize) {
    const positionMultiplier = this.positionWeights[position] || 0.8;
    const playerAdjustment = Math.max(0.6, 1 - (numPlayers * 0.05));
    const finalStrength = handStrength * positionMultiplier * playerAdjustment;
    const potOdds = currentBet / (potSize + currentBet);
    const spr = stackSize / (potSize || 1);

    if (finalStrength > 0.8) {
      return { action: 'Raise', amount: Math.floor(Math.min(potSize * 0.75, stackSize)) };
    }

    if (finalStrength > 0.6) {
      if (spr > 3 && position === 'late') {
        return { action: 'Raise', amount: Math.floor(potSize * 0.5) };
      }
      if (potOdds < finalStrength) {
        return { action: 'Call', amount: currentBet };
      }
    }

    if (finalStrength > 0.4 && potOdds < finalStrength / 2) {
      return { action: 'Call', amount: currentBet };
    }

    return { action: 'Fold', amount: 0 };
  }

  getDecision(holeCards, communityCards, position, numPlayers, potSize, currentBet, stackSize) {
    if (communityCards.length === 0) {
      return this.getPreflopDecision(holeCards, position, numPlayers, potSize, currentBet, stackSize);
    }
    
    const { strength } = this.evaluateHand(holeCards, communityCards);
    return this.getPostFlopDecision(strength, position, numPlayers, potSize, currentBet, stackSize);
  }
}

export const parseCard = (cardStr) => {
  if (!cardStr) return null;
  const rank = cardStr.slice(0, -1);
  const suit = cardStr.slice(-1);
  return new Card(rank, suit);
};