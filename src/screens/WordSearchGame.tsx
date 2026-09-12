import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Screen } from '../components/Screen';
import {
  fetchPuzzle,
  type WordSearchPuzzle,
} from '../lib/firestoreWordSearch';
import { submitScore } from '../lib/firestoreScores';
import { playClear } from '../lib/sound';
import './WordSearchGame.css';

interface Cell {
  r: number;
  c: number;
}

interface WordSearchGameProps {
  puzzleId: string;
  uid: string;
  displayName: string;
  onBack: () => void;
}

function snapEnd(start: Cell, hoverR: number, hoverC: number, size: number) {
  const dr = hoverR - start.r;
  const dc = hoverC - start.c;
  if (dr === 0 && dc === 0) return { end: start, dRow: 0, dCol: 0 };
  const dRow = dr === 0 ? 0 : dr / Math.abs(dr);
  const dCol = dc === 0 ? 0 : dc / Math.abs(dc);
  let steps = Math.max(Math.abs(dr), Math.abs(dc));
  // Clamp so the snapped line never runs off the board.
  while (
    start.r + dRow * steps < 0 ||
    start.r + dRow * steps > size - 1 ||
    start.c + dCol * steps < 0 ||
    start.c + dCol * steps > size - 1
  ) {
    steps--;
  }
  return {
    end: { r: start.r + dRow * steps, c: start.c + dCol * steps },
    dRow,
    dCol,
  };
}

function pathBetween(start: Cell, end: Cell, dRow: number, dCol: number): Cell[] {
  const steps = Math.max(Math.abs(end.r - start.r), Math.abs(end.c - start.c));
  const path: Cell[] = [];
  for (let i = 0; i <= steps; i++) {
    path.push({ r: start.r + dRow * i, c: start.c + dCol * i });
  }
  return path;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function WordSearchGame({
  puzzleId,
  uid,
  displayName,
  onBack,
}: WordSearchGameProps) {
  const [puzzle, setPuzzle] = useState<WordSearchPuzzle | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [foundWords, setFoundWords] = useState<Set<string>>(new Set());
  const [dragStart, setDragStart] = useState<Cell | null>(null);
  const [dragCells, setDragCells] = useState<Cell[]>([]);
  const [foundCells, setFoundCells] = useState<Set<string>>(new Set());
  const [elapsedMs, setElapsedMs] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [scoreSaved, setScoreSaved] = useState(false);

  const boardRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    let cancelled = false;
    fetchPuzzle(puzzleId).then((p) => {
      if (cancelled) return;
      if (!p) {
        setLoadError(true);
      } else {
        setPuzzle(p);
        startTimeRef.current = Date.now();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [puzzleId]);

  useEffect(() => {
    if (!puzzle || completed) return;
    const id = window.setInterval(() => {
      setElapsedMs(Date.now() - startTimeRef.current);
    }, 200);
    return () => window.clearInterval(id);
  }, [puzzle, completed]);

  const cellFromPoint = (clientX: number, clientY: number): Cell | null => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect || !puzzle) return null;
    const cellSize = rect.width / puzzle.size;
    const col = Math.max(
      0,
      Math.min(puzzle.size - 1, Math.floor((clientX - rect.left) / cellSize))
    );
    const row = Math.max(
      0,
      Math.min(puzzle.size - 1, Math.floor((clientY - rect.top) / cellSize))
    );
    return { r: row, c: col };
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (completed) return;
    const cell = cellFromPoint(e.clientX, e.clientY);
    if (!cell) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragStart(cell);
    setDragCells([cell]);
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragStart || !puzzle) return;
    const hover = cellFromPoint(e.clientX, e.clientY);
    if (!hover) return;
    const { end, dRow, dCol } = snapEnd(dragStart, hover.r, hover.c, puzzle.size);
    setDragCells(pathBetween(dragStart, end, dRow, dCol));
  };

  const handlePointerUp = () => {
    if (!dragStart || !puzzle) return;
    const letters = dragCells.map((c) => puzzle.grid[c.r][c.c]).join('');
    const reversed = letters.split('').reverse().join('');

    const match = puzzle.words.find(
      (w) =>
        !foundWords.has(w.word) && (w.word === letters || w.word === reversed)
    );

    if (match) {
      const justCompleted = foundWords.size + 1 === puzzle.words.length;
      // Bigger celebration for the final word than for a regular find.
      playClear(justCompleted ? 3 : 0);
      if (justCompleted) setCompleted(true);
      setFoundWords((prev) => new Set(prev).add(match.word));
      setFoundCells((prev) => {
        const next = new Set(prev);
        dragCells.forEach((c) => next.add(`${c.r}-${c.c}`));
        return next;
      });
    }

    setDragStart(null);
    setDragCells([]);
  };

  useEffect(() => {
    if (!completed || scoreSaved || !puzzle) return;
    setScoreSaved(true);
    submitScore({
      gameId: 'wordsearch',
      // One leaderboard regardless of whether the puzzle was freshly
      // created or picked from the library — solving speed isn't
      // meaningfully different between the two.
      mode: 'default',
      uid,
      name: displayName,
      value: Math.round(elapsedMs / 1000),
    }).catch(() => setScoreSaved(false));
  }, [completed, scoreSaved, puzzle, uid, displayName, elapsedMs]);

  if (loadError) {
    return (
      <Screen title="Word Search" onBack={onBack}>
        <div className="card empty-state">
          Couldn&rsquo;t find that puzzle — it may have been removed.
        </div>
      </Screen>
    );
  }

  if (!puzzle) {
    return (
      <Screen title="Word Search" onBack={onBack}>
        <div className="card empty-state">Loading puzzle…</div>
      </Screen>
    );
  }

  const dragCellKeys = new Set(dragCells.map((c) => `${c.r}-${c.c}`));

  return (
    <Screen title={puzzle.topic} onBack={onBack}>
      <div className="ws-scorebar">
        <div className="ws-stat">
          <span className="ws-stat-value">{formatElapsed(elapsedMs)}</span>
          <span className="ws-stat-label">time</span>
        </div>
        <div className="ws-stat ws-stat-right">
          <span className="ws-stat-value">
            {foundWords.size}/{puzzle.words.length}
          </span>
          <span className="ws-stat-label">found</span>
        </div>
      </div>

      <div
        className="ws-board"
        ref={boardRef}
        style={{ gridTemplateColumns: `repeat(${puzzle.size}, 1fr)` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {puzzle.grid.map((row, r) =>
          row.split('').map((letter, c) => {
            const key = `${r}-${c}`;
            const isFound = foundCells.has(key);
            const isDragging = dragCellKeys.has(key);
            return (
              <span
                key={key}
                className={`ws-cell ${isFound ? 'found' : ''} ${
                  isDragging ? 'dragging' : ''
                }`}
              >
                {letter}
              </span>
            );
          })
        )}
      </div>

      <ul className="ws-word-list">
        {puzzle.words.map((w) => (
          <li
            key={w.word}
            className={`ws-word ${foundWords.has(w.word) ? 'found' : ''}`}
          >
            {w.word}
          </li>
        ))}
      </ul>

      {completed && (
        <div className="ws-complete card">
          <h3>Solved!</h3>
          <p className="ws-complete-time">{formatElapsed(elapsedMs)}</p>
          <button className="btn btn-primary" onClick={onBack}>
            Back to Word Search
          </button>
        </div>
      )}
    </Screen>
  );
}
