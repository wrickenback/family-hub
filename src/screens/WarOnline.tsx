import { useEffect, useRef } from 'react';
import { Screen } from '../components/Screen';
import { OnlineLobby } from '../components/OnlineLobby';
import { IdleClaim } from '../components/IdleClaim';
import { IconSpinner } from '../components/icons';
import { TurnBanner } from '../components/TurnBanner';
import { WarCard, WarHistory, WarProgress } from './WarGame';
import { MAX_ROUNDS, fromHandString } from '../lib/warEngine';
import { warRules, type WarState } from '../lib/onlineWar';
import { useBoardChange, useOnlineGame } from '../lib/useOnlineGame';
import { submitScore } from '../lib/firestoreScores';
import { playClear, playGameOver, playPlace } from '../lib/sound';
import './WarGame.css';

/** Two family members, two devices. There's no decision to make on a flip,
 * so "turn" here just alternates whose tap advances the round — see
 * onlineWar.ts. */
export function WarOnline({
  uid,
  displayName,
  onBack,
}: {
  uid: string;
  displayName: string;
  onBack: () => void;
}) {
  const { game, games, busy, error, host, join, resume, move, rematch, leave, claimWin } =
    useOnlineGame<WarState>(warRules, uid, displayName);

  const scoredRounds = useRef<Set<string>>(new Set());

  useBoardChange(game?.state?.handA, () => {
    if (!game) return;
    if (game.status === 'done') {
      game.outcome === 'win' && game.winnerUid === uid
        ? playClear(4)
        : playGameOver();
    } else if ((game.state?.reveals?.length ?? 0) > 1) {
      playClear(game.state.reveals.length);
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
      gameId: 'war',
      mode: 'online',
      uid,
      name: displayName,
      value: 1,
    }).catch(() => scoredRounds.current.delete(key));
  }, [game, uid, displayName]);

  if (!game) {
    return (
      <Screen title="War" subtitle="Play a family member" onBack={onBack}>
        <OnlineLobby
          kind="war"
          uid={uid}
          games={games}
          busy={busy}
          error={error}
          onHost={host}
          onResume={resume}
          onJoin={join}
        />
      </Screen>
    );
  }

  const myLetter = game.state?.players?.[uid];
  const opponentUid = game.players.find((p) => p !== uid);
  const opponentName = opponentUid ? game.names[opponentUid] : null;
  const waiting = game.status === 'waiting';
  const myTurn = game.status === 'active' && game.turn === uid;
  const myHand =
    myLetter === 'B' ? game.state?.handB : game.state?.handA;
  const theirHand =
    myLetter === 'B' ? game.state?.handA : game.state?.handB;
  const myCount = myHand ? fromHandString(myHand).length : 0;
  const theirCount = theirHand ? fromHandString(theirHand).length : 0;
  const reveals = game.state?.reveals ?? [];
  const rounds = game.state?.rounds ?? 0;
  const last = reveals[reveals.length - 1];
  const myCard = last ? (myLetter === 'B' ? last.b : last.a) : null;
  const theirCard = last ? (myLetter === 'B' ? last.a : last.b) : null;
  const roundWinner = game.state?.roundWinner ?? null;
  const iTookRound = roundWinner === myLetter;

  return (
    <Screen
      title="War"
      subtitle={opponentName ? `vs ${opponentName}` : 'Waiting…'}
      onBack={onBack}
    >
      {error && <div className="war-error card">{error}</div>}

      <div className="war-scorebar">
        <div className="war-tally">
          <span className="war-tally-label">Your wins</span>
          <span className="war-tally-value">{game.wins[uid] ?? 0}</span>
        </div>
        <div className="war-tally">
          <span className="war-tally-label">
            {opponentName ?? 'Opponent'}&rsquo;s wins
          </span>
          <span className="war-tally-value">
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
        <>
          <TurnBanner
            active={myTurn}
            label={myTurn ? 'Your turn to flip' : `${opponentName ?? 'They'} flip next`}
            hint={
              reveals.length > 1
                ? "It's a war!"
                : rounds >= MAX_ROUNDS
                ? 'Sudden death — next flip to lead takes it'
                : `Round ${rounds + 1} of ${MAX_ROUNDS}`
            }
          />
          <WarProgress rounds={rounds} />
        </>
      ) : (
        <p
          className={`war-status ${game.status === 'done' ? 'settled' : ''}`}
          aria-live="polite"
        >
          {waiting && (
            <IconSpinner className="war-status-spinner" aria-hidden="true" />
          )}
          {waiting
            ? 'Waiting for someone to join…'
            : game.winnerUid === uid
            ? 'You win!'
            : `${opponentName} wins`}
        </p>
      )}

      <div className="war-table">
        <div className="war-side">
          <span className="war-side-label">You</span>
          <WarCard card={myCard} flipping={!!last} winner={!!last && iTookRound} />
          <span className="war-pile-count">{myCount} cards</span>
        </div>
        <span className="war-vs">VS</span>
        <div className="war-side">
          <span className="war-side-label">{opponentName ?? 'Opponent'}</span>
          <WarCard
            card={theirCard}
            flipping={!!last}
            winner={!!last && !iTookRound && roundWinner !== null}
          />
          <span className="war-pile-count">{theirCount} cards</span>
        </div>
      </div>

      <WarHistory reveals={reveals} />

      {game.status === 'active' && (
        <button
          className="btn btn-primary war-flip-btn"
          onClick={() => move(null)}
          disabled={!myTurn}
        >
          {myTurn ? 'Flip' : `Waiting on ${opponentName ?? 'them'}`}
        </button>
      )}

      {game.status === 'done' && (
        <div className="war-result card">
          <h3>{game.winnerUid === uid ? 'You win!' : `${opponentName} wins`}</h3>
          <p className="war-note">
            {myCount === 0 || theirCount === 0
              ? 'Took the whole deck.'
              : `Most cards after ${rounds} rounds: ${myCount}–${theirCount}.`}
          </p>
          <button className="btn btn-primary" onClick={rematch}>
            Rematch
          </button>
        </div>
      )}

      <button className="btn btn-text war-leave" onClick={leave}>
        {waiting ? 'Cancel this game' : 'Leave game'}
      </button>
    </Screen>
  );
}
