/** Yahtzee's rules, with no React and no transport in sight — the same
 * scoring drives the pass-and-play sheet and the online one.
 *
 * Dice and holds are strings rather than arrays for the same reason the
 * other games encode their boards that way: the Realtime Database turns a
 * sparse array into an object and drops `false`, so "HNNNH" survives a round
 * trip that [true,false,false,false,true] does not. */

export const DICE_COUNT = 5;
export const ROLLS_PER_TURN = 3;

/** No dice on the table yet — the turn hasn't started. */
export const NO_DICE = '';
export const NO_HOLDS = '-----';

export type Section = 'upper' | 'lower';

export interface Category {
  id: string;
  label: string;
  section: Section;
  /** Shown under the name on the sheet, so nobody has to remember the rule. */
  hint: string;
}

export const CATEGORIES: Category[] = [
  { id: 'ones', label: 'Ones', section: 'upper', hint: 'Sum of 1s' },
  { id: 'twos', label: 'Twos', section: 'upper', hint: 'Sum of 2s' },
  { id: 'threes', label: 'Threes', section: 'upper', hint: 'Sum of 3s' },
  { id: 'fours', label: 'Fours', section: 'upper', hint: 'Sum of 4s' },
  { id: 'fives', label: 'Fives', section: 'upper', hint: 'Sum of 5s' },
  { id: 'sixes', label: 'Sixes', section: 'upper', hint: 'Sum of 6s' },
  { id: 'threeKind', label: 'Three of a kind', section: 'lower', hint: 'Sum of all dice' },
  { id: 'fourKind', label: 'Four of a kind', section: 'lower', hint: 'Sum of all dice' },
  { id: 'fullHouse', label: 'Full house', section: 'lower', hint: '25 points' },
  { id: 'smallStraight', label: 'Small straight', section: 'lower', hint: 'Four in a row — 30' },
  { id: 'largeStraight', label: 'Large straight', section: 'lower', hint: 'Five in a row — 40' },
  { id: 'yahtzee', label: 'Yahtzee', section: 'lower', hint: 'Five alike — 50' },
  { id: 'chance', label: 'Chance', section: 'lower', hint: 'Sum of all dice' },
];

export const UPPER_BONUS_TARGET = 63;
export const UPPER_BONUS = 35;

/** A filled-in sheet. A category that hasn't been taken yet is simply
 * absent, which is also how it survives the Realtime Database — storing an
 * explicit null there would delete the key anyway. */
export type Sheet = Record<string, number>;

export function parseDice(dice: string): number[] {
  return dice.split('').map((d) => Number(d));
}

/** Rolls every die that isn't being held. */
export function rollDice(
  dice: string,
  held: string,
  rng: () => number = Math.random
): string {
  let next = '';
  for (let i = 0; i < DICE_COUNT; i++) {
    const keep = dice[i] && held[i] === 'H';
    next += keep ? dice[i] : String(1 + Math.floor(rng() * 6));
  }
  return next;
}

function counts(dice: number[]): number[] {
  const byFace = new Array(7).fill(0);
  for (const die of dice) byFace[die]++;
  return byFace;
}

function hasRun(byFace: number[], length: number): boolean {
  let run = 0;
  for (let face = 1; face <= 6; face++) {
    run = byFace[face] > 0 ? run + 1 : 0;
    if (run >= length) return true;
  }
  return false;
}

/** What a given category would score for these dice. Always defined — a
 * category that doesn't match simply scores zero, which is exactly what
 * taking it as a sacrifice means. */
export function scoreFor(categoryId: string, dice: string): number {
  if (dice.length < DICE_COUNT) return 0;
  const values = parseDice(dice);
  const byFace = counts(values);
  const total = values.reduce((sum, d) => sum + d, 0);

  switch (categoryId) {
    case 'ones':
      return byFace[1] * 1;
    case 'twos':
      return byFace[2] * 2;
    case 'threes':
      return byFace[3] * 3;
    case 'fours':
      return byFace[4] * 4;
    case 'fives':
      return byFace[5] * 5;
    case 'sixes':
      return byFace[6] * 6;
    case 'threeKind':
      return byFace.some((n) => n >= 3) ? total : 0;
    case 'fourKind':
      return byFace.some((n) => n >= 4) ? total : 0;
    // Five alike counts as a full house here. It's a house rule rather than
    // the tournament one, but a kid who rolls five sixes and is told it
    // isn't a full house has learned nothing except that the game is mean.
    case 'fullHouse':
      return (byFace.includes(3) && byFace.includes(2)) || byFace.includes(5)
        ? 25
        : 0;
    case 'smallStraight':
      return hasRun(byFace, 4) ? 30 : 0;
    case 'largeStraight':
      return hasRun(byFace, 5) ? 40 : 0;
    case 'yahtzee':
      return byFace.includes(5) ? 50 : 0;
    case 'chance':
      return total;
    default:
      return 0;
  }
}

export function upperSubtotal(sheet: Sheet): number {
  return CATEGORIES.filter((c) => c.section === 'upper').reduce(
    (sum, c) => sum + (sheet[c.id] ?? 0),
    0
  );
}

export function bonusFor(sheet: Sheet): number {
  return upperSubtotal(sheet) >= UPPER_BONUS_TARGET ? UPPER_BONUS : 0;
}

export function grandTotal(sheet: Sheet): number {
  const scored = CATEGORIES.reduce((sum, c) => sum + (sheet[c.id] ?? 0), 0);
  return scored + bonusFor(sheet);
}

export function isSheetFull(sheet: Sheet): boolean {
  return CATEGORIES.every((c) => sheet[c.id] !== undefined);
}

export function toggleHold(held: string, index: number): string {
  const next = held.split('');
  next[index] = next[index] === 'H' ? '-' : 'H';
  return next.join('');
}

/** The best open category for these dice — what "where should I put this?"
 * resolves to when a player taps the suggestion. Ties break toward the
 * earlier category so a sacrifice lands in the cheapest upper box. */
export function bestOpenCategory(sheet: Sheet, dice: string): string | null {
  let best: string | null = null;
  let bestScore = -1;
  for (const category of CATEGORIES) {
    if (sheet[category.id] !== undefined) continue;
    const score = scoreFor(category.id, dice);
    if (score > bestScore) {
      bestScore = score;
      best = category.id;
    }
  }
  return best;
}
