import { useState } from 'react';
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

/** Pass-and-play on one device. Local only — as with Tic Tac Toe, there's no
 * second signed-in account here to attribute a win to, so the family board
 * is fed by online games. */
export function ConnectFourGame({ onBack }: { onBack: () => void }) {
  const [board, setBoard] = useState(EMPTY_BOARD);
  const [turn, setTurn] = useState<Disc>('R');
  const [starter, setStarter] = useState<Disc>('R');
  const [result, setResult] = useState<Result>(null);
  const [tally, setTally] = useState({ R: 0, Y: 0, draw: 0 });

  const handleDrop = (col: number) => {
    if (result) return;
    const dropped = dropDisc(board, col, turn);
    if (!dropped) return; // column full
    setBoard(dropped.board);

    const line = winningLine(dropped.board);
    if (line) {
      setResult({ type: 'win', disc: turn, line });
      setTally((t) => ({ ...t, [turn]: t[turn] + 1 }));
      playClear(3);
    } else if (isFull(dropped.board)) {
      setResult({ type: 'draw' });
      setTally((t) => ({ ...t, draw: t.draw + 1 }));
      playGameOver();
    } else {
      playPlace();
      setTurn(other(turn));
    }
  };

  const handleNextRound = () => {
    // Alternate who opens — going first is a real advantage in Connect 4.
    const nextStarter = other(starter);
    setStarter(nextStarter);
    setTurn(nextStarter);
    setBoard(EMPTY_BOARD);
    setResult(null);
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

/** Shared board renderer. A whole column is one button — that's the actual
 * move in Connect 4, and it gives a far bigger tap target on a phone than
 * an individual slot would. */
export function C4Board({
  board,
  winning,
  disabled,
  onDrop,
}: {
  board: string;
  winning: number[];
  disabled: boolean;
  onDrop: (col: number) => void;
}) {
  return (
    <div className="c4-board" role="grid" aria-label="Connect 4 board">
      {Array.from({ length: COLS }).map((_, col) => {
        const full = landingRow(board, col) < 0;
        return (
          <button
            key={col}
            className="c4-column"
            onClick={() => onDrop(col)}
            disabled={disabled || full}
            aria-label={`Drop in column ${col + 1}`}
          >
            {Array.from({ length: ROWS }).map((__, row) => {
              const i = indexOf(row, col);
              const disc = board[i];
              return (
                <span
                  key={row}
                  className={`c4-slot ${disc !== '-' ? `disc-${disc}` : ''} ${
                    winning.includes(i) ? 'winning' : ''
                  }`}
                />
              );
            })}
          </button>
        );
      })}
    </div>
  );
}
