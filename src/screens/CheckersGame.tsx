import { useState } from 'react';
import { Screen } from '../components/Screen';
import { TurnBanner } from '../components/TurnBanner';
import {
  INITIAL_BOARD,
  SIZE,
  SQUARES,
  applyMove,
  countPieces,
  destinationsFrom,
  isDark,
  isKing,
  legalMoves,
  movablePieces,
  other,
  ownerOf,
  winnerAgainst,
  type Player,
} from '../lib/checkersEngine';
import { playClear, playGameOver, playPlace } from '../lib/sound';
import './CheckersGame.css';

const LABEL: Record<Player, string> = { r: 'Red', b: 'Black' };

/** Kept in step with the .ck-piece colours in the stylesheet. */
export const PLAYER_HEX: Record<Player, string> = {
  r: '#a85225',
  b: '#1a1410',
};

export function CheckersGame({ onBack }: { onBack: () => void }) {
  const [board, setBoard] = useState(INITIAL_BOARD);
  const [turn, setTurn] = useState<Player>('r');
  const [starter, setStarter] = useState<Player>('r');
  const [chainFrom, setChainFrom] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [last, setLast] = useState<{ from: number; to: number } | null>(null);
  const [winner, setWinner] = useState<Player | null>(null);
  const [over, setOver] = useState(false);
  const [tally, setTally] = useState({ r: 0, b: 0 });

  const handleMove = (from: number, to: number) => {
    const move = legalMoves(board, turn, chainFrom).find(
      (m) => m.from === from && m.to === to
    );
    if (!move) return;

    const result = applyMove(board, move);
    setBoard(result.board);
    setLast({ from, to });
    move.captured !== null ? playClear(result.promoted ? 4 : 1) : playPlace();

    if (result.mustContinue) {
      setChainFrom(to);
      setSelected(to);
      return;
    }

    setChainFrom(null);
    setSelected(null);

    const won = winnerAgainst(result.board, other(turn));
    if (won) {
      setWinner(won);
      setOver(true);
      setTally((t) => ({ ...t, [won]: t[won] + 1 }));
      playGameOver();
      return;
    }
    setTurn(other(turn));
  };

  const handleNextRound = () => {
    const nextStarter = other(starter);
    setStarter(nextStarter);
    setTurn(nextStarter);
    setBoard(INITIAL_BOARD);
    setChainFrom(null);
    setSelected(null);
    setLast(null);
    setWinner(null);
    setOver(false);
  };

  return (
    <Screen title="Checkers" subtitle="Pass and play" onBack={onBack}>
      <div className="ck-scorebar">
        <div className="ck-tally">
          <span className="ck-tally-label">Red</span>
          <span className="ck-tally-value">{tally.r}</span>
        </div>
        <div className="ck-tally">
          <span className="ck-tally-label">Pieces</span>
          <span className="ck-tally-value">
            {countPieces(board, 'r')}-{countPieces(board, 'b')}
          </span>
        </div>
        <div className="ck-tally">
          <span className="ck-tally-label">Black</span>
          <span className="ck-tally-value">{tally.b}</span>
        </div>
      </div>

      {over ? (
        <p className="ck-status settled" aria-live="polite">
          {winner ? `${LABEL[winner]} wins!` : 'Game over'}
        </p>
      ) : (
        <TurnBanner
          active
          label={`${LABEL[turn]}'s turn`}
          hint={
            chainFrom !== null
              ? 'Jump again with the same piece.'
              : legalMoves(board, turn).some((m) => m.captured !== null)
              ? 'You have a jump — you have to take it.'
              : undefined
          }
          accent={PLAYER_HEX[turn]}
        />
      )}

      <CheckersBoard
        board={board}
        player={turn}
        chainFrom={chainFrom}
        selected={selected}
        last={last}
        disabled={over}
        flipped={false}
        onSelect={setSelected}
        onMove={handleMove}
      />

      {over && (
        <div className="ck-result card">
          <h3>{winner ? `${LABEL[winner]} wins` : 'Game over'}</h3>
          <button className="btn btn-primary" onClick={handleNextRound}>
            Next round
          </button>
        </div>
      )}

      <p className="ck-note">
        Pass-and-play rounds stay on this device. Start an online game to put a
        win on the family board.
      </p>
    </Screen>
  );
}

export function CheckersBoard({
  board,
  player,
  chainFrom,
  selected,
  last,
  disabled,
  flipped,
  onSelect,
  onMove,
}: {
  board: string;
  /** Whose pieces may be picked up right now. */
  player: Player;
  chainFrom: number | null;
  selected: number | null;
  last: { from: number; to: number } | null;
  disabled: boolean;
  /** Black's phone sees the board from the other end, so your own pieces are
   * always the ones nearest your thumbs. */
  flipped: boolean;
  onSelect: (index: number | null) => void;
  onMove: (from: number, to: number) => void;
}) {
  const movable = disabled ? new Set<number>() : movablePieces(board, player, chainFrom);
  const destinations = disabled || selected === null
    ? []
    : destinationsFrom(board, player, selected, chainFrom);
  const targets = new Map(destinations.map((m) => [m.to, m]));

  const handleTap = (index: number) => {
    if (disabled) return;
    if (targets.has(index) && selected !== null) {
      onMove(selected, index);
      return;
    }
    // Mid-chain the piece is locked; tapping elsewhere shouldn't quietly
    // drop the jump that's still owed.
    if (chainFrom !== null) return;
    if (movable.has(index)) {
      onSelect(selected === index ? null : index);
      return;
    }
    onSelect(null);
  };

  const order = Array.from({ length: SQUARES }, (_, i) =>
    flipped ? SQUARES - 1 - i : i
  );

  return (
    <div className="ck-wrapper">
      <div
        className="ck-board"
        style={{ gridTemplateColumns: `repeat(${SIZE}, 1fr)` }}
        role="grid"
        aria-label="Checkers board"
      >
        {order.map((index) => {
          const piece = board[index];
          const owner = ownerOf(piece);
          const dark = isDark(index);
          const isTarget = targets.has(index);
          const classes = [
            'ck-square',
            dark ? 'dark' : 'light',
            selected === index ? 'selected' : '',
            isTarget ? 'target' : '',
            targets.get(index)?.captured != null ? 'target-jump' : '',
            last && (last.from === index || last.to === index) ? 'recent' : '',
            !owner && !isTarget ? 'quiet' : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <button
              key={index}
              className={classes}
              disabled={disabled || (!dark) || (!owner && !isTarget)}
              onClick={() => handleTap(index)}
              aria-label={`Square ${index}${owner ? `, ${LABEL[owner]}` : ''}`}
            >
              {owner && (
                <span
                  className={`ck-piece ${owner === 'r' ? 'red' : 'black'} ${
                    movable.has(index) ? 'ready' : ''
                  }`}
                >
                  {isKing(piece) && <span className="ck-crown" aria-hidden="true" />}
                </span>
              )}
              {isTarget && <span className="ck-dot" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
