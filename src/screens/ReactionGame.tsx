import { useEffect, useRef, useState } from 'react';
import { Screen } from '../components/Screen';
import { submitScore, watchTopScores } from '../lib/firestoreScores';
import { DEFAULT_MODE } from '../lib/router';
import { playClear, playGameOver, playPlace } from '../lib/sound';
import './ReactionGame.css';

const ROUNDS = 5;
const MIN_WAIT_MS = 1400;
const MAX_WAIT_MS = 4800;

type Phase = 'idle' | 'waiting' | 'go' | 'scored' | 'tooSoon' | 'done';

interface ReactionGameProps {
  uid: string;
  displayName: string;
  onBack: () => void;
}

export function ReactionGame({ uid, displayName, onBack }: ReactionGameProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  // One entry per attempt. null marks a voided attempt (tapped before the
  // green) — it still consumes a round, it just doesn't produce a time.
  const [times, setTimes] = useState<(number | null)[]>([]);
  const [lastTime, setLastTime] = useState<number | null>(null);
  const [familyBest, setFamilyBest] = useState<number | null>(null);

  const waitTimer = useRef<number | null>(null);
  const goAt = useRef<number>(0);
  const scoreSaved = useRef(false);
  // familyBest is a live subscription, and this set's own score lands in it
  // moments after the set ends — freeze the pre-submission value so the
  // "New family best!" flag is judged against everyone else's times, not
  // against the score we're in the middle of writing.
  const familyBestAtEnd = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (waitTimer.current !== null) window.clearTimeout(waitTimer.current);
    };
  }, []);

  useEffect(() => {
    return watchTopScores(
      'reaction',
      DEFAULT_MODE,
      (entries) => setFamilyBest(entries[0]?.value ?? null),
      () => setFamilyBest(null),
      1,
      'asc'
    );
  }, []);

  const validTimes = times.filter((t): t is number => t !== null);
  const best = validTimes.length ? Math.min(...validTimes) : null;

  // Submitted once per set, after all rounds — the best single reaction of
  // the five. One attempt is too noisy to rank a family on, and a mis-tap
  // shouldn't wipe out an otherwise good set.
  useEffect(() => {
    if (phase !== 'done' || scoreSaved.current || best === null) return;
    scoreSaved.current = true;
    submitScore({
      gameId: 'reaction',
      mode: DEFAULT_MODE,
      uid,
      name: displayName,
      value: best,
    }).catch(() => {
      scoreSaved.current = false;
    });
  }, [phase, best, uid, displayName]);

  const armRound = () => {
    setPhase('waiting');
    setLastTime(null);
    const delay = MIN_WAIT_MS + Math.random() * (MAX_WAIT_MS - MIN_WAIT_MS);
    waitTimer.current = window.setTimeout(() => {
      goAt.current = performance.now();
      setPhase('go');
      playPlace();
    }, delay);
  };

  const handleTap = () => {
    switch (phase) {
      case 'idle':
      case 'scored':
      case 'tooSoon':
        armRound();
        break;

      case 'waiting': {
        // Jumped the gun. The attempt is spent, not retried: it's recorded
        // as a void and the set moves on. Letting them re-roll the same
        // round would make an early tap free, which turns spamming the
        // screen into a valid strategy for catching the green early.
        if (waitTimer.current !== null) window.clearTimeout(waitTimer.current);
        const nextTimes = [...times, null];
        const finished = nextTimes.length >= ROUNDS;
        if (finished) familyBestAtEnd.current = familyBest;
        setTimes(nextTimes);
        setLastTime(null);
        playGameOver();
        setPhase(finished ? 'done' : 'tooSoon');
        break;
      }

      case 'go': {
        const elapsed = Math.round(performance.now() - goAt.current);
        const nextTimes = [...times, elapsed];
        const finished = nextTimes.length >= ROUNDS;
        if (finished) familyBestAtEnd.current = familyBest;
        setTimes(nextTimes);
        setLastTime(elapsed);
        playClear(finished ? 3 : 0);
        setPhase(finished ? 'done' : 'scored');
        break;
      }

      case 'done':
        break;
    }
  };

  const handleRestart = () => {
    if (waitTimer.current !== null) window.clearTimeout(waitTimer.current);
    scoreSaved.current = false;
    setTimes([]);
    setLastTime(null);
    setPhase('idle');
  };

  const average =
    validTimes.length > 0
      ? Math.round(validTimes.reduce((sum, t) => sum + t, 0) / validTimes.length)
      : null;
  const voided = times.length - validTimes.length;

  const panelText = () => {
    switch (phase) {
      case 'idle':
        return { big: 'Tap to start', small: `Best of ${ROUNDS} taps` };
      case 'waiting':
        return { big: 'Wait…', small: 'Tap the moment it turns green' };
      case 'go':
        return { big: 'TAP!', small: '' };
      case 'scored':
        return { big: `${lastTime} ms`, small: 'Tap for the next one' };
      case 'tooSoon':
        return { big: 'Too soon!', small: 'That one is void — tap for the next round' };
      case 'done':
        return best === null
          ? { big: 'All void', small: 'Wait for the green next time' }
          : { big: `${best} ms`, small: 'Your best of the set' };
    }
  };

  const { big, small } = panelText();

  return (
    <Screen title="Reaction Time" onBack={onBack}>
      <div className="reaction-scorebar">
        <div className="reaction-stat">
          <span className="reaction-stat-value">
            {Math.min(times.length + (phase === 'done' ? 0 : 1), ROUNDS)}/
            {ROUNDS}
          </span>
          <span className="reaction-stat-label">round</span>
        </div>
        <div className="reaction-stat reaction-stat-right">
          <span className="reaction-stat-value">
            {familyBest !== null ? `${familyBest} ms` : '—'}
          </span>
          <span className="reaction-stat-label">family best</span>
        </div>
      </div>

      <button
        className={`reaction-panel phase-${phase}`}
        onPointerDown={handleTap}
        disabled={phase === 'done'}
        aria-live="polite"
      >
        <span className="reaction-panel-big">{big}</span>
        {small && <span className="reaction-panel-small">{small}</span>}
      </button>

      {times.length > 0 && (
        <ul className="reaction-times">
          {Array.from({ length: ROUNDS }).map((_, i) => {
            const played = i < times.length;
            const value = times[i];
            return (
              <li
                key={i}
                className={`reaction-time ${played ? 'filled' : ''} ${
                  played && value === null ? 'void' : ''
                } ${value !== null && value === best ? 'best' : ''}`}
              >
                {!played ? '–' : value === null ? '✗' : value}
              </li>
            );
          })}
        </ul>
      )}

      {phase === 'done' && (
        <div className="reaction-result card">
          <h3>{best === null ? 'No time' : `${best} ms`}</h3>
          <p className="reaction-result-detail">
            {best === null
              ? `All ${ROUNDS} attempts were void`
              : `Best of ${ROUNDS} · ${average} ms average${
                  voided > 0 ? ` · ${voided} void` : ''
                }`}
          </p>
          {best !== null &&
            (familyBestAtEnd.current === null ? (
              <p className="reaction-result-flag">First time on the board!</p>
            ) : best < familyBestAtEnd.current ? (
              <p className="reaction-result-flag">New family best!</p>
            ) : (
              <p className="reaction-result-gap">
                {best - familyBestAtEnd.current} ms off the family best
              </p>
            ))}
          <button className="btn btn-primary" onClick={handleRestart}>
            Play again
          </button>
        </div>
      )}
    </Screen>
  );
}
