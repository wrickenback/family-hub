import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Screen } from '../components/Screen';
import {
  BOARD_SIZE,
  PIECE_COLORS,
  canPlace,
  clearFullLines,
  drawPieces,
  emptyBoard,
  isGameOver,
  mulberry32,
  placePiece,
  scorePlacement,
  seedFromDateKey,
  shapeBounds,
  todayKey,
  type Board,
  type Shape,
} from '../lib/blocksEngine';
import { submitScore } from '../lib/firestoreScores';
import './BlocksGame.css';

interface BlocksGameProps {
  mode: 'free' | 'daily';
  uid: string;
  displayName: string;
  onBack: () => void;
}

interface TraySlot {
  shape: Shape;
  color: number;
}

interface DragState {
  slotIndex: number;
  shape: Shape;
  color: number;
  clientX: number;
  clientY: number;
}

const LIFT_PX = 64;

function randomColor(): number {
  return 1 + Math.floor(Math.random() * PIECE_COLORS);
}

export function BlocksGame({ mode, uid, displayName, onBack }: BlocksGameProps) {
  const dateKey = useMemo(() => todayKey(), []);
  const rngRef = useRef<() => number>(
    mode === 'daily' ? mulberry32(seedFromDateKey(dateKey)) : Math.random
  );

  const [board, setBoard] = useState<Board>(() => emptyBoard());
  const [tray, setTray] = useState<(TraySlot | null)[]>([]);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [scoreSaved, setScoreSaved] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);

  const boardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const initialBoard = emptyBoard();
    const pieces = drawPieces(initialBoard, rngRef.current);
    setBoard(initialBoard);
    setTray(pieces.map((shape) => ({ shape, color: randomColor() })));
    // Re-run if the mode itself changes (e.g. switching Free/Daily while on
    // this screen); a fresh key per mode would be cleaner but this keeps the
    // effect simple since BlocksGame is remounted by the router on mode
    // change anyway (mode is baked into the route).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const { board: cleared, linesCleared } = clearFullLines(placed);
    const gained = scorePlacement(drag.shape.cells.length, linesCleared);

    let nextTray = tray.map((slot, i) =>
      i === drag.slotIndex ? null : slot
    );
    if (nextTray.every((slot) => slot === null)) {
      const pieces = drawPieces(cleared, rngRef.current);
      nextTray = pieces.map((shape) => ({ shape, color: randomColor() }));
    }

    setBoard(cleared);
    setTray(nextTray);
    setScore((s) => s + gained);

    const remainingShapes = nextTray.map((slot) => slot?.shape ?? null);
    if (isGameOver(cleared, remainingShapes)) {
      setGameOver(true);
    }
  };

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
      // Best-effort — a failed leaderboard write shouldn't block seeing your
      // final score on screen.
      setScoreSaved(false);
    });
  }, [gameOver, scoreSaved, score, mode, dateKey, uid, displayName]);

  const handleRestart = () => {
    const initialBoard = emptyBoard();
    rngRef.current =
      mode === 'daily' ? mulberry32(seedFromDateKey(dateKey)) : Math.random;
    const pieces = drawPieces(initialBoard, rngRef.current);
    setBoard(initialBoard);
    setTray(pieces.map((shape) => ({ shape, color: randomColor() })));
    setScore(0);
    setGameOver(false);
    setScoreSaved(false);
  };

  const ghost = drag ? anchorFor(drag.shape, drag.clientX, drag.clientY) : null;
  const ghostValid =
    drag && ghost ? canPlace(board, drag.shape, ghost.anchorRow, ghost.anchorCol) : false;

  return (
    <Screen
      title={mode === 'daily' ? 'Blocks · Daily' : 'Blocks'}
      subtitle={`Score ${score.toLocaleString()}`}
      onBack={onBack}
    >
      <div className="blocks-board-wrap">
        <div className="blocks-board" ref={boardRef}>
          {board.map((row, r) =>
            row.map((cell, c) => (
              <div
                key={`${r}-${c}`}
                className={`blocks-cell ${cell ? `piece-color-${cell}` : ''}`}
              />
            ))
          )}
        </div>

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
                className="blocks-ghost-cell"
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
              <PiecePreview shape={slot.shape} color={slot.color} />
            )}
          </button>
        ))}
      </div>

      {gameOver && (
        <div className="blocks-gameover card">
          <h3>Game over</h3>
          <p className="blocks-gameover-score">{score.toLocaleString()} points</p>
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
