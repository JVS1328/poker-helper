// Claude vision client. Each region type has its own tool schema so the model
// returns structured JSON we can trust. Cards come back as e.g. "Ah" / "Td"
// and we convert to the app's internal "A♥" / "T♦" format.

const API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
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

const HOLE_TOOL = {
  name: 'report_hole_cards',
  description: 'Report the two hole cards visible in the cropped image.',
  input_schema: {
    type: 'object',
    properties: {
      cards: {
        type: 'array',
        items: { type: 'string', description: 'Card as rank+suit, e.g. "Ah", "Td", "2c". Use T for 10.' },
        minItems: 0,
        maxItems: 2,
      },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      notes: { type: 'string' },
    },
    required: ['cards', 'confidence'],
  },
};

const BOARD_TOOL = {
  name: 'report_board',
  description: 'Report the community / board cards visible (0 to 5 cards).',
  input_schema: {
    type: 'object',
    properties: {
      cards: {
        type: 'array',
        items: { type: 'string', description: 'Card as rank+suit, e.g. "Ah", "Td". Use T for 10.' },
        minItems: 0,
        maxItems: 5,
      },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      notes: { type: 'string' },
    },
    required: ['cards', 'confidence'],
  },
};

const NUMBER_TOOL = (name, description) => ({
  name,
  description,
  input_schema: {
    type: 'object',
    properties: {
      amount: {
        type: ['number', 'null'],
        description: 'The numeric value, in chip units. Strip $/commas. Null if unreadable.',
      },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      notes: { type: 'string' },
    },
    required: ['amount', 'confidence'],
  },
});

const POT_TOOL = NUMBER_TOOL('report_pot', 'Report the pot total visible.');
const STACK_TOOL = NUMBER_TOOL('report_stack', 'Report the player stack total visible.');

const PROMPTS = {
  hole: 'This image is a tight crop of a poker player\'s two hole cards. Identify both cards (rank + suit). Use "T" for ten. If only one or zero cards are visible, return what you can. Set confidence honestly — low if suits are ambiguous or cards are face-down.',
  board: 'This image is a tight crop of a poker community-card / board area. Identify every face-up board card from left to right (0 to 5 cards). Use "T" for ten. Card backs or empty slots should NOT be included. Set confidence honestly.',
  pot: 'This image is a tight crop of the pot indicator on a poker table. Read the numeric pot total. Strip currency symbols, commas, and "Pot:" labels. If the value uses K/M shorthand (e.g. "1.2K"), expand it to a plain number (1200). Return null if not readable.',
  stack: 'This image is a tight crop of a poker player\'s chip stack indicator. Read the numeric stack total. Strip currency symbols and commas. Expand K/M shorthand. Return null if not readable.',
};

const TOOLS = { hole: HOLE_TOOL, board: BOARD_TOOL, pot: POT_TOOL, stack: STACK_TOOL };

const callClaude = async ({ apiKey, model, image, tool, prompt, signal }) => {
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
      max_tokens: 256,
      tools: [tool],
      tool_choice: { type: 'tool', name: tool.name },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.base64 } },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Claude API ${res.status}: ${text.slice(0, 200) || res.statusText}`);
  }
  const json = await res.json();
  const block = json.content?.find(c => c.type === 'tool_use');
  if (!block) throw new Error('No tool_use in response.');
  return block.input;
};

export const readRegion = async (regionType, image, { apiKey, model, signal } = {}) => {
  if (!apiKey) throw new Error('No API key configured.');
  const tool = TOOLS[regionType];
  const prompt = PROMPTS[regionType];
  if (!tool || !prompt) throw new Error(`Unknown region type: ${regionType}`);
  const raw = await callClaude({ apiKey, model, image, tool, prompt, signal });
  const confidence = typeof raw.confidence === 'number' ? raw.confidence : 0;

  if (regionType === 'hole' || regionType === 'board') {
    const cards = Array.isArray(raw.cards) ? raw.cards.map(normalizeCard).filter(Boolean) : [];
    return { type: regionType, cards, confidence, notes: raw.notes || '' };
  }
  const amount = typeof raw.amount === 'number' && Number.isFinite(raw.amount) ? raw.amount : null;
  return { type: regionType, amount, confidence, notes: raw.notes || '' };
};
