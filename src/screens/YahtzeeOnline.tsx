import { useEffect, useRef, useState } from 'react';
import { Screen } from '../components/Screen';
import { OnlineLobby } from '../components/OnlineLobby';
import { IdleClaim } from '../components/IdleClaim';
import { IconSpinner } from '../components/icons';
import { TurnBanner } from '../components/TurnBanner';
import { DiceTray, ScoreSheet } from './YahtzeeGame';
import {
  DICE_COUNT,
  NO_HOLDS,
  ROLLS_PER_TURN,
  grandTotal,
  toggleHold,
} from '../lib/yahtzeeEngine';
import { yahtzeeRules, type YState } from '../lib/onlineYahtzee';
import { useBoardChange, useOnlineGame } from '../lib/useOnlineGame';
import { submitScore } from '../lib/firestoreScores';
import { playClear, playGameOver, playPlace } from '../lib/sound';
import './YahtzeeGame.css';

/** Two family members, two devices. A turn spans several moves here — up to
 * three rolls, then one category — so unlike every other online game, seeing
 * `game.turn` stay on your own uid after a move is the normal case.
 *
 * Which dice are being kept is deliberately local rather than synced: it
 * changes on every tap, it only matters to the person holding the dice, and
 * syncing it would put a write on the wire for something that isn't a move
 * yet. It rides along with the roll instead. */
export function YahtzeeOnline({
  uid,
  displayName,
  onBack,
}: {
  uid: string;
  displayName: string;
  onBack: () => void;
}) {
  const { game, games, busy, error, host, join, resume, move, rematch, leave, claimWin } =
    useOnlineGame<YState>(yahtzeeRules, uid, displayName);

  const [held, setHeld] = useState(NO_HOLDS);
  const scoredRounds = useRef<Set<string>>(new Set());

  const dice = game?.state?.dice ?? '';
  const rollsLeft = game?.state?.rollsLeft ?? ROLLS_PER_TURN;

  // Dice clearing means a turn ended — on either phone — so nothing should
  // still be marked as kept.
  useEffect(() => {
    if (dice.length !== DICE_COUNT) setHeld(NO_HOLDS);
  }, [dice]);

  useBoardChange(dice, (next) => {
    if (!game) return;
    if (game.status === 'done') {
      game.outcome === 'win' && game.winnerUid === uid
        ? playClear(4)
        : playGameOver();
      return;
    }
    if (next.length === DICE_COUNT) playPlace();
  });

  useEffect(() => {
    if (!game || game.status !== 'done' || game.outcome !== 'win') return;
    if (game.winnerUid !== uid) return;
    const key = `${game.id}:${game.wins[uid] ?? 0}`;
    if (scoredRounds.current.has(key)) return;
    scoredRounds.current.add(key);
    submitScore({
      gameId: 'yahtzee',
      mode: 'online',
      uid,
      name: displayName,
      value: 1,
      extra: { points: grandTotal(game.state?.sheets?.[uid] ?? {}) },
    }).catch(() => scoredRounds.current.delete(key));
  }, [game, uid, displayName]);

  if (!game) {
    return (
      <Screen title="Yahtzee" subtitle="Play a family member" onBack={onBack}>
        <OnlineLobby
          kind="yahtzee"
          uid={uid}
          games={games}
          busy={busy}
          error={error}
          joinAs="as the second player"
          onHost={host}
          onResume={resume}
          onJoin={join}
        />
      </Screen>
    );
  }

  const opponentUid = game.players.find((p) => p !== uid);
  const opponentName = opponentUid ? game.names[opponentUid] : null;
  const waiting = game.status === 'waiting';
  const myTurn = game.status === 'active' && game.turn === uid;
  const sheets = game.state?.sheets ?? {};
  const myTotal = grandTotal(sheets[uid] ?? {});
  const theirTotal = opponentUid ? grandTotal(sheets[opponentUid] ?? {}) : 0;

  const seats = [
    { id: uid, name: 'You', sheet: sheets[uid] ?? {} },
    ...(opponentUid
      ? [
          {
            id: opponentUid,
            name: opponentName ?? 'Them',
            sheet: sheets[opponentUid] ?? {},
          },
        ]
      : []),
  ];

  return (
    <Screen
      title="Yahtzee"
      subtitle={opponentName ? `vs ${opponentName}` : 'Waiting…'}
      onBack={onBack}
    >
      {error && <div className="yz-error card">{error}</div>}

      <div className="yz-scorebar">
        <div className="yz-tally">
          <span className="yz-tally-label">You</span>
          <span className="yz-tally-value">{game.wins[uid] ?? 0}</span>
        </div>
        <div className="yz-tally">
          <span className="yz-tally-label">Draws</span>
          <span className="yz-tally-value">{game.draws}</span>
        </div>
        <div className="yz-tally">
          <span className="yz-tally-label">{opponentName ?? 'Opponent'}</span>
          <span className="yz-tally-value">
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
          label={`${
            myTurn ? 'Your turn' : `${opponentName ?? 'Opponent'}'s turn`
          } — ${myTotal}-${theirTotal}`}
          hint={
            !myTurn
              ? undefined
              : rollsLeft === ROLLS_PER_TURN
              ? 'Three rolls. Tap dice to keep them.'
              : rollsLeft > 0
              ? `${rollsLeft} roll${rollsLeft === 1 ? '' : 's'} left`
              : 'Out of rolls — take a box.'
          }
        />
      ) : (
        <p
          className={`yz-status ${game.status === 'done' ? 'settled' : ''}`}
          aria-live="polite"
        >
          {waiting && (
            <IconSpinner className="yz-status-spinner" aria-hidden="true" />
          )}
          {waiting
            ? 'Waiting for someone to join…'
            : game.outcome === 'draw'
            ? `Draw — ${myTotal} each`
            : game.winnerUid === uid
            ? 'You win!'
            : `${opponentName} wins`}
        </p>
      )}

      <DiceTray
        dice={dice}
        held={held}
        rollsLeft={rollsLeft}
        canRoll={myTurn}
        onHold={(i) => setHeld(toggleHold(held, i))}
        onRoll={() => move({ type: 'roll', held })}
      />

      <ScoreSheet
        seats={seats}
        activeSeat={myTurn ? uid : null}
        dice={dice}
        onScore={(category) => move({ type: 'score', category })}
      />

      {game.status === 'done' && (
        <div className="yz-result card">
          <h3>
            {game.outcome === 'draw'
              ? 'Draw'
              : game.winnerUid === uid
              ? 'You win!'
              : `${opponentName} wins`}
          </h3>
          <div className="yz-final">
            <div className="yz-final-seat">
              <span className="yz-final-name">You</span>
              <span className="yz-final-score">{myTotal}</span>
            </div>
            <div className="yz-final-seat">
              <span className="yz-final-name">{opponentName ?? 'Them'}</span>
              <span className="yz-final-score">{theirTotal}</span>
            </div>
          </div>
          <button className="btn btn-primary" onClick={rematch}>
            Rematch
          </button>
        </div>
      )}

      <button className="btn btn-text yz-leave" onClick={leave}>
        {waiting ? 'Cancel this game' : 'Leave game'}
      </button>
    </Screen>
  );
}
