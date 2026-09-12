import { useCallback, useState } from 'react';
import { Screen } from '../components/Screen';
import {
  emptyBoard,
  isFull,
  winningLine,
  other,
  type Board,
  type Mark,
} from '../lib/ticTacToeEngine';
import { playClear, playGameOver, playPlace } from '../lib/sound';
import './TicTacToeGame.css';

type Result =
  | { type: 'win'; mark: Mark; line: number[] }
  | { type: 'draw' }
  | null;

/** Pass-and-play on a single device: two people, one phone, taking turns.
 * Nothing here touches Firestore — there's no second signed-in account to
 * attribute a win to, so this session's tally stays local and the family
 * leaderboard is fed by online games only. */
export function TicTacToeGame({ onBack }: { onBack: () => void }) {
  const [board, setBoard] = useState<Board>(emptyBoard);
  const [turn, setTurn] = useState<Mark>('X');
  const [starter, setStarter] = useState<Mark>('X');
  const [result, setResult] = useState<Result>(null);
  const [tally, setTally] = useState({ X: 0, O: 0, draw: 0 });

  const playAt = useCallback(
    (index: number, mark: Mark) => {
      if (board[index] !== null) return;
      const next = [...board];
      next[index] = mark;
      setBoard(next);

      const line = winningLine(next);
      if (line) {
        setResult({ type: 'win', mark, line });
        setTally((t) => ({ ...t, [mark]: t[mark] + 1 }));
        playClear(3);
      } else if (isFull(next)) {
        setResult({ type: 'draw' });
        setTally((t) => ({ ...t, draw: t.draw + 1 }));
        playGameOver();
      } else {
        playPlace();
        setTurn(other(mark));
      }
    },
    [board]
  );

  const handleNextRound = () => {
    // Alternate who opens, so X's first-move advantage evens out over a
    // session rather than always favouring whoever grabbed the phone first.
    const nextStarter = other(starter);
    setStarter(nextStarter);
    setTurn(nextStarter);
    setBoard(emptyBoard());
    setResult(null);
  };

  const winningCells = result?.type === 'win' ? result.line : [];

  return (
    <Screen title="Tic Tac Toe" subtitle="Pass and play" onBack={onBack}>
      <div className="ttt-scorebar">
        <div className="ttt-tally">
          <span className="ttt-tally-mark">X</span>
          <span className="ttt-tally-value">{tally.X}</span>
        </div>
        <div className="ttt-tally ttt-tally-draw">
          <span className="ttt-tally-mark">Draws</span>
          <span className="ttt-tally-value">{tally.draw}</span>
        </div>
        <div className="ttt-tally">
          <span className="ttt-tally-mark">O</span>
          <span className="ttt-tally-value">{tally.O}</span>
        </div>
      </div>

      <p className={`ttt-status ${result ? 'settled' : ''}`} aria-live="polite">
        {result?.type === 'win'
          ? `${result.mark} wins!`
          : result?.type === 'draw'
          ? "Draw — nobody's giving an inch"
          : `${turn}'s turn`}
      </p>

      <div className="ttt-board" role="grid" aria-label="Tic Tac Toe board">
        {board.map((cell, index) => (
          <button
            key={index}
            className={`ttt-cell ${cell ? `mark-${cell.toLowerCase()}` : ''} ${
              winningCells.includes(index) ? 'winning' : ''
            }`}
            onClick={() => playAt(index, turn)}
            disabled={!!result || cell !== null}
            aria-label={
              cell ? `${cell} at square ${index + 1}` : `Empty square ${index + 1}`
            }
          >
            {cell}
          </button>
        ))}
      </div>

      {result && (
        <div className="ttt-result card">
          <h3>{result.type === 'draw' ? 'Draw' : `${result.mark} wins`}</h3>
          <button className="btn btn-primary" onClick={handleNextRound}>
            Next round
          </button>
        </div>
      )}

      <p className="ttt-note">
        Pass-and-play rounds stay on this device. To put a win on the family
        leaderboard, start an online game instead.
      </p>
    </Screen>
  );
}
