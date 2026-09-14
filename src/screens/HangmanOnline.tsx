import { useEffect, useRef, useState } from 'react';
import { Screen } from '../components/Screen';
import { OnlineLobby } from '../components/OnlineLobby';
import { IdleClaim } from '../components/IdleClaim';
import { HangmanBoard } from '../components/HangmanBoard';
import { IconSpinner } from '../components/icons';
import { fetchHangmanHint } from '../lib/firestoreHangman';
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

        <div className="hangman-status-row">
          <p
            className={`hangman-status ${finished ? 'settled' : ''}`}
            aria-live="polite"
          >
            {(waiting || (settingUp && !amSetter)) && (
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
  const [hinting, setHinting] = useState(false);
  const [hintNote, setHintNote] = useState<string | null>(null);
  const [hintSource, setHintSource] = useState<ProviderSource>(null);

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
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const word = normalizeWord(text);
    if (!word) {
      setProblem(wordProblem(text));
      return;
    }
    setProblem(null);
    setSaving(true);
    try {
      await setHangmanWord(gameId, uid, word, hint.trim().slice(0, 60));
    } catch {
      setProblem("That didn't save — try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="card hangman-setter" onSubmit={submit}>
      <span className="section-title">Set a word for {guesserName}</span>
      <input
        type="text"
        className="hangman-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
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
      {hintSource && <ProviderBadge source={hintSource} />}
      {hintNote && <p className="hangman-setter-hint">{hintNote}</p>}
      {problem && <p className="hangman-problem">{problem}</p>}
      <button className="btn btn-primary" type="submit" disabled={saving}>
        {saving ? 'Setting…' : 'Set the word'}
      </button>
      <p className="hangman-setter-hint">
        3 to 18 letters. Spaces are allowed for a two-word phrase.
      </p>
    </form>
  );
}
