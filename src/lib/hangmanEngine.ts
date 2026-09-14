/** Pure hangman rules, shared by the solo game and the online family game
 * so the two can never disagree about what counts as a wrong guess or when
 * a round is over. No Firebase, no React. */

/** Head, body, two arms, two legs — the six parts the figure is drawn in. */
export const MAX_WRONG = 6;

export const KEY_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

/** Cleans up a word someone typed into the family game. Letters and single
 * spaces only, so a phrase like "ICE CREAM" works while punctuation, digits
 * and emoji — none of which can be guessed off a 26-letter keyboard — are
 * rejected outright rather than silently stripped into a word nobody can
 * finish. Returns null if it isn't playable. */
export function normalizeWord(raw: string): string | null {
  const word = raw.trim().toUpperCase().replace(/\s+/g, ' ');
  if (!/^[A-Z]+( [A-Z]+)*$/.test(word)) return null;
  const letters = word.replace(/ /g, '');
  if (letters.length < 3 || letters.length > 18) return null;
  return word;
}

/** Why a word was rejected, in words a kid can act on. */
export function wordProblem(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return 'Type a word first.';
  if (!/^[A-Za-z ]+$/.test(trimmed)) return 'Letters and spaces only.';
  const letters = trimmed.replace(/ /g, '');
  if (letters.length < 3) return 'Use at least 3 letters.';
  if (letters.length > 18) return "That's too long — 18 letters max.";
  return normalizeWord(raw) ? null : "That word won't work.";
}

/** The letters guessed so far are carried as one sorted string: it's a
 * single atomic field for the Realtime Database to write, and comparing two
 * of them is how the screens know a guess landed. */
export function addGuess(guessed: string, letter: string): string {
  if (guessed.includes(letter)) return guessed;
  return [...guessed.split(''), letter].sort().join('');
}

export function wrongLetters(word: string, guessed: string): string[] {
  return guessed.split('').filter((letter) => !word.includes(letter));
}

export function wrongCount(word: string, guessed: string): number {
  return wrongLetters(word, guessed).length;
}

export function isSolved(word: string, guessed: string): boolean {
  return word
    .split('')
    .every((char) => char === ' ' || guessed.includes(char));
}

export function isHanged(word: string, guessed: string): boolean {
  return wrongCount(word, guessed) >= MAX_WRONG;
}

export interface MaskedChar {
  char: string;
  /** A space between words — rendered as a gap, not a blank to guess. */
  gap: boolean;
  revealed: boolean;
}

/** The row of blanks and revealed letters under the gallows. `reveal` shows
 * the whole word regardless, for the moment the figure is finished. */
export function maskWord(
  word: string,
  guessed: string,
  reveal = false
): MaskedChar[] {
  return word.split('').map((char) => {
    if (char === ' ') return { char: ' ', gap: true, revealed: true };
    const revealed = reveal || guessed.includes(char);
    return { char, gap: false, revealed };
  });
}
