import type { Board, Shape } from './blocksEngine';

export interface BlocksProgress {
  board: Board;
  tray: Array<{ shape: Shape; color: number } | null>;
  score: number;
  streak: number;
}

const STORAGE_KEY = 'familyhub:blocks:progress';

/**
 * Save blocks game progress to localStorage. Wrapped in try/catch to handle
 * private-mode browsers and cleared site data that may throw on access.
 */
export function saveBlocksProgress(progress: BlocksProgress): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // localStorage is unavailable; continue without persistence
  }
}

/**
 * Load and validate blocks game progress from localStorage. Returns null if
 * no progress exists, storage is unavailable, or data is corrupt/invalid.
 */
export function loadBlocksProgress(): BlocksProgress | null {
  try {
    const item = localStorage.getItem(STORAGE_KEY);
    if (!item) return null;

    const data = JSON.parse(item) as unknown;
    if (!data || typeof data !== 'object') return null;

    const progress = data as Record<string, unknown>;

    // Validate board: should be an array of arrays of numbers
    if (!Array.isArray(progress.board) || progress.board.length === 0) {
      return null;
    }
    for (const row of progress.board) {
      if (!Array.isArray(row) || !row.every((cell) => typeof cell === 'number')) {
        return null;
      }
    }

    // Validate tray: should be an array of shapes or nulls
    if (!Array.isArray(progress.tray)) {
      return null;
    }
    for (const slot of progress.tray) {
      if (slot !== null) {
        if (
          typeof slot !== 'object' ||
          !Array.isArray((slot as Record<string, unknown>).shape) ||
          typeof (slot as Record<string, unknown>).color !== 'number'
        ) {
          return null;
        }
        // Validate shape cells
        const shape = (slot as Record<string, unknown>).shape as unknown[];
        if (!shape.every((cell) => Array.isArray(cell) && cell.length === 2)) {
          return null;
        }
      }
    }

    // Validate score and streak
    if (typeof progress.score !== 'number' || progress.score < 0) {
      return null;
    }
    if (typeof progress.streak !== 'number' || progress.streak < 0) {
      return null;
    }

    return {
      board: progress.board as Board,
      tray: progress.tray as Array<{ shape: Shape; color: number } | null>,
      score: progress.score as number,
      streak: progress.streak as number,
    };
  } catch {
    // JSON parse failed, storage unavailable, or validation error
    return null;
  }
}

/**
 * Delete blocks game progress from localStorage.
 */
export function deleteBlocksProgress(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage is unavailable; no action needed
  }
}
