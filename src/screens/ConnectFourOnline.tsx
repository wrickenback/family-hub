import { useEffect, useRef, useState } from 'react';
import { Screen } from '../components/Screen';
import { OnlineLobby } from '../components/OnlineLobby';
import { IdleClaim } from '../components/IdleClaim';
import { IconSpinner } from '../components/icons';
import { C4Board } from './ConnectFourGame';
import { EMPTY_BOARD } from '../lib/connectFourEngine';
import { connectFourRules, type C4State } from '../lib/onlineConnectFour';
import { useBoardChange, useOnlineGame } from '../lib/useOnlineGame';
import { submitScore } from '../lib/firestoreScores';
import { playClear, playGameOver, playPlace } from '../lib/sound';
import './ConnectFourGame.css';

const LABEL: Record<string, string> = { R: 'Red', Y: 'Yellow' };

/** Two family members, two devices. The board lives in the Realtime
 * Database, and the landing slot of the last disc is synced along with it —
 * so the drop animation and win celebration play on *both* phones, not just
 * the one that tapped. */
export function ConnectFourOnline({
  uid,
  displayName,
  onBack,
}: {
  uid: string;
  displayName: string;
  onBack: () => void;
}) {
  const { game, games, busy, error, host, join, resume, move, rematch, leave, claimWin } =
    useOnlineGame<C4State>(connectFourRules, uid, displayName);

  const scoredRounds = useRef<Set<string>>(new Set());
  const [celebrating, setCelebrating] = useState(false);

  useEffect(() => {
    if (celebrating) {
      const timer = setTimeout(() => setCelebrating(false), 2200);
      return () => clearTimeout(timer);
    }
  }, [celebrating]);

  // Sound and celebration both hang off the synced board, so the opponent's
  // drop is as audible and as animated here as our own.
  useBoardChange(game?.state?.board, (next) => {
    if (!game) return;
    if (game.status === 'active' && next === EMPTY_BOARD) return; // rematch reset
    if (game.status === 'done') {
      if (game.outcome === 'win') {
        setCelebrating(true);
        game.winnerUid === uid ? playClear(4) : playGameOver();
      } else {
        playGameOver();
      }
    } else {
      playPlace();
    }
  });

  useEffect(() => {
    if (!game || game.status !== 'done' || game.outcome !== 'win') return;
    if (game.winnerUid !== uid) return;
    const key = `${game.id}:${game.wins[uid] ?? 0}`;
    if (scoredRounds.current.has(key)) return;
    scoredRounds.current.add(key);
    submitScore({
      gameId: 'connect4',
      mode: 'online',
      uid,
      name: displayName,
      value: 1,
    }).catch(() => scoredRounds.current.delete(key));
  }, [game, uid, displayName]);

  // ---------- lobby ----------

  if (!game) {
    return (
      <Screen title="Connect 4" subtitle="Play a family member" onBack={onBack}>
        <OnlineLobby
          kind="connect4"
          uid={uid}
          games={games}
          busy={busy}
          error={error}
          joinAs="as Yellow"
          onHost={host}
          onResume={resume}
          onJoin={join}
        />
      </Screen>
    );
  }

  // ---------- at a table ----------

  const board = game.state?.board ?? EMPTY_BOARD;
  const myDisc = game.state?.discs?.[uid];
  const opponentUid = game.players.find((p) => p !== uid);
  const opponentName = opponentUid ? game.names[opponentUid] : null;
  const waiting = game.status === 'waiting';
  const myTurn = game.status === 'active' && game.turn === uid;

  return (
    <Screen
      title="Connect 4"
      subtitle={opponentName ? `vs ${opponentName}` : 'Waiting…'}
      onBack={onBack}
    >
      {error && <div className="c4-error card">{error}</div>}

      <div className="c4-scorebar">
        <div className="c4-tally">
          <span className="c4-tally-label">
            You {myDisc ? `(${LABEL[myDisc]})` : ''}
          </span>
          <span className="c4-tally-value">{game.wins[uid] ?? 0}</span>
        </div>
        <div className="c4-tally">
          <span className="c4-tally-label">Draws</span>
          <span className="c4-tally-value">{game.draws}</span>
        </div>
        <div className="c4-tally">
          <span className="c4-tally-label">{opponentName ?? 'Opponent'}</span>
          <span className="c4-tally-value">
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

      <p
        className={`c4-status ${game.status === 'done' ? 'settled' : ''}`}
        aria-live="polite"
      >
        {waiting && (
          <IconSpinner className="c4-status-spinner" aria-hidden="true" />
        )}
        {waiting
          ? 'Waiting for someone to join…'
          : game.status === 'done'
          ? game.outcome === 'draw'
            ? 'Draw — board full'
            : game.winnerUid === uid
            ? 'You win!'
            : `${opponentName} wins`
          : myTurn
          ? 'Your turn'
          : `${opponentName ?? 'Opponent'}'s turn`}
      </p>

      <C4Board
        board={board}
        winning={game.state?.line ?? []}
        disabled={!myTurn}
        celebrating={celebrating}
        lastDroppedIndex={game.state?.lastIndex ?? null}
        turn={myTurn ? myDisc : undefined}
        onDrop={(col) => move(col)}
      />

      {game.status === 'done' && (
        <div className="c4-result card">
          <h3>
            {game.outcome === 'draw'
              ? 'Draw'
              : game.winnerUid === uid
              ? 'You win!'
              : `${opponentName} wins`}
          </h3>
          <button className="btn btn-primary" onClick={rematch}>
            Rematch
          </button>
        </div>
      )}

      <button className="btn btn-text c4-leave" onClick={leave}>
        {waiting ? 'Cancel this game' : 'Leave game'}
      </button>
    </Screen>
  );
}
