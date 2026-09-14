import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

export interface CatQueensProgress {
  /** Puzzles solved at each board size, keyed by size ("6".."9") — drives
   * both the level shown and whether that size still gets a freebie
   * region. */
  levels: Record<string, number>;
  discoveredBreeds: string[];
}

const EMPTY_PROGRESS: CatQueensProgress = { levels: {}, discoveredBreeds: [] };

/** Tied to the signed-in account rather than the device, so a solver's
 * level and breed collection follow them across phones/tablets instead of
 * resetting on whichever device they happen to pick up. Falls back to
 * fresh progress on any failure (offline, no db) rather than blocking
 * play — this is progress tracking, not save data worth erroring over. */
export async function loadCatQueensProgress(
  uid: string
): Promise<CatQueensProgress> {
  if (!db) return EMPTY_PROGRESS;
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'catQueensProgress', 'state'));
    if (!snap.exists()) return EMPTY_PROGRESS;
    const data = snap.data() as Partial<CatQueensProgress>;
    return {
      levels: data.levels ?? {},
      discoveredBreeds: data.discoveredBreeds ?? [],
    };
  } catch {
    return EMPTY_PROGRESS;
  }
}

export async function saveCatQueensProgress(
  uid: string,
  progress: CatQueensProgress
): Promise<void> {
  if (!db) return;
  await setDoc(
    doc(db, 'users', uid, 'catQueensProgress', 'state'),
    progress,
    { merge: true }
  );
}
