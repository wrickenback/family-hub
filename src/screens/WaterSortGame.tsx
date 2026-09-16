import { useCallback, useEffect, useRef, useState } from 'react';
import { Screen } from '../components/Screen';
import {
  TUBE_CAPACITY,
  canPour,
  isSolved as tubesAreSolved,
  generateLevel,
  hasAnyMove,
  hintMove,
  pour,
  topRun,
  type Level,
  type Tubes,
} from '../lib/waterSortEngine';
import { submitScore, watchTopScores } from '../lib/firestoreScores';
import { DEFAULT_MODE } from '../lib/router';
import { playPour, playWin } from '../lib/sound';
import './WaterSortGame.css';

const LEVEL_KEY = 'familyhub:watersort:level';

/** Ten distinct, high-contrast liquids. Picked to stay tellable apart at
 * thumbnail size and for the commonest colour-blindness — no red/green pair
 * carries meaning on its own, and every tube also shows its colour's
 * initial, so nothing depends on hue alone. */
const COLORS = [
  { fill: '#e0453c', name: 'Red', letter: 'R' },
  { fill: '#2f7fd4', name: 'Blue', letter: 'B' },
  { fill: '#f2a516', name: 'Orange', letter: 'O' },
  { fill: '#3aa65c', name: 'Green', letter: 'G' },
  { fill: '#8c50c9', name: 'Purple', letter: 'P' },
  { fill: '#f06fae', name: 'Pink', letter: 'K' },
  { fill: '#22c1c1', name: 'Teal', letter: 'T' },
  { fill: '#f7e04a', name: 'Yellow', letter: 'Y' },
  { fill: '#8b5e3c', name: 'Brown', letter: 'N' },
  { fill: '#98a3ad', name: 'Grey', letter: 'S' },
];

function loadLevel(): number {
  try {
    const raw = localStorage.getItem(LEVEL_KEY);
    const value = raw ? Number(raw) : 1;
    return Number.isFinite(value) && value >= 1 ? Math.floor(value) : 1;
  } catch {
    return 1;
  }
}

function saveLevel(level: number): void {
  try {
    localStorage.setItem(LEVEL_KEY, String(level));
  } catch {
    // Storage unavailable — progress just won't survive a reload.
  }
}

interface WaterSortGameProps {
  uid: string;
  displayName: string;
  onBack: () => void;
}

export function WaterSortGame({ uid, displayName, onBack }: WaterSortGameProps) {
  // The first level has to seed two pieces of state from one generated
  // puzzle, which a lazy useState initializer can't do on its own.
  const firstLevel = useRef<{ level: number; puzzle: Level } | null>(null);
  if (!firstLevel.current) {
    const startingLevel = loadLevel();
    firstLevel.current = {
      level: startingLevel,
      puzzle: generateLevel(startingLevel),
    };
  }

  const [level, setLevel] = useState(firstLevel.current.level);
  const [puzzle, setPuzzle] = useState<Level>(firstLevel.current.puzzle);
  const [tubes, setTubes] = useState<Tubes>(firstLevel.current.puzzle.tubes);
  const [history, setHistory] = useState<Tubes[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [moves, setMoves] = useState(0);
  const [solved, setSolved] = useState(false);
  const [hint, setHint] = useState<{ from: number; to: number } | null>(null);
  // One free extra tube per level — the escape hatch for a position the
  // player has painted themselves into, without a coin economy attached.
  const [extraUsed, setExtraUsed] = useState(false);
  const [best, setBest] = useState<number | null>(null);

  const scoreSaved = useRef(false);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return watchTopScores(
      'watersort',
      DEFAULT_MODE,
      (entries) => setBest(entries[0]?.value ?? null),
      () => setBest(null),
      1,
      'desc'
    );
  }, []);

  const startLevel = useCallback((next: number) => {
    const generated = generateLevel(next);
    setLevel(next);
    setPuzzle(generated);
    setTubes(generated.tubes);
    setHistory([]);
    setPicked(null);
    setHint(null);
    setMoves(0);
    setSolved(false);
    setExtraUsed(false);
    scoreSaved.current = false;
    saveLevel(next);
  }, []);

  useEffect(() => {
    if (solved) return;
    if (!tubesAreSolved(tubes)) return;
    setSolved(true);
    setPicked(null);
    playWin();
  }, [tubes, solved]);

  // A cleared level is a score: the level number itself, so the family board
  // ranks on how far people have got.
  useEffect(() => {
    if (!solved || scoreSaved.current) return;
    scoreSaved.current = true;
    submitScore({
      gameId: 'watersort',
      mode: DEFAULT_MODE,
      uid,
      name: displayName,
      value: level,
      extra: { moves, par: puzzle.par },
    }).catch(() => {
      scoreSaved.current = false;
    });
  }, [solved, uid, displayName, level, moves, puzzle.par]);

  useEffect(() => {
    if (solved) {
      resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [solved]);

  const commit = (next: Tubes) => {
    setHistory((h) => [...h.slice(-199), tubes]);
    setTubes(next);
    setMoves((m) => m + 1);
    setHint(null);
    playPour();
  };

  const tapTube = (index: number) => {
    if (solved) return;
    if (picked === null) {
      if (tubes[index].length === 0) return;
      setPicked(index);
      return;
    }
    if (picked === index) {
      setPicked(null);
      return;
    }
    const next = pour(tubes, picked, index);
    if (next) {
      commit(next);
      setPicked(null);
      return;
    }
    // Not a legal pour — treat it as picking up the tapped tube instead of
    // rejecting the tap outright, which is almost always what was meant.
    setPicked(tubes[index].length > 0 ? index : null);
  };

  const undo = () => {
    if (history.length === 0 || solved) return;
    setTubes(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
    setMoves((m) => Math.max(m - 1, 0));
    setPicked(null);
    setHint(null);
  };

  const addExtraTube = () => {
    if (extraUsed || solved) return;
    setHistory((h) => [...h.slice(-199), tubes]);
    setTubes([...tubes, []]);
    setExtraUsed(true);
    setPicked(null);
    setHint(null);
  };

  const showHint = () => {
    if (solved) return;
    setHint(hintMove(tubes));
    setPicked(null);
  };

  // isSolved is checked here as well as in the effect that sets `solved`,
  // because that effect only runs after the paint — without it, the frame
  // that completes the last tube would flash "nothing left to pour" (a
  // finished board has no legal pours left either).
  const stuck = !solved && !tubesAreSolved(tubes) && !hasAnyMove(tubes);

  return (
    <Screen title="Water Sort" onBack={onBack} className="ws-screen">
      <div className="ws-statbar">
        <div className="ws-stat">
          <span className="ws-stat-value">{level}</span>
          <span className="ws-stat-label">level</span>
        </div>
        <div className="ws-stat">
          <span className="ws-stat-value">{moves}</span>
          <span className="ws-stat-label">moves</span>
        </div>
        <div className="ws-stat">
          <span className="ws-stat-value">{puzzle.par}</span>
          <span className="ws-stat-label">par</span>
        </div>
        <div className="ws-stat">
          <span className="ws-stat-value">{best ?? '—'}</span>
          <span className="ws-stat-label">family best</span>
        </div>
      </div>

      <div className="ws-rack">
        {tubes.map((tube, i) => {
          const run = topRun(tube);
          const liftable =
            picked === i && run ? Math.min(run.count, TUBE_CAPACITY) : 0;
          const receivable =
            picked !== null && picked !== i && canPour(tubes, picked, i);
          return (
            <button
              key={i}
              className={`ws-tube ${picked === i ? 'picked' : ''} ${
                receivable ? 'receivable' : ''
              } ${hint && (hint.from === i || hint.to === i) ? 'hinted' : ''}`}
              onClick={() => tapTube(i)}
              disabled={solved}
              aria-label={
                tube.length === 0
                  ? `Tube ${i + 1}, empty`
                  : `Tube ${i + 1}, ${tube
                      .map((c) => COLORS[c % COLORS.length].name)
                      .join(', ')} from the bottom`
              }
            >
              <span className="ws-tube-glass">
                {/* Units render bottom-up, so index 0 of the tube sits at
                    the bottom of the glass the way liquid actually would. */}
                {[...tube].reverse().map((color, slot) => {
                  const fromTop = slot;
                  const isLifted = fromTop < liftable;
                  const swatch = COLORS[color % COLORS.length];
                  return (
                    <span
                      key={`${slot}-${color}`}
                      className={`ws-unit ${isLifted ? 'lifted' : ''}`}
                      style={{ background: swatch.fill }}
                    >
                      <span className="ws-unit-letter">{swatch.letter}</span>
                    </span>
                  );
                })}
              </span>
            </button>
          );
        })}
      </div>

      <div className="ws-actions">
        <button
          className="btn btn-secondary"
          onClick={undo}
          disabled={history.length === 0 || solved}
        >
          Undo
        </button>
        <button className="btn btn-secondary" onClick={showHint} disabled={solved}>
          Hint
        </button>
        <button
          className="btn btn-secondary"
          onClick={addExtraTube}
          disabled={extraUsed || solved}
        >
          {extraUsed ? 'Tube used' : 'Extra tube'}
        </button>
      </div>

      <button
        className="btn btn-text ws-restart"
        onClick={() => startLevel(level)}
      >
        Restart this level
      </button>

      {hint && !solved && (
        <p className="ws-hint-text">
          Pour tube {hint.from + 1} into tube {hint.to + 1}.
        </p>
      )}

      {stuck && (
        <div className="card ws-result">
          <h3>Nothing left to pour</h3>
          <p className="ws-result-detail">
            Every tube is blocked. Undo a few moves, or start the level again.
          </p>
          <div className="ws-result-actions">
            <button className="btn btn-secondary" onClick={undo}>
              Undo
            </button>
            <button className="btn btn-primary" onClick={() => startLevel(level)}>
              Restart
            </button>
          </div>
        </div>
      )}

      {solved && (
        <div className="card ws-result" ref={resultRef}>
          <h3>Level {level} clear!</h3>
          <p className="ws-result-detail">
            {moves} {moves === 1 ? 'pour' : 'pours'}
            {moves <= puzzle.par
              ? ` — par was ${puzzle.par}. Nicely done.`
              : `, par was ${puzzle.par}.`}
          </p>
          <button
            className="btn btn-primary"
            onClick={() => startLevel(level + 1)}
          >
            Next level
          </button>
        </div>
      )}
    </Screen>
  );
}
