import { mulberry32 } from './blocksEngine';

export type Suit = 'S' | 'H' | 'D' | 'C';
export type DrawCount = 1 | 3;

export interface Card {
  /** Stable across a whole game so React keys survive every move. */
  id: string;
  suit: Suit;
  /** 1 = ace, 11/12/13 = J/Q/K. */
  rank: number;
  faceUp: boolean;
}

export interface SolitaireState {
  stock: Card[];
  waste: Card[];
  /** Four piles, indexed by SUITS order — ascending from ace. */
  foundations: Card[][];
  /** Seven columns, dealt 1..7 deep with only the last card face up. */
  tableau: Card[][];
  drawCount: DrawCount;
  moves: number;
  /** How many times the waste has been turned back into the stock. Draw-1
   * would otherwise be an infinite loop through the deck, which makes
   * "stuck" undetectable; the UI doesn't limit redeals, it just reports it. */
  redeals: number;
}

export const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
export const SUIT_SYMBOL: Record<Suit, string> = {
  S: '♠',
  H: '♥',
  D: '♦',
  C: '♣',
};
const RANK_LABELS = [
  '',
  'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K',
];

export function rankLabel(rank: number): string {
  return RANK_LABELS[rank] ?? String(rank);
}

export function isRed(suit: Suit): boolean {
  return suit === 'H' || suit === 'D';
}

/** A tableau card may sit on one of the opposite colour, one rank higher. */
function stacksOnTableau(card: Card, onto: Card | undefined): boolean {
  if (!onto) return card.rank === 13; // only a king starts an empty column
  return isRed(card.suit) !== isRed(onto.suit) && card.rank === onto.rank - 1;
}

function stacksOnFoundation(card: Card, pile: Card[], suit: Suit): boolean {
  if (card.suit !== suit) return false;
  return card.rank === pile.length + 1;
}

function freshDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 13; rank++) {
      deck.push({ id: `${suit}${rank}`, suit, rank, faceUp: false });
    }
  }
  return deck;
}

/** Fisher-Yates against a supplied RNG, so a seeded deal is reproducible —
 * that's what lets the whole family play byte-identical cards on the same
 * day and compare times honestly. */
function shuffle(deck: Card[], rng: () => number): Card[] {
  const out = [...deck];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function dealSolitaire(
  drawCount: DrawCount,
  seed?: number
): SolitaireState {
  const rng =
    seed === undefined ? Math.random : mulberry32(seed || 1);
  const deck = shuffle(freshDeck(), rng);
  const tableau: Card[][] = [];
  let next = 0;
  for (let col = 0; col < 7; col++) {
    const pile: Card[] = [];
    for (let i = 0; i <= col; i++) {
      const card = { ...deck[next++] };
      card.faceUp = i === col;
      pile.push(card);
    }
    tableau.push(pile);
  }
  return {
    stock: deck.slice(next).map((c) => ({ ...c, faceUp: false })),
    waste: [],
    foundations: [[], [], [], []],
    tableau,
    drawCount,
    moves: 0,
    redeals: 0,
  };
}

function clone(state: SolitaireState): SolitaireState {
  return {
    ...state,
    stock: [...state.stock],
    waste: [...state.waste],
    foundations: state.foundations.map((p) => [...p]),
    tableau: state.tableau.map((p) => [...p]),
  };
}

/** Turns the next card(s) face up onto the waste, or recycles the waste
 * back into the stock when it's empty. Returns null when neither is
 * possible (both piles empty), so callers can leave the state untouched. */
export function drawFromStock(state: SolitaireState): SolitaireState | null {
  const next = clone(state);
  if (next.stock.length === 0) {
    if (next.waste.length === 0) return null;
    next.stock = next.waste
      .slice()
      .reverse()
      .map((c) => ({ ...c, faceUp: false }));
    next.waste = [];
    next.redeals += 1;
    next.moves += 1;
    return next;
  }
  const count = Math.min(state.drawCount, next.stock.length);
  for (let i = 0; i < count; i++) {
    const card = next.stock.pop()!;
    next.waste.push({ ...card, faceUp: true });
  }
  next.moves += 1;
  return next;
}

export interface Selection {
  from: 'tableau' | 'waste';
  /** Column index for a tableau selection; ignored for the waste. */
  col: number;
  /** Index within the column of the topmost selected card. */
  index: number;
}

/** The cards a selection actually picks up — a tableau selection carries
 * everything below it, which is the whole point of building runs. */
export function selectedCards(
  state: SolitaireState,
  sel: Selection
): Card[] {
  if (sel.from === 'waste') {
    const top = state.waste[state.waste.length - 1];
    return top ? [top] : [];
  }
  return state.tableau[sel.col].slice(sel.index);
}

/** A face-up run is only movable if it's already a valid descending,
 * alternating-colour sequence — otherwise picking it up would let a player
 * teleport a buried card. */
export function canPickUp(state: SolitaireState, sel: Selection): boolean {
  const cards = selectedCards(state, sel);
  if (cards.length === 0) return false;
  if (!cards[0].faceUp) return false;
  for (let i = 1; i < cards.length; i++) {
    if (!stacksOnTableau(cards[i], cards[i - 1])) return false;
  }
  return true;
}

export function canDropOnTableau(
  state: SolitaireState,
  sel: Selection,
  col: number
): boolean {
  if (!canPickUp(state, sel)) return false;
  if (sel.from === 'tableau' && sel.col === col) return false;
  const cards = selectedCards(state, sel);
  const pile = state.tableau[col];
  return stacksOnTableau(cards[0], pile[pile.length - 1]);
}

export function canDropOnFoundation(
  state: SolitaireState,
  sel: Selection,
  foundationIndex: number
): boolean {
  if (!canPickUp(state, sel)) return false;
  const cards = selectedCards(state, sel);
  // Foundations take one card at a time, never a run.
  if (cards.length !== 1) return false;
  return stacksOnFoundation(
    cards[0],
    state.foundations[foundationIndex],
    SUITS[foundationIndex]
  );
}

function removeSelected(next: SolitaireState, sel: Selection): Card[] {
  if (sel.from === 'waste') {
    const card = next.waste.pop();
    return card ? [card] : [];
  }
  const pile = next.tableau[sel.col];
  const cards = pile.splice(sel.index);
  // Uncovering a face-down card always flips it — in Klondike there's never
  // a reason not to, so making the player tap it again is just friction.
  const under = pile[pile.length - 1];
  if (under && !under.faceUp) pile[pile.length - 1] = { ...under, faceUp: true };
  return cards;
}

export function moveToTableau(
  state: SolitaireState,
  sel: Selection,
  col: number
): SolitaireState | null {
  if (!canDropOnTableau(state, sel, col)) return null;
  const next = clone(state);
  const cards = removeSelected(next, sel);
  next.tableau[col] = [...next.tableau[col], ...cards];
  next.moves += 1;
  return next;
}

export function moveToFoundation(
  state: SolitaireState,
  sel: Selection,
  foundationIndex: number
): SolitaireState | null {
  if (!canDropOnFoundation(state, sel, foundationIndex)) return null;
  const next = clone(state);
  const cards = removeSelected(next, sel);
  next.foundations[foundationIndex] = [
    ...next.foundations[foundationIndex],
    ...cards,
  ];
  next.moves += 1;
  return next;
}

/** Where a single tapped card should go when the player asks for "just put
 * it somewhere sensible": its foundation first, then any column it fits. */
export function autoPlace(
  state: SolitaireState,
  sel: Selection
): SolitaireState | null {
  const cards = selectedCards(state, sel);
  if (cards.length === 1) {
    for (let f = 0; f < 4; f++) {
      const moved = moveToFoundation(state, sel, f);
      if (moved) return moved;
    }
  }
  for (let col = 0; col < 7; col++) {
    const moved = moveToTableau(state, sel, col);
    if (moved) return moved;
  }
  return null;
}

export function isWon(state: SolitaireState): boolean {
  return state.foundations.every((pile) => pile.length === 13);
}

/** True once every card is face up and the stock is exhausted — from there
 * the rest of the game is mechanical, so the UI offers to finish it. */
export function canAutoFinish(state: SolitaireState): boolean {
  if (isWon(state)) return false;
  if (state.stock.length > 0 || state.waste.length > 1) return false;
  return state.tableau.every((pile) => pile.every((card) => card.faceUp));
}

/** Plays one forced card to a foundation, for the auto-finish animation.
 * Returns null when nothing more can go up. */
export function stepAutoFinish(state: SolitaireState): SolitaireState | null {
  for (let col = 0; col < 7; col++) {
    const pile = state.tableau[col];
    if (pile.length === 0) continue;
    const sel: Selection = { from: 'tableau', col, index: pile.length - 1 };
    for (let f = 0; f < 4; f++) {
      const moved = moveToFoundation(state, sel, f);
      if (moved) return moved;
    }
  }
  if (state.waste.length > 0) {
    const sel: Selection = { from: 'waste', col: 0, index: 0 };
    for (let f = 0; f < 4; f++) {
      const moved = moveToFoundation(state, sel, f);
      if (moved) return moved;
    }
  }
  return null;
}

/** Whether anything currently on the tableau can move — to a foundation,
 * or onto another column in a way that achieves something. Sliding a whole
 * column onto an empty one only shuffles it sideways, so it doesn't count. */
function hasTableauMove(state: SolitaireState): boolean {
  for (let col = 0; col < 7; col++) {
    const pile = state.tableau[col];
    for (let i = 0; i < pile.length; i++) {
      if (!pile[i].faceUp) continue;
      const sel: Selection = { from: 'tableau', col, index: i };
      if (!canPickUp(state, sel)) continue;
      for (let f = 0; f < 4; f++) {
        if (canDropOnFoundation(state, sel, f)) return true;
      }
      for (let target = 0; target < 7; target++) {
        if (target === col) continue;
        if (state.tableau[target].length === 0 && i === 0) continue;
        if (canDropOnTableau(state, sel, target)) return true;
      }
    }
  }
  return false;
}

function wasteTopIsPlayable(state: SolitaireState): boolean {
  if (state.waste.length === 0) return false;
  const sel: Selection = { from: 'waste', col: 0, index: 0 };
  for (let f = 0; f < 4; f++) {
    if (canDropOnFoundation(state, sel, f)) return true;
  }
  for (let col = 0; col < 7; col++) {
    if (canDropOnTableau(state, sel, col)) return true;
  }
  return false;
}

/** True when the game genuinely cannot be continued.
 *
 * Simply checking "nothing can move right now" would be wrong — there is
 * almost always another card to turn. So when the tableau is frozen, this
 * deals the stock all the way round, untouched, and asks whether any card
 * it exposes could be played. That answers the question exactly for both
 * draw counts, including draw-3, where only every third card ever reaches
 * the top of the waste. Nothing playable in a full circuit, and nothing to
 * do on the tableau, means the game really is over.
 *
 * Erring the other way — declaring a winnable game dead — would be far
 * worse than never firing, so the circuit is bounded by two full redeals
 * and gives up (reporting "not stuck") rather than guessing. */
export function isStuck(state: SolitaireState): boolean {
  if (isWon(state)) return false;
  if (hasTableauMove(state)) return false;
  if (wasteTopIsPlayable(state)) return false;

  const startRedeals = state.redeals;
  let probe: SolitaireState | null = state;
  // A full circuit can't take more turns than there are cards, plus the
  // redeals themselves; the redeal bound is the real stop condition.
  for (let i = 0; i < 120; i++) {
    probe = drawFromStock(probe);
    if (!probe) return true; // nothing left to turn at all
    if (probe.redeals > startRedeals + 1) break;
    if (wasteTopIsPlayable(probe)) return false;
  }
  return true;
}
