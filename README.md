# Poker Decision Helper

A React-based application that provides poker hand decision recommendations based on multiple factors including position, stack sizes, and current game state.

## Features

### Game State Inputs
- Hole cards (your hand)
- Community cards
- Table position (early/middle/late/blind)
- Number of players
- Pot size
- Current bet amount
- Stack size

### Decision Logic

#### Preflop Decisions
- Premium pairs (AA, KK, QQ)
- Medium pairs (JJ-88)
- Small pairs (77-22)
- Premium unpaired (AK, AQs)
- Suited connectors
- Broadway cards
- Position-based adjustments

#### Postflop Analysis
- Hand strength evaluation
- Position multipliers
- Pot odds calculations
- Stack-to-pot ratio considerations

### Position Guide
- Early: Under the Gun (UTG, UTG+1, UTG+2)
- Middle: Middle Position
- Late: Hijack, Cutoff, Button
- Blind: Small Blind, Big Blind

## Technical Stack
- React
- Tailwind CSS
- JavaScript ES6+

## Installation

```bash
# Create new React project
npx create-react-app poker-helper
cd poker-helper

# Install Tailwind
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

# Start application
npm start
