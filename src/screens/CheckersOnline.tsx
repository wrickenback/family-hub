import { useEffect, useRef, useState } from 'react';
import { Screen } from '../components/Screen';
import { OnlineLobby } from '../components/OnlineLobby';
import { IdleClaim } from '../components/IdleClaim';
import { IconSpinner } from '../components/icons';
import { TurnBanner } from '../components/TurnBanner';
import { CheckersBoard, PLAYER_HEX } from './CheckersGame';
import { INITIAL_BOARD, countPieces, legalMoves } from '../lib/checkersEngine';
import { checkersRules, type CheckersState } from '../lib/onlineCheckers';
import { useBoardChange, useOnlineGame } from '../lib/useOnlineGame';
import { submitScore } from '../lib/firestoreScores';
import { playClear, playGameOver, playPlace } from '../lib/sound';
import './CheckersGame.css';

const LABEL = { r: 'Red', b: 'Black' } as const;

/** Two family members, two devices. Mid-multi-jump the turn stays put and
 * the jumping piece is pinned — see onlineCheckers.ts — so a board that
 * comes back still on your turn is the normal "jump again" case. */
export function CheckersOnline({
  uid,
  displayName,
  onBack,
}: {
  uid: string;
  displayName: string;
  onBack: () => void;
}) {
  const { game, games, busy, error, host, join, resume, move, rematch, leave, claimWin } =
    useOnlineGame<CheckersState>(checkersRules, uid, displayName);

  const [selected, setSelected] = useState<number | null>(null);
  const scoredRounds = useRef<Set<string>>(new Set());

  const board = game?.state?.board ?? INITIAL_BOARD;
  const chainFrom = game?.state?.chainFrom ?? null;

  // Mid-chain the engine allows exactly one piece to move, so pick it up for
  // the player rather than making them tap it again to carry on jumping.
  useEffect(() => {
    if (chainFrom !== null) setSelected(chainFrom);
  }, [chainFrom]);

  useBoardChange(board, () => {
    if (!game) return;
    if (game.status === 'done') {
      game.winnerUid === uid ? playClear(4) : playGameOver();
      return;
    }
    playPlace();
  });

  useEffect(() => {
    if (!game || game.status !== 'done' || game.outcome !== 'win') return;
    if (game.winnerUid !== uid) return;
    const key = `${game.id}:${game.wins[uid] ?? 0}`;
    if (scoredRounds.current.has(key)) return;
    scoredRounds.current.add(key);
    submitScore({
      gameId: 'checkers',
      mode: 'online',
      uid,
      name: displayName,
      value: 1,
    }).catch(() => scoredRounds.current.delete(key));
  }, [game, uid, displayName]);

  if (!game) {
    return (
      <Screen title="Checkers" subtitle="Play a family member" onBack={onBack}>
        <OnlineLobby
          kind="checkers"
          uid={uid}
          games={games}
          busy={busy}
          error={error}
          joinAs="as Black"
          onHost={host}
          onResume={resume}
          onJoin={join}
        />
      </Screen>
    );
  }

  const myColour = game.state?.players?.[uid];
  const opponentUid = game.players.find((p) => p !== uid);
  const opponentName = opponentUid ? game.names[opponentUid] : null;
  const waiting = game.status === 'waiting';
  const myTurn = game.status === 'active' && game.turn === uid;
  const last =
    game.state?.lastFrom != null && game.state?.lastTo != null
      ? { from: game.state.lastFrom, to: game.state.lastTo }
      : null;

  return (
    <Screen
      title="Checkers"
      subtitle={opponentName ? `vs ${opponentName}` : 'Waiting…'}
      onBack={onBack}
    >
      {error && <div className="ck-error card">{error}</div>}

      <div className="ck-scorebar">
        <div className="ck-tally">
          <span className="ck-tally-label">
            You {myColour ? `(${LABEL[myColour]})` : ''}
          </span>
          <span className="ck-tally-value">{game.wins[uid] ?? 0}</span>
        </div>
        <div className="ck-tally">
          <span className="ck-tally-label">Pieces</span>
          <span className="ck-tally-value">
            {myColour
              ? `${countPieces(board, myColour)}-${countPieces(
                  board,
                  myColour === 'r' ? 'b' : 'r'
                )}`
              : '—'}
          </span>
        </div>
        <div className="ck-tally">
          <span className="ck-tally-label">{opponentName ?? 'Opponent'}</span>
          <span className="ck-tally-value">
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

      {game.status === 'active' ? (
        <TurnBanner
          active={myTurn}
          label={myTurn ? 'Your turn' : `${opponentName ?? 'Opponent'}'s turn`}
          hint={
            !myTurn || !myColour
              ? undefined
              : chainFrom !== null
              ? 'Jump again with the same piece.'
              : legalMoves(board, myColour).some((m) => m.captured !== null)
              ? 'You have a jump — you have to take it.'
              : undefined
          }
          accent={myColour ? PLAYER_HEX[myTurn ? myColour : myColour === 'r' ? 'b' : 'r'] : undefined}
        />
      ) : (
        <p
          className={`ck-status ${game.status === 'done' ? 'settled' : ''}`}
          aria-live="polite"
        >
          {waiting && (
            <IconSpinner className="ck-status-spinner" aria-hidden="true" />
          )}
          {waiting
            ? 'Waiting for someone to join…'
            : game.winnerUid === uid
            ? 'You win!'
            : `${opponentName} wins`}
        </p>
      )}

      <CheckersBoard
        board={board}
        player={myColour ?? 'r'}
        chainFrom={chainFrom}
        selected={selected}
        last={last}
        disabled={!myTurn}
        flipped={myColour === 'b'}
        onSelect={setSelected}
        onMove={(from, to) => {
          setSelected(null);
          move({ from, to });
        }}
      />

      {game.status === 'done' && (
        <div className="ck-result card">
          <h3>{game.winnerUid === uid ? 'You win!' : `${opponentName} wins`}</h3>
          <button className="btn btn-primary" onClick={rematch}>
            Rematch
          </button>
        </div>
      )}

      <button className="btn btn-text ck-leave" onClick={leave}>
        {waiting ? 'Cancel this game' : 'Leave game'}
      </button>
    </Screen>
  );
}
