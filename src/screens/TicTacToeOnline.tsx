import { useEffect, useRef } from 'react';
import { Screen } from '../components/Screen';
import { OnlineLobby } from '../components/OnlineLobby';
import { IdleClaim } from '../components/IdleClaim';
import { TurnBanner } from '../components/TurnBanner';
import { Confetti, MarkGlyph, StrikeLine } from '../components/TttMarks';
import { IconSpinner } from '../components/icons';
import { ticTacToeRules, type TttState } from '../lib/onlineTicTacToe';
import { useBoardChange, useOnlineGame } from '../lib/useOnlineGame';
import { submitScore } from '../lib/firestoreScores';
import { playClear, playGameOver, playPlace } from '../lib/sound';
import './TicTacToeGame.css';

interface Props {
  uid: string;
  displayName: string;
  onBack: () => void;
}

/** Two family members on two devices. The board lives in the Realtime
 * Database and this component renders whatever the snapshot says, so there's
 * no local copy that could drift from the other player's. */
export function TicTacToeOnline({ uid, displayName, onBack }: Props) {
  const {
    game,
    games,
    busy,
    error,
    host,
    join,
    resume,
    move,
    rematch,
    leave,
    claimWin,
  } = useOnlineGame<TttState>(ticTacToeRules, uid, displayName);

  const scoredRounds = useRef<Set<string>>(new Set());

  // Sound is driven off the synced board rather than off our own tap, so the
  // opponent's move is audible here too.
  useBoardChange(game?.state?.board, (next) => {
    if (!game) return;
    if (game.status === 'active' && !next.includes('X') && !next.includes('O')) {
      return; // a rematch clearing the board is a reset, not a move
    }
    if (game.status === 'done') {
      if (game.outcome === 'win') {
        game.winnerUid === uid ? playClear(3) : playGameOver();
      } else {
        playGameOver();
      }
    } else {
      playPlace();
    }
  });

  // Each player reports only their own win — the scores rules require the
  // submitted uid to match the caller, and that's the right constraint.
  useEffect(() => {
    if (!game || game.status !== 'done' || game.outcome !== 'win') return;
    if (game.winnerUid !== uid) return;
    // wins-per-uid doubles as a round counter, so this key changes on every
    // rematch and each round's win is submitted exactly once.
    const key = `${game.id}:${game.wins[uid] ?? 0}`;
    if (scoredRounds.current.has(key)) return;
    scoredRounds.current.add(key);
    submitScore({
      gameId: 'tictactoe',
      mode: 'online',
      uid,
      name: displayName,
      value: 1,
    }).catch(() => scoredRounds.current.delete(key));
  }, [game, uid, displayName]);

  // ---------- lobby ----------

  if (!game) {
    return (
      <Screen title="Tic Tac Toe" subtitle="Play a family member" onBack={onBack}>
        <OnlineLobby
          kind="tictactoe"
          uid={uid}
          games={games}
          busy={busy}
          error={error}
          joinAs="as O"
          onHost={host}
          onResume={resume}
          onJoin={join}
        />
      </Screen>
    );
  }

  // ---------- at a table ----------

  const board = game.state?.board ?? '---------';
  const cells = board.split('');
  const myMark = game.state?.marks?.[uid] ?? null;
  const line = game.state?.line ?? null;
  const opponentUid = game.players.find((p) => p !== uid);
  const opponentName = opponentUid ? game.names[opponentUid] : null;
  const waiting = game.status === 'waiting';
  const myTurn = game.status === 'active' && game.turn === uid;
  const won = game.status === 'done' && game.outcome === 'win' && !!line;

  const statusText = () => {
    if (waiting) return 'Waiting for someone to join…';
    if (game.status === 'done') {
      if (game.outcome === 'draw') return "Draw — nobody's giving an inch";
      return game.winnerUid === uid ? 'You win!' : `${opponentName} wins`;
    }
    return myTurn ? 'Your turn' : `${opponentName ?? 'Opponent'}'s turn`;
  };

  return (
    <Screen
      title="Tic Tac Toe"
      subtitle={opponentName ? `vs ${opponentName}` : 'Waiting…'}
      onBack={onBack}
    >
      <div className="ttt-fit">
        {error && <div className="ttt-error card">{error}</div>}

        <div className="ttt-scorebar">
          <div className="ttt-tally">
            <span className="ttt-tally-mark">You ({myMark ?? '—'})</span>
            <span className="ttt-tally-value">{game.wins[uid] ?? 0}</span>
          </div>
          <div className="ttt-tally ttt-tally-draw">
            <span className="ttt-tally-mark">Draws</span>
            <span className="ttt-tally-value">{game.draws}</span>
          </div>
          <div className="ttt-tally">
            <span className="ttt-tally-mark">
              {opponentName ?? 'Opponent'}
              {opponentUid && game.state?.marks?.[opponentUid]
                ? ` (${game.state.marks[opponentUid]})`
                : ''}
            </span>
            <span className="ttt-tally-value">
              {opponentUid ? game.wins[opponentUid] ?? 0 : 0}
            </span>
          </div>
        </div>

        <IdleClaim
          status={game.status}
          turn={game.turn}
          updatedAt={game.updatedAt}
          uid={uid}
          opponentName={opponentName}
          onClaim={claimWin}
        />

        <div className="ttt-status-row">
          {game.status === 'active' ? (
            <TurnBanner
              active={myTurn}
              label={myTurn ? 'Your turn' : `${opponentName ?? 'Opponent'}'s turn`}
            />
          ) : (
            <p
              className={`ttt-status ${game.status === 'done' ? 'settled' : ''}`}
              aria-live="polite"
            >
              {waiting && (
                <IconSpinner className="ttt-status-spinner" aria-hidden="true" />
              )}
              {statusText()}
            </p>
          )}
          {game.status === 'done' && (
            <button className="btn btn-primary ttt-next-btn" onClick={rematch}>
              Rematch
            </button>
          )}
        </div>

        <div className="ttt-board-wrap">
          <div className="ttt-board-frame">
            {won && line && (
              <>
                <StrikeLine line={line} />
                <Confetti />
              </>
            )}
            <div className="ttt-board" role="grid" aria-label="Tic Tac Toe board">
              {cells.map((cell, index) => (
                <button
                  key={index}
                  className={`ttt-cell ${
                    cell !== '-' ? `mark-${cell.toLowerCase()}` : ''
                  } ${line?.includes(index) ? 'winning' : ''} ${
                    won && !line?.includes(index) ? 'dimmed' : ''
                  }`}
                  style={{ '--i': index } as React.CSSProperties}
                  onClick={() => move(index)}
                  disabled={!myTurn || cell !== '-'}
                  aria-label={
                    cell !== '-'
                      ? `${cell} at square ${index + 1}`
                      : `Empty square ${index + 1}`
                  }
                >
                  {cell !== '-' && <MarkGlyph mark={cell as 'X' | 'O'} />}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button className="btn btn-text ttt-leave" onClick={leave}>
          {waiting ? 'Cancel this game' : 'Leave game'}
        </button>
      </div>
    </Screen>
  );
}
