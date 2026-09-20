import { useEffect, useRef, useState } from 'react';
import { Screen } from '../components/Screen';
import { OnlineLobby } from '../components/OnlineLobby';
import { IdleClaim } from '../components/IdleClaim';
import { TurnBanner } from '../components/TurnBanner';
import { HangmanBoard } from '../components/HangmanBoard';
import { IconSpinner } from '../components/icons';
import {
  checkHangmanSpelling,
  fetchHangmanHint,
  fetchHangmanSuggestions,
  fetchHangmanCategories,
  markHangmanSuggestionUsed,
  HANGMAN_CATEGORIES,
  type DiscoveredCategory,
  type HangmanCategory,
} from '../lib/firestoreHangman';
import { ProviderBadge, type ProviderSource } from '../components/ProviderBadge';
import {
  hangmanRules,
  setHangmanWord,
  type HmState,
} from '../lib/onlineHangman';
import {
  MAX_WRONG,
  isHanged,
  isSolved,
  normalizeWord,
  wordProblem,
  wrongCount,
} from '../lib/hangmanEngine';
import { useOnlineGame } from '../lib/useOnlineGame';
import { submitScore } from '../lib/firestoreScores';
import { playClear, playGameOver, playPlace } from '../lib/sound';
import './HangmanGame.css';

interface Props {
  uid: string;
  displayName: string;
  onBack: () => void;
}

/** Family hangman: one of you sets the word, the other guesses, and the
 * roles swap on every rematch. Runs on the same Realtime Database core as
 * the other online games — the only unusual part is that the guesser holds
 * the turn for the whole round, which is what stops the setter from being
 * able to move at all. */
export function HangmanOnline({ uid, displayName, onBack }: Props) {
  const {
    game,
    games,
    busy,
    error,
    host,
    join,
    resume,
    move,
    rematch,
    leave,
    claimWin,
  } = useOnlineGame<HmState>(hangmanRules, uid, displayName);

  const scoredRounds = useRef<Set<string>>(new Set());
  const previousGuessed = useRef<string | null>(null);

  const word = game?.state?.word ?? '';
  const guessed = game?.state?.guessed ?? '';
  const setter = game?.state?.setter ?? '';
  const amSetter = !!game && setter === uid;

  // Sound is driven off the synced state, so the setter hears the guesser's
  // near-misses land too.
  useEffect(() => {
    if (!game || !word) {
      previousGuessed.current = null;
      return;
    }
    const before = previousGuessed.current;
    previousGuessed.current = guessed;
    if (before === null || before === guessed) return;
    const letter = guessed.split('').find((l) => !before.includes(l));
    if (!letter) return;
    if (isSolved(word, guessed)) playClear(3);
    else if (isHanged(word, guessed)) playGameOver();
    else if (word.includes(letter)) playPlace();
    else playGameOver();
  }, [game, word, guessed]);

  useEffect(() => {
    if (!game || game.status !== 'done' || game.outcome !== 'win') return;
    if (game.winnerUid !== uid) return;
    const key = `${game.id}:${game.wins[uid] ?? 0}`;
    if (scoredRounds.current.has(key)) return;
    scoredRounds.current.add(key);
    submitScore({
      gameId: 'hangman',
      mode: 'online',
      uid,
      name: displayName,
      value: 1,
    }).catch(() => scoredRounds.current.delete(key));
  }, [game, uid, displayName]);

  // ---------- lobby ----------

  if (!game) {
    return (
      <Screen title="Hangman" subtitle="Family game" onBack={onBack}>
        <OnlineLobby
          kind="hangman"
          uid={uid}
          games={games}
          busy={busy}
          error={error}
          joinAs="as the guesser"
          onHost={host}
          onResume={resume}
          onJoin={join}
        />
      </Screen>
    );
  }

  const opponentUid = game.players.find((p) => p !== uid);
  const opponentName = opponentUid ? game.names[opponentUid] : null;
  const waiting = game.status === 'waiting';
  const settingUp = game.status === 'placing';
  const finished = game.status === 'done';
  const outcome = !word
    ? 'playing'
    : isSolved(word, guessed)
    ? 'won'
    : isHanged(word, guessed)
    ? 'lost'
    : 'playing';

  const statusText = () => {
    if (waiting) return 'Waiting for someone to join…';
    if (settingUp) {
      return amSetter
        ? 'Your turn to think of a word'
        : `${opponentName ?? 'They'} are picking a word…`;
    }
    if (finished) {
      const guesserWon = game.winnerUid !== setter;
      if (guesserWon) {
        return amSetter
          ? `${opponentName} got it`
          : 'You got it!';
      }
      return amSetter ? 'They never got it!' : 'Out of guesses';
    }
    return amSetter ? `${opponentName ?? 'They'} are guessing…` : 'Your turn';
  };

  return (
    <Screen
      title="Hangman"
      subtitle={opponentName ? `vs ${opponentName}` : 'Waiting…'}
      onBack={onBack}
    >
      <div className="hangman-fit">
        {error && <div className="hangman-error card">{error}</div>}

        <div className="hangman-scorebar">
          <div className="hangman-tally">
            <span className="hangman-tally-name">
              You {amSetter ? '(setting)' : '(guessing)'}
            </span>
            <span className="hangman-tally-value">{game.wins[uid] ?? 0}</span>
          </div>
          <div className="hangman-tally">
            <span className="hangman-tally-name">
              {opponentName ?? 'Opponent'}{' '}
              {game.status !== 'waiting' && (amSetter ? '(guessing)' : '(setting)')}
            </span>
            <span className="hangman-tally-value">
              {opponentUid ? game.wins[opponentUid] ?? 0 : 0}
            </span>
          </div>
        </div>

        <IdleClaim
          status={game.status}
          turn={game.turn}
          updatedAt={game.updatedAt}
          uid={uid}
          opponentName={opponentName}
          onClaim={claimWin}
        />

        {!waiting && !finished ? (
          <div className="hangman-status-row">
            <TurnBanner
              active={settingUp ? amSetter : !amSetter}
              label={statusText()}
            />
          </div>
        ) : (
          <div className="hangman-status-row">
            <p
              className={`hangman-status ${finished ? 'settled' : ''}`}
              aria-live="polite"
            >
              {waiting && (
                <IconSpinner className="hangman-status-spinner" aria-hidden="true" />
              )}
              {statusText()}
            </p>
            {finished && (
              <button className="btn btn-primary hangman-next-btn" onClick={rematch}>
                Swap and play again
              </button>
            )}
          </div>
        )}

        {settingUp && amSetter && (
          <WordSetter
            gameId={game.id}
            uid={uid}
            guesserName={opponentName ?? 'them'}
          />
        )}

        {settingUp && !amSetter && (
          <div className="card hangman-waiting-card">
            <p>
              {opponentName ?? 'Your opponent'} is choosing a word for you to
              guess.
            </p>
          </div>
        )}

        {!waiting && !settingUp && word && (
          <>
            {amSetter && !finished && (
              <p className="hangman-setter-note">
                Your word: <strong>{word}</strong> — they can&rsquo;t see it.
              </p>
            )}
            <HangmanBoard
              word={word}
              guessed={guessed}
              outcome={outcome}
              hint={game.state?.hint}
              canGuess={!amSetter && game.status === 'active'}
              onGuess={move}
            />
            {finished && (
              <div className="card hangman-result">
                <h3>{word}</h3>
                <p className="hangman-result-detail">
                  {outcome === 'won'
                    ? `Guessed with ${MAX_WRONG - wrongCount(word, guessed)} to spare`
                    : `${MAX_WRONG} wrong guesses — the figure is finished`}
                </p>
                {game.state?.hint && (
                  // Shown after every round regardless of outcome, same as
                  // solo hangman — the setter's clue reads differently once
                  // you know the answer, and seeing both together is half
                  // the fun of a good one.
                  <p className="hangman-result-hint">Clue: {game.state.hint}</p>
                )}
              </div>
            )}
          </>
        )}

        {waiting && (
          <div className="card hangman-waiting-card">
            <p>
              Once someone sits down you&rsquo;ll pick a word for them to
              guess.
            </p>
          </div>
        )}

        <button className="btn btn-text hangman-leave" onClick={leave}>
          {waiting ? 'Cancel this game' : 'Leave game'}
        </button>
      </div>
    </Screen>
  );
}

/** The setter's half of the round: a word, and optionally a clue. Kept on
 * this screen rather than in the lobby because the word can only be written
 * once someone is sitting opposite — until then there's nobody to set it
 * for, and the shared join step resets game state. */
function WordSetter({
  gameId,
  uid,
  guesserName,
}: {
  gameId: string;
  uid: string;
  guesserName: string;
}) {
  const [text, setText] = useState('');
  const [hint, setHint] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [hinting, setHinting] = useState(false);
  const [hintNote, setHintNote] = useState<string | null>(null);
  const [hintSource, setHintSource] = useState<ProviderSource>(null);
  /** A spelling the model offered, waiting on the setter to take it or
   * leave it. Never applied on its own: the word may well be a name or a
   * family in-joke, and only the person who typed it knows that.
   *
   * `atSubmit` is what the two buttons do afterwards. Raised from the Set
   * button, answering it sets the word — the setter had already committed.
   * Raised from Suggest, it only fixes the text and gets out of the way,
   * because they were still writing the clue. */
  const [suggestion, setSuggestion] = useState<{
    typed: string;
    fixed: string;
    atSubmit: boolean;
  } | null>(null);
  /** Every word already put to the model, and what it said — the correction
   * it offered, or null for "looks fine". Suggest fills this in as a side
   * effect of fetching the clue, so the common path (tap Suggest, then Set)
   * asks one model one question once instead of twice. */
  const checked = useRef<Map<string, string | null>>(new Map());
  /** Words the setter has explicitly okayed, either by keeping their own
   * spelling or by taking the correction, so they're never asked twice. */
  const accepted = useRef<Set<string>>(new Set());

  /** "Write from scratch" (unchanged) or "pick a category" — the setter's
   * alternative path, backed by the same shared word pool solo hangman and
   * word search draw on. */
  const [mode, setMode] = useState<'scratch' | 'category'>('scratch');
  const [discovered, setDiscovered] = useState<DiscoveredCategory[]>([]);
  const [activeCategory, setActiveCategory] = useState<HangmanCategory | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestSource, setSuggestSource] = useState<ProviderSource>(null);
  /** The word currently in `text` because it was tapped from the
   * suggestion list, and which category it came from — cleared the moment
   * the setter edits the box by hand, so an edited suggestion doesn't
   * wrongly mark the ORIGINAL suggestion used at save time. Only committing
   * (Set the word) on an untouched suggestion calls markHangmanSuggestionUsed
   * — browsing or loading more never should (see suggestHangmanWords). */
  const [pickedSuggestion, setPickedSuggestion] = useState<{
    category: HangmanCategory;
    word: string;
  } | null>(null);

  useEffect(() => {
    if (mode !== 'category') return;
    let cancelled = false;
    fetchHangmanCategories().then((categories) => {
      if (!cancelled) setDiscovered(categories);
    });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  const pickCategory = async (category: HangmanCategory) => {
    setActiveCategory(category);
    setSuggestions([]);
    setPickedSuggestion(null);
    setSuggestLoading(true);
    const result = await fetchHangmanSuggestions(category, 8);
    setSuggestLoading(false);
    setSuggestions(result.words);
    setSuggestSource(result.words.length ? (result.source as ProviderSource) : null);
  };

  const loadMoreSuggestions = async () => {
    if (!activeCategory) return;
    setSuggestLoading(true);
    const result = await fetchHangmanSuggestions(activeCategory, 8);
    setSuggestLoading(false);
    setSuggestions(result.words);
    setSuggestSource(result.words.length ? (result.source as ProviderSource) : null);
  };

  const pickSuggestion = (word: string) => {
    if (!activeCategory) return;
    setText(word);
    setSuggestion(null);
    setPickedSuggestion({ category: activeCategory, word });
    // A pool-sourced word is already real, common vocabulary — skip
    // spell-checking it the way a from-scratch word needs, same reasoning
    // as accepted.current elsewhere: don't ask the model a question whose
    // answer is already known.
    accepted.current.add(word);
    checked.current.set(word, null);
  };

  /** Lets the setter hand the clue-writing to the AI. It only runs on a
   * word that already passes validation, so it can't be asked to make sense
   * of half a typed word. */
  const suggestHint = async () => {
    const word = normalizeWord(text);
    if (!word) {
      setProblem(wordProblem(text));
      return;
    }
    setProblem(null);
    setHintNote(null);
    setHintSource(null);
    setHinting(true);
    const suggested = await fetchHangmanHint(word);
    setHinting(false);
    if (suggested.hint) {
      setHint(suggested.hint);
      setHintSource(suggested.source);
    } else {
      setHintNote("Couldn't think of one — write your own.");
    }

    // The same call already answered the spelling question. Record it
    // either way — a null verdict is just as worth remembering, since it's
    // what lets the Set button skip its own check.
    checked.current.set(word, suggested.correction);
    if (suggested.correction && suggested.correction !== word) {
      setSuggestion({ typed: word, fixed: suggested.correction, atSubmit: false });
    }
  };

  const save = async (word: string) => {
    setSuggestion(null);
    setSaving(true);
    try {
      await setHangmanWord(gameId, uid, word, hint.trim().slice(0, 60));
      // Committing, not browsing — this is the one moment a suggestion
      // actually gets marked used (see fetchHangmanSuggestions's own doc
      // comment for why showing it must not). Only fires when the word
      // being saved is still exactly the untouched suggestion that was
      // tapped, not something edited afterward.
      if (pickedSuggestion?.word === word) {
        void markHangmanSuggestionUsed(pickedSuggestion.category, word);
      }
    } catch {
      setProblem("That didn't save — try again.");
    } finally {
      setSaving(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const word = normalizeWord(text);
    if (!word) {
      setProblem(wordProblem(text));
      return;
    }
    setProblem(null);
    setSuggestion(null);

    // The spell check sits between "Set the word" and the word actually
    // going in, because this is the last moment it can be fixed: once the
    // guesser has the word, a typo means a round nobody can win, and
    // hangman gives no way to tell a misspelling from a hard word.
    if (!accepted.current.has(word)) {
      let fixed = checked.current.get(word) ?? null;
      // Only worth a call if Suggest hasn't already asked about this exact
      // word. `has` rather than a truthiness check: a remembered "looks
      // fine" is a real answer and mustn't send us round again.
      if (!checked.current.has(word)) {
        setChecking(true);
        fixed = await checkHangmanSpelling(word);
        setChecking(false);
        checked.current.set(word, fixed);
      }
      if (fixed && fixed !== word) {
        setSuggestion({ typed: word, fixed, atSubmit: true });
        return;
      }
      accepted.current.add(word);
    }

    await save(word);
  };

  /** Both answers to "did you mean" end the question. Which of them changes
   * the word is the only difference; whether it also sets it depends on
   * where the question came from. */
  const resolveSuggestion = (word: string) => {
    if (!suggestion) return;
    const atSubmit = suggestion.atSubmit;
    accepted.current.add(word);
    checked.current.set(word, null);
    setText(word);
    setSuggestion(null);
    if (atSubmit) void save(word);
  };

  const trimmedHint = hint.trim();

  const pinnedIds = new Set(HANGMAN_CATEGORIES.map((c) => c.id));

  return (
    <form className="card hangman-setter" onSubmit={submit}>
      <span className="section-title">Set a word for {guesserName}</span>

      <div className="hangman-mode-toggle">
        <button
          type="button"
          className={`hangman-mode-btn ${mode === 'scratch' ? 'active' : ''}`}
          onClick={() => setMode('scratch')}
        >
          Write my own
        </button>
        <button
          type="button"
          className={`hangman-mode-btn ${mode === 'category' ? 'active' : ''}`}
          onClick={() => setMode('category')}
        >
          Pick a category
        </button>
      </div>

      {mode === 'category' && (
        <div className="hangman-category-browser">
          <ul className="hangman-category-list hangman-category-list-compact">
            {[...HANGMAN_CATEGORIES, ...discovered.filter((c) => !pinnedIds.has(c.slug)).map((c) => ({ id: c.slug, label: c.label }))].map(
              (category) => (
                <li key={category.id}>
                  <button
                    type="button"
                    className={`hangman-category ${activeCategory?.id === category.id ? 'active' : ''}`}
                    onClick={() => void pickCategory(category)}
                  >
                    {category.label}
                  </button>
                </li>
              )
            )}
          </ul>

          {activeCategory && (
            <div className="hangman-suggestion-list">
              {suggestLoading && suggestions.length === 0 ? (
                <p className="hangman-setter-hint">Thinking of some options…</p>
              ) : (
                <>
                  <ul className="hangman-suggestion-chips">
                    {suggestions.map((word) => (
                      <li key={word}>
                        <button
                          type="button"
                          className={`hangman-suggestion-chip ${
                            pickedSuggestion?.word === word ? 'active' : ''
                          }`}
                          onClick={() => pickSuggestion(word)}
                        >
                          {word}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="hangman-suggestion-actions">
                    <button
                      type="button"
                      className="btn btn-text"
                      onClick={() => void loadMoreSuggestions()}
                      disabled={suggestLoading}
                    >
                      {suggestLoading ? 'Loading…' : 'Load more'}
                    </button>
                    {suggestSource && <ProviderBadge source={suggestSource} />}
                  </div>
                </>
              )}
            </div>
          )}
          {pickedSuggestion && (
            <p className="hangman-setter-hint">
              Picked <strong>{pickedSuggestion.word}</strong> — edit it below if you
              want, or set it as is.
            </p>
          )}
        </div>
      )}

      <input
        type="text"
        className="hangman-input"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSuggestion(null);
          setPickedSuggestion(null);
        }}
        placeholder="A word or short phrase"
        maxLength={24}
        autoFocus
        // Nothing is hidden from the person holding the phone, but the
        // keyboard's own word suggestions would happily show the word to
        // anyone glancing over — and autocapitalize keeps it readable.
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />

      {suggestion && (
        <div className="hangman-didyoumean">
          <p className="hangman-didyoumean-q">
            Did you mean <strong>{suggestion.fixed}</strong>?
          </p>
          <div className="hangman-didyoumean-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => resolveSuggestion(suggestion.fixed)}
            >
              Use {suggestion.fixed}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => resolveSuggestion(suggestion.typed)}
            >
              Keep {suggestion.typed}
            </button>
          </div>
        </div>
      )}

      <div className="hangman-hint-row">
        <input
          type="text"
          className="hangman-input"
          value={hint}
          onChange={(e) => {
            setHint(e.target.value);
            // Once edited by hand it's no longer purely the model's
            // wording, so the badge shouldn't keep claiming it.
            setHintSource(null);
          }}
          placeholder="A clue (optional)"
          maxLength={60}
          autoComplete="off"
        />
        <button
          type="button"
          className="btn btn-secondary hangman-suggest"
          onClick={suggestHint}
          disabled={hinting}
        >
          {hinting ? 'Thinking…' : 'Suggest'}
        </button>
      </div>

      {/* A clue runs to 60 characters and the box shows maybe 20 of them,
          so the setter was approving clues they could only read a third
          of. This wraps the whole thing, live, under the box it's typed
          in — the box stays the place you edit, this is the place you read. */}
      {trimmedHint && (
        <p className="hangman-hint-preview" aria-live="polite">
          {trimmedHint}
        </p>
      )}

      {hintSource && <ProviderBadge source={hintSource} />}
      {hintNote && <p className="hangman-setter-hint">{hintNote}</p>}
      {problem && <p className="hangman-problem">{problem}</p>}
      <button
        className="btn btn-primary"
        type="submit"
        disabled={saving || checking || suggestion?.atSubmit}
      >
        {checking ? 'Checking…' : saving ? 'Setting…' : 'Set the word'}
      </button>
      <p className="hangman-setter-hint">
        3 to 18 letters. Spaces are allowed for a two-word phrase.
      </p>
    </form>
  );
}
