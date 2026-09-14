import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Screen } from '../components/Screen';
import { CAT_BREEDS, CatFace, getBreed } from '../components/CatFace';
import { CatCollection } from '../components/CatCollection';
import {
  findConflicts,
  generateCatQueensPuzzle,
  isSolved,
  type CatQueensPuzzle,
} from '../lib/catQueensEngine';
import {
  loadCatQueensProgress,
  saveCatQueensProgress,
  type CatQueensProgress,
} from '../lib/firestoreCatQueens';
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

// Only a solver's first couple of puzzles at a given size get the one-cell
// freebie region — enough to learn the rules on, without making every
// puzzle trivially easy forever.
const FREEBIE_LEVEL_CAP = 2;

function emptyGrid(size: number): CellState[][] {
  return Array.from({ length: size }, () => new Array(size).fill('empty'));
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/** Which breed shows up on the next puzzle. Weighted toward ones this
 * account hasn't found yet, so every solve makes real progress toward a
 * full collection instead of the same handful of breeds turning up over
 * and over while others never appear. Once everything is found, it's just
 * uniformly random — there's nothing left to chase, so variety is all that
 * matters. */
function pickBreedId(discoveredBreeds: string[]): string {
  const found = new Set(discoveredBreeds);
  const undiscovered = CAT_BREEDS.filter((b) => !found.has(b.id));
  const pool = undiscovered.length > 0 ? undiscovered : CAT_BREEDS;
  return pool[Math.floor(Math.random() * pool.length)].id;
}

function newPuzzle(
  size: number,
  level: number,
  discoveredBreeds: string[]
): { puzzle: CatQueensPuzzle; breedId: string } {
  return {
    puzzle: generateCatQueensPuzzle(size, level <= FREEBIE_LEVEL_CAP),
    breedId: pickBreedId(discoveredBreeds),
  };
}

export function CatQueensGame({
  size,
  uid,
  displayName,
  onBack,
}: CatQueensGameProps) {
  // The solver's level per board size and discovered-breed collection live
  // on their account, not the device — null while that's still loading.
  const [progress, setProgress] = useState<CatQueensProgress | null>(null);
  const [round, setRound] = useState<{
    puzzle: CatQueensPuzzle;
    breedId: string;
  } | null>(null);
  const [cells, setCells] = useState<CellState[][] | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [scoreSaved, setScoreSaved] = useState(false);
  const [justDiscovered, setJustDiscovered] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);
  const [confirmGiveUp, setConfirmGiveUp] = useState(false);
  const [showCollection, setShowCollection] = useState(false);

  // Either way the round is over: no more moves, no timer, nothing to
  // score. Kept as one flag so every interaction guard only has to check
  // one thing instead of two.
  const locked = completed || gaveUp;

  const startTimeRef = useRef(Date.now());
  const completeRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  // Tracks a pointer gesture across the board so a drag can mark out a
  // whole row/column of cells at once, while a plain tap on one cell still
  // does its full empty -> X -> cat -> empty cycle.
  const dragStateRef = useRef<{ r: number; c: number; moved: boolean } | null>(
    null
  );
  // A pointer tap resolves the action on pointerup (so it works mid-drag,
  // not just on release over the same cell) — this flag tells the button's
  // own click handler (needed for keyboard activation) to skip the
  // duplicate click event the browser fires right after.
  const suppressClickRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadCatQueensProgress(uid).then((p) => {
      if (!cancelled) setProgress(p);
    });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  // Fires once, the moment progress arrives — starts the first puzzle at
  // whichever level this account has already reached for this size.
  useEffect(() => {
    if (!progress || round) return;
    const level = progress.levels[String(size)] ?? 1;
    setRound(newPuzzle(size, level, progress.discoveredBreeds));
    setCells(emptyGrid(size));
    startTimeRef.current = Date.now();
  }, [progress, round, size]);

  useEffect(() => {
    if (locked || !round) return;
    const id = window.setInterval(() => {
      setElapsedMs(Date.now() - startTimeRef.current);
    }, 200);
    return () => window.clearInterval(id);
  }, [locked, round]);

  const breed = round ? getBreed(round.breedId) : null;

  const cats = useMemo(() => {
    if (!cells) return [];
    const out: { r: number; c: number }[] = [];
    cells.forEach((row, r) =>
      row.forEach((state, c) => {
        if (state === 'cat') out.push({ r, c });
      })
    );
    return out;
  }, [cells]);

  const conflicts = useMemo(
    () => (round ? findConflicts(round.puzzle.regions, cats) : new Map()),
    [round, cats]
  );

  const restart = () => {
    if (!progress) return;
    const level = progress.levels[String(size)] ?? 1;
    setRound(newPuzzle(size, level, progress.discoveredBreeds));
    setCells(emptyGrid(size));
    setElapsedMs(0);
    setCompleted(false);
    setScoreSaved(false);
    setJustDiscovered(false);
    setGaveUp(false);
    setConfirmGiveUp(false);
    startTimeRef.current = Date.now();
  };

  const handleTap = (r: number, c: number) => {
    if (locked) return;
    setCells((prev) => {
      if (!prev) return prev;
      const next = prev.map((row) => [...row]);
      const order: CellState[] = ['empty', 'x', 'cat'];
      const current = next[r][c];
      next[r][c] = order[(order.indexOf(current) + 1) % order.length];
      return next;
    });
  };

  const clearBoard = () => {
    if (locked) return;
    setCells(emptyGrid(size));
  };

  const paintX = (r: number, c: number) => {
    setCells((prev) => {
      if (!prev || prev[r][c] !== 'empty') return prev;
      const next = prev.map((row) => [...row]);
      next[r][c] = 'x';
      return next;
    });
  };

  const cellFromPoint = (clientX: number, clientY: number) => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const c = Math.max(
      0,
      Math.min(size - 1, Math.floor(((clientX - rect.left) / rect.width) * size))
    );
    const r = Math.max(
      0,
      Math.min(size - 1, Math.floor(((clientY - rect.top) / rect.height) * size))
    );
    return { r, c };
  };

  const handleBoardPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (locked) return;
    const cell = cellFromPoint(e.clientX, e.clientY);
    if (!cell) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStateRef.current = { r: cell.r, c: cell.c, moved: false };
  };

  const handleBoardPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const start = dragStateRef.current;
    if (!start || locked) return;
    const cell = cellFromPoint(e.clientX, e.clientY);
    if (!cell) return;
    if (cell.r !== start.r || cell.c !== start.c) {
      if (!start.moved) {
        start.moved = true;
        // Now that this is confirmed to be a drag (not a tap), the cell it
        // started on gets marked out too, not just the ones it crosses.
        paintX(start.r, start.c);
      }
      paintX(cell.r, cell.c);
    }
  };

  const handleBoardPointerUp = () => {
    const start = dragStateRef.current;
    if (start && !start.moved) {
      handleTap(start.r, start.c);
      suppressClickRef.current = true;
    }
    dragStateRef.current = null;
  };

  useEffect(() => {
    if (completed || !round || !progress) return;
    if (!isSolved(round.puzzle.size, round.puzzle.regions, cats)) return;
    setCompleted(true);
    playClear(3);

    const nextLevel = (progress.levels[String(size)] ?? 1) + 1;
    const nextDiscovered = progress.discoveredBreeds.includes(round.breedId)
      ? progress.discoveredBreeds
      : [...progress.discoveredBreeds, round.breedId];
    if (nextDiscovered !== progress.discoveredBreeds) setJustDiscovered(true);

    const nextProgress: CatQueensProgress = {
      levels: { ...progress.levels, [String(size)]: nextLevel },
      discoveredBreeds: nextDiscovered,
    };
    setProgress(nextProgress);
    saveCatQueensProgress(uid, nextProgress).catch(() => {});
  }, [cats, round, completed, progress, size, uid]);

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
  // result card — solved or given up — lands below the fold; bring it into
  // view rather than leaving the player staring at an unchanged board.
  useEffect(() => {
    if (!locked) return;
    completeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [locked]);

  if (!progress || !round || !cells || !breed) {
    return (
      <Screen title="Cat Queens" onBack={onBack}>
        <div className="card empty-state">Loading your progress…</div>
      </Screen>
    );
  }

  const level = progress.levels[String(size)] ?? 1;
  const discoveredCount = progress.discoveredBreeds.length;
  const { puzzle } = round;

  // Only computed when it'll actually be shown — the solution is already
  // sitting in round.puzzle.solution either way, nothing to fetch.
  const solutionSet = gaveUp
    ? new Set(puzzle.solution.map((s) => `${s.r}-${s.c}`))
    : null;
  const correctCount = gaveUp
    ? cats.filter((c) => solutionSet!.has(`${c.r}-${c.c}`)).length
    : 0;

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
        <button
          className="cq-stat cq-stat-right cq-collection-btn"
          onClick={() => setShowCollection(true)}
        >
          <span className="cq-stat-value">{discoveredCount}/{CAT_BREEDS.length}</span>
          <span className="cq-stat-label">breeds found</span>
        </button>
      </div>

      <p className="cq-rules">
        <span className="cq-level">Level {level}</span> · One{' '}
        {breed.name.toLowerCase()} per row, column and color. No two cats may
        touch, even diagonally.
      </p>

      <div
        className="cq-board"
        ref={boardRef}
        style={{
          gridTemplateColumns: `repeat(${size}, 1fr)`,
          gridTemplateRows: `repeat(${size}, 1fr)`,
        }}
        onPointerDown={handleBoardPointerDown}
        onPointerMove={handleBoardPointerMove}
        onPointerUp={handleBoardPointerUp}
        onPointerCancel={() => {
          dragStateRef.current = null;
        }}
      >
        {cells.map((row, r) =>
          row.map((state, c) => {
            const region = puzzle.regions[r][c];
            const conflict = conflicts.get(`${r}-${c}`);
            const key = `${r}-${c}`;
            // On a give-up reveal: a cat that matches the solution is left
            // as-is (it was right); a cat that doesn't is marked wrong
            // rather than erased, so what the player actually had stays
            // visible next to the real answer; an empty solution cell gets
            // a faint "ghost" cat showing where one belonged.
            const inSolution = solutionSet?.has(key) ?? false;
            const wrongCat = gaveUp && state === 'cat' && !inSolution;
            const missedCat = gaveUp && state !== 'cat' && inSolution;
            return (
              <button
                key={key}
                className={`cq-cell ${conflict && !gaveUp ? 'conflict' : ''} ${
                  wrongCat ? 'cq-cell-wrong' : ''
                } ${missedCat ? 'cq-cell-missed' : ''}`}
                style={{ background: REGION_COLORS[region % REGION_COLORS.length] }}
                onClick={() => {
                  // The board's own pointer handlers already resolve a tap
                  // (and every drag) directly — this only fires for a
                  // keyboard-activated click, unless it's the browser's
                  // compatibility click right after a pointer tap.
                  if (suppressClickRef.current) {
                    suppressClickRef.current = false;
                    return;
                  }
                  handleTap(r, c);
                }}
                disabled={gaveUp}
                aria-label={
                  wrongCat
                    ? `${breed.name} placed here, but that was wrong`
                    : missedCat
                    ? `A ${breed.name.toLowerCase()} belonged here`
                    : state === 'cat'
                    ? `${breed.name} placed`
                    : state === 'x'
                    ? 'Marked empty'
                    : 'Empty cell'
                }
              >
                {state === 'cat' && <CatFace breed={breed} size={30} />}
                {missedCat && (
                  <span className="cq-cell-ghost">
                    <CatFace breed={breed} size={30} />
                  </span>
                )}
                {wrongCat && <span className="cq-wrong-mark">✕</span>}
                {state === 'x' && !gaveUp && <span className="cq-x">✕</span>}
              </button>
            );
          })
        )}
      </div>

      <div className="cq-actions">
        <button className="btn btn-secondary" onClick={clearBoard} disabled={locked}>
          Clear board
        </button>
        <button className="btn btn-secondary" onClick={restart}>
          New puzzle
        </button>
      </div>

      {!locked && !confirmGiveUp && (
        <button
          className="btn btn-text cq-giveup-btn"
          onClick={() => setConfirmGiveUp(true)}
        >
          Give up
        </button>
      )}

      {!locked && confirmGiveUp && (
        <div className="card cq-giveup-confirm">
          <p>Reveal the solution? This puzzle won&rsquo;t count as solved.</p>
          <div className="cq-giveup-confirm-actions">
            <button
              className="btn btn-text"
              onClick={() => setConfirmGiveUp(false)}
            >
              Keep trying
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                setGaveUp(true);
                setConfirmGiveUp(false);
              }}
            >
              Show me
            </button>
          </div>
        </div>
      )}

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
          <button className="btn btn-primary" onClick={restart}>
            Play another
          </button>
        </div>
      )}

      {gaveUp && (
        <div className="cq-complete card" ref={completeRef}>
          <h3>Here&rsquo;s the solution</h3>
          <p className="cq-complete-time">
            You had {correctCount} of {size} right
          </p>
          <button className="btn btn-primary" onClick={restart}>
            Try another
          </button>
        </div>
      )}

      {showCollection && (
        <CatCollection
          discoveredBreeds={progress.discoveredBreeds}
          onClose={() => setShowCollection(false)}
        />
      )}
    </Screen>
  );
}
