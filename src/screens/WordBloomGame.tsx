import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Screen } from '../components/Screen';
import { Confetti } from '../components/Confetti';
import { GameLeaderboard } from '../components/GameLeaderboard';
import { ProviderBadge } from '../components/ProviderBadge';
import { IconSpinner } from '../components/icons';
import {
  MIN_WORD_LENGTH,
  recentBases,
  rememberBase,
  scoreWord,
  totalPossible,
  wheelLetters,
  type BloomPuzzle,
} from '../lib/bloomEngine';
import { fetchBloomPuzzle } from '../lib/firestoreBloom';
import { todayKey } from '../lib/blocksEngine';
import { submitScore } from '../lib/firestoreScores';
import { playClear, playPlace, playWin } from '../lib/sound';
import './WordBloomGame.css';

type Feedback = { kind: 'good' | 'bad'; text: string } | null;

export function WordBloomGame({
  mode,
  uid,
  displayName,
  onBack,
}: {
  mode: 'daily' | 'free';
  uid: string;
  displayName: string;
  onBack: () => void;
}) {
  const [puzzle, setPuzzle] = useState<BloomPuzzle | null>(null);
  const [loading, setLoading] = useState(true);
  const [found, setFound] = useState<string[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [finished, setFinished] = useState(false);
  const submitted = useRef(false);
  const dateKey = todayKey();

  const load = useCallback(async () => {
    setLoading(true);
    setFound([]);
    setPicked([]);
    setFinished(false);
    setFeedback(null);
    submitted.current = false;
    const next = await fetchBloomPuzzle(
      mode === 'daily' ? { dateKey } : { avoid: recentBases() }
    );
    rememberBase(next.base);
    setPuzzle(next);
    setLoading(false);
  }, [mode, dateKey]);

  useEffect(() => {
    load();
  }, [load]);

  const letters = useMemo(
    () => (puzzle ? wheelLetters(puzzle.base) : []),
    [puzzle]
  );
  const possible = useMemo(
    () => (puzzle ? totalPossible(puzzle.words) : 0),
    [puzzle]
  );
  const score = found.reduce((sum, word) => sum + scoreWord(word), 0);
  const current = picked.map((i) => letters[i]).join('');
  const complete = !!puzzle && found.length === puzzle.words.length;

  // Finishing is what puts the score on the board, so completing the puzzle
  // has to count as finishing too — otherwise the best possible round is
  // the one that never gets recorded.
  useEffect(() => {
    if (complete && !finished) {
      setFinished(true);
      playWin();
    }
  }, [complete, finished]);

  useEffect(() => {
    if (!finished || mode !== 'daily' || submitted.current || !puzzle) return;
    submitted.current = true;
    submitScore({
      gameId: 'wordbloom',
      mode: 'daily',
      dateKey,
      uid,
      name: displayName,
      value: score,
      extra: { words: found.length, base: puzzle.base },
    }).catch(() => {
      submitted.current = false;
    });
  }, [finished, mode, score, found.length, puzzle, dateKey, uid, displayName]);

  const submit = () => {
    if (!puzzle || finished) return;
    const word = current;
    setPicked([]);

    if (word.length < MIN_WORD_LENGTH) {
      setFeedback({ kind: 'bad', text: `${MIN_WORD_LENGTH} letters minimum` });
      return;
    }
    if (found.includes(word)) {
      setFeedback({ kind: 'bad', text: 'Already found' });
      return;
    }
    if (!puzzle.words.includes(word)) {
      setFeedback({ kind: 'bad', text: 'Not in this puzzle' });
      return;
    }

    setFound((f) => [...f, word]);
    setFeedback({ kind: 'good', text: `${word} +${scoreWord(word)}` });
    word.length >= puzzle.base.length ? playClear(4) : playPlace();
  };

  // Clear the flash a moment after it lands, so it reads as a reaction to
  // the last word rather than a status line that happens to be stale.
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 1400);
    return () => clearTimeout(timer);
  }, [feedback]);

  if (loading) {
    return (
      <Screen title="Word Bloom" subtitle="Building your puzzle…" onBack={onBack}>
        <div className="card wb-loading">
          <IconSpinner className="wb-spinner" aria-hidden="true" />
          <p>Finding a good set of letters…</p>
        </div>
      </Screen>
    );
  }

  if (!puzzle) {
    return (
      <Screen title="Word Bloom" onBack={onBack}>
        <div className="card empty-state">Couldn&rsquo;t load a puzzle.</div>
      </Screen>
    );
  }

  const byLength = puzzle.words.reduce<Record<number, string[]>>((acc, word) => {
    (acc[word.length] ??= []).push(word);
    return acc;
  }, {});

  return (
    <Screen
      title="Word Bloom"
      subtitle={mode === 'daily' ? "Today's letters" : 'Free play'}
      onBack={onBack}
    >
      {complete && <Confetti />}

      <div className="wb-scorebar">
        <div className="wb-tally">
          <span className="wb-tally-label">Score</span>
          <span className="wb-tally-value">{score}</span>
        </div>
        <div className="wb-tally">
          <span className="wb-tally-label">Found</span>
          <span className="wb-tally-value">
            {found.length}/{puzzle.words.length}
          </span>
        </div>
        <div className="wb-tally">
          <span className="wb-tally-label">Best possible</span>
          <span className="wb-tally-value">{possible}</span>
        </div>
      </div>

      <div className="wb-progress" aria-hidden="true">
        <span style={{ width: `${possible ? (score / possible) * 100 : 0}%` }} />
      </div>

      <div className="wb-words card">
        {Object.keys(byLength)
          .map(Number)
          .sort((a, b) => a - b)
          .map((length) => (
            <div key={length} className="wb-word-row">
              <span className="wb-word-length">{length}</span>
              <div className="wb-word-slots">
                {byLength[length].map((word) => {
                  const got = found.includes(word);
                  return (
                    <span
                      key={word}
                      className={`wb-word ${got ? 'found' : ''} ${
                        finished && !got ? 'missed' : ''
                      }`}
                    >
                      {got || finished ? word : '•'.repeat(length)}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
      </div>

      <div className={`wb-current ${feedback ? feedback.kind : ''}`} aria-live="polite">
        {feedback ? feedback.text : current || 'Tap the letters'}
      </div>

      <div className="wb-wheel">
        {letters.map((letter, i) => {
          const angle = (i / letters.length) * 2 * Math.PI - Math.PI / 2;
          const used = picked.includes(i);
          return (
            <button
              key={i}
              className={`wb-letter ${used ? 'used' : ''}`}
              style={{
                left: `${50 + 38 * Math.cos(angle)}%`,
                top: `${50 + 38 * Math.sin(angle)}%`,
              }}
              disabled={finished || used}
              onClick={() => setPicked((p) => [...p, i])}
            >
              {letter}
            </button>
          );
        })}
      </div>

      <div className="wb-controls">
        <button
          className="btn btn-text"
          onClick={() => setPicked([])}
          disabled={picked.length === 0 || finished}
        >
          Clear
        </button>
        <button
          className="btn btn-primary wb-enter"
          onClick={submit}
          disabled={picked.length === 0 || finished}
        >
          Enter
        </button>
        <button
          className="btn btn-text"
          onClick={() => setPicked((p) => p.slice(0, -1))}
          disabled={picked.length === 0 || finished}
        >
          Undo
        </button>
      </div>

      {!finished ? (
        <button className="btn btn-text wb-finish" onClick={() => setFinished(true)}>
          {mode === 'daily' ? "I'm done — put it on the board" : "I'm done"}
        </button>
      ) : (
        <div className="wb-result card">
          <h3>
            {complete
              ? 'Every word found!'
              : `${found.length} of ${puzzle.words.length} found`}
          </h3>
          <p className="wb-result-score">{score} points</p>
          {mode === 'free' && (
            <button className="btn btn-primary" onClick={load}>
              New letters
            </button>
          )}
        </div>
      )}

      <ProviderBadge source={puzzle.source} />

      {mode === 'daily' && (
        <>
          <div className="section-head">
            <span className="section-title">Today&rsquo;s best</span>
          </div>
          <GameLeaderboard
            gameId="wordbloom"
            mode="daily"
            scoring="highScore"
            dateKey={dateKey}
            limit={5}
          />
        </>
      )}
    </Screen>
  );
}
