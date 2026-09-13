import { useState, useEffect } from 'react';
import { Screen } from '../components/Screen';
import {
  COLS,
  EMPTY_BOARD,
  ROWS,
  dropDisc,
  indexOf,
  isFull,
  landingRow,
  other,
  winningLine,
  type Disc,
} from '../lib/connectFourEngine';
import { playClear, playGameOver, playPlace } from '../lib/sound';
import './ConnectFourGame.css';

type Result = { type: 'win'; disc: Disc; line: number[] } | { type: 'draw' } | null;

const LABEL: Record<Disc, string> = { R: 'Red', Y: 'Yellow' };

const CONFETTI_COLORS = ['#E4172A', '#FFC400', '#2472DD', '#ffffff', '#3BB54A'];

function Confetti() {
  const pieces = Array.from({ length: 36 }).map((_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 400,
    duration: 1.4 + Math.random() * 0.8,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    spin: Math.random() > 0.5 ? '360deg' : '-360deg',
    tilt: Math.random() * 360,
  }));

  return (
    <div className="c4-confetti-field" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="c4-confetti-piece"
          style={{
            left: `${p.left}%`,
            backgroundColor: p.color,
            animationDelay: `${p.delay}ms`,
            animationDuration: `${p.duration}s`,
            transform: `rotate(${p.tilt}deg)`,
            '--spin': p.spin,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

export function ConnectFourGame({ onBack }: { onBack: () => void }) {
  const [board, setBoard] = useState(EMPTY_BOARD);
  const [turn, setTurn] = useState<Disc>('R');
  const [starter, setStarter] = useState<Disc>('R');
  const [result, setResult] = useState<Result>(null);
  const [tally, setTally] = useState({ R: 0, Y: 0, draw: 0 });
  const [celebrating, setCelebrating] = useState(false);
  const [lastDroppedIndex, setLastDroppedIndex] = useState<number | null>(null);
  const [turnFading, setTurnFading] = useState(false);

  useEffect(() => {
    if (celebrating) {
      const timer = setTimeout(() => setCelebrating(false), 2200);
      return () => clearTimeout(timer);
    }
  }, [celebrating]);

  const handleDrop = (col: number) => {
    if (result) return;
    const dropped = dropDisc(board, col, turn);
    if (!dropped) return;
    setLastDroppedIndex(dropped.index);
    setBoard(dropped.board);

    const line = winningLine(dropped.board);
    if (line) {
      setCelebrating(true);
      setResult({ type: 'win', disc: turn, line });
      setTally((t) => ({ ...t, [turn]: t[turn] + 1 }));
      playClear(3);
    } else if (isFull(dropped.board)) {
      setResult({ type: 'draw' });
      setTally((t) => ({ ...t, draw: t.draw + 1 }));
      playGameOver();
    } else {
      playPlace();
      // Clear the waiting chips out before swapping their color, rather than
      // snapping every column's indicator to the new color instantly.
      setTurnFading(true);
      setTimeout(() => {
        setTurn(other(turn));
        setTurnFading(false);
      }, 160);
    }
  };

  const handleNextRound = () => {
    const nextStarter = other(starter);
    setStarter(nextStarter);
    setTurn(nextStarter);
    setBoard(EMPTY_BOARD);
    setResult(null);
    setCelebrating(false);
    setLastDroppedIndex(null);
  };

  const winning = result?.type === 'win' ? result.line : [];

  return (
    <Screen title="Connect 4" subtitle="Pass and play" onBack={onBack}>
      <div className="c4-scorebar">
        <div className="c4-tally">
          <span className="c4-tally-label">Red</span>
          <span className="c4-tally-value">{tally.R}</span>
        </div>
        <div className="c4-tally">
          <span className="c4-tally-label">Draws</span>
          <span className="c4-tally-value">{tally.draw}</span>
        </div>
        <div className="c4-tally">
          <span className="c4-tally-label">Yellow</span>
          <span className="c4-tally-value">{tally.Y}</span>
        </div>
      </div>

      <p className={`c4-status ${result ? 'settled' : ''}`} aria-live="polite">
        {result?.type === 'win'
          ? `${LABEL[result.disc]} wins!`
          : result?.type === 'draw'
          ? 'Draw — board full'
          : `${LABEL[turn]}'s turn`}
      </p>

      <C4Board
        board={board}
        winning={winning}
        disabled={!!result}
        celebrating={celebrating}
        lastDroppedIndex={lastDroppedIndex}
        turn={turn}
        turnFading={turnFading}
        onDrop={handleDrop}
      />

      {result && (
        <div className="c4-result card">
          <h3>
            {result.type === 'draw' ? 'Draw' : `${LABEL[result.disc]} wins`}
          </h3>
          <button className="btn btn-primary" onClick={handleNextRound}>
            Next round
          </button>
        </div>
      )}

      <p className="c4-note">
        Pass-and-play rounds stay on this device. Start an online game to put a
        win on the family board.
      </p>
    </Screen>
  );
}

export function C4Board({
  board,
  winning,
  disabled,
  celebrating,
  lastDroppedIndex,
  turn,
  turnFading,
  onDrop,
}: {
  board: string;
  winning: number[];
  disabled: boolean;
  celebrating: boolean;
  lastDroppedIndex: number | null;
  turn?: Disc;
  turnFading?: boolean;
  onDrop: (col: number) => void;
}) {
  return (
    <div className="c4-wrapper">
      <div className="c4-column-headers">
        {Array.from({ length: COLS }).map((_, col) => {
          const full = landingRow(board, col) < 0;
          return (
            <div key={col} className="c4-column-header">
              <button
                className="c4-column-button"
                onClick={() => onDrop(col)}
                disabled={disabled || full}
                aria-label={`Drop in column ${col + 1}`}
              >
                <span
                  className={`c4-ghost-disc ghost-${turn ?? 'R'} ${turnFading ? 'fading' : ''}`}
                />
              </button>
            </div>
          );
        })}
      </div>
      <div className={`c4-board ${celebrating ? 'dimmed' : ''}`} role="grid" aria-label="Connect 4 board">
        {Array.from({ length: COLS }).map((_, col) => (
          <div key={col} className="c4-column">
            {Array.from({ length: ROWS }).map((__, row) => {
              const i = indexOf(row, col);
              const disc = board[i];
              const isLastDropped = i === lastDroppedIndex;
              return (
                <span key={row} className="c4-slot">
                  {disc !== '-' && (
                    <span
                      className={`c4-disc disc-${disc} ${
                        winning.includes(i) ? 'winning' : ''
                      } ${isLastDropped ? 'newly-dropped' : ''}`}
                      style={
                        isLastDropped
                          ? ({ '--drop-from': `-${(row + 1) * 100}%` } as React.CSSProperties)
                          : undefined
                      }
                    />
                  )}
                </span>
              );
            })}
          </div>
        ))}
      </div>
      {celebrating && <Confetti />}
    </div>
  );
}
