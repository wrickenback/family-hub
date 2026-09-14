import { useEffect } from 'react';
import { HangmanFigure } from './HangmanFigure';
import {
  KEY_ROWS,
  MAX_WRONG,
  maskWord,
  wrongCount,
  wrongLetters,
} from '../lib/hangmanEngine';

export type HangmanOutcome = 'playing' | 'won' | 'lost';

interface Props {
  word: string;
  /** Sorted string of letters guessed so far. */
  guessed: string;
  outcome: HangmanOutcome;
  /** A clue, when there is one — solo rounds always have one, family rounds
   * only if the setter typed one. */
  hint?: string;
  /** False for the person who set the word, who watches rather than plays. */
  canGuess: boolean;
  onGuess: (letter: string) => void;
}

/** Everything both hangman screens draw: the figure, the blanks, the letters
 * already burned, and the keyboard. Solo and family share it so a fix to the
 * board can't land in one and miss the other. */
export function HangmanBoard({
  word,
  guessed,
  outcome,
  hint,
  canGuess,
  onGuess,
}: Props) {
  const finished = outcome !== 'playing';
  const wrong = wrongCount(word, guessed);
  const missed = wrongLetters(word, guessed);
  // A lost round shows the word it was — the only way to learn anything
  // from losing.
  const masked = maskWord(word, guessed, outcome === 'lost');

  // Physical keyboard, for whoever is playing on a laptop.
  useEffect(() => {
    if (!canGuess || finished) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!/^[a-zA-Z]$/.test(e.key)) return;
      const letter = e.key.toUpperCase();
      if (guessed.includes(letter)) return;
      onGuess(letter);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canGuess, finished, guessed, onGuess]);

  return (
    <div className="hangman-board">
      <HangmanFigure wrong={wrong} outcome={outcome} />

      <p className="hangman-lives" aria-live="polite">
        {finished
          ? `${wrong} of ${MAX_WRONG} wrong`
          : `${MAX_WRONG - wrong} ${
              MAX_WRONG - wrong === 1 ? 'guess' : 'guesses'
            } left`}
      </p>

      <div className="hangman-word" aria-label="The word so far">
        {masked.map((slot, index) =>
          slot.gap ? (
            <span key={index} className="hangman-space" aria-hidden="true" />
          ) : (
            <span
              key={index}
              className={`hangman-slot ${slot.revealed ? 'revealed' : ''} ${
                outcome === 'lost' && !guessed.includes(slot.char)
                  ? 'missed'
                  : ''
              }`}
            >
              <span className="hangman-letter">
                {slot.revealed ? slot.char : ''}
              </span>
            </span>
          )
        )}
      </div>

      {hint && !finished && <p className="hangman-hint">Clue: {hint}</p>}

      {missed.length > 0 && (
        <p className="hangman-missed">
          {missed.map((letter) => (
            <span key={letter}>{letter}</span>
          ))}
        </p>
      )}

      {!finished && (
        <div className="hangman-keyboard">
          {KEY_ROWS.map((row) => (
            <div className="hangman-key-row" key={row}>
              {row.split('').map((letter) => {
                const used = guessed.includes(letter);
                const hit = used && word.includes(letter);
                return (
                  <button
                    key={letter}
                    className={`hangman-key ${
                      used ? (hit ? 'hit' : 'miss') : ''
                    }`}
                    onClick={() => onGuess(letter)}
                    disabled={used || !canGuess}
                    aria-label={letter}
                  >
                    {letter}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
