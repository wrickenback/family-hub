import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Screen } from '../components/Screen';
import {
  BOARD_SIZE,
  PIECE_COLORS,
  canPlace,
  cellPoints,
  clearLines,
  drawPieces,
  emptyBoard,
  findFullLines,
  isGameOver,
  lineClearScore,
  mulberry32,
  placePiece,
  seedFromDateKey,
  shapeBounds,
  streakMultiplier,
  todayKey,
  type Board,
  type Shape,
} from '../lib/blocksEngine';
import { submitScore, watchTopScores } from '../lib/firestoreScores';
import {
  deleteBlocksProgress,
  loadBlocksProgress,
  saveBlocksProgress,
} from '../lib/localStorageBlocks';
import { playClear, playGameOver, playPlace } from '../lib/sound';
import './BlocksGame.css';

interface BlocksGameProps {
  mode: 'free' | 'daily';
  uid: string;
  displayName: string;
  onBack: () => void;
}

interface TraySlot {
  id: number;
  shape: Shape;
  color: number;
}

let pieceIdCounter = 0;

function makeSlot(shape: Shape): TraySlot {
  pieceIdCounter += 1;
  return { id: pieceIdCounter, shape, color: randomColor() };
}

interface DragState {
  slotIndex: number;
  shape: Shape;
  color: number;
  clientX: number;
  clientY: number;
}

interface ClearingLines {
  rows: Set<number>;
  cols: Set<number>;
}

const LIFT_PX = 64;
const CLEAR_ANIM_MS = 280;

function randomColor(): number {
  return 1 + Math.floor(Math.random() * PIECE_COLORS);
}

// A plain single-line clear with no streak yet doesn't get a banner — the
// flash and score bump already say "you did it"; reserving text for
// doubles/triples/streaks keeps it meaning something when it shows up.
function comboLabel(linesCleared: number, streak: number): string | null {
  const base =
    linesCleared >= 4
      ? 'BLAST!'
      : linesCleared === 3
      ? 'TRIPLE!'
      : linesCleared === 2
      ? 'DOUBLE!'
      : null;
  if (base) {
    return streak > 1 ? `${base}  ×${streak} STREAK` : base;
  }
  return streak >= 3 ? `×${streak} STREAK` : null;
}

export function BlocksGame({ mode, uid, displayName, onBack }: BlocksGameProps) {
  const dateKey = useMemo(() => todayKey(), []);
  const rngRef = useRef<() => number>(
    mode === 'daily' ? mulberry32(seedFromDateKey(dateKey)) : Math.random
  );

  const [board, setBoard] = useState<Board>(() => emptyBoard());
  const [tray, setTray] = useState<(TraySlot | null)[]>([]);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [streak, setStreak] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [scoreSaved, setScoreSaved] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [clearingLines, setClearingLines] = useState<ClearingLines | null>(null);
  const [banner, setBanner] = useState<{ id: number; text: string } | null>(null);
  const [scoreBump, setScoreBump] = useState(0);

  const boardRef = useRef<HTMLDivElement>(null);

  const [familyBest, setFamilyBest] = useState<number | null>(null);
  const personalBestAtStart = useRef(0);
  // familyBest is a live subscription — freeze it the instant the game ends
  // so submitting this game's own score (which can become the new top entry
  // and update the live value) can't flip "New family record!" back to "0
  // points from the record" a moment after it's shown.
  const familyBestAtEnd = useRef<number | null>(null);

  // Load saved progress and initialize board/tray/score/streak
  useEffect(() => {
    const progress = loadBlocksProgress();
    if (progress) {
      // Restore from saved progress
      setBoard(progress.board);
      setScore(progress.score);
      setStreak(progress.streak);
      // Reconstruct TraySlots with fresh ids but restored shapes/colors
      const restoredTray = progress.tray.map((slot) => {
        if (!slot) return null;
        pieceIdCounter += 1;
        return { id: pieceIdCounter, shape: slot.shape, color: slot.color };
      });
      setTray(restoredTray);
      setBest(progress.score); // Start "this session" best at the resumed score
    } else {
      // Initialize a new game
      const initialBoard = emptyBoard();
      const pieces = drawPieces(initialBoard, rngRef.current, true);
      setBoard(initialBoard);
      setTray(pieces.map(makeSlot));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return watchTopScores(
      'blocks',
      mode,
      (entries) => setFamilyBest(entries[0]?.value ?? 0),
      () => setFamilyBest(null),
      1
    );
  }, [mode]);

  const anchorFor = (shape: Shape, clientX: number, clientY: number) => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const cellSize = rect.width / BOARD_SIZE;
    const { width, height } = shapeBounds(shape);
    const originX = clientX - rect.left - (width * cellSize) / 2;
    const originY = clientY - LIFT_PX - rect.top - (height * cellSize) / 2;
    const anchorCol = Math.max(
      0,
      Math.min(BOARD_SIZE - width, Math.round(originX / cellSize))
    );
    const anchorRow = Math.max(
      0,
      Math.min(BOARD_SIZE - height, Math.round(originY / cellSize))
    );
    return { anchorRow, anchorCol, cellSize, rect };
  };

  const handlePointerDown = (
    e: ReactPointerEvent<HTMLButtonElement>,
    slotIndex: number,
    slot: TraySlot
  ) => {
    if (gameOver) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({
      slotIndex,
      shape: slot.shape,
      color: slot.color,
      clientX: e.clientX,
      clientY: e.clientY,
    });
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag) return;
    setDrag({ ...drag, clientX: e.clientX, clientY: e.clientY });
  };

  // Draws fresh pieces if the tray just emptied, then checks whether the
  // resulting board+tray combination is a dead end.
  const finishTurn = (
    newBoard: Board,
    trayAfterUse: (TraySlot | null)[]
  ) => {
    let nextTray = trayAfterUse;
    if (nextTray.every((slot) => slot === null)) {
      const pieces = drawPieces(newBoard, rngRef.current);
      nextTray = pieces.map(makeSlot);
    }
    setBoard(newBoard);
    setTray(nextTray);
    const remainingShapes = nextTray.map((slot) => slot?.shape ?? null);
    if (isGameOver(newBoard, remainingShapes)) {
      familyBestAtEnd.current = familyBest;
      setGameOver(true);
      playGameOver();
    }
  };

  // Save game progress whenever state changes, but not after game ends
  useEffect(() => {
    if (gameOver || board.length === 0 || tray.length === 0) return;
    // Only save if at least one piece has been placed (board or tray has changed)
    saveBlocksProgress({
      board,
      tray: tray.map((slot) =>
        slot ? { shape: slot.shape, color: slot.color } : null
      ),
      score,
      streak,
    });
  }, [board, tray, score, streak, gameOver]);

  const handlePointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag) return;
    const target = anchorFor(drag.shape, e.clientX, e.clientY);
    setDrag(null);
    if (!target) return;
    if (!canPlace(board, drag.shape, target.anchorRow, target.anchorCol)) {
      return;
    }

    const placed = placePiece(
      board,
      drag.shape,
      target.anchorRow,
      target.anchorCol,
      drag.color
    );
    const { rows, cols } = findFullLines(placed);
    const linesCleared = rows.length + cols.length;
    const cellsPlaced = drag.shape.cells.length;
    const trayAfterUse = tray.map((slot, i) =>
      i === drag.slotIndex ? null : slot
    );

    if (linesCleared === 0) {
      playPlace();
      setStreak(0);
      setScore((s) => s + cellsPlaced);
      finishTurn(placed, trayAfterUse);
      return;
    }

    const nextStreak = streak + 1;
    const gained =
      cellPoints(cellsPlaced) +
      Math.round(lineClearScore(linesCleared) * streakMultiplier(nextStreak));

    playClear(linesCleared);
    setStreak(nextStreak);
    setScore((s) => s + gained);
    setScoreBump((b) => b + 1);
    setBoard(placed); // show the completed lines briefly before they vanish
    setClearingLines({ rows: new Set(rows), cols: new Set(cols) });
    const label = comboLabel(linesCleared, nextStreak);
    if (label) setBanner({ id: Date.now(), text: label });
    if (typeof navigator.vibrate === 'function') {
      navigator.vibrate(linesCleared >= 2 ? [30, 40, 30] : 25);
    }

    window.setTimeout(() => {
      setClearingLines(null);
      finishTurn(clearLines(placed, rows, cols), trayAfterUse);
    }, CLEAR_ANIM_MS);
  };

  useEffect(() => {
    if (!banner) return;
    const t = window.setTimeout(() => setBanner(null), 900);
    return () => window.clearTimeout(t);
  }, [banner]);

  useEffect(() => {
    if (score > best) setBest(score);
  }, [score, best]);

  // Delete saved progress when game ends
  useEffect(() => {
    if (gameOver) {
      deleteBlocksProgress();
    }
  }, [gameOver]);

  useEffect(() => {
    if (!gameOver || scoreSaved || score === 0) return;
    setScoreSaved(true);
    submitScore({
      gameId: 'blocks',
      mode,
      dateKey: mode === 'daily' ? dateKey : undefined,
      uid,
      name: displayName,
      value: score,
    }).catch(() => {
      setScoreSaved(false);
    });
  }, [gameOver, scoreSaved, score, mode, dateKey, uid, displayName]);

  const handleRestart = () => {
    personalBestAtStart.current = best;
    familyBestAtEnd.current = null;
    deleteBlocksProgress(); // Clear saved progress for this game
    const initialBoard = emptyBoard();
    rngRef.current =
      mode === 'daily' ? mulberry32(seedFromDateKey(dateKey)) : Math.random;
    const pieces = drawPieces(initialBoard, rngRef.current, true);
    setBoard(initialBoard);
    setTray(pieces.map(makeSlot));
    setScore(0);
    setStreak(0);
    setGameOver(false);
    setScoreSaved(false);
    setClearingLines(null);
    setBanner(null);
  };

  const ghost = drag ? anchorFor(drag.shape, drag.clientX, drag.clientY) : null;
  const ghostValid =
    drag && ghost ? canPlace(board, drag.shape, ghost.anchorRow, ghost.anchorCol) : false;

  // Landing-spot preview directly on the grid (not just the floating ghost),
  // plus a distinct highlight on any row/col this placement would complete —
  // the single most "does this feel like the real game" detail.
  const previewCells = new Set<string>();
  const previewClearCells = new Set<string>();
  if (drag && ghost) {
    for (const [dr, dc] of drag.shape.cells) {
      previewCells.add(`${ghost.anchorRow + dr}-${ghost.anchorCol + dc}`);
    }
    if (ghostValid) {
      const hypothetical = placePiece(
        board,
        drag.shape,
        ghost.anchorRow,
        ghost.anchorCol,
        drag.color
      );
      const { rows, cols } = findFullLines(hypothetical);
      if (rows.length || cols.length) {
        for (let r = 0; r < BOARD_SIZE; r++) {
          for (let c = 0; c < BOARD_SIZE; c++) {
            if (rows.includes(r) || cols.includes(c)) {
              previewClearCells.add(`${r}-${c}`);
            }
          }
        }
      }
    }
  }

  return (
    <Screen
      title={mode === 'daily' ? 'Blocks · Daily' : 'Blocks'}
      onBack={onBack}
    >
      <div className="blocks-scorebar">
        <div className="blocks-score-main">
          <span key={scoreBump} className="blocks-score-value">
            {score.toLocaleString()}
          </span>
          <span className="blocks-score-label">score</span>
        </div>
        <div className="blocks-score-side">
          <span className="blocks-best-value">{best.toLocaleString()}</span>
          <span className="blocks-score-label">this session</span>
        </div>
      </div>

      <div className="blocks-board-wrap">
        <div className="blocks-board" ref={boardRef}>
          {board.map((row, r) =>
            row.map((cell, c) => {
              const key = `${r}-${c}`;
              const isClearing =
                !!clearingLines &&
                (clearingLines.rows.has(r) || clearingLines.cols.has(c));
              const isPreview = previewCells.has(key);
              const willClear = previewClearCells.has(key);
              const classes = [
                'blocks-cell',
                cell ? `piece-color-${cell}` : '',
                isClearing ? 'clearing' : '',
                isPreview ? (ghostValid ? 'preview-valid' : 'preview-invalid') : '',
                willClear ? 'preview-clear' : '',
              ]
                .filter(Boolean)
                .join(' ');
              return <div key={key} className={classes} />;
            })
          )}
        </div>

        {banner && (
          <div key={banner.id} className="blocks-banner">
            {banner.text}
          </div>
        )}

        {drag && ghost && (
          <div
            className={`blocks-ghost ${ghostValid ? 'valid' : 'invalid'}`}
            style={{
              left: ghost.rect.left + ghost.anchorCol * ghost.cellSize,
              top: ghost.rect.top + ghost.anchorRow * ghost.cellSize,
            }}
          >
            {drag.shape.cells.map(([dr, dc]) => (
              <span
                key={`${dr}-${dc}`}
                className={`blocks-ghost-cell piece-color-${drag.color}`}
                style={{
                  left: dc * ghost.cellSize,
                  top: dr * ghost.cellSize,
                  width: ghost.cellSize,
                  height: ghost.cellSize,
                }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="blocks-tray">
        {tray.map((slot, i) => (
          <button
            key={i}
            className="blocks-tray-slot"
            disabled={!slot || gameOver}
            onPointerDown={
              slot ? (e) => handlePointerDown(e, i, slot) : undefined
            }
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            style={{ touchAction: 'none' }}
          >
            {slot && drag?.slotIndex !== i && (
              <PiecePreview key={slot.id} shape={slot.shape} color={slot.color} />
            )}
          </button>
        ))}
      </div>

      {gameOver && (
        <div className="blocks-gameover card">
          <h3>Game over</h3>
          <p className="blocks-gameover-score">{score.toLocaleString()} points</p>
          {score > personalBestAtStart.current && (
            <p className="blocks-gameover-flag new-best">
              New session best!
            </p>
          )}
          {familyBestAtEnd.current !== null && (
            <p className="blocks-gameover-flag family">
              {score > familyBestAtEnd.current
                ? 'New family record!'
                : familyBestAtEnd.current > 0
                ? `${(familyBestAtEnd.current - score).toLocaleString()} points from the family record`
                : 'First score on the board!'}
            </p>
          )}
          <button className="btn btn-primary" onClick={handleRestart}>
            Play again
          </button>
        </div>
      )}
    </Screen>
  );
}

function PiecePreview({ shape, color }: { shape: Shape; color: number }) {
  const { width, height } = shapeBounds(shape);
  const cell = 16;
  return (
    <div
      className="piece-preview"
      style={{ width: width * cell, height: height * cell }}
    >
      {shape.cells.map(([r, c]) => (
        <span
          key={`${r}-${c}`}
          className={`piece-preview-cell piece-color-${color}`}
          style={{ left: c * cell, top: r * cell, width: cell, height: cell }}
        />
      ))}
    </div>
  );
}
