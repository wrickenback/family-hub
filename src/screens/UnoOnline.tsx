import { useEffect, useRef, useState } from 'react';
import { Screen } from '../components/Screen';
import { OnlineLobby } from '../components/OnlineLobby';
import { IdleClaim } from '../components/IdleClaim';
import { IconSpinner } from '../components/icons';
import { TurnBanner } from '../components/TurnBanner';
import { UnoCard, UnoColorChip, UnoColorPicker, UnoHand } from './UnoGame';
import {
  COLOR_HEX,
  anyPlayable,
  fromHandString,
  isWild,
  type CardCode,
  type Color,
  type PlayEvent,
} from '../lib/unoEngine';
import { unoRules, type DBUnoState, type UnoMove } from '../lib/onlineUno';
import { useOnlineGame } from '../lib/useOnlineGame';
import { submitScore } from '../lib/firestoreScores';
import { playClear, playGameOver, playPlace } from '../lib/sound';
import './UnoGame.css';

const EVENT_TEXT: Record<Exclude<PlayEvent, null>, string> = {
  skip: 'Skip! Go again.',
  draw2: '+2! They drew two — go again.',
  wild4: '+4! They drew four — go again.',
  wild: 'Wild — new colour picked.',
};

/** Two family members, two devices. Hands live in the same shared game
 * state everything else here does (see the trust-model note in
 * onlineUno.ts) — a technically determined sibling could inspect it, but
 * that's the same posture the rest of this app takes with "trusted family,
 * no field-level perms." */
export function UnoOnline({
  uid,
  displayName,
  onBack,
}: {
  uid: string;
  displayName: string;
  onBack: () => void;
}) {
  const { game, games, busy, error, host, join, resume, move, rematch, leave, claimWin } =
    useOnlineGame<DBUnoState>(unoRules, uid, displayName);

  const scoredRounds = useRef<Set<string>>(new Set());
  const [hasDrawn, setHasDrawn] = useState(false);
  const [pendingWild, setPendingWild] = useState<CardCode | null>(null);
  const lastEvent = useRef<PlayEvent>(null);

  // A fresh turn re-arms the one draw you're allowed. Watching the turn
  // alone wasn't enough: Skip, Reverse, +2 and +4 all hand the turn back to
  // the same player, so `turn` doesn't change and a player who had drawn
  // before playing one of them started their next turn unable to draw. The
  // played card is the signal that actually moves — a draw leaves it alone.
  useEffect(() => {
    setHasDrawn(false);
    setPendingWild(null);
  }, [game?.turn, game?.state?.topCard]);

  useEffect(() => {
    if (!game) return;
    const ev = game.state?.event ?? null;
    if (ev === lastEvent.current) return;
    lastEvent.current = ev;
    if (game.status === 'done') {
      game.winnerUid === uid ? playClear(4) : playGameOver();
    } else if (ev) {
      playClear(2);
    } else {
      playPlace();
    }
  }, [game, uid]);

  useEffect(() => {
    if (!game || game.status !== 'done' || game.outcome !== 'win') return;
    if (game.winnerUid !== uid) return;
    const key = `${game.id}:${game.wins[uid] ?? 0}`;
    if (scoredRounds.current.has(key)) return;
    scoredRounds.current.add(key);
    submitScore({
      gameId: 'uno',
      mode: 'online',
      uid,
      name: displayName,
      value: 1,
    }).catch(() => scoredRounds.current.delete(key));
  }, [game, uid, displayName]);

  if (!game) {
    return (
      <Screen title="Uno" subtitle="Play a family member" onBack={onBack}>
        <OnlineLobby
          kind="uno"
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

  const send = (m: UnoMove) => move(m);

  const myLetter = game.state?.players?.[uid];
  const opponentUid = game.players.find((p) => p !== uid);
  const opponentName = opponentUid ? game.names[opponentUid] : null;
  const waiting = game.status === 'waiting';
  const myTurn = game.status === 'active' && game.turn === uid;
  const myHand = fromHandString(
    (myLetter === 'B' ? game.state?.handB : game.state?.handA) ?? ''
  );
  const opponentCount = fromHandString(
    (myLetter === 'B' ? game.state?.handA : game.state?.handB) ?? ''
  ).length;
  const topCard = game.state?.topCard;
  const color = game.state?.color;
  const event = game.state?.event ?? null;
  const canDrawPlay =
    hasDrawn && topCard && color ? anyPlayable(myHand, topCard, color) : false;

  const handlePlay = (card: CardCode) => {
    if (!myTurn) return;
    if (isWild(card)) {
      setPendingWild(card);
      return;
    }
    send({ type: 'play', card });
  };

  return (
    <Screen
      title="Uno"
      subtitle={opponentName ? `vs ${opponentName}` : 'Waiting…'}
      onBack={onBack}
    >
      {error && <div className="uno-error card">{error}</div>}

      <div className="uno-scorebar">
        <div className="uno-tally">
          <span className="uno-tally-label">Your wins</span>
          <span className="uno-tally-value">{game.wins[uid] ?? 0}</span>
        </div>
        <div className="uno-tally">
          <span className="uno-tally-label">
            {opponentName ?? 'Opponent'}&rsquo;s wins
          </span>
          <span className="uno-tally-value">
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
          hint={event ? EVENT_TEXT[event] : undefined}
          accent={color ? COLOR_HEX[color] : undefined}
        />
      ) : (
        <p
          className={`uno-status ${game.status === 'done' ? 'settled' : ''}`}
          aria-live="polite"
        >
          {waiting && (
            <IconSpinner className="uno-status-spinner" aria-hidden="true" />
          )}
          {waiting
            ? 'Waiting for someone to join…'
            : game.winnerUid === uid
            ? 'You win!'
            : `${opponentName} wins`}
        </p>
      )}

      {!waiting && topCard && color && (
        <div className="uno-table">
          <div className="uno-opponent">
            <span className="uno-opponent-backs">
              {Array.from({ length: opponentCount }).map((_, i) => (
                <span key={i} className="uno-card-back" />
              ))}
            </span>
            <span>{opponentName ?? 'Opponent'}&rsquo;s cards</span>
          </div>
          <div className="uno-pile">
            <UnoCard card={topCard} />
            <UnoColorChip color={color} />
          </div>
          <button
            className="uno-draw-pile"
            onClick={() => {
              send({ type: 'draw' });
              setHasDrawn(true);
            }}
            disabled={!myTurn || hasDrawn}
            aria-label="Draw a card"
          >
            Draw
          </button>
        </div>
      )}

      {pendingWild && (
        <div className="card">
          <p className="uno-hand-label">Pick a colour</p>
          <UnoColorPicker
            onPick={(c: Color) => {
              send({ type: 'play', card: pendingWild, color: c });
              setPendingWild(null);
            }}
          />
        </div>
      )}

      {!waiting && game.status !== 'done' && !pendingWild && topCard && color && (
        <UnoHand
          hand={myHand}
          topCard={topCard}
          color={color}
          disabled={!myTurn}
          onPlay={(card) => handlePlay(card)}
        />
      )}

      {myTurn && hasDrawn && !canDrawPlay && game.status === 'active' && (
        <div className="uno-actions">
          <button
            className="btn btn-primary"
            onClick={() => send({ type: 'pass' })}
          >
            End turn
          </button>
        </div>
      )}

      {game.status === 'done' && (
        <div className="uno-result card">
          <h3>{game.winnerUid === uid ? 'You win!' : `${opponentName} wins`}</h3>
          <button className="btn btn-primary" onClick={rematch}>
            Rematch
          </button>
        </div>
      )}

      <button className="btn btn-text uno-leave" onClick={leave}>
        {waiting ? 'Cancel this game' : 'Leave game'}
      </button>
    </Screen>
  );
}
