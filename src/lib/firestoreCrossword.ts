import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { CLUES } from './miniCrosswordPuzzles';
import {
  SIZE,
  entriesFor,
  fallbackCrossword,
  type MiniCrossword,
  type PuzzleSource,
} from './miniCrosswordEngine';

/** Today's crossword, from the Cloud Function that generates and caches it.
 *
 * Slow by the standards of everything else here: on a day nobody has opened
 * it yet this is waiting on a model to solve a grid, which is why the
 * screen shows a real progress state rather than a spinner and a hope.
 * Never throws — a failure of any kind lands on the bundled puzzle, since
 * nothing about it is the player's fault. */
export async function fetchMiniCrossword(
  dateKey: string
): Promise<MiniCrossword | null> {
  const offline = fallbackCrossword(dateKey);
  if (!functions) return offline;

  try {
    const call = httpsCallable(functions, 'getMiniCrossword');
    const result = await call({ dateKey });
    const data = result.data as {
      grid?: unknown;
      entries?: unknown;
      source?: unknown;
    };

    if (
      !Array.isArray(data.grid) ||
      data.grid.length !== SIZE ||
      !Array.isArray(data.entries)
    ) {
      return offline;
    }

    const grid = data.grid.map((row) => String(row).toUpperCase());
    if (grid.some((row) => !/^[A-Z#]{5}$/.test(row))) return offline;

    const supplied = new Map<string, string>();
    for (const raw of data.entries as unknown[]) {
      if (!raw || typeof raw !== 'object') continue;
      const entry = raw as Record<string, unknown>;
      const key = `${entry.direction}:${entry.row}:${entry.col}`;
      if (typeof entry.clue === 'string') supplied.set(key, entry.clue);
    }

    // The clue normally comes from the server; the bundled list is only a
    // backstop for an entry that somehow arrives without one, so a single
    // missing clue doesn't cost the whole puzzle.
    const entries = entriesFor(
      grid,
      (answer, slot) =>
        supplied.get(`${slot.direction}:${slot.row}:${slot.col}`) ?? CLUES[answer]
    );
    if (!entries) return offline;

    return {
      grid,
      entries,
      source: (data.source as PuzzleSource) ?? 'fallback',
    };
  } catch {
    return offline;
  }
}
