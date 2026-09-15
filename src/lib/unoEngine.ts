// Pure Uno logic, shared by the local pass-and-play screen and the online
// game's move transaction. A card is a two-character code: a colour letter
// ('R'/'Y'/'G'/'B') followed by a digit ('0'-'9') or an action letter
// ('S'kip, re'V'erse, 'D'raw two) — or 'W' followed by ' ' for a plain Wild
// or 'F' for Wild Draw Four. Hands, the deck and the discard pile are all
// flat strings of these codes for the same reason every other game here
// keeps its board a string: no conversion layer between local state and
// what gets written to Firestore/RTDB.
//
// Deliberately simplified from full tournament Uno for a casual family
// game: two players only (so Reverse behaves exactly like Skip — there's
// nowhere else to reverse to), no stacking +2/+4 onto the next draw, and no
// "catch the Uno call-out" penalty — the UI just badges a one-card hand.

export type Color = 'R' | 'Y' | 'G' | 'B';
export const COLORS: Color[] = ['R', 'Y', 'G', 'B'];
export type CardCode = string;
export type Kind = 'number' | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4';

export function isWild(card: CardCode): boolean {
  return card[0] === 'W';
}

export function cardColor(card: CardCode): Color | null {
  return isWild(card) ? null : (card[0] as Color);
}

export function cardKind(card: CardCode): Kind {
  if (card[0] === 'W') return card[1] === 'F' ? 'wild4' : 'wild';
  const v = card[1];
  if (v === 'S') return 'skip';
  if (v === 'V') return 'reverse';
  if (v === 'D') return 'draw2';
  return 'number';
}

export function cardLabel(card: CardCode): string {
  switch (cardKind(card)) {
    case 'skip':
      return 'Skip';
    case 'reverse':
      return 'Reverse';
    case 'draw2':
      return '+2';
    case 'wild':
      return 'Wild';
    case 'wild4':
      return '+4';
    default:
      return card[1];
  }
}

export const COLOR_HEX: Record<Color, string> = {
  R: '#D32F2F',
  Y: '#E0A80C',
  G: '#2E9E4F',
  B: '#1E6FD9',
};

export const COLOR_NAME: Record<Color, string> = {
  R: 'Red',
  Y: 'Yellow',
  G: 'Green',
  B: 'Blue',
};

export function freshDeck(): CardCode[] {
  const deck: CardCode[] = [];
  for (const color of COLORS) {
    deck.push(color + '0');
    for (let n = 1; n <= 9; n++) {
      deck.push(color + n, color + n);
    }
    for (const action of ['S', 'V', 'D']) {
      deck.push(color + action, color + action);
    }
  }
  for (let i = 0; i < 4; i++) deck.push('WC');
  for (let i = 0; i < 4; i++) deck.push('WF');
  return deck;
}

export function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function toHandString(hand: CardCode[]): string {
  return hand.join('');
}

export function fromHandString(s: string): CardCode[] {
  const hand: CardCode[] = [];
  for (let i = 0; i < s.length; i += 2) hand.push(s.slice(i, i + 2));
  return hand;
}

export function isPlayable(
  card: CardCode,
  topCard: CardCode,
  color: Color
): boolean {
  if (isWild(card)) return true;
  if (cardColor(card) === color) return true;
  const k1 = cardKind(card);
  const k2 = cardKind(topCard);
  if (k1 === 'number' && k2 === 'number') return card[1] === topCard[1];
  if (k1 !== 'number' && k1 === k2) return true;
  return false;
}

export function anyPlayable(
  hand: CardCode[],
  topCard: CardCode,
  color: Color
): boolean {
  return hand.some((c) => isPlayable(c, topCard, color));
}

/** Draws up to `n` cards, reshuffling the discard pile back into the deck
 * (topCard stays put) if the draw pile runs dry mid-draw. */
export function drawFromDeck(
  deck: CardCode[],
  discardPile: CardCode[],
  n: number
): { drawn: CardCode[]; deck: CardCode[]; discardPile: CardCode[] } {
  let d = [...deck];
  let disc = [...discardPile];
  const drawn: CardCode[] = [];
  for (let i = 0; i < n; i++) {
    if (d.length === 0) {
      if (disc.length === 0) break; // every card is already in a hand
      d = shuffle(disc);
      disc = [];
    }
    drawn.push(d.shift() as CardCode);
  }
  return { drawn, deck: d, discardPile: disc };
}

export interface DealResult {
  handA: CardCode[];
  handB: CardCode[];
  deck: CardCode[];
  discardPile: CardCode[];
  topCard: CardCode;
  color: Color;
}

/** Deals 7 cards to each hand and flips a starting card. The starting card
 * is redrawn until it's a plain number — starting on a Wild or an action
 * card would need house-rule guessing about who it applies to before
 * anyone has taken a turn. */
export function deal(): DealResult {
  const deck = shuffle(freshDeck());
  const handA = deck.splice(0, 7);
  const handB = deck.splice(0, 7);
  let topCard = deck.shift() as CardCode;
  const burned: CardCode[] = [];
  while (cardKind(topCard) !== 'number') {
    burned.push(topCard);
    topCard = deck.shift() as CardCode;
  }
  return {
    handA,
    handB,
    deck: [...deck, ...shuffle(burned)],
    discardPile: [],
    topCard,
    color: cardColor(topCard) as Color,
  };
}

export interface UnoState {
  handA: CardCode[];
  handB: CardCode[];
  deck: CardCode[];
  discardPile: CardCode[];
  topCard: CardCode;
  color: Color;
}

export type PlayEvent = 'skip' | 'draw2' | 'wild4' | 'wild' | null;

export interface PlayResult {
  state: UnoState;
  /** 'again' means the opponent's turn was skipped (Skip/Reverse/Draw Two/
   * Wild Draw Four all resolve the same way in a two-player game). */
  effect: 'normal' | 'again' | 'winner';
  event: PlayEvent;
}

/** Plays one card from `letter`'s hand. Returns null if the card isn't in
 * hand or doesn't match the pile — callers can trust a non-null result is
 * fully legal. */
export function playCard(
  state: UnoState,
  letter: 'A' | 'B',
  card: CardCode,
  chosenColor?: Color
): PlayResult | null {
  const hand = letter === 'A' ? state.handA : state.handB;
  const idx = hand.indexOf(card);
  if (idx === -1) return null;
  if (!isPlayable(card, state.topCard, state.color)) return null;
  if (isWild(card) && !chosenColor) return null;

  const newHand = [...hand.slice(0, idx), ...hand.slice(idx + 1)];
  const newColor = isWild(card) ? (chosenColor as Color) : (cardColor(card) as Color);
  let opponentHand = letter === 'A' ? state.handB : state.handA;
  let deck = state.deck;
  let discardPile = [...state.discardPile, state.topCard];
  let event: PlayEvent = null;
  let again = false;

  const kind = cardKind(card);
  if (kind === 'skip' || kind === 'reverse') {
    again = true;
    event = 'skip';
  } else if (kind === 'draw2') {
    const r = drawFromDeck(deck, discardPile, 2);
    opponentHand = [...opponentHand, ...r.drawn];
    deck = r.deck;
    discardPile = r.discardPile;
    again = true;
    event = 'draw2';
  } else if (kind === 'wild4') {
    const r = drawFromDeck(deck, discardPile, 4);
    opponentHand = [...opponentHand, ...r.drawn];
    deck = r.deck;
    discardPile = r.discardPile;
    again = true;
    event = 'wild4';
  } else if (kind === 'wild') {
    event = 'wild';
  }

  const state2: UnoState = {
    handA: letter === 'A' ? newHand : opponentHand,
    handB: letter === 'B' ? newHand : opponentHand,
    deck,
    discardPile,
    topCard: card,
    color: newColor,
  };

  return {
    state: state2,
    effect: newHand.length === 0 ? 'winner' : again ? 'again' : 'normal',
    event,
  };
}

/** Draws one card into `letter`'s hand, for when nothing playable is on
 * offer (or the player just wants an extra option). Turn-passing is the
 * caller's decision, not this function's. */
export function drawOne(state: UnoState, letter: 'A' | 'B'): UnoState {
  const r = drawFromDeck(state.deck, state.discardPile, 1);
  const hand = (letter === 'A' ? state.handA : state.handB).concat(r.drawn);
  return {
    ...state,
    deck: r.deck,
    discardPile: r.discardPile,
    handA: letter === 'A' ? hand : state.handA,
    handB: letter === 'B' ? hand : state.handB,
  };
}
