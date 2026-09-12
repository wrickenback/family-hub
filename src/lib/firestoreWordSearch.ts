import { httpsCallable } from 'firebase/functions';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit as fbLimit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from 'firebase/firestore';
import { db, functions } from './firebase';

export interface PlacedWord {
  word: string;
  row: number;
  col: number;
  dRow: number;
  dCol: number;
}

export interface WordSearchPuzzle {
  id: string;
  topic: string;
  topicSlug: string;
  size: number;
  grid: string[];
  words: PlacedWord[];
  createdBy?: string;
  createdByName?: string;
}

/** Calls the Cloud Function that asks Gemini for words and builds the grid
 * server-side. Throws a message safe to show directly to the player. */
export async function generatePuzzle(topic: string): Promise<WordSearchPuzzle> {
  if (!functions) throw new Error('Firebase is not configured');
  const call = httpsCallable(functions, 'generateWordSearchPuzzle');
  try {
    const result = await call({ topic });
    return result.data as WordSearchPuzzle;
  } catch (err) {
    // httpsCallable errors are HttpsErrorImpl-shaped but not exported as a
    // usable class for `instanceof` — duck-type on `.message` instead.
    const message =
      err && typeof err === 'object' && 'message' in err
        ? String((err as { message: unknown }).message)
        : null;
    throw new Error(message || 'Something went wrong generating that puzzle.');
  }
}

export async function deleteWordSearchPuzzle(id: string): Promise<void> {
  if (!db) return;
  await deleteDoc(doc(db, 'wordSearchPuzzles', id));
}

export interface WordSearchProgress {
  foundWords: string[];
  elapsedMs: number;
}

/** In-progress state lives per-user so resuming a puzzle someone else is
 * also playing never clobbers their progress. Words found + elapsed time
 * is enough to fully reconstruct the board — cell highlights are derived
 * from the puzzle's own word placements, not stored separately. */
export async function saveWordSearchProgress(
  uid: string,
  puzzleId: string,
  progress: WordSearchProgress
): Promise<void> {
  if (!db) return;
  await setDoc(doc(db, 'users', uid, 'wordSearchProgress', puzzleId), progress);
}

export async function loadWordSearchProgress(
  uid: string,
  puzzleId: string
): Promise<WordSearchProgress | null> {
  if (!db) return null;
  const snap = await getDoc(doc(db, 'users', uid, 'wordSearchProgress', puzzleId));
  return snap.exists() ? (snap.data() as WordSearchProgress) : null;
}

export async function deleteWordSearchProgress(
  uid: string,
  puzzleId: string
): Promise<void> {
  if (!db) return;
  await deleteDoc(doc(db, 'users', uid, 'wordSearchProgress', puzzleId));
}

export async function fetchPuzzle(id: string): Promise<WordSearchPuzzle | null> {
  if (!db) return null;
  const snap = await getDoc(doc(db, 'wordSearchPuzzles', id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as WordSearchPuzzle;
}

/** Puzzles anyone in the family has generated, newest first — the
 * "Library" mode. Not filtered by topic; browsing everything is simpler
 * than a per-topic index and matches "puzzles the family has made". */
export function watchRecentPuzzles(
  onChange: (puzzles: WordSearchPuzzle[]) => void,
  onError: (error: unknown) => void,
  limitCount = 20
) {
  if (!db) return () => {};
  const q = query(
    collection(db, 'wordSearchPuzzles'),
    orderBy('createdAt', 'desc'),
    fbLimit(limitCount)
  );
  return onSnapshot(
    q,
    (snap) =>
      onChange(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }) as WordSearchPuzzle)
      ),
    onError
  );
}
