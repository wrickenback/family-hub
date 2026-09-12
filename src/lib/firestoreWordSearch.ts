import { httpsCallable } from 'firebase/functions';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit as fbLimit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import { db, functions } from './firebase';

export interface PlacedWord {
  word: string;
  row: number;
  col: number;
  dRow: number;
  dCol: number;
}

export type WordSearchDifficulty = 'easy' | 'hard';

export interface WordSearchPuzzle {
  id: string;
  topic: string;
  topicSlug: string;
  difficulty?: WordSearchDifficulty;
  size: number;
  grid: string[];
  words: PlacedWord[];
  createdBy?: string;
  createdByName?: string;
}

/** Calls the Cloud Function that asks Gemini for words and builds the grid
 * server-side. Throws a message safe to show directly to the player. */
export async function generatePuzzle(
  topic: string,
  difficulty: WordSearchDifficulty = 'hard'
): Promise<WordSearchPuzzle> {
  if (!functions) throw new Error('Firebase is not configured');
  const call = httpsCallable(functions, 'generateWordSearchPuzzle');
  try {
    const result = await call({ topic, difficulty });
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
  await setDoc(doc(db, 'users', uid, 'wordSearchProgress', puzzleId), {
    ...progress,
    updatedAt: serverTimestamp(),
  });
}

export async function loadWordSearchProgress(
  uid: string,
  puzzleId: string
): Promise<WordSearchProgress | null> {
  if (!db) return null;
  const snap = await getDoc(doc(db, 'users', uid, 'wordSearchProgress', puzzleId));
  return snap.exists() ? (snap.data() as WordSearchProgress) : null;
}

/** Live progress for one puzzle. The same account can have the same puzzle
 * open on a phone and a laptop at once; without this each device would only
 * see the state it loaded at mount, and every save (a whole-document write)
 * would silently overwrite whatever the other device had found. Subscribing
 * lets both converge — the game screen unions the incoming found-words into
 * its own set, which is safe because that set only ever grows. */
export function watchWordSearchProgress(
  uid: string,
  puzzleId: string,
  onChange: (progress: WordSearchProgress | null) => void,
  onError: (error: unknown) => void
) {
  if (!db) return () => {};
  return onSnapshot(
    doc(db, 'users', uid, 'wordSearchProgress', puzzleId),
    (snap) =>
      onChange(snap.exists() ? (snap.data() as WordSearchProgress) : null),
    onError
  );
}

export async function deleteWordSearchProgress(
  uid: string,
  puzzleId: string
): Promise<void> {
  if (!db) return;
  await deleteDoc(doc(db, 'users', uid, 'wordSearchProgress', puzzleId));
}

/** Hides an in-progress puzzle from the "continue" prompt on the Create
 * tab without touching the underlying progress (foundWords/elapsedMs) —
 * dismissing is just "stop suggesting this," not "give up on it." The
 * puzzle is still fully resumable from the Library tab afterward. */
export async function dismissWordSearchProgress(
  uid: string,
  puzzleId: string
): Promise<void> {
  if (!db) return;
  await setDoc(
    doc(db, 'users', uid, 'wordSearchProgress', puzzleId),
    { hiddenFromCreate: true },
    { merge: true }
  );
}

export interface ResumablePuzzle {
  puzzleId: string;
  topic: string;
  foundCount: number;
  totalCount: number;
}

/** The most recent puzzle this user has started but not finished (and
 * hasn't dismissed from the Create tab) — powers the "Continue?" prompt
 * there. Completing a puzzle deletes its progress doc entirely, so
 * anything left in this subcollection is genuinely unfinished. */
export async function getResumablePuzzle(uid: string): Promise<ResumablePuzzle | null> {
  if (!db) return null;
  const q = query(
    collection(db, 'users', uid, 'wordSearchProgress'),
    orderBy('updatedAt', 'desc'),
    fbLimit(5)
  );
  const snap = await getDocs(q);
  for (const docSnap of snap.docs) {
    const data = docSnap.data() as WordSearchProgress & {
      hiddenFromCreate?: boolean;
      updatedAt?: Timestamp;
    };
    if (data.hiddenFromCreate) continue;
    const puzzle = await fetchPuzzle(docSnap.id);
    if (!puzzle) continue; // puzzle itself was deleted from the library
    return {
      puzzleId: docSnap.id,
      topic: puzzle.topic,
      foundCount: data.foundWords.length,
      totalCount: puzzle.words.length,
    };
  }
  return null;
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
