import { BLOOM_PACKS } from './bloomPuzzles';
import { seedFromDateKey, mulberry32 } from './blocksEngine';

/** Word Bloom: a ring of letters and every word hidden in them.
 *
 * The puzzle carries its own answer list rather than the app shipping a
 * dictionary. That's what makes an AI-written puzzle safe to play — a word
 * counts because it's on the list the puzzle came with, so there's no way
 * for the game to accept something the wheel can't spell or reject
 * something it promised. */

export type PuzzleSource = 'gemini' | 'haiku' | 'sonnet' | 'fallback';

export interface BloomPuzzle {
  base: string;
  words: string[];
  source: PuzzleSource;
}

/** Words shorter than this are never worth a point. */
export const MIN_WORD_LENGTH = 3;

/** Points for a found word — longer words are worth disproportionately
 * more, so finding the full base word is the thing to chase rather than
 * hoovering up every three-letter scrap. */
export function scoreWord(word: string): number {
  if (word.length <= 3) return 1;
  if (word.length === 4) return 3;
  if (word.length === 5) return 6;
  return 10;
}

export function totalPossible(words: string[]): number {
  return words.reduce((sum, word) => sum + scoreWord(word), 0);
}

/** The letters as they appear on the wheel. Shuffled off the base word so
 * the answer isn't sitting there spelled out, but deterministically per
 * puzzle so it doesn't reshuffle on every render. */
export function wheelLetters(base: string): string[] {
  const letters = base.split('');
  const rng = mulberry32(seedFromDateKey(base) || 1);
  for (let i = letters.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [letters[i], letters[j]] = [letters[j], letters[i]];
  }
  return letters;
}

/** A bundled puzzle, picked by date so the whole family gets the same one
 * on a day when no model could be reached. */
export function fallbackPuzzle(dateKey: string): BloomPuzzle {
  const pack = BLOOM_PACKS[Math.abs(seedFromDateKey(dateKey)) % BLOOM_PACKS.length];
  return { base: pack.base, words: pack.words, source: 'fallback' };
}

/** A random bundled puzzle, for free play with no signal. */
export function randomFallbackPuzzle(): BloomPuzzle {
  const pack = BLOOM_PACKS[Math.floor(Math.random() * BLOOM_PACKS.length)];
  return { base: pack.base, words: pack.words, source: 'fallback' };
}

/** The recent bases this device has played, so the generator can be told
 * what not to pick again. Kept on the device rather than in Firestore:
 * it's a nudge for one player's variety, not shared family state. */
const RECENT_KEY = 'familyhub:bloom:recent';
const RECENT_LIMIT = 12;

export function recentBases(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((b) => typeof b === 'string') : [];
  } catch {
    return [];
  }
}

export function rememberBase(base: string) {
  try {
    const next = [base, ...recentBases().filter((b) => b !== base)].slice(
      0,
      RECENT_LIMIT
    );
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked — the generator just gets a shorter avoid list.
  }
}
