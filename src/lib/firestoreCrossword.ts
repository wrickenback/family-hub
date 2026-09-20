import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  query,
  setDoc,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './firebase';
import { CLUES } from './miniCrosswordPuzzles';
import {
  SIZE,
  entriesFor,
  fallbackCrossword,
  randomFallbackCrossword,
  type MiniCrossword,
  type PuzzleSource,
} from './miniCrosswordEngine';

/** Today's crossword, or a fresh one for free play, from the Cloud Function
 * that generates it (and caches it, for the daily puzzle only).
 *
 * Slow by the standards of everything else here: whenever nobody has a
 * cached grid to hand back — the day's first open, or any free-play
 * request — this is waiting on a model to solve a grid, which is why the
 * screen shows a real progress state rather than a spinner and a hope.
 * Never throws — a failure of any kind lands on the bundled puzzle, since
 * nothing about it is the player's fault. */
export async function fetchMiniCrossword(
  dateKey?: string
): Promise<MiniCrossword | null> {
  const offline = dateKey ? fallbackCrossword(dateKey) : randomFallbackCrossword();
  if (!functions) return offline;

  try {
    const call = httpsCallable(functions, 'getMiniCrossword');
    const result = await call({ dateKey: dateKey ?? '' });
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

/** Marks a daily crossword as solved for this player, so the archive screen
 * knows not to offer it again and a replay from the archive can't post a
 * second score for a day already on the board. */
export async function markCrosswordPlayed(
  uid: string,
  dateKey: string
): Promise<void> {
  if (!db) return;
  await setDoc(doc(db, 'users', uid, 'crosswordPlayed', dateKey), {
    solvedAt: serverTimestamp(),
  });
}

export async function hasCrosswordPlayed(
  uid: string,
  dateKey: string
): Promise<boolean> {
  if (!db) return false;
  const snap = await getDoc(doc(db, 'users', uid, 'crosswordPlayed', dateKey));
  return snap.exists();
}

/** Which of the given dateKeys this player has already solved. Firestore's
 * `in` filter tops out at 30 values, which happens to match the archive's
 * 30-day window, so this stays one round trip instead of one read per day
 * shown. */
export async function playedCrosswordDates(
  uid: string,
  dateKeys: string[]
): Promise<Set<string>> {
  if (!db || dateKeys.length === 0) return new Set();
  const q = query(
    collection(db, 'users', uid, 'crosswordPlayed'),
    where(documentId(), 'in', dateKeys)
  );
  const snap = await getDocs(q);
  return new Set(snap.docs.map((d) => d.id));
}
