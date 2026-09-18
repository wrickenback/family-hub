import { CLUES, MINI_GRIDS } from './miniCrosswordPuzzles';
import { seedFromDateKey } from './blocksEngine';

/** Which model wrote the puzzle, or the bundled set. Declared here rather
 * than imported so this file stays free of anything Firebase-shaped. */
export type PuzzleSource = 'gemini' | 'haiku' | 'sonnet' | 'fallback';

/** The 5x5 mini crossword.
 *
 * The block pattern is fixed and shared with the generator prompt on the
 * server — see functions/src/wordGames.ts. Keeping one shape means the
 * board can be laid out once and an AI-written puzzle and a bundled one are
 * the same thing to everything downstream of here. */

export const SIZE = 5;

export const PATTERN = ['...##', '.....', '.....', '.....', '##...'];

export interface Slot {
  direction: 'across' | 'down';
  row: number;
  col: number;
  length: number;
}

export interface CrosswordEntry extends Slot {
  answer: string;
  clue: string;
  /** Display number, as on a real crossword — shared by an across and a
   * down that start on the same square. */
  number: number;
}

export interface MiniCrossword {
  grid: string[];
  entries: CrosswordEntry[];
  source: PuzzleSource;
}

export function isBlock(row: number, col: number): boolean {
  return PATTERN[row][col] === '#';
}

function open(row: number, col: number): boolean {
  return (
    row >= 0 && row < SIZE && col >= 0 && col < SIZE && !isBlock(row, col)
  );
}

/** Every run of three or more open squares, derived from the pattern rather
 * than listed, so the two can never disagree. */
export const SLOTS: Slot[] = (() => {
  const slots: Slot[] = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!open(r, c)) continue;
      if (!open(r, c - 1)) {
        let length = 0;
        while (open(r, c + length)) length++;
        if (length >= 3) slots.push({ direction: 'across', row: r, col: c, length });
      }
      if (!open(r - 1, c)) {
        let length = 0;
        while (open(r + length, c)) length++;
        if (length >= 3) slots.push({ direction: 'down', row: r, col: c, length });
      }
    }
  }
  return slots;
})();

/** Crossword numbering: squares that start any entry, in reading order. */
export const NUMBERS: Map<string, number> = (() => {
  const numbers = new Map<string, number>();
  let next = 1;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (SLOTS.some((s) => s.row === r && s.col === c)) {
        numbers.set(`${r},${c}`, next++);
      }
    }
  }
  return numbers;
})();

export function cellsOf(slot: Slot): [number, number][] {
  return Array.from({ length: slot.length }, (_, i) =>
    slot.direction === 'across'
      ? ([slot.row, slot.col + i] as [number, number])
      : ([slot.row + i, slot.col] as [number, number])
  );
}

function readSlot(grid: string[], slot: Slot): string {
  return cellsOf(slot)
    .map(([r, c]) => grid[r][c])
    .join('');
}

/** An empty board in the puzzle's shape — blocks in place, letters blank. */
export function emptyBoard(): string[] {
  return PATTERN.map((row) =>
    row
      .split('')
      .map((cell) => (cell === '#' ? '#' : ' '))
      .join('')
  );
}

export function isSolved(board: string[], puzzle: MiniCrossword): boolean {
  return puzzle.entries.every((entry) => readSlot(board, entry) === entry.answer);
}

/** Which squares hold the wrong letter — the "check my grid" button. Only
 * filled squares count, so it never accuses you of a square you left
 * blank. */
export function wrongCells(board: string[], puzzle: MiniCrossword): Set<string> {
  const wrong = new Set<string>();
  for (const entry of puzzle.entries) {
    cellsOf(entry).forEach(([r, c], i) => {
      const letter = board[r][c];
      if (letter !== ' ' && letter !== entry.answer[i]) wrong.add(`${r},${c}`);
    });
  }
  return wrong;
}

export function setCell(
  board: string[],
  row: number,
  col: number,
  letter: string
): string[] {
  return board.map((line, r) =>
    r === row
      ? line.substring(0, col) + (letter || ' ') + line.substring(col + 1)
      : line
  );
}

/** Builds the clued entries for a grid, or null if any answer has no clue.
 * Exported because the fetch path reuses it for a generated grid — see
 * firestoreCrossword.ts. */
export function entriesFor(
  grid: string[],
  clueFor: (answer: string, slot: Slot) => string | undefined
): CrosswordEntry[] | null {
  const entries: CrosswordEntry[] = [];
  for (const slot of SLOTS) {
    const answer = readSlot(grid, slot);
    if (!/^[A-Z]+$/.test(answer)) return null;
    const clue = clueFor(answer, slot);
    if (!clue) return null;
    entries.push({
      ...slot,
      answer,
      clue,
      number: NUMBERS.get(`${slot.row},${slot.col}`) ?? 0,
    });
  }
  return entries;
}

/** A bundled puzzle, picked by date so the family shares one on a day
 * nothing could be generated. Returns null only if a grid ships with an
 * unclued answer, which the note in miniCrosswordPuzzles warns against. */
export function fallbackCrossword(dateKey: string): MiniCrossword | null {
  const grid =
    MINI_GRIDS[Math.abs(seedFromDateKey(dateKey)) % MINI_GRIDS.length];
  const entries = entriesFor(grid, (answer) => CLUES[answer]);
  return entries ? { grid, entries, source: 'fallback' } : null;
}
