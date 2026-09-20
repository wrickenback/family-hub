import { useCallback, useEffect, useRef, useState } from 'react';
import { Screen } from '../components/Screen';
import { HangmanBoard } from '../components/HangmanBoard';
import { IconAlert, IconSpinner } from '../components/icons';
import { ProviderBadge, type ProviderSource } from '../components/ProviderBadge';
import {
  fetchHangmanWord,
  fetchHangmanCategories,
  type DiscoveredCategory,
  type HangmanCategory,
} from '../lib/firestoreHangman';
import { pickRandomTopics, wordSearchTopics } from '../lib/wordSearchTopics';
import {
  MAX_WRONG,
  addGuess,
  isHanged,
  isSolved,
  wrongCount,
} from '../lib/hangmanEngine';
import { submitScore } from '../lib/firestoreScores';
import { playClear, playGameOver, playPlace } from '../lib/sound';
import './HangmanGame.css';

interface Props {
  uid: string;
  displayName: string;
  onBack: () => void;
}

/** Solo hangman: pick a category, Gemini picks the word and a clue. The
 * word is fetched fresh every round and never stored, so there's nothing to
 * peek at between rounds. */
export function HangmanGame({ uid, displayName, onBack }: Props) {
  const [category, setCategory] = useState<HangmanCategory | null>(null);
  const [word, setWord] = useState('');
  const [hint, setHint] = useState('');
  const [guessed, setGuessed] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<ProviderSource>(null);

  const scoreSubmitted = useRef(false);
  // Words already seen this session, per category, so a category played
  // for ten rounds in a row doesn't keep landing on the same word — both
  // providers reliably converge on the same "quirky but recognizable" pick
  // for a narrow category without something to steer them away from it.
  // Session-only on purpose: a fresh visit is allowed to repeat, since
  // there's no meaningful memory to carry across a full navigation away.
  const seenRef = useRef<Record<string, string[]>>({});

  const outcome = !word
    ? 'playing'
    : isSolved(word, guessed)
    ? 'won'
    : isHanged(word, guessed)
    ? 'lost'
    : 'playing';

  const startRound = useCallback(async (next: HangmanCategory) => {
    setCategory(next);
    setLoading(true);
    setError(null);
    setWord('');
    setGuessed('');
    setHint('');
    scoreSubmitted.current = false;
    try {
      const avoid = seenRef.current[next.id] ?? [];
      const picked = await fetchHangmanWord(next, avoid);
      setWord(picked.word);
      setHint(picked.hint);
      setSource(picked.source);
      // Cap at 8 — enough to break repetition without eventually excluding
      // so much of a small category that nothing is left to pick.
      const history = [...avoid, picked.word].slice(-8);
      seenRef.current = { ...seenRef.current, [next.id]: history };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }, []);

  const guess = (letter: string) => {
    if (outcome !== 'playing') return;
    const next = addGuess(guessed, letter);
    if (next === guessed) return;
    setGuessed(next);
    if (word.includes(letter)) playPlace();
    else playGameOver();
  };

  // The win chime fires off the outcome rather than off the tap, so it
  // lands with the last letter appearing rather than a beat before it.
  useEffect(() => {
    if (outcome === 'won') playClear(3);
  }, [outcome]);

  useEffect(() => {
    if (outcome !== 'won' || scoreSubmitted.current) return;
    scoreSubmitted.current = true;
    submitScore({
      gameId: 'hangman',
      mode: 'solo',
      uid,
      name: displayName,
      value: 1,
    }).catch(() => {
      scoreSubmitted.current = false;
    });
  }, [outcome, uid, displayName]);

  // ---------- picking a category ----------

  if (!category || (!word && !loading && !error)) {
    return (
      <Screen title="Hangman" subtitle="Solo" onBack={onBack}>
        <CategoryPicker onPick={startRound} />
      </Screen>
    );
  }

  if (loading) {
    return (
      <Screen title="Hangman" subtitle={category.label} onBack={onBack}>
        <div className="card hangman-thinking">
          <IconSpinner className="generating-spinner" aria-hidden="true" />
          <p>Thinking of a word&hellip;</p>
        </div>
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen title="Hangman" subtitle={category.label} onBack={onBack}>
        <div className="card generating-error">
          <IconAlert aria-hidden="true" />
          <div>
            <p className="generating-error-title">
              Couldn&rsquo;t get a word
            </p>
            <p className="generating-error-detail">{error}</p>
          </div>
        </div>
        <button
          className="btn btn-primary hangman-wide-btn"
          onClick={() => startRound(category)}
        >
          Try again
        </button>
        <button
          className="btn btn-text hangman-wide-btn"
          onClick={() => setCategory(null)}
        >
          Pick a different category
        </button>
      </Screen>
    );
  }

  return (
    <Screen title="Hangman" subtitle={category.label} onBack={onBack}>
      <div className="hangman-fit">
        <ProviderBadge source={source} />
        <HangmanBoard
          word={word}
          guessed={guessed}
          outcome={outcome}
          hint={hint}
          canGuess
          onGuess={guess}
        />

        {outcome !== 'playing' && (
          <div className="card hangman-result">
            <h3>{outcome === 'won' ? 'Saved!' : 'Out of guesses'}</h3>
            <p className="hangman-result-detail">
              {outcome === 'won'
                ? `You got ${word} with ${
                    MAX_WRONG - wrongCount(word, guessed)
                  } to spare`
                : `The word was ${word}`}
            </p>
            {hint && (
              // Shown after every round regardless of outcome — the clue
              // read differently mid-guess than it does once you know the
              // answer, and seeing both together is half the fun of a good
              // one.
              <p className="hangman-result-hint">Clue: {hint}</p>
            )}
            <button
              className="btn btn-primary"
              onClick={() => startRound(category)}
            >
              Another word
            </button>
            <button
              className="btn btn-text"
              onClick={() => setCategory(null)}
            >
              Change category
            </button>
          </div>
        )}
      </div>
    </Screen>
  );
}

/** Display-only slug, used to dedupe "played before" against the shuffled
 * ideas list and as a React key. Deliberately NOT sent to the server —
 * `fetchHangmanWord` sends the topic text and the server derives the real
 * slug with its own `slugify`, so this staying in sync doesn't affect
 * which pool anything lands in. */
function slugFor(topic: string): string {
  return topic
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function CategoryPicker({
  onPick,
}: {
  onPick: (category: HangmanCategory) => void;
}) {
  const [discovered, setDiscovered] = useState<DiscoveredCategory[]>([]);
  const [customTopic, setCustomTopic] = useState('');
  // The same 198 curated topics Word Search offers, shown 8 at a time so
  // the list doesn't become a wall of buttons. Sharing the list is the
  // point: a topic played in either game stocks one shared pool, so the
  // other game gets it instantly afterwards.
  const [suggested, setSuggested] = useState(() => pickRandomTopics(8));
  const shownSlugs = new Set(suggested.map(slugFor));

  useEffect(() => {
    let cancelled = false;
    fetchHangmanCategories().then((categories) => {
      if (!cancelled) setDiscovered(categories);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const submitCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const label = customTopic.trim();
    if (!label) return;
    // No client-side slug — the server derives it the same way word
    // search's topics do, so typing "Ancient Rome" here lands on the exact
    // same pool as typing it into word search first.
    onPick({ id: label, label });
  };

  // Topics whose pool is already stocked answer instantly; everything else
  // pays one live call to fill its bank the first time. Worth surfacing as
  // its own row rather than mixed in, since it's the difference between an
  // immediate word and a few seconds of waiting.
  const readyNow = discovered.filter((c) => !shownSlugs.has(c.slug)).slice(0, 8);

  return (
    <div className="card hangman-categories">
      <span className="section-title">Pick a category</span>
      <p className="hangman-categories-note">
        A word gets picked for you, with a clue to go on.
      </p>

      {readyNow.length > 0 && (
        <>
          <span className="hangman-category-group">Played before</span>
          <ul className="hangman-category-list hangman-category-list-chips">
            {readyNow.map((c) => (
              <li key={c.slug}>
                <button
                  className="hangman-category hangman-category-chip"
                  onClick={() => onPick({ id: c.slug, label: c.label })}
                >
                  {c.label}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <span className="hangman-category-group">Ideas</span>
      <ul className="hangman-category-list hangman-category-list-chips">
        {suggested.map((topic) => (
          <li key={topic}>
            <button
              className="hangman-category hangman-category-chip"
              onClick={() => onPick({ id: slugFor(topic), label: topic })}
            >
              {topic}
            </button>
          </li>
        ))}
      </ul>
      <button
        className="btn btn-secondary hangman-wide-btn"
        onClick={() => setSuggested((prev) => [...prev, ...pickRandomTopics(8)])}
      >
        Load more topics
      </button>

      <form className="hangman-custom-category" onSubmit={submitCustom}>
        <input
          type="text"
          value={customTopic}
          onChange={(e) => setCustomTopic(e.target.value)}
          placeholder="Or type your own topic…"
          maxLength={60}
        />
        <button type="submit" className="btn btn-text" disabled={!customTopic.trim()}>
          Go
        </button>
      </form>
      <p className="hangman-categories-note">
        {wordSearchTopics.length} topics, the same ones Word Search uses.
      </p>
    </div>
  );
}
