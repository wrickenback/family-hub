import { useCallback, useEffect, useRef, useState } from 'react';
import { Screen } from '../components/Screen';
import { TurnBanner } from '../components/TurnBanner';
import {
  PADS,
  extendSequence,
  playbackDuration,
  playbackSchedule,
  stepTiming,
} from '../lib/simonEngine';
import { submitScore, watchTopScores } from '../lib/firestoreScores';
import { DEFAULT_MODE } from '../lib/router';
import {
  audioNow,
  playSimonFail,
  playWin,
  scheduleSimonTone,
  startSimonTone,
  unlockAudio,
} from '../lib/sound';
import './SimonGame.css';

type Phase = 'idle' | 'watch' | 'repeat' | 'failed';
export type SimonMode = 'solo' | 'pass';

const BEST_KEY = 'familyhub:simon:best';
/** Lead-in before the first tone of a round, so the player has a beat to
 * look up from the "watch" banner before the sequence starts. */
const LEAD_IN = 0.45;

function loadBest(): number {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    const value = raw ? Number(raw) : 0;
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function saveBest(value: number): void {
  try {
    localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Private mode or blocked storage — the round still counts, it just
    // isn't remembered on this device.
  }
}

interface SimonGameProps {
  mode: SimonMode;
  uid: string;
  displayName: string;
  onBack: () => void;
}

export function SimonGame({ mode, uid, displayName, onBack }: SimonGameProps) {
  const [sequence, setSequence] = useState<number[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [step, setStep] = useState(0);
  const [lit, setLit] = useState<number | null>(null);
  const [best, setBest] = useState(loadBest);
  const [familyBest, setFamilyBest] = useState<number | null>(null);
  // Pass-and-play only: 0 or 1, and who lost when it ends.
  const [player, setPlayer] = useState(0);
  const [loser, setLoser] = useState<number | null>(null);

  const frameRef = useRef<number | null>(null);
  const releaseToneRef = useRef<(() => void) | null>(null);
  const scoreSaved = useRef(false);
  // A fallback clock for browsers with no Web Audio at all, so the game is
  // still playable (silently) rather than frozen on "watch".
  const fallbackStart = useRef(0);

  useEffect(() => {
    return watchTopScores(
      'simon',
      DEFAULT_MODE,
      (entries) => setFamilyBest(entries[0]?.value ?? null),
      () => setFamilyBest(null),
      1,
      'desc'
    );
  }, []);

  const stopPlayback = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      stopPlayback();
      releaseToneRef.current?.();
    };
  }, [stopPlayback]);

  /** Plays a sequence back. Every tone is scheduled on the audio clock in
   * one go, and the flashes are driven from that same clock each frame —
   * so the lights and the sound cannot drift apart, and neither drifts from
   * the tempo however busy the main thread gets. */
  const playSequence = useCallback(
    (seq: number[]) => {
      stopPlayback();
      setPhase('watch');
      setStep(0);
      unlockAudio();

      const schedule = playbackSchedule(seq);
      const total = playbackDuration(seq);
      const clockStart = audioNow();
      const usingAudio = clockStart !== null;
      const startAt = (clockStart ?? 0) + LEAD_IN;
      fallbackStart.current = performance.now() / 1000 + LEAD_IN;

      if (usingAudio) {
        for (const s of schedule) {
          scheduleSimonTone(s.pad, startAt + s.at, s.duration);
        }
      }

      const tick = () => {
        const now = usingAudio ? audioNow()! : performance.now() / 1000;
        const elapsed = now - (usingAudio ? startAt : fallbackStart.current);
        if (elapsed >= total) {
          setLit(null);
          setPhase('repeat');
          setStep(0);
          frameRef.current = null;
          return;
        }
        const active = schedule.find(
          (s) => elapsed >= s.at && elapsed < s.at + s.duration
        );
        setLit(active ? active.pad : null);
        frameRef.current = requestAnimationFrame(tick);
      };
      frameRef.current = requestAnimationFrame(tick);
    },
    [stopPlayback]
  );

  const startGame = () => {
    scoreSaved.current = false;
    setLoser(null);
    setPlayer(0);
    const seq = extendSequence([]);
    setSequence(seq);
    playSequence(seq);
  };

  const nextRound = useCallback(
    (fromSequence: number[]) => {
      const seq = extendSequence(fromSequence);
      setSequence(seq);
      playSequence(seq);
    },
    [playSequence]
  );

  const endRound = useCallback(
    (reached: number, failedPlayer: number) => {
      setPhase('failed');
      setLit(null);
      playSimonFail();
      setLoser(failedPlayer);
      if (mode === 'solo' && reached > best) {
        setBest(reached);
        saveBest(reached);
      }
    },
    [best, mode]
  );

  // Solo scores go up once per game, at the end: the length of the longest
  // sequence repeated correctly. Pass-and-play never scores — the second
  // player isn't signed in on this device to attribute a result to.
  useEffect(() => {
    if (phase !== 'failed' || mode !== 'solo' || scoreSaved.current) return;
    const reached = sequence.length - 1;
    if (reached < 1) return;
    scoreSaved.current = true;
    submitScore({
      gameId: 'simon',
      mode: DEFAULT_MODE,
      uid,
      name: displayName,
      value: reached,
    }).catch(() => {
      scoreSaved.current = false;
    });
  }, [phase, mode, sequence.length, uid, displayName]);

  const pressPad = (pad: number) => {
    if (phase !== 'repeat') return;
    releaseToneRef.current?.();
    releaseToneRef.current = startSimonTone(pad);
    setLit(pad);

    if (sequence[step] !== pad) {
      // The round the player actually completed is one less than the
      // sequence they just failed on.
      endRound(sequence.length - 1, player);
      return;
    }

    const nextStep = step + 1;
    if (nextStep < sequence.length) {
      setStep(nextStep);
      return;
    }

    // Whole sequence repeated. Hold the last tone briefly, then either hand
    // the phone over or push straight on to a longer sequence.
    setStep(0);
    setPhase('watch');
    const { tone } = stepTiming(sequence.length);
    const pause = mode === 'pass' ? 1100 : tone * 1000 + 500;
    if (mode === 'solo') playWin();
    const current = sequence;
    window.setTimeout(() => {
      if (mode === 'pass') setPlayer((p) => (p === 0 ? 1 : 0));
      nextRound(current);
    }, pause);
  };

  const releasePad = () => {
    releaseToneRef.current?.();
    releaseToneRef.current = null;
    if (phase === 'repeat') setLit(null);
  };

  const round = sequence.length;
  const reached = Math.max(round - 1, 0);

  const banner =
    phase === 'watch'
      ? { label: 'Watch', hint: `Sequence of ${round}` }
      : phase === 'repeat'
      ? {
          label:
            mode === 'pass' ? `Player ${player + 1} — repeat it` : 'Your turn',
          hint: `${step} of ${round}`,
        }
      : null;

  return (
    <Screen title="Simon" onBack={onBack} className="simon-screen">
      {banner && (
        <TurnBanner
          active
          label={banner.label}
          hint={banner.hint}
          accent={phase === 'watch' ? '#8b7d72' : PADS[0].litColor}
        />
      )}

      <div className="simon-stats">
        <div className="simon-stat">
          <span className="simon-stat-value">{reached}</span>
          <span className="simon-stat-label">this game</span>
        </div>
        {mode === 'solo' && (
          <>
            <div className="simon-stat">
              <span className="simon-stat-value">{best || '—'}</span>
              <span className="simon-stat-label">your best</span>
            </div>
            <div className="simon-stat">
              <span className="simon-stat-value">{familyBest ?? '—'}</span>
              <span className="simon-stat-label">family best</span>
            </div>
          </>
        )}
      </div>

      <div className="simon-board" aria-label="Simon pads">
        {PADS.map((pad) => (
          <button
            key={pad.id}
            className={`simon-pad simon-pad-${pad.id} ${
              lit === pad.id ? 'lit' : ''
            }`}
            style={{
              background: lit === pad.id ? pad.litColor : pad.color,
            }}
            disabled={phase !== 'repeat'}
            onPointerDown={(e) => {
              e.preventDefault();
              pressPad(pad.id);
            }}
            onPointerUp={releasePad}
            onPointerLeave={releasePad}
            onPointerCancel={releasePad}
            aria-label={pad.name}
          />
        ))}
        <div className="simon-hub">
          <span className="simon-hub-count">{round || '—'}</span>
          <span className="simon-hub-label">
            {phase === 'watch' ? 'watch' : phase === 'repeat' ? 'repeat' : 'ready'}
          </span>
        </div>
      </div>

      {phase === 'idle' && (
        <>
          <button className="btn btn-primary simon-start" onClick={startGame}>
            {mode === 'pass' ? 'Start — Player 1 first' : 'Start'}
          </button>
          <p className="simon-note">
            Sound carries the pattern, so turn it up. On an iPhone the ring
            switch mutes it — if you hear nothing, that&rsquo;s why. The pads
            still flash either way.
          </p>
        </>
      )}

      {phase === 'failed' && (
        <div className="card simon-result">
          <h3>
            {mode === 'pass'
              ? `Player ${(loser ?? 0) === 0 ? 2 : 1} wins`
              : reached >= best && reached > 0
              ? 'New personal best!'
              : 'Missed it'}
          </h3>
          <p className="simon-result-detail">
            {mode === 'pass'
              ? `Player ${(loser ?? 0) + 1} broke the chain at ${round}.`
              : `You got ${reached} ${reached === 1 ? 'step' : 'steps'}.`}
          </p>
          <button className="btn btn-primary" onClick={startGame}>
            Play again
          </button>
        </div>
      )}
    </Screen>
  );
}
