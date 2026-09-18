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
  source: 'gemini' | 'haiku' | 'fallback';
}

/** Asks the Cloud Function for a word and a clue. The API key stays
 * server-side, and — just as importantly — so does the prompt, so the word
 * can't be read out of the bundle by a player who knows how.
 *
 * `avoid` is this player's last several words for this category — without
 * it both providers reliably converge on the same "quirky but recognizable"
 * pick for a narrow category (Animals kept coming back PLATYPUS three
 * rounds running). The caller is responsible for remembering what's been
 * seen; nothing is stored server-side for solo rounds. */
export async function fetchHangmanWord(
  category: HangmanCategory,
  avoid: string[] = []
): Promise<HangmanWord> {
  if (!functions) throw new Error('Firebase is not configured');
  const call = httpsCallable(functions, 'getHangmanWord');
  try {
    const result = await call({
      category: category.id,
      label: category.label,
      avoid,
    });
    return result.data as HangmanWord;
  } catch (err) {
    const message =
      err && typeof err === 'object' && 'message' in err
        ? String((err as { message: unknown }).message)
        : null;
    throw new Error(message || "Couldn't think of a word — try again.");
  }
}

export interface HangmanHint {
  hint: string;
  source: 'gemini' | 'haiku' | null;
  /** A spelling the model thinks was meant instead, or null for "looks
   * fine". Answered in the same call as the clue — see generateHangmanHint
   * for why. The caller should remember it against the word it asked
   * about, so submitting that word doesn't ask a second time. */
  correction: string | null;
}

/** Asks for a clue for a word the setter typed. Best-effort by design: an
 * empty string means "couldn't think of one" (a family in-joke, a name, a
 * word the model didn't recognize), which is a perfectly normal outcome and
 * leaves the setter writing their own rather than staring at an error. */
export async function fetchHangmanHint(word: string): Promise<HangmanHint> {
  if (!functions) return { hint: '', source: null, correction: null };
  try {
    const call = httpsCallable(functions, 'getHangmanHint');
    const result = await call({ word });
    const data = result.data as {
      hint?: unknown;
      source?: unknown;
      correction?: unknown;
    };
    const hint = typeof data.hint === 'string' ? data.hint : '';
    const source = data.source === 'gemini' || data.source === 'haiku' ? data.source : null;
    const correction =
      typeof data.correction === 'string' && data.correction
        ? data.correction
        : null;
    return { hint, source: hint ? source : null, correction };
  } catch {
    return { hint: '', source: null, correction: null };
  }
}

/** Asks whether the word the setter typed looks misspelled.
 *
 * Returns null for "looks fine" — and for every failure too, because the
 * word going in unchecked is exactly what happened before this existed,
 * whereas a failure the setter has to acknowledge would be a new way for
 * the game not to start. */
export async function checkHangmanSpelling(word: string): Promise<string | null> {
  if (!functions) return null;
  try {
    const call = httpsCallable(functions, 'checkHangmanWord');
    const result = await call({ word });
    const data = result.data as { suggestion?: unknown };
    return typeof data.suggestion === 'string' && data.suggestion ? data.suggestion : null;
  } catch {
    return null;
  }
}
