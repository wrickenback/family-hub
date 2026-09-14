import { WORDLE_ANSWERS } from './wordleWords';

/** Pure rules for Daily Word. No Firebase, no React — the scoring is the
 * one part that has to be exactly right, so it lives on its own. */

export const WORD_LENGTH = 5;
export const MAX_GUESSES = 6;

export type LetterState = 'correct' | 'present' | 'absent';

/** The date key a family day is filed under. Deliberately *local* time,
 * unlike Blocks' UTC todayKey(): the daily word should roll over at the
 * family's own midnight, not mid-evening. Everyone in one house shares a
 * timezone, so everyone lands on the same key. */
export function localDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Milliseconds until the next local midnight — powers the "next word in…"
 * countdown once you've finished today's. */
export function msUntilTomorrow(now = new Date()): number {
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime() - now.getTime();
}

/** Scores one guess against the answer.
 *
 * Duplicate letters are the whole difficulty here: a guess of SPEED against
 * an answer with one E must light exactly one of those Es. So greens are
 * claimed in a first pass, and only the answer letters left unclaimed are
 * available to turn a later letter yellow. Scoring in a single pass would
 * mark both Es present and quietly lie to the player. */
export function scoreGuess(guess: string, answer: string): LetterState[] {
  const result: LetterState[] = new Array(guess.length).fill('absent');
  const remaining: Record<string, number> = {};

  for (let i = 0; i < answer.length; i++) {
    if (guess[i] === answer[i]) {
      result[i] = 'correct';
    } else {
      remaining[answer[i]] = (remaining[answer[i]] ?? 0) + 1;
    }
  }

  for (let i = 0; i < guess.length; i++) {
    if (result[i] === 'correct') continue;
    const letter = guess[i];
    if ((remaining[letter] ?? 0) > 0) {
      result[i] = 'present';
      remaining[letter] -= 1;
    }
  }

  return result;
}

const RANK: Record<LetterState, number> = { absent: 0, present: 1, correct: 2 };

/** What colour each key on the on-screen keyboard should be. A letter never
 * downgrades: once it has been green somewhere it stays green, even if a
 * later guess puts it in a wrong slot. */
export function keyboardState(
  guesses: string[],
  answer: string
): Record<string, LetterState> {
  const keys: Record<string, LetterState> = {};
  for (const guess of guesses) {
    const states = scoreGuess(guess, answer);
    for (let i = 0; i < guess.length; i++) {
      const letter = guess[i];
      const next = states[i];
      if (!keys[letter] || RANK[next] > RANK[keys[letter]]) {
        keys[letter] = next;
      }
    }
  }
  return keys;
}

export type Outcome = 'playing' | 'won' | 'lost';

export function outcomeFor(guesses: string[], answer: string): Outcome {
  if (guesses[guesses.length - 1] === answer) return 'won';
  if (guesses.length >= MAX_GUESSES) return 'lost';
  return 'playing';
}

/** A fresh answer for free play. */
export function randomAnswer(): string {
  return WORDLE_ANSWERS[Math.floor(Math.random() * WORDLE_ANSWERS.length)];
}

/** Guesses aren't checked against a dictionary — there isn't one bundled,
 * and a family playing on the sofa would rather try a hunch than be told
 * their word "isn't a word". Anything five letters long is allowed. */
export function isSubmittable(guess: string): boolean {
  return new RegExp(`^[A-Z]{${WORD_LENGTH}}$`).test(guess);
}

export const KEY_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
