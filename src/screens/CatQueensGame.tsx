import { useEffect, useMemo, useRef, useState } from 'react';
import { Screen } from '../components/Screen';
import { CAT_BREEDS, CatFace, getBreed } from '../components/CatFace';
import {
  findConflicts,
  generateCatQueensPuzzle,
  isSolved,
  type CatQueensPuzzle,
} from '../lib/catQueensEngine';
import { submitScore } from '../lib/firestoreScores';
import { DEFAULT_MODE } from '../lib/router';
import { playClear } from '../lib/sound';
import './CatQueensGame.css';

export type CatQueensSize = 6 | 7 | 8 | 9;

interface CatQueensGameProps {
  size: CatQueensSize;
  uid: string;
  displayName: string;
  onBack: () => void;
}

type CellState = 'empty' | 'x' | 'cat';

const REGION_COLORS = [
  '#f5c95e', '#8f8fe0', '#f2a3c5', '#7ec9e0', '#9fd18a',
  '#e08a7a', '#c9a3e8', '#e8d38a', '#8adbc2', '#e0a3a3',
];

const DISCOVERED_KEY = 'catqueens-discovered-breeds';
const LEVEL_KEY_PREFIX = 'catqueens-level-';
// Only a solver's first couple of puzzles at a given size get the one-cell
// freebie region — enough to learn the rules on, without making every
// puzzle trivially easy forever.
const FREEBIE_LEVEL_CAP = 2;

function loadDiscovered(): Set<string> {
  try {
    const raw = window.localStorage.getItem(DISCOVERED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveDiscovered(ids: Set<string>) {
  try {
    window.localStorage.setItem(DISCOVERED_KEY, JSON.stringify([...ids]));
  } catch {
    // best effort — a missed save just costs one collection entry
  }
}

function loadLevel(size: number): number {
  try {
    const raw = window.localStorage.getItem(`${LEVEL_KEY_PREFIX}${size}`);
    const n = raw ? Number(raw) : 1;
    return Number.isFinite(n) && n >= 1 ? n : 1;
  } catch {
    return 1;
  }
}

function saveLevel(size: number, level: number) {
  try {
    window.localStorage.setItem(`${LEVEL_KEY_PREFIX}${size}`, String(level));
  } catch {
    // best effort — a missed save just costs the level tracking, not play
  }
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function newPuzzle(
  size: number,
  level: number
): { puzzle: CatQueensPuzzle; breedId: string } {
  return {
    puzzle: generateCatQueensPuzzle(size, level <= FREEBIE_LEVEL_CAP),
    breedId: CAT_BREEDS[Math.floor(Math.random() * CAT_BREEDS.length)].id,
  };
}

export function CatQueensGame({
  size,
  uid,
  displayName,
  onBack,
}: CatQueensGameProps) {
  const [level, setLevel] = useState(() => loadLevel(size));
  const [{ puzzle, breedId }, setRound] = useState(() => newPuzzle(size, level));
  const [cells, setCells] = useState<CellState[][]>(() =>
    Array.from({ length: size }, () => new Array(size).fill('empty'))
  );
  const [elapsedMs, setElapsedMs] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [scoreSaved, setScoreSaved] = useState(false);
  const [justDiscovered, setJustDiscovered] = useState(false);

  const startTimeRef = useRef(Date.now());
  const discoveredRef = useRef<Set<string>>(loadDiscovered());
  const completeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (completed) return;
    const id = window.setInterval(() => {
      setElapsedMs(Date.now() - startTimeRef.current);
    }, 200);
    return () => window.clearInterval(id);
  }, [completed]);

  const breed = getBreed(breedId);

  const cats = useMemo(() => {
    const out: { r: number; c: number }[] = [];
    cells.forEach((row, r) =>
      row.forEach((state, c) => {
        if (state === 'cat') out.push({ r, c });
      })
    );
    return out;
  }, [cells]);

  const conflicts = useMemo(
    () => findConflicts(puzzle.regions, cats),
    [puzzle, cats]
  );

  const restart = (nextSize: number = size) => {
    setRound(newPuzzle(nextSize, level));
    setCells(Array.from({ length: nextSize }, () => new Array(nextSize).fill('empty')));
    setElapsedMs(0);
    setCompleted(false);
    setScoreSaved(false);
    setJustDiscovered(false);
    startTimeRef.current = Date.now();
  };

  const handleTap = (r: number, c: number) => {
    if (completed) return;
    setCells((prev) => {
      const next = prev.map((row) => [...row]);
      const order: CellState[] = ['empty', 'x', 'cat'];
      const current = next[r][c];
      next[r][c] = order[(order.indexOf(current) + 1) % order.length];
      return next;
    });
  };

  const clearBoard = () => {
    if (completed) return;
    setCells(Array.from({ length: size }, () => new Array(size).fill('empty')));
  };

  useEffect(() => {
    if (completed) return;
    if (!isSolved(puzzle.size, puzzle.regions, cats)) return;
    setCompleted(true);
    playClear(3);
    setLevel((l) => {
      const next = l + 1;
      saveLevel(size, next);
      return next;
    });
    if (!discoveredRef.current.has(breedId)) {
      discoveredRef.current = new Set(discoveredRef.current).add(breedId);
      saveDiscovered(discoveredRef.current);
      setJustDiscovered(true);
    }
  }, [cats, puzzle, completed, breedId]);

  useEffect(() => {
    if (!completed || scoreSaved) return;
    setScoreSaved(true);
    submitScore({
      gameId: 'catqueens',
      mode: DEFAULT_MODE,
      uid,
      name: displayName,
      value: Math.round(elapsedMs / 1000),
    }).catch(() => setScoreSaved(false));
  }, [completed, scoreSaved, uid, displayName, elapsedMs]);

  // The board can run taller than the viewport on the bigger sizes, so the
  // "Solved!" card lands below the fold — bring it into view rather than
  // leaving the player staring at an unchanged board.
  useEffect(() => {
    if (!completed) return;
    completeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [completed]);

  const discoveredCount = discoveredRef.current.size;

  return (
    <Screen title="Cat Queens" onBack={onBack}>
      <div className="cq-scorebar">
        <div className="cq-stat">
          <span className="cq-stat-value">{formatElapsed(elapsedMs)}</span>
          <span className="cq-stat-label">time</span>
        </div>
        <div className="cq-breed-badge">
          <CatFace breed={breed} size={44} />
          <span>{breed.name}</span>
        </div>
        <div className="cq-stat cq-stat-right">
          <span className="cq-stat-value">{discoveredCount}/{CAT_BREEDS.length}</span>
          <span className="cq-stat-label">breeds found</span>
        </div>
      </div>

      <p className="cq-rules">
        <span className="cq-level">Level {level}</span> · One{' '}
        {breed.name.toLowerCase()} per row, column and color. No two cats may
        touch, even diagonally.
      </p>

      <div
        className="cq-board"
        style={{
          gridTemplateColumns: `repeat(${size}, 1fr)`,
          gridTemplateRows: `repeat(${size}, 1fr)`,
        }}
      >
        {cells.map((row, r) =>
          row.map((state, c) => {
            const region = puzzle.regions[r][c];
            const conflict = conflicts.get(`${r}-${c}`);
            return (
              <button
                key={`${r}-${c}`}
                className={`cq-cell ${conflict ? 'conflict' : ''}`}
                style={{ background: REGION_COLORS[region % REGION_COLORS.length] }}
                onClick={() => handleTap(r, c)}
                aria-label={
                  state === 'cat'
                    ? `${breed.name} placed`
                    : state === 'x'
                    ? 'Marked empty'
                    : 'Empty cell'
                }
              >
                {state === 'cat' && <CatFace breed={breed} size={30} />}
                {state === 'x' && <span className="cq-x">✕</span>}
              </button>
            );
          })
        )}
      </div>

      <div className="cq-actions">
        <button className="btn btn-secondary" onClick={clearBoard} disabled={completed}>
          Clear board
        </button>
        <button className="btn btn-secondary" onClick={() => restart()}>
          New puzzle
        </button>
      </div>

      {completed && (
        <div className="cq-complete card" ref={completeRef}>
          <CatFace breed={breed} size={56} />
          <h3>Solved!</h3>
          <p className="cq-complete-time">{formatElapsed(elapsedMs)}</p>
          {justDiscovered && (
            <p className="cq-discovered-flag">
              New breed discovered: {breed.name}!
            </p>
          )}
          <button className="btn btn-primary" onClick={() => restart()}>
            Play another
          </button>
        </div>
      )}
    </Screen>
  );
}
