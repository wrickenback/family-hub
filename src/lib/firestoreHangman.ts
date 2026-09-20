import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export interface HangmanCategory {
  id: string;
  label: string;
}

/** The solo categories, in the order they're shown.
 *
 * Every `id` here MUST equal the server's `slugify(label)`, because the
 * label is what gets sent as the topic and the slug derived from it is
 * what keys both the shared word pool and the bundled fallback packs
 * (FALLBACK_HANGMAN in wordGames.ts). Two of these used to be shorter
 * hand-written ids — 'household' and 'anything' — which stopped matching
 * their own labels the moment topics were unified, silently costing those
 * categories their fallback pack and making them show up twice in the
 * picker once a pool existed under the real slug. */
export const HANGMAN_CATEGORIES: HangmanCategory[] = [
  { id: 'animals', label: 'Animals' },
  { id: 'food', label: 'Food' },
  { id: 'sports', label: 'Sports' },
  { id: 'places', label: 'Places' },
  { id: 'around-the-house', label: 'Around the house' },
  { id: 'space', label: 'Space' },
  { id: 'anything-at-all', label: 'Anything at all' },
];

/** A category discovered from the shared word pool — most often a topic
 * someone already typed into word search, or an earlier hangman category
 * that's already stocked. Offered alongside `HANGMAN_CATEGORIES`' pinned
 * defaults, never instead of them. */
export interface DiscoveredCategory {
  slug: string;
  label: string;
  wordCount: number;
}

/** Read-only, no model call — lists topics worth offering as a hangman
 * category beyond the pinned defaults (WORD_BANK_PLAN.md §4). Failing soft
 * to an empty list on any error: this is a nice-to-have, and the pinned
 * categories plus typing a custom one both still work regardless. */
export async function fetchHangmanCategories(): Promise<DiscoveredCategory[]> {
  if (!functions) return [];
  try {
    const call = httpsCallable(functions, 'listHangmanCategories');
    const result = await call({});
    const data = result.data as { categories?: unknown };
    if (!Array.isArray(data.categories)) return [];
    return data.categories.filter(
      (c): c is DiscoveredCategory =>
        !!c &&
        typeof c === 'object' &&
        typeof (c as DiscoveredCategory).slug === 'string' &&
        typeof (c as DiscoveredCategory).label === 'string' &&
        typeof (c as DiscoveredCategory).wordCount === 'number'
    );
  } catch {
    return [];
  }
}

export interface HangmanWord {
  word: string;
  hint: string;
  category: string;
  // 'pool': served straight from the shared word bank, no model called this
  // request at all — see WORD_BANK_PLAN.md §2/§3. This is the common case
  // once a category's pool is stocked, not a fallback.
  source: 'gemini' | 'glm-flash' | 'haiku' | 'pool' | 'fallback';
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
    // Sends the free-text label as `topic`, same shape word search uses —
    // the server derives the slug itself (slugify()), so a category
    // discovered from word search's own topics or typed fresh here always
    // lands on the identical pool no matter which screen created it.
    const result = await call({ topic: category.label, avoid });
    return result.data as HangmanWord;
  } catch (err) {
    const message =
      err && typeof err === 'object' && 'message' in err
        ? String((err as { message: unknown }).message)
        : null;
    throw new Error(message || "Couldn't think of a word — try again.");
  }
}

export interface HangmanSuggestions {
  words: string[];
  category: string;
  source: string;
}

/** A batch of candidate words/phrases for the multiplayer setter's "pick a
 * category" option, alongside their existing "write from scratch" field.
 * Purely browsing — nothing is marked used server-side by calling this, so
 * "load more" is just calling it again. Only actually setting one of these
 * as the round's word should follow up with `markHangmanSuggestionUsed`. */
export async function fetchHangmanSuggestions(
  category: HangmanCategory,
  count = 8
): Promise<HangmanSuggestions> {
  if (!functions) return { words: [], category: category.id, source: 'fallback' };
  try {
    const call = httpsCallable(functions, 'suggestHangmanWords');
    const result = await call({ topic: category.label, count });
    const data = result.data as { words?: unknown; category?: unknown; source?: unknown };
    const words = Array.isArray(data.words)
      ? data.words.filter((w): w is string => typeof w === 'string')
      : [];
    return {
      words,
      category: typeof data.category === 'string' ? data.category : category.id,
      source: typeof data.source === 'string' ? data.source : 'pool',
    };
  } catch {
    return { words: [], category: category.id, source: 'fallback' };
  }
}

/** Marks a suggestion as served once the setter actually picks it — call
 * this alongside (not instead of) setHangmanWord, which is what actually
 * starts the round. Best-effort: a failure here means a suggestion might
 * come back around sooner than it should, never that the round can't
 * start, so it's fine to fire-and-forget from the caller's perspective. */
export async function markHangmanSuggestionUsed(
  category: HangmanCategory,
  word: string
): Promise<void> {
  if (!functions) return;
  try {
    const call = httpsCallable(functions, 'markHangmanSuggestionUsed');
    await call({ category: category.id, word });
  } catch {
    // Best-effort — see the doc comment above.
  }
}

export interface HangmanHint {
  hint: string;
  source: 'gemini' | 'glm-flash' | 'haiku' | null;
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
    const source =
      data.source === 'gemini' || data.source === 'glm-flash' || data.source === 'haiku'
        ? data.source
        : null;
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
