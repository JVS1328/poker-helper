// Single-call Claude vision read of an entire poker-table screenshot.
// Sonnet 4.6 is used by default — it handles the spatial reasoning ("which
// player is the user", "which number is the pot vs. someone's stack") much
// better than Haiku does on a wide-angle screenshot.

const API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-4-6';
export const CONFIDENCE_THRESHOLD = 0.6;

const SUIT_MAP = {
  h: '♥', H: '♥', '♥': '♥',
  d: '♦', D: '♦', '♦': '♦',
  s: '♠', S: '♠', '♠': '♠',
  c: '♣', C: '♣', '♣': '♣',
};
const VALID_RANKS = new Set(['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']);

// "Ah" / "10h" / "A♥" → "A♥". Returns null if it can't be parsed cleanly.
export const normalizeCard = (raw) => {
  if (!raw || typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s) return null;
  let rank = s.slice(0, -1).toUpperCase();
  const suitChar = s.slice(-1);
  if (rank === '10') rank = 'T';
  if (!VALID_RANKS.has(rank)) return null;
  const suit = SUIT_MAP[suitChar];
  if (!suit) return null;
  return `${rank}${suit}`;
};

const cardArrayField = (description, max) => ({
  type: 'object',
  description,
  properties: {
    cards: {
      type: 'array',
      items: { type: 'string', description: 'Card as rank+suit, e.g. "Ah", "Td". Use T for ten.' },
      maxItems: max,
    },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
  required: ['cards', 'confidence'],
});

const numberField = (description) => ({
  type: 'object',
  description,
  properties: {
    amount: { type: ['number', 'null'], description: 'Numeric value or null if not visible/readable.' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
  required: ['amount', 'confidence'],
});

const TABLE_TOOL = {
  name: 'report_table_state',
  description: 'Report the current poker-table state visible in the screenshot.',
  input_schema: {
    type: 'object',
    properties: {
      hole_cards: cardArrayField(
        'The user\'s OWN two hole cards. The user is whichever player has face-up cards (their seat is usually at the bottom-center of the table). Do not return opponents\' cards (their cards will be face-down or hidden).',
        2,
      ),
      board: cardArrayField(
        'The community / board cards in the middle of the table. 0 to 5 face-up cards (preflop=0, flop=3, turn=4, river=5). Card backs and empty slots do NOT count.',
        5,
      ),
      pot: numberField(
        'The total pot — usually labelled "Pot" near the middle of the table, often as the largest number on screen. Strip $/€/commas/labels. Expand "1.2K" → 1200.',
      ),
      to_call: numberField(
        'The chip amount the user must add to stay in the hand right now. Often shown on a "Call" button next to the user\'s seat. Use 0 if the action is checked to the user (no bet outstanding). Null only if you genuinely cannot tell.',
      ),
      stack: numberField(
        'The user\'s remaining chip stack — the number directly under or beside the user\'s own seat (the same seat whose hole cards are face-up).',
      ),
      notes: {
        type: 'string',
        description: 'Optional short freeform note about anything ambiguous (e.g. "two tables visible, used the active one").',
      },
    },
    required: ['hole_cards', 'board', 'pot', 'to_call', 'stack'],
  },
};

const PROMPT = `You are reading a screenshot of an in-progress poker game so a HUD can update its state.

Identify, from the user's perspective:
1. The user's two hole cards (face-up cards belonging to the player whose UI this is — typically the bottom-center seat).
2. Community / board cards (0-5).
3. Pot total.
4. To-call amount (chips the user needs to add this round).
5. The user's chip stack.

Rules:
- Use "T" for ten in card notation (e.g. "Th" not "10h"). Suit letters: h, d, s, c.
- Strip currency symbols, commas, and labels from numbers. Expand K/M shorthand.
- Set per-field confidence honestly. Low confidence = the field is partially occluded, ambiguous, or you're guessing. The HUD will skip low-confidence fields.
- If a field genuinely isn't visible (e.g. preflop has no board), return an empty array / null with HIGH confidence — that's a confident "nothing there."
- Only the user's own cards count for hole_cards. Opponents' face-down cards do NOT.`;

export const readTableState = async (image, { apiKey, model, signal } = {}) => {
  if (!apiKey) throw new Error('No API key configured.');
  const res = await fetch(API_URL, {
    method: 'POST',
    signal,
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      max_tokens: 1024,
      tools: [TABLE_TOOL],
      tool_choice: { type: 'tool', name: TABLE_TOOL.name },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.base64 } },
          { type: 'text', text: PROMPT },
        ],
      }],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Claude API ${res.status}: ${text.slice(0, 300) || res.statusText}`);
  }
  const json = await res.json();
  const block = json.content?.find(c => c.type === 'tool_use');
  if (!block) throw new Error('No tool_use in response.');
  const raw = block.input;

  const cleanCards = (arr) => Array.isArray(arr) ? arr.map(normalizeCard).filter(Boolean) : [];
  const cleanAmount = (a) => (typeof a === 'number' && Number.isFinite(a)) ? a : null;
  const cleanConf = (c) => (typeof c === 'number' && c >= 0 && c <= 1) ? c : 0;

  return {
    holeCards: { cards: cleanCards(raw.hole_cards?.cards), confidence: cleanConf(raw.hole_cards?.confidence) },
    board:     { cards: cleanCards(raw.board?.cards),     confidence: cleanConf(raw.board?.confidence) },
    pot:       { amount: cleanAmount(raw.pot?.amount),    confidence: cleanConf(raw.pot?.confidence) },
    toCall:    { amount: cleanAmount(raw.to_call?.amount), confidence: cleanConf(raw.to_call?.confidence) },
    stack:     { amount: cleanAmount(raw.stack?.amount),  confidence: cleanConf(raw.stack?.confidence) },
    notes:     typeof raw.notes === 'string' ? raw.notes : '',
    usage:     json.usage || null,
  };
};
