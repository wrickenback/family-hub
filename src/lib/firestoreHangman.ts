import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export interface HangmanCategory {
  id: string;
  label: string;
}

/** The solo categories, in the order they're shown. Ids are what the Cloud
 * Function validates against and what its offline fallback words are filed
 * under, so adding one here means adding it there too. */
export const HANGMAN_CATEGORIES: HangmanCategory[] = [
  { id: 'animals', label: 'Animals' },
  { id: 'food', label: 'Food' },
  { id: 'sports', label: 'Sports' },
  { id: 'places', label: 'Places' },
  { id: 'household', label: 'Around the house' },
  { id: 'space', label: 'Space' },
  { id: 'anything', label: 'Anything at all' },
];

export interface HangmanWord {
  word: string;
  hint: string;
  category: string;
  source: 'ai' | 'fallback';
}

/** Asks the Cloud Function for a word and a clue. The API key stays
 * server-side, and — just as importantly — so does the prompt, so the word
 * can't be read out of the bundle by a player who knows how. */
export async function fetchHangmanWord(
  category: HangmanCategory
): Promise<HangmanWord> {
  if (!functions) throw new Error('Firebase is not configured');
  const call = httpsCallable(functions, 'getHangmanWord');
  try {
    const result = await call({ category: category.id, label: category.label });
    return result.data as HangmanWord;
  } catch (err) {
    const message =
      err && typeof err === 'object' && 'message' in err
        ? String((err as { message: unknown }).message)
        : null;
    throw new Error(message || "Couldn't think of a word — try again.");
  }
}

/** Asks for a clue for a word the setter typed. Best-effort by design: an
 * empty string means "couldn't think of one" (a family in-joke, a name, a
 * word the model didn't recognize), which is a perfectly normal outcome and
 * leaves the setter writing their own rather than staring at an error. */
export async function fetchHangmanHint(word: string): Promise<string> {
  if (!functions) return '';
  try {
    const call = httpsCallable(functions, 'getHangmanHint');
    const result = await call({ word });
    const hint = (result.data as { hint?: unknown }).hint;
    return typeof hint === 'string' ? hint : '';
  } catch {
    return '';
  }
}
