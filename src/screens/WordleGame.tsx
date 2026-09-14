import { useCallback, useEffect, useRef, useState } from 'react';
import { Screen } from '../components/Screen';
import { IconAlert, IconSpinner } from '../components/icons';
import { submitScore } from '../lib/firestoreScores';
import {
  fetchDailyWord,
  fetchFreePlayWords,
  loadDailyProgress,
  saveDailyProgress,
  watchDailyResults,
  type DailyResult,
} from '../lib/firestoreWordle';
import {
  KEY_ROWS,
  MAX_GUESSES,
  WORD_LENGTH,
  isSubmittable,
  keyboardState,
  localDateKey,
  msUntilTomorrow,
  outcomeFor,
  randomAnswer,
  scoreGuess,
} from '../lib/wordleEngine';
import { playClear, playGameOver, playPlace } from '../lib/sound';
import './WordleGame.css';

/** How long each tile takes to flip, and how far apart the flips start.
 * The row is "revealing" until the last tile lands — the keyboard colours
 * and the win/lose card both wait for that, so the answer is never spoiled
 * a beat before the tiles show it. */
const FLIP_MS = 320;
const FLIP_STAGGER = 260;

function revealDurationFor(): number {
  return (WORD_LENGTH - 1) * FLIP_STAGGER + FLIP_MS;
}

interface Props {
  mode: 'family' | 'free';
  uid: string;
  displayName: string;
  onBack: () => void;
}

export function WordleGame({ mode, uid, displayName, onBack }: Props) {
  const isFamily = mode === 'family';
  const [dateKey] = useState(() => localDateKey());

  const [answer, setAnswer] = useState<string | null>(null);
  const [pickedByName, setPickedByName] = useState<string | null>(null);
  const [guesses, setGuesses] = useState<string[]>([]);
  /** Guesses whose flip animation has finished — what the keyboard and the
   * result card are allowed to know about. */
  const [revealedCount, setRevealedCount] = useState(0);
  const [current, setCurrent] = useState('');
  const [loading, setLoading] = useState(true);
  /** Free play's remaining AI words. One request brings back a batch, so
   * "New word" is instant until the batch runs out. */
  const [freeQueue, setFreeQueue] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);
  const [results, setResults] = useState<DailyResult[]>([]);

  const scoreSubmitted = useRef(false);
  const toastTimer = useRef<number | null>(null);

  // ---------- loading the answer ----------

  /** Free play's words come from Gemini too — same PG-13 prompt as the
   * daily word, just not stored or shared. The bundled list is only
   * reached when that call comes back empty (offline in the installed PWA,
   * or a model hiccup), because an unlimited mode must never be blocked on
   * the network. */
  const loadFreeBatch = useCallback(async () => {
    setLoading(true);
    const words = await fetchFreePlayWords();
    const pool = words.length > 0 ? words : [randomAnswer()];
    setAnswer(pool[0]);
    setFreeQueue(pool.slice(1));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isFamily) {
      loadFreeBatch();
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchDailyWord(dateKey), loadDailyProgress(uid, dateKey)])
      .then(([daily, progress]) => {
        if (cancelled) return;
        setAnswer(daily.word);
        setPickedByName(daily.pickedByName);
        if (progress?.guesses?.length) {
          setGuesses(progress.guesses);
          // A resumed day starts fully revealed: re-running six flips on a
          // board the player has already seen is just a delay.
          setRevealedCount(progress.guesses.length);
          // Already scored on the day it was solved; don't submit again.
          scoreSubmitted.current = progress.solved;
        }
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Something went wrong.');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isFamily, dateKey, uid, loadFreeBatch]);

  useEffect(() => {
    if (!isFamily) return;
    return watchDailyResults(dateKey, setResults, () => setResults([]));
  }, [isFamily, dateKey]);

  useEffect(() => {
    return () => {
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    };
  }, []);

  // ---------- state derived from what's been revealed ----------

  const revealing = revealedCount < guesses.length;
  const outcome = answer
    ? outcomeFor(guesses.slice(0, revealedCount), answer)
    : 'playing';
  const finished = outcome !== 'playing';
  const keys = answer ? keyboardState(guesses.slice(0, revealedCount), answer) : {};

  const flash = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1400);
  }, []);

  // ---------- playing ----------

  const submitGuess = useCallback(() => {
    if (!answer || revealing || finished) return;
    if (!isSubmittable(current)) {
      setShaking(true);
      window.setTimeout(() => setShaking(false), 450);
      flash(`${WORD_LENGTH} letters needed`);
      return;
    }

    const nextGuesses = [...guesses, current];
    setGuesses(nextGuesses);
    setCurrent('');
    playPlace();

    const solved = current === answer;
    const done = solved || nextGuesses.length >= MAX_GUESSES;

    if (isFamily) {
      // Written before the flip finishes on purpose: if the app is closed
      // mid-animation the guess still counts, exactly as it would have.
      saveDailyProgress(uid, dateKey, {
        guesses: nextGuesses,
        answer,
        finished: done,
        solved,
      }).catch(() => {});
    }

    window.setTimeout(() => {
      setRevealedCount(nextGuesses.length);
      if (solved) playClear(3);
      else if (done) playGameOver();
    }, revealDurationFor());
  }, [
    answer,
    revealing,
    finished,
    current,
    guesses,
    isFamily,
    uid,
    dateKey,
    flash,
  ]);

  const typeLetter = useCallback(
    (letter: string) => {
      if (revealing || finished) return;
      setCurrent((c) => (c.length < WORD_LENGTH ? c + letter : c));
    },
    [revealing, finished]
  );

  const backspace = useCallback(() => {
    if (revealing || finished) return;
    setCurrent((c) => c.slice(0, -1));
  }, [revealing, finished]);

  // Physical keyboard too — this is played on laptops as well as phones.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Enter') {
        submitGuess();
      } else if (e.key === 'Backspace') {
        backspace();
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        typeLetter(e.key.toUpperCase());
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [submitGuess, backspace, typeLetter]);

  // One win per family word, recorded with the guess count so the family
  // panel can show who got it in how many. Free play never scores: it's
  // unlimited, so a "win" there would be worth nothing.
  useEffect(() => {
    if (!isFamily || outcome !== 'won' || scoreSubmitted.current) return;
    scoreSubmitted.current = true;
    submitScore({
      gameId: 'wordle',
      mode: 'family',
      dateKey,
      uid,
      name: displayName,
      value: 1,
      extra: { guesses: revealedCount },
    }).catch(() => {
      scoreSubmitted.current = false;
    });
  }, [isFamily, outcome, dateKey, uid, displayName, revealedCount]);

  const startFreeRound = () => {
    setGuesses([]);
    setRevealedCount(0);
    setCurrent('');
    if (freeQueue.length > 0) {
      setAnswer(freeQueue[0]);
      setFreeQueue((queue) => queue.slice(1));
      return;
    }
    loadFreeBatch();
  };

  // ---------- rendering ----------

  if (loading) {
    return (
      <Screen title="Daily Word" onBack={onBack}>
        <div className="card wordle-loading">
          <IconSpinner className="generating-spinner" aria-hidden="true" />
          <p>
            {isFamily
              ? "Getting today's word…"
              : 'Thinking of a word…'}
          </p>
        </div>
      </Screen>
    );
  }

  if (error || !answer) {
    return (
      <Screen title="Daily Word" onBack={onBack}>
        <div className="card generating-error">
          <IconAlert aria-hidden="true" />
          <div>
            <p className="generating-error-title">
              Couldn&rsquo;t start the game
            </p>
            <p className="generating-error-detail">
              {error ?? 'No word available.'}
            </p>
          </div>
        </div>
      </Screen>
    );
  }

  const rows = Array.from({ length: MAX_GUESSES }, (_, row) => {
    if (row < guesses.length) {
      return {
        letters: guesses[row].split(''),
        states: scoreGuess(guesses[row], answer),
        revealing: row >= revealedCount,
        typed: false,
      };
    }
    if (row === guesses.length) {
      return {
        letters: current.padEnd(WORD_LENGTH, ' ').split(''),
        states: null,
        revealing: false,
        typed: true,
      };
    }
    return { letters: new Array(WORD_LENGTH).fill(' '), states: null, revealing: false, typed: false };
  });

  return (
    <Screen
      title="Daily Word"
      subtitle={isFamily ? "Today's family word" : 'Free play'}
      onBack={onBack}
    >
      <div className="wordle-fit">
        {isFamily && pickedByName && guesses.length === 0 && (
          <p className="wordle-picked-by">
            {pickedByName} opened today&rsquo;s word first.
          </p>
        )}

        <div className="wordle-board-wrap">
          {toast && (
            <div className="wordle-toast" role="status">
              {toast}
            </div>
          )}
          <div className="wordle-board" aria-label="Guesses">
            {rows.map((row, rowIndex) => (
              <div
                className={`wordle-row ${
                  shaking && row.typed ? 'shaking' : ''
                }`}
                key={rowIndex}
              >
                {row.letters.map((letter, col) => (
                  <div
                    key={col}
                    className={`wordle-tile ${
                      row.states && !row.revealing
                        ? `state-${row.states[col]}`
                        : ''
                    } ${row.revealing ? `flipping state-${row.states?.[col]}` : ''} ${
                      row.typed && letter !== ' ' ? 'filled' : ''
                    }`}
                    style={
                      {
                        '--flip-delay': `${col * FLIP_STAGGER}ms`,
                        '--flip-ms': `${FLIP_MS}ms`,
                      } as React.CSSProperties
                    }
                  >
                    <span className="wordle-tile-face">
                      {letter.trim() || ''}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {finished && (
          <ResultCard
            outcome={outcome}
            answer={answer}
            guesses={revealedCount}
            isFamily={isFamily}
            onPlayAgain={startFreeRound}
          />
        )}

        {!finished && (
          <div className="wordle-keyboard">
            {KEY_ROWS.map((row, rowIndex) => (
              <div className="wordle-key-row" key={row}>
                {rowIndex === 2 && (
                  <button
                    className="wordle-key wordle-key-wide"
                    onClick={submitGuess}
                  >
                    Enter
                  </button>
                )}
                {row.split('').map((letter) => (
                  <button
                    key={letter}
                    className={`wordle-key ${
                      keys[letter] ? `state-${keys[letter]}` : ''
                    }`}
                    onClick={() => typeLetter(letter)}
                    aria-label={letter}
                  >
                    {letter}
                  </button>
                ))}
                {rowIndex === 2 && (
                  <button
                    className="wordle-key wordle-key-wide"
                    onClick={backspace}
                    aria-label="Delete"
                  >
                    ⌫
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {isFamily && <FamilyResults results={results} uid={uid} />}
      </div>
    </Screen>
  );
}

function ResultCard({
  outcome,
  answer,
  guesses,
  isFamily,
  onPlayAgain,
}: {
  outcome: 'won' | 'lost' | 'playing';
  answer: string;
  guesses: number;
  isFamily: boolean;
  onPlayAgain: () => void;
}) {
  const [remaining, setRemaining] = useState(() => msUntilTomorrow());

  useEffect(() => {
    if (!isFamily) return;
    const id = window.setInterval(() => setRemaining(msUntilTomorrow()), 1000);
    return () => window.clearInterval(id);
  }, [isFamily]);

  const hours = Math.floor(remaining / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);

  return (
    <div className="card wordle-result">
      <h3>{outcome === 'won' ? 'Got it!' : answer}</h3>
      <p className="wordle-result-detail">
        {outcome === 'won'
          ? `Solved in ${guesses} ${guesses === 1 ? 'guess' : 'guesses'}`
          : 'Out of guesses — that was the word'}
      </p>
      {isFamily ? (
        <p className="wordle-result-next">
          Next word in {hours}h {minutes}m {seconds}s
        </p>
      ) : (
        <button className="btn btn-primary" onClick={onPlayAgain}>
          New word
        </button>
      )}
    </div>
  );
}

function FamilyResults({ results, uid }: { results: DailyResult[]; uid: string }) {
  return (
    <section className="wordle-family">
      <div className="section-head">
        <span className="section-title">Solved today</span>
        <span className="section-count">{results.length}</span>
      </div>
      {results.length === 0 ? (
        <div className="card empty-state">
          Nobody has solved it yet today.
        </div>
      ) : (
        <ol className="card wordle-family-list">
          {results.map((result) => (
            <li
              key={result.uid}
              className={`wordle-family-row ${
                result.uid === uid ? 'is-you' : ''
              }`}
            >
              <span className="wordle-family-name">
                {result.uid === uid ? 'You' : result.name}
              </span>
              <span className="wordle-family-guesses">
                {result.guesses} {result.guesses === 1 ? 'guess' : 'guesses'}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
