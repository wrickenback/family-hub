import { useEffect, useRef } from 'react';
import { Screen } from '../components/Screen';
import { OnlineLobby } from '../components/OnlineLobby';
import { IdleClaim } from '../components/IdleClaim';
import { IconSpinner } from '../components/icons';
import { DBBoard } from './DotsAndBoxesGame';
import { EMPTY_EDGES, tally } from '../lib/dotsAndBoxesEngine';
import { dotsAndBoxesRules, type DBState } from '../lib/onlineDotsAndBoxes';
import { useBoardChange, useOnlineGame } from '../lib/useOnlineGame';
import { submitScore } from '../lib/firestoreScores';
import { playClear, playGameOver, playPlace } from '../lib/sound';
import './DotsAndBoxesGame.css';

const LABEL: Record<string, string> = { A: 'Purple', B: 'Orange' };

/** Two family members, two devices. Completing a box grants another turn,
 * so `game.turn` staying put on your own uid after a move is the normal
 * "go again" case, not a bug — see onlineDotsAndBoxes.ts. */
export function DotsAndBoxesOnline({
  uid,
  displayName,
  onBack,
}: {
  uid: string;
  displayName: string;
  onBack: () => void;
}) {
  const { game, games, busy, error, host, join, resume, move, rematch, leave, claimWin } =
    useOnlineGame<DBState>(dotsAndBoxesRules, uid, displayName);

  const scoredRounds = useRef<Set<string>>(new Set());

  useBoardChange(game?.state?.edges, (next) => {
    if (!game) return;
    if (game.status === 'active' && next === EMPTY_EDGES) return; // rematch reset
    if (game.status === 'done') {
      game.outcome === 'win' && game.winnerUid === uid
        ? playClear(4)
        : playGameOver();
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
      gameId: 'dotsandboxes',
      mode: 'online',
      uid,
      name: displayName,
      value: 1,
    }).catch(() => scoredRounds.current.delete(key));
  }, [game, uid, displayName]);

  if (!game) {
    return (
      <Screen
        title="Dots and Boxes"
        subtitle="Play a family member"
        onBack={onBack}
      >
        <OnlineLobby
          kind="dotsandboxes"
          uid={uid}
          games={games}
          busy={busy}
          error={error}
          joinAs="as Orange"
          onHost={host}
          onResume={resume}
          onJoin={join}
        />
      </Screen>
    );
  }

  const edges = game.state?.edges ?? EMPTY_EDGES;
  const boxes = game.state?.boxes ?? '';
  const myLetter = game.state?.players?.[uid];
  const opponentUid = game.players.find((p) => p !== uid);
  const opponentName = opponentUid ? game.names[opponentUid] : null;
  const waiting = game.status === 'waiting';
  const myTurn = game.status === 'active' && game.turn === uid;
  const counts = tally(boxes);

  return (
    <Screen
      title="Dots and Boxes"
      subtitle={opponentName ? `vs ${opponentName}` : 'Waiting…'}
      onBack={onBack}
    >
      {error && <div className="db-error card">{error}</div>}

      <div className="db-scorebar">
        <div className="db-tally">
          <span className="db-tally-label">
            You {myLetter ? `(${LABEL[myLetter]})` : ''}
          </span>
          <span className="db-tally-value">{game.wins[uid] ?? 0}</span>
        </div>
        <div className="db-tally">
          <span className="db-tally-label">Draws</span>
          <span className="db-tally-value">{game.draws}</span>
        </div>
        <div className="db-tally">
          <span className="db-tally-label">{opponentName ?? 'Opponent'}</span>
          <span className="db-tally-value">
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
        className={`db-status ${game.status === 'done' ? 'settled' : ''}`}
        aria-live="polite"
      >
        {waiting && (
          <IconSpinner className="db-status-spinner" aria-hidden="true" />
        )}
        {waiting
          ? 'Waiting for someone to join…'
          : game.status === 'done'
          ? game.outcome === 'draw'
            ? `Draw — ${counts.A}-${counts.B}`
            : game.winnerUid === uid
            ? 'You win!'
            : `${opponentName} wins`
          : myTurn
          ? `Your turn (${counts.A}-${counts.B})`
          : `${opponentName ?? 'Opponent'}'s turn (${counts.A}-${counts.B})`}
      </p>

      <DBBoard
        edges={edges}
        boxes={boxes}
        lastEdge={game.state?.lastEdge ?? null}
        disabled={!myTurn}
        onDraw={(edge) => move(edge)}
      />

      {game.status === 'done' && (
        <div className="db-result card">
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

      <button className="btn btn-text db-leave" onClick={leave}>
        {waiting ? 'Cancel this game' : 'Leave game'}
      </button>
    </Screen>
  );
}
