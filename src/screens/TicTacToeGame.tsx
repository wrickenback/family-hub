import { useCallback, useState } from 'react';
import { Screen } from '../components/Screen';
import { Confetti, MarkGlyph, StrikeLine } from '../components/TttMarks';
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

/** Rotating captions for whose turn it is — keyed by move count + round so a
 * given position always shows the same line (no flicker on re-render). */
const TURN_PHRASES: Record<Mark, string[]> = {
  X: ['Your move, X', 'X to play', 'X, make it count'],
  O: ['Your move, O', 'O to play', "O's moment…"],
};

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
  const [round, setRound] = useState(1);
  const [streak, setStreak] = useState({ X: 0, O: 0 });

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
        setStreak((s) => ({ ...s, [mark]: s[mark] + 1, [other(mark)]: 0 }));
        playClear(3);
      } else if (isFull(next)) {
        setResult({ type: 'draw' });
        setTally((t) => ({ ...t, draw: t.draw + 1 }));
        setStreak({ X: 0, O: 0 });
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
    setRound((r) => r + 1);
  };

  const winningCells = result?.type === 'win' ? result.line : [];
  const moveCount = board.filter(Boolean).length;
  const phrases = TURN_PHRASES[turn];
  const phrase = phrases[(round + moveCount) % phrases.length];

  return (
    <Screen title="Tic Tac Toe" subtitle="Pass and play" onBack={onBack}>
      <div className="ttt-fit">
        <div className="ttt-scorebar">
          <span className="ttt-round-badge">Round {round}</span>
          <div className={`ttt-tally ttt-tally-x ${!result && turn === 'X' ? 'turn' : ''}`}>
            {streak.X >= 2 && (
              <span className="ttt-streak" title={`${streak.X} wins in a row`}>
                🔥{streak.X}
              </span>
            )}
            <span className="ttt-tally-mark">X</span>
            <span key={tally.X} className="ttt-tally-value">{tally.X}</span>
          </div>
          <div className="ttt-tally ttt-tally-draw">
            <span className="ttt-tally-mark">Draws</span>
            <span key={tally.draw} className="ttt-tally-value">{tally.draw}</span>
          </div>
          <div className={`ttt-tally ttt-tally-o ${!result && turn === 'O' ? 'turn' : ''}`}>
            {streak.O >= 2 && (
              <span className="ttt-streak" title={`${streak.O} wins in a row`}>
                🔥{streak.O}
              </span>
            )}
            <span className="ttt-tally-mark">O</span>
            <span key={tally.O} className="ttt-tally-value">{tally.O}</span>
          </div>
        </div>

        <div className="ttt-players" role="status" aria-live="polite">
          <div className={`ttt-chip ttt-chip-x ${!result && turn === 'X' ? 'turn' : ''}`}>
            <MarkGlyph mark="X" />
          </div>
          <div className="ttt-status-row">
            <p className={`ttt-status ${result ? 'settled' : ''}`}>
              {result?.type === 'win'
                ? `${result.mark} wins!`
                : result?.type === 'draw'
                ? "Draw — nobody's giving an inch"
                : phrase}
            </p>
            {result && (
              <button className="btn btn-primary ttt-next-btn" onClick={handleNextRound}>
                Next round
              </button>
            )}
          </div>
          <div className={`ttt-chip ttt-chip-o ${!result && turn === 'O' ? 'turn' : ''}`}>
            <MarkGlyph mark="O" />
          </div>
        </div>

        <div className="ttt-board-wrap">
          <div className="ttt-board-frame" key={round}>
            {result?.type === 'win' && (
              <>
                <StrikeLine line={result.line} />
                <Confetti />
              </>
            )}
            <div className="ttt-board" role="grid" aria-label="Tic Tac Toe board">
              {board.map((cell, index) => (
                <button
                  key={index}
                  className={`ttt-cell ${cell ? `mark-${cell.toLowerCase()}` : ''} ${
                    winningCells.includes(index) ? 'winning' : ''
                  } ${
                    result?.type === 'win' && !winningCells.includes(index) ? 'dimmed' : ''
                  }`}
                  style={{ '--i': index } as React.CSSProperties}
                  onClick={() => playAt(index, turn)}
                  disabled={!!result || cell !== null}
                  aria-label={
                    cell ? `${cell} at square ${index + 1}` : `Empty square ${index + 1}`
                  }
                >
                  {cell && <MarkGlyph mark={cell} />}
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="ttt-note">
          Pass-and-play rounds stay on this device. For the family leaderboard,
          start an online game instead.
        </p>
      </div>
    </Screen>
  );
}
