import { httpsCallable } from 'firebase/functions';
import {
  collection,
  doc,
  getDoc,
  limit as fbLimit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { db, functions } from './firebase';

export interface DailyWord {
  dateKey: string;
  word: string;
  /** Whoever opened the game first today and so triggered the pick. */
  pickedByName: string | null;
  // 'pool': served from the shared word bank, no model called this
  // request — see WORD_BANK_PLAN.md §2/§3. The common case, not a fallback.
  source: 'gemini' | 'glm-flash' | 'haiku' | 'pool' | 'fallback';
}

/** Today's family word. The answer is never readable from Firestore
 * directly (the rules deny `dailyWords` to clients outright) — it only
 * comes back through this callable, which also creates the day's word the
 * very first time anyone in the family asks for it. */
export async function fetchDailyWord(dateKey: string): Promise<DailyWord> {
  if (!functions) throw new Error('Firebase is not configured');
  const call = httpsCallable(functions, 'getDailyWord');
  try {
    const result = await call({ dateKey });
    return result.data as DailyWord;
  } catch (err) {
    const message =
      err && typeof err === 'object' && 'message' in err
        ? String((err as { message: unknown }).message)
        : null;
    throw new Error(message || "Couldn't get today's word.");
  }
}

export interface FreePlayWords {
  words: string[];
  source: 'gemini' | 'glm-flash' | 'haiku' | 'pool' | 'fallback';
}

/** A batch of free-play answers. Returns an empty list (never throws) when
 * no provider can deliver — free play must always be playable, so the
 * caller falls back to the bundled list instead of showing the player an
 * error for something they didn't do. */
export async function fetchFreePlayWords(): Promise<FreePlayWords> {
  if (!functions) return { words: [], source: 'fallback' };
  try {
    const call = httpsCallable(functions, 'getWordleWords');
    const result = await call({});
    const data = result.data as { words?: unknown; source?: unknown };
    const words = Array.isArray(data.words)
      ? data.words.filter(
          (w): w is string => typeof w === 'string' && /^[A-Z]{5}$/.test(w)
        )
      : [];
    const source =
      data.source === 'gemini' ||
      data.source === 'glm-flash' ||
      data.source === 'haiku' ||
      data.source === 'pool'
        ? data.source
        : 'fallback';
    return { words, source: words.length > 0 ? source : 'fallback' };
  } catch {
    return { words: [], source: 'fallback' };
  }
}

export interface DailyProgress {
  guesses: string[];
  /** Copied in so a resumed game can be rebuilt without re-fetching, and so
   * a finished day still shows the answer after the word has rolled over. */
  answer: string;
  finished: boolean;
  solved: boolean;
}

/** Progress is per user, keyed by day, so the same account picks up where
 * it left off on a different device — and so nobody can quietly restart
 * today's word by reloading the page. */
export async function saveDailyProgress(
  uid: string,
  dateKey: string,
  progress: DailyProgress
): Promise<void> {
  if (!db) return;
  await setDoc(doc(db, 'users', uid, 'dailyWordProgress', dateKey), {
    ...progress,
    updatedAt: serverTimestamp(),
  });
}

export async function loadDailyProgress(
  uid: string,
  dateKey: string
): Promise<DailyProgress | null> {
  if (!db) return null;
  const snap = await getDoc(doc(db, 'users', uid, 'dailyWordProgress', dateKey));
  return snap.exists() ? (snap.data() as DailyProgress) : null;
}

export interface DailyResult {
  uid: string;
  name: string;
  guesses: number;
}

/** Who in the family has already solved today, and in how many guesses —
 * the bit that makes it feel like everyone is playing the same puzzle.
 *
 * Read off the same `scores` docs the leaderboard uses rather than a
 * separate collection: a solve already writes one, and it carries the
 * guess count alongside the win. Only solves appear here; a failed day
 * writes nothing, so nobody's miss is published to the family. */
export function watchDailyResults(
  dateKey: string,
  onChange: (results: DailyResult[]) => void,
  onError: (error: unknown) => void
) {
  if (!db) return () => {};
  const q = query(
    collection(db, 'scores'),
    where('gameId', '==', 'wordle'),
    where('mode', '==', 'family'),
    where('dateKey', '==', dateKey),
    orderBy('value', 'desc'),
    fbLimit(20)
  );
  return onSnapshot(
    q,
    (snap) => {
      const byUid = new Map<string, DailyResult>();
      for (const d of snap.docs) {
        const data = d.data();
        const uid = (data.uid as string) ?? d.id;
        // One solve per person per day, but a retried submission could in
        // principle leave two — keep the better of them.
        const guesses = (data.guesses as number) ?? 0;
        const existing = byUid.get(uid);
        if (!existing || guesses < existing.guesses) {
          byUid.set(uid, {
            uid,
            name: (data.name as string) ?? 'Someone',
            guesses,
          });
        }
      }
      onChange([...byUid.values()].sort((a, b) => a.guesses - b.guesses));
    },
    onError
  );
}
