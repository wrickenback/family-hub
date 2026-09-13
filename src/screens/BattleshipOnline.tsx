import { useEffect, useRef, useState } from 'react';
import { Screen } from '../components/Screen';
import { OnlineLobby } from '../components/OnlineLobby';
import { IconSpinner } from '../components/icons';
import {
  EMPTY_FLEET,
  FLEET,
  GRID,
  colOf,
  isFleetComplete,
  placeShip,
  placedShipIds,
  randomFleet,
  rowOf,
  shipCells,
  type Orientation,
  type ShipDef,
} from '../lib/battleshipEngine';
import {
  battleshipRules,
  bsView,
  clearFleets,
  fetchFleet,
  fireShot,
  saveFleet,
  watchFleet,
  type BsFleetDoc,
  type BsGameView,
  type BsState,
} from '../lib/onlineBattleship';
import { useOnlineGame } from '../lib/useOnlineGame';
import { submitScore } from '../lib/firestoreScores';
import { playClear, playGameOver, playPlace } from '../lib/sound';
import './BattleshipGame.css';

/** Two family members, two devices. Public state (turn, shots, outcome)
 * lives in the shared Realtime Database node; each player's fleet sits in a
 * separate node so a glance at /games can't spill ship positions. */
export function BattleshipOnline({
  uid,
  displayName,
  onBack,
}: {
  uid: string;
  displayName: string;
  onBack: () => void;
}) {
  const { game, games, busy, error, host, join, resume, leave, forfeit, rematch } =
    useOnlineGame<BsState>(battleshipRules, uid, displayName);

  const scoredRounds = useRef<Set<string>>(new Set());
  const prevShotCount = useRef(0);

  // ---------- lobby ----------

  if (!game) {
    return (
      <Screen title="Battleship" subtitle="Play a family member" onBack={onBack}>
        <OnlineLobby
          kind="battleship"
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

  // ---------- at a table ----------

  const view = bsView(game);
  const opponentUid = game.players.find((p) => p !== uid);
  const opponentName = opponentUid ? game.names[opponentUid] : null;

  // Walking out of a live battle is a forfeit — otherwise the opponent is
  // stranded waiting on someone who has gone.
  const handleLeave = () => {
    prevShotCount.current = 0;
    if (game.status === 'active' || game.status === 'placing') forfeit();
    else leave();
  };

  const handleRematch = async () => {
    // Fleets are cleared first so both players land back in placement with
    // an empty grid rather than last round's ships.
    await clearFleets(game);
    prevShotCount.current = 0;
    rematch();
  };

  if (game.status === 'waiting') {
    return (
      <Screen
        title="Battleship"
        subtitle={opponentName ? `vs ${opponentName}` : 'Waiting…'}
        onBack={onBack}
      >
        {error && <div className="bs-error card">{error}</div>}
        <p className="bs-status" aria-live="polite">
          <IconSpinner className="bs-status-spinner" aria-hidden="true" />
          Waiting for someone to join…
        </p>
        <button className="btn btn-text bs-leave" onClick={handleLeave}>
          Cancel this game
        </button>
      </Screen>
    );
  }

  if (game.status === 'placing') {
    return (
      <PlacementPhase
        game={view}
        uid={uid}
        opponentName={opponentName}
        busy={busy}
        error={error}
        onPlace={(ships) => {
          saveFleet(game.id, uid, ships).catch(() => {});
        }}
        onLeave={handleLeave}
        onBack={onBack}
      />
    );
  }

  return (
    <BattlePhase
      game={view}
      uid={uid}
      opponentUid={opponentUid ?? ''}
      opponentName={opponentName}
      displayName={displayName}
      error={error}
      scoredRounds={scoredRounds}
      prevShotCount={prevShotCount}
      onFire={(index) => {
        fireShot(game.id, uid, index).catch(() => {});
      }}
      onRematch={handleRematch}
      onLeave={handleLeave}
      onBack={onBack}
    />
  );
}

// ---------- placement ----------

function PlacementPhase({
  game,
  uid,
  opponentName,
  busy,
  error,
  onPlace,
  onLeave,
  onBack,
}: {
  game: BsGameView;
  uid: string;
  opponentName: string | null;
  busy: boolean;
  error: string | null;
  onPlace: (ships: string) => void;
  onLeave: () => void;
  onBack: () => void;
}) {
  const [fleet, setFleet] = useState(EMPTY_FLEET);
  const [orientation, setOrientation] = useState<Orientation>('h');
  const [ready, setReady] = useState(false);

  const placed = placedShipIds(fleet);
  const nextShip = FLEET.find((s) => !placed.has(s.id)) ?? null;
  const opponentReady = opponentUidReady(game, uid);

  const handleCell = (index: number) => {
    if (!nextShip || ready) return;
    const cells = shipCells(fleet, nextShip, rowOf(index), colOf(index), orientation);
    if (!cells) return;
    setFleet(placeShip(fleet, nextShip, rowOf(index), colOf(index), orientation));
  };

  const handleReady = () => {
    if (!isFleetComplete(fleet) || ready) return;
    setReady(true);
    onPlace(fleet);
  };

  const complete = isFleetComplete(fleet);

  return (
    <Screen
      title="Battleship"
      subtitle={opponentName ? `vs ${opponentName}` : 'Placing…'}
      onBack={onBack}
    >
      {error && <div className="bs-error card">{error}</div>}

      <p className="bs-status" aria-live="polite">
        {ready
          ? opponentReady
            ? 'Both fleets ready — battle starting…'
            : 'Fleet locked in. Waiting for your opponent…'
          : 'Place your 5 ships. They can touch, but never overlap.'}
      </p>

      <BsGrid
        fleet={fleet}
        shots={[]}
        mode="place"
        previewShip={ready ? null : nextShip}
        previewOrientation={orientation}
        onCell={handleCell}
      />

      {!ready && (
        <>
          <div className="bs-ship-row">
            {FLEET.map((ship) => (
              <span
                key={ship.id}
                className={`bs-ship-chip ${
                  placed.has(ship.id) ? 'placed' : 'pending'
                }`}
              >
                {ship.name} ({ship.size})
              </span>
            ))}
          </div>
          <div className="bs-place-actions">
            <button
              className="btn btn-text"
              onClick={() =>
                setOrientation((o) => (o === 'h' ? 'v' : 'h'))
              }
            >
              {orientation === 'h' ? 'Horizontal ⟷' : 'Vertical ↕'}
            </button>
            <button
              className="btn btn-text"
              onClick={() => setFleet(EMPTY_FLEET)}
              disabled={!complete && fleet === EMPTY_FLEET}
            >
              Clear
            </button>
            <button
              className="btn btn-text"
              onClick={() => setFleet(randomFleet())}
            >
              Random
            </button>
          </div>
          <button
            className="btn btn-primary blocks-play-btn"
            disabled={!complete || busy}
            onClick={handleReady}
          >
            {busy ? 'Locking in…' : 'Ready for battle'}
          </button>
        </>
      )}

      <button className="btn btn-text bs-leave" onClick={onLeave}>
        Forfeit and leave
      </button>
    </Screen>
  );
}

function opponentUidReady(game: BsGameView, uid: string): boolean {
  const opponent = game.players.find((p) => p !== uid);
  return opponent ? game.ready[opponent] === true : false;
}

// ---------- battle ----------

function BattlePhase({
  game,
  uid,
  opponentUid,
  opponentName,
  displayName,
  error,
  scoredRounds,
  prevShotCount,
  onFire,
  onRematch,
  onLeave,
  onBack,
}: {
  game: BsGameView;
  uid: string;
  opponentUid: string;
  opponentName: string | null;
  displayName: string;
  error: string | null;
  scoredRounds: { current: Set<string> };
  prevShotCount: { current: number };
  onFire: (index: number) => void;
  onRematch: () => void;
  onLeave: () => void;
  onBack: () => void;
}) {
  const [myFleet, setMyFleet] = useState<BsFleetDoc | null>(null);
  const [enemyFleet, setEnemyFleet] = useState<BsFleetDoc | null>(null);

  const myShots = game.shots[uid] ?? [];
  const theirShots = game.shots[opponentUid] ?? [];
  const myTurn = game.status === 'active' && game.turn === uid;

  // Own fleet, live (it's ours to read).
  useEffect(() => {
    return watchFleet(game.id, uid, setMyFleet);
  }, [game.id, uid]);

  // The opponent's layout, fetched when the battle starts (and again after
  // each rematch re-places fleets). One read per battle — shots are tracked
  // on the shared doc, so the layout itself never changes mid-round.
  useEffect(() => {
    if (game.status !== 'active' && game.status !== 'done') return;
    let cancelled = false;
    fetchFleet(game.id, opponentUid).then((fleet) => {
      if (!cancelled) setEnemyFleet(fleet);
    });
    return () => {
      cancelled = true;
    };
  }, [game.id, game.status, opponentUid]);

  // Sound on any shot resolving — ours or theirs.
  useEffect(() => {
    const total = myShots.length + theirShots.length;
    const previous = prevShotCount.current;
    prevShotCount.current = total;
    if (total <= previous) return;
    const last = game.lastResult;
    if (!last) return;
    if (last.by === uid) {
      if (last.result === 'sunk') playClear(3);
      else if (last.result === 'hit') playClear(1);
      else playPlace();
    } else {
      playGameOver();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myShots.length, theirShots.length]);

  // Winner reports their own win — same pattern as Tic Tac Toe / Connect 4.
  useEffect(() => {
    if (game.status !== 'done' || game.winnerUid !== uid) return;
    const key = `${game.id}:${game.wins[uid] ?? 0}`;
    if (scoredRounds.current.has(key)) return;
    scoredRounds.current.add(key);
    submitScore({
      gameId: 'battleship',
      mode: 'online',
      uid,
      name: displayName,
      value: 1,
    }).catch(() => scoredRounds.current.delete(key));
  }, [game, uid, displayName, scoredRounds]);

  const statusText = () => {
    if (game.status === 'done') {
      return game.winnerUid === uid
        ? 'You win! Fleet destroyed.'
        : `${opponentName ?? 'Opponent'} sank your whole fleet.`;
    }
    if (!myFleet?.placed) return 'Placing your fleet…';
    return myTurn
      ? 'Your turn — tap a square to fire!'
      : `Waiting for ${opponentName ?? 'opponent'} to fire…`;
  };

  return (
    <Screen
      title="Battleship"
      subtitle={opponentName ? `vs ${opponentName}` : undefined}
      onBack={onBack}
    >
      {error && <div className="bs-error card">{error}</div>}

      <div className="bs-scorebar">
        <div className="bs-tally">
          <span className="bs-tally-label">You</span>
          <span className="bs-tally-value">{game.wins[uid] ?? 0}</span>
        </div>
        <div className="bs-tally">
          <span className="bs-tally-label">Hits to win</span>
          <span className="bs-tally-value">
            {myShots.filter((i) => enemyFleet && enemyFleet.ships[i] !== '-')
              .length}
            /17
          </span>
        </div>
        <div className="bs-tally">
          <span className="bs-tally-label">{opponentName ?? 'Opponent'}</span>
          <span className="bs-tally-value">{game.wins[opponentUid] ?? 0}</span>
        </div>
      </div>

      <p
        className={`bs-status ${game.status === 'done' ? 'settled' : ''}`}
        aria-live="polite"
      >
        {statusText()}
      </p>

      <div className="bs-grids">
        <div className="bs-grid-section">
          <span className="bs-grid-label">Your fleet</span>
          <BsGrid
            fleet={myFleet?.ships ?? EMPTY_FLEET}
            shots={theirShots}
            mode="defend"
            onCell={() => {}}
          />
        </div>
        <div className="bs-grid-section">
          <span className="bs-grid-label">Enemy waters</span>
          <BsGrid
            fleet={enemyFleet?.ships ?? EMPTY_FLEET}
            shots={myShots}
            mode="fire"
            interactive={myTurn}
            onCell={onFire}
          />
        </div>
      </div>

      {game.status === 'done' && (
        <div className="bs-result card">
          <h3>{game.winnerUid === uid ? 'You win!' : `${opponentName} wins`}</h3>
          <button className="btn btn-primary" onClick={onRematch}>
            Rematch
          </button>
        </div>
      )}

      <button className="btn btn-text bs-leave" onClick={onLeave}>
        {game.status === 'done' ? 'Leave table' : 'Forfeit and leave'}
      </button>
    </Screen>
  );
}

// ---------- shared grid renderer ----------

/** The one grid component for every phase. `mode` decides what a cell
 * shows: placement previews, your own ships under fire, or the enemy waters
 * you're shooting into. */
export function BsGrid({
  fleet,
  shots,
  mode,
  interactive = false,
  previewShip = null,
  previewOrientation = 'h',
  onCell,
}: {
  fleet: string;
  shots: number[];
  mode: 'place' | 'defend' | 'fire';
  interactive?: boolean;
  previewShip?: ShipDef | null;
  previewOrientation?: Orientation;
  onCell: (index: number) => void;
}) {
  const shotSet = new Set(shots);
  // Placement preview: the next ship's shape is shown in the chip legend
  // below the grid, and each tap validates against the current orientation.
  // No hover-preview — this is a phone-first app.
  void previewShip;
  void previewOrientation;

  return (
    <div className="bs-board" role="grid" aria-label="Battleship grid">
      {Array.from({ length: GRID * GRID }).map((_, index) => {
        const ship = fleet[index];
        const shot = shotSet.has(index);
        const hit = shot && ship !== '-' && ship !== 'X';
        // In fire mode the fleet string is the enemy layout — only reveal
        // cells that have actually been fired at.
        const reveal = mode === 'fire' ? shot : true;
        const classes = [
          'bs-cell',
          reveal && ship !== '-' && ship !== 'X' ? `ship-${ship.toLowerCase()}` : '',
          shot ? (hit ? 'shot-hit' : 'shot-miss') : '',
          mode === 'fire' && interactive ? 'fireable' : '',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <button
            key={index}
            className={classes}
            onClick={() => onCell(index)}
            disabled={!interactive || shot}
            aria-label={`Row ${rowOf(index) + 1}, column ${colOf(index) + 1}`}
          />
        );
      })}
    </div>
  );
}

