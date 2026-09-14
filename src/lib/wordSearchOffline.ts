import { OFFLINE_PUZZLES } from './wordSearchOfflinePuzzles';
import type { WordSearchPuzzle } from './firestoreWordSearch';

/** The bundled word searches, and how the rest of the app tells one from a
 * generated puzzle.
 *
 * Regenerating the puzzle data: the list of topics and their word lists is
 * the authored input; the grids are baked from it by running the server's
 * own placer (functions/src/wordSearchGrid.ts) over each list. Editing
 * wordSearchOfflinePuzzles.ts by hand means hand-checking that every word
 * still reads off the grid — change the word lists and re-bake instead. */

const OFFLINE_PREFIX = 'local-';

/** True for a bundled puzzle id. Every lookup keys off the id itself, so a
 * resumed puzzle, a deep link and a leaderboard entry all route correctly
 * without needing a flag carried alongside. */
export function isOfflinePuzzleId(id: string): boolean {
  return id.startsWith(OFFLINE_PREFIX);
}

export function getOfflinePuzzle(id: string): WordSearchPuzzle | null {
  return OFFLINE_PUZZLES.find((puzzle) => puzzle.id === id) ?? null;
}

export const OFFLINE_PUZZLE_COUNT = OFFLINE_PUZZLES.length;

/** A random bundled puzzle, avoiding the one just played so a second tap
 * doesn't hand back the same grid. */
export function randomOfflinePuzzle(excludeId?: string): WordSearchPuzzle {
  const pool = excludeId
    ? OFFLINE_PUZZLES.filter((puzzle) => puzzle.id !== excludeId)
    : OFFLINE_PUZZLES;
  return pool[Math.floor(Math.random() * pool.length)];
}
