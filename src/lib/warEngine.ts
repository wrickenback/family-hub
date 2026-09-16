// Pure War logic, shared by the local pass-and-play screen and the online
// game's move transaction. A hand is an array (or, once it crosses into
// Firestore/RTDB territory, a flat string) of two-character card codes —
// rank first ('2'-'9','T','J','Q','K','A'), then suit ('S','H','D','C').
//
// Simplified war rule: on a tie, each side reveals one more card (no
// face-down "burn" cards) and compares again, repeating until someone wins
// outright or runs dry. Full-fidelity War (three burned cards per side) adds
// edge cases — a player who can't cover the burn — that don't change who
// eventually wins, just how many taps it takes to get there; this keeps the
// online sync and the UI simple without changing the spirit of the game.

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUITS = ['S', 'H', 'D', 'C'];

export type CardCode = string;

export function freshDeck(): CardCode[] {
  const deck: CardCode[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) deck.push(rank + suit);
  }
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

export function rankValue(card: CardCode): number {
  return RANKS.indexOf(card[0]) + 2;
}

export function rankLabel(card: CardCode): string {
  const r = card[0];
  if (r === 'T') return '10';
  if (r === 'J') return 'J';
  if (r === 'Q') return 'Q';
  if (r === 'K') return 'K';
  if (r === 'A') return 'A';
  return r;
}

export function suitSymbol(card: CardCode): string {
  switch (card[1]) {
    case 'S':
      return '♠';
    case 'H':
      return '♥';
    case 'D':
      return '♦';
    default:
      return '♣';
  }
}

export function isRed(card: CardCode): boolean {
  return card[1] === 'H' || card[1] === 'D';
}

export function toHandString(hand: CardCode[]): string {
  return hand.join('');
}

export function fromHandString(s: string): CardCode[] {
  const hand: CardCode[] = [];
  for (let i = 0; i < s.length; i += 2) hand.push(s.slice(i, i + 2));
  return hand;
}

/** Deals a shuffled deck as evenly as possible between two hands. */
export function deal(): { a: CardCode[]; b: CardCode[] } {
  const deck = shuffle(freshDeck());
  const half = Math.floor(deck.length / 2);
  return { a: deck.slice(0, half), b: deck.slice(half) };
}

/** War has no decisions in it, and two evenly matched piles can trade the
 * same cards back and forth indefinitely — a simulated game here ran 5000
 * rounds without either side running out. So the deck isn't the finish
 * line: after this many flips, the bigger pile takes it. It keeps a game to
 * a few minutes and, unlike "play until someone has all 52", guarantees
 * there is an end to get to. */
export const MAX_ROUNDS = 60;

/** Who's ahead on cards, or null if the piles are level. */
export function leader(countA: number, countB: number): 'A' | 'B' | null {
  if (countA === countB) return null;
  return countA > countB ? 'A' : 'B';
}

export interface RoundResult {
  handA: CardCode[];
  handB: CardCode[];
  /** Every pair of cards revealed this round, in order — a single-entry
   * array normally, longer when the round went to war. */
  reveals: { a: CardCode; b: CardCode }[];
  winner: 'A' | 'B';
}

/** Plays one round (which may itself contain one or more "wars"). Returns
 * null if either hand is already empty — the game is over. */
export function playRound(
  handA: CardCode[],
  handB: CardCode[]
): RoundResult | null {
  if (handA.length === 0 || handB.length === 0) return null;

  const a = [...handA];
  const b = [...handB];
  const pot: CardCode[] = [];
  const reveals: { a: CardCode; b: CardCode }[] = [];

  let cardA = a.shift() as CardCode;
  let cardB = b.shift() as CardCode;
  pot.push(cardA, cardB);
  reveals.push({ a: cardA, b: cardB });

  while (rankValue(cardA) === rankValue(cardB)) {
    if (a.length === 0) return { handA: a, handB: [...b, ...pot], reveals, winner: 'B' };
    if (b.length === 0) return { handA: [...a, ...pot], handB: b, reveals, winner: 'A' };
    cardA = a.shift() as CardCode;
    cardB = b.shift() as CardCode;
    pot.push(cardA, cardB);
    reveals.push({ a: cardA, b: cardB });
  }

  const winner: 'A' | 'B' = rankValue(cardA) > rankValue(cardB) ? 'A' : 'B';
  return winner === 'A'
    ? { handA: [...a, ...pot], handB: b, reveals, winner }
    : { handA: a, handB: [...b, ...pot], reveals, winner };
}
