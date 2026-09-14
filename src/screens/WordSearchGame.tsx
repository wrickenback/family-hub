import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { Screen } from '../components/Screen';
import { ProviderBadge } from '../components/ProviderBadge';
import { Confetti } from '../components/Confetti';
import {
  deleteWordSearchProgress,
  fetchPuzzle,
  loadWordSearchProgress,
  saveWordSearchProgress,
  watchWordSearchProgress,
  type PlacedWord,
  type WordSearchPuzzle,
} from '../lib/firestoreWordSearch';
import { submitScore } from '../lib/firestoreScores';
import { DEFAULT_MODE } from '../lib/router';
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

/** Recovers the full cell path for a placed word — used to restore
 * highlights for words already found in a resumed puzzle. */
function cellsForWord(w: PlacedWord): Cell[] {
  const cells: Cell[] = [];
  for (let i = 0; i < w.word.length; i++) {
    cells.push({ r: w.row + w.dRow * i, c: w.col + w.dCol * i });
  }
  return cells;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

// Soft-bg / deep-fg pairs, cycled by each word's position in the puzzle so
// a word's color is stable and matches between the grid and the word list.
// Kept in the app's warm palette family (rust/teal/gold already exist) but
// extended with enough additional hues that a full word list rarely repeats
// a color for two words that could plausibly share a highlighted cell.
const WORD_COLORS = [
  { bg: '#fdf1e9', fg: '#a85225' }, // rust
  { bg: '#e7f1ee', fg: '#2d6b5f' }, // teal
  { bg: '#fbf1de', fg: '#b8862b' }, // gold
  { bg: '#f3eaf5', fg: '#7c4a86' }, // plum
  { bg: '#e8f0f7', fg: '#2f6690' }, // blue
  { bg: '#e5f3f5', fg: '#1f7a8c' }, // sky
  { bg: '#eef3e6', fg: '#4c7a33' }, // forest
  { bg: '#f8e9eb', fg: '#c15b6b' }, // coral
  { bg: '#e9eaf2', fg: '#45507a' }, // slate
  { bg: '#efe6de', fg: '#6b4a2f' }, // brown
];

function wordColor(word: string, words: PlacedWord[]): { bg: string; fg: string } {
  const index = words.findIndex((w) => w.word === word);
  return WORD_COLORS[(index < 0 ? 0 : index) % WORD_COLORS.length];
}

/** Style for a word-list entry: flat background/text in that word's color. */
function wordListItemStyle(word: string, words: PlacedWord[]): CSSProperties {
  const { bg, fg } = wordColor(word, words);
  return { background: bg, color: fg };
}

/** Style for a grid cell, which can belong to more than one found word
 * where two words cross. A single word gets a flat fill (matches the word
 * list); two or more get an even pie-wedge split — one wedge per word,
 * capped at 4 — so a crossing letter still visibly belongs to all of them
 * rather than just whichever word was found most recently. */
function foundCellStyle(cellWords: string[], words: PlacedWord[]): CSSProperties {
  const uniqueWords = Array.from(new Set(cellWords)).slice(0, 4);
  const colors = uniqueWords.map((w) => wordColor(w, words));
  if (colors.length <= 1) {
    const c = colors[0] ?? WORD_COLORS[0];
    return { background: c.bg, color: c.fg };
  }
  const step = 360 / colors.length;
  const stops = colors
    .map((c, i) => `${c.bg} ${i * step}deg ${(i + 1) * step}deg`)
    .join(', ');
  return { background: `conic-gradient(${stops})`, color: 'var(--text-primary)' };
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
  // cellKey ("r-c") -> the found word(s) that cover it — usually one, but
  // more where two words cross the same letter — so the grid can color
  // each found cell to match its word(s) in the list below.
  const [foundCells, setFoundCells] = useState<Map<string, string[]>>(new Map());
  const [elapsedMs, setElapsedMs] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [scoreSaved, setScoreSaved] = useState(false);
  // The word just found, shown in place of the trace line as a short
  // celebration. Carries an id so finding the same word twice (or two words
  // in quick succession) still restarts the animation and the timer.
  const [celebration, setCelebration] = useState<{
    word: string;
    id: number;
  } | null>(null);

  const boardRef = useRef<HTMLDivElement>(null);
  const completeRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef(Date.now());
  // True only if the final word was found on THIS device — gates score
  // submission so a second open device that merely syncs to "solved"
  // doesn't post a duplicate time for the same solve.
  const solvedHereRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchPuzzle(puzzleId), loadWordSearchProgress(uid, puzzleId)]).then(
      ([p, progress]) => {
        if (cancelled) return;
        if (!p) {
          setLoadError(true);
          return;
        }
        setPuzzle(p);
        if (progress) {
          const resumedWords = new Set(
            progress.foundWords.filter((w) => p.words.some((pw) => pw.word === w))
          );
          setFoundWords(resumedWords);
          setFoundCells(() => {
            const next = new Map<string, string[]>();
            p.words
              .filter((pw) => resumedWords.has(pw.word))
              .forEach((pw) =>
                cellsForWord(pw).forEach((c) => {
                  const key = `${c.r}-${c.c}`;
                  next.set(key, [...(next.get(key) ?? []), pw.word]);
                })
              );
            return next;
          });
          startTimeRef.current = Date.now() - progress.elapsedMs;
          setElapsedMs(progress.elapsedMs);
        } else {
          startTimeRef.current = Date.now();
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, [puzzleId, uid]);

  useEffect(() => {
    if (!puzzle || completed) return;
    const id = window.setInterval(() => {
      setElapsedMs(Date.now() - startTimeRef.current);
    }, 200);
    return () => window.clearInterval(id);
  }, [puzzle, completed]);

  // Same puzzle, same account, two devices (phone and laptop). Each save is
  // a whole-document write, so without this the device that saves last wins
  // and the other's finds disappear. Found-words is a set that only grows,
  // so merging is just a union — both devices converge on everything found
  // on either, and two people can even work the same puzzle together.
  useEffect(() => {
    if (!puzzle || completed) return;
    return watchWordSearchProgress(
      uid,
      puzzleId,
      (progress) => {
        if (!progress) return;
        const remote = progress.foundWords.filter((w) =>
          puzzle.words.some((pw) => pw.word === w)
        );
        setFoundWords((prev) => {
          const missing = remote.filter((w) => !prev.has(w));
          if (missing.length === 0) return prev; // our own write echoing back
          const next = new Set(prev);
          missing.forEach((w) => next.add(w));
          setFoundCells((prevCells) => {
            const nextCells = new Map(prevCells);
            puzzle.words
              .filter((pw) => missing.includes(pw.word))
              .forEach((pw) =>
                cellsForWord(pw).forEach((c) => {
                  const key = `${c.r}-${c.c}`;
                  const at = nextCells.get(key) ?? [];
                  if (!at.includes(pw.word)) nextCells.set(key, [...at, pw.word]);
                })
              );
            return nextCells;
          });
          // The other device may have found the last word — reflect that
          // here instead of sitting on a fully-found board with no
          // "Solved!". Deliberately does NOT set solvedHereRef: only the
          // device that actually landed the final word submits the score,
          // so one solve can't post two entries from two open tabs.
          if (next.size === puzzle.words.length) setCompleted(true);
          return next;
        });
        // Keep whichever clock is further along, so picking the puzzle back
        // up on a second device doesn't wind the timer backwards.
        if (progress.elapsedMs > Date.now() - startTimeRef.current) {
          startTimeRef.current = Date.now() - progress.elapsedMs;
        }
      },
      () => {}
    );
  }, [puzzle, puzzleId, uid, completed]);

  // Clear the celebration after it's had its moment. Keyed on the id so each
  // new find restarts the countdown rather than inheriting the old one.
  useEffect(() => {
    if (!celebration) return;
    const id = window.setTimeout(() => setCelebration(null), 1600);
    return () => window.clearTimeout(id);
  }, [celebration]);

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
      if (justCompleted) {
        solvedHereRef.current = true;
        setCompleted(true);
      }
      const nextFoundWords = new Set(foundWords).add(match.word);
      setCelebration({ word: match.word, id: Date.now() });
      setFoundWords(nextFoundWords);
      setFoundCells((prev) => {
        const next = new Map(prev);
        dragCells.forEach((c) => {
          const key = `${c.r}-${c.c}`;
          next.set(key, [...(next.get(key) ?? []), match.word]);
        });
        return next;
      });
      if (justCompleted) {
        deleteWordSearchProgress(uid, puzzleId).catch(() => {});
      } else {
        saveWordSearchProgress(uid, puzzleId, {
          foundWords: Array.from(nextFoundWords),
          elapsedMs: Date.now() - startTimeRef.current,
        }).catch(() => {});
      }
    }

    setDragStart(null);
    setDragCells([]);
  };

  useEffect(() => {
    if (!completed || scoreSaved || !puzzle) return;
    if (!solvedHereRef.current) return;
    setScoreSaved(true);
    submitScore({
      gameId: 'wordsearch',
      // One leaderboard regardless of whether the puzzle was freshly
      // created or picked from the library — solving speed isn't
      // meaningfully different between the two.
      mode: DEFAULT_MODE,
      uid,
      name: displayName,
      value: Math.round(elapsedMs / 1000),
    }).catch(() => setScoreSaved(false));
  }, [completed, scoreSaved, puzzle, uid, displayName, elapsedMs]);

  // The grid plus the found-word list can easily run past the fold on a
  // phone, especially for a 10x10 board — bring the "Solved!" card into
  // view rather than leaving the player staring at an unchanged board.
  useEffect(() => {
    if (!completed) return;
    completeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [completed]);

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
  // Shown above the board while dragging so the traced letters stay
  // visible even though a finger is covering the cell it's actually on.
  const traceLetters = dragStart
    ? dragCells.map((c) => puzzle.grid[c.r][c.c]).join('')
    : '';

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

      {puzzle.source && (
        <ProviderBadge source={puzzle.source} className="ws-source-badge" />
      )}

      {/* One fixed-height line that does three jobs in priority order:
          celebrate a find, mirror the letters being traced (a finger covers
          the cells it's on), or prompt. Fixed height so the board never
          shifts as it switches between them. */}
      {celebration ? (
        <div
          key={celebration.id}
          className="ws-trace celebrating"
          style={wordListItemStyle(celebration.word, puzzle.words)}
          aria-live="polite"
        >
          <span className="ws-trace-found-label">Found</span>
          {celebration.word}
        </div>
      ) : (
        <div className={`ws-trace ${traceLetters ? 'active' : ''}`}>
          {traceLetters || 'Drag across letters to trace a word'}
        </div>
      )}

      <div
        className="ws-board"
        ref={boardRef}
        style={{
          gridTemplateColumns: `repeat(${puzzle.size}, 1fr)`,
          gridTemplateRows: `repeat(${puzzle.size}, 1fr)`,
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {puzzle.grid.map((row, r) =>
          row.split('').map((letter, c) => {
            const key = `${r}-${c}`;
            const cellWords = foundCells.get(key);
            const isDragging = dragCellKeys.has(key);
            return (
              <span
                key={key}
                className={`ws-cell ${cellWords ? 'found' : ''} ${
                  isDragging ? 'dragging' : ''
                }`}
                style={cellWords ? foundCellStyle(cellWords, puzzle.words) : undefined}
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
            style={
              foundWords.has(w.word)
                ? wordListItemStyle(w.word, puzzle.words)
                : undefined
            }
          >
            {w.word}
          </li>
        ))}
      </ul>

      {completed && (
        <>
          <Confetti />
          <div className="ws-complete card" ref={completeRef}>
            <h3>Solved!</h3>
            <p className="ws-complete-time">{formatElapsed(elapsedMs)}</p>
            <button className="btn btn-primary" onClick={onBack}>
              Back to Word Search
            </button>
          </div>
        </>
      )}
    </Screen>
  );
}
