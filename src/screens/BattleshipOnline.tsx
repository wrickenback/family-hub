import { useEffect, useRef, useState } from 'react';
import { Screen } from '../components/Screen';
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
  cancelBsGame,
  createBsGame,
  fetchOpponentFleet,
  fireBsShot,
  forfeitBsGame,
  joinBsGame,
  rematchBsGame,
  saveBsFleet,
  watchBsGame,
  watchMyFleet,
  watchOpenBsGames,
  type BsFleetDoc,
  type OnlineBsGame,
} from '../lib/firestoreBattleship';
import { submitScore } from '../lib/firestoreScores';
import { playClear, playGameOver, playPlace } from '../lib/sound';
import './BattleshipGame.css';

/** Two family members, two devices, synced through Firestore. Each player's
 * fleet lives in a private subdoc; the shared game doc carries only public
 * state (turn, shots, outcome). Mirrors the Connect 4 online screen. */
export function BattleshipOnline({
  uid,
  displayName,
  onBack,
}: {
  uid: string;
  displayName: string;
  onBack: () => void;
}) {
  const [gameId, setGameId] = useState<string | null>(null);
  const [game, setGame] = useState<OnlineBsGame | null>(null);
  const [openGames, setOpenGames] = useState<OnlineBsGame[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scoredRounds = useRef<Set<string>>(new Set());
  const prevShotCount = useRef(0);

  useEffect(() => {
    if (gameId) return;
    return watchOpenBsGames(setOpenGames, () => setOpenGames([]));
  }, [gameId]);

  useEffect(() => {
    if (!gameId) {
      setGame(null);
      return;
    }
    return watchBsGame(
      gameId,
      (g) => {
        if (!g) {
          setGameId(null);
          setGame(null);
          return;
        }
        setGame(g);
      },
      () => setError('Lost connection to that game.')
    );
  }, [gameId]);

  const guard = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const handleHost = () =>
    guard(async () => setGameId(await createBsGame(uid, displayName)));

  const handleJoin = (id: string) =>
    guard(async () => {
      await joinBsGame(id, uid, displayName);
      setGameId(id);
    });

  const handleLeave = () =>
    guard(async () => {
      if (game && game.createdBy === uid && game.status === 'waiting') {
        await cancelBsGame(game.id);
      } else if (game && (game.status === 'active' || game.status === 'placing')) {
        // Leaving a live battle is a forfeit — the opponent shouldn't be
        // stranded waiting on someone who's gone.
        await forfeitBsGame(game.id, uid);
      }
      setGameId(null);
      setGame(null);
      prevShotCount.current = 0;
    });

  // ---------- lobby ----------

  if (!gameId || !game) {
    const joinable = openGames.filter((g) => g.createdBy !== uid);
    const mine = openGames.filter((g) => g.createdBy === uid);

    return (
      <Screen title="Battleship" subtitle="Play a family member" onBack={onBack}>
        {error && <div className="bs-error card">{error}</div>}

        <button
          className="btn btn-primary blocks-play-btn"
          onClick={handleHost}
          disabled={busy}
        >
          {busy ? 'Opening…' : 'Start a game'}
        </button>

        {mine.length > 0 && (
          <>
            <div className="section-head">
              <span className="section-title">Your open game</span>
            </div>
            <ul className="bs-lobby">
              {mine.map((g) => (
                <li key={g.id}>
                  <button
                    className="bs-lobby-item card"
                    onClick={() => setGameId(g.id)}
                  >
                    <span className="bs-lobby-name">Waiting for an opponent</span>
                    <span className="bs-lobby-meta">Tap to reopen</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="section-head">
          <span className="section-title">Open games</span>
        </div>
        {joinable.length === 0 ? (
          <div className="card empty-state">
            Nobody&rsquo;s waiting right now. Start a game and it&rsquo;ll show
            up here for whoever opens the app next.
          </div>
        ) : (
          <ul className="bs-lobby">
            {joinable.map((g) => (
              <li key={g.id}>
                <button
                  className="bs-lobby-item card"
                  onClick={() => handleJoin(g.id)}
                  disabled={busy}
                >
                  <span className="bs-lobby-name">
                    {g.names[g.createdBy] ?? 'Someone'}
                  </span>
                  <span className="bs-lobby-meta">Tap to join</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Screen>
    );
  }

  // ---------- at a table ----------

  const opponentUid = game.players.find((p) => p !== uid);
  const opponentName = opponentUid ? game.names[opponentUid] : null;

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
        game={game}
        uid={uid}
        opponentName={opponentName}
        busy={busy}
        error={error}
        onPlace={(ships) => guard(() => saveBsFleet(game.id, uid, ships))}
        onLeave={handleLeave}
        onBack={onBack}
      />
    );
  }

  return (
    <BattlePhase
      game={game}
      uid={uid}
      opponentUid={opponentUid ?? ''}
      opponentName={opponentName}
      displayName={displayName}
      error={error}
      scoredRounds={scoredRounds}
      prevShotCount={prevShotCount}
      onFire={(index) => fireBsShot(game.id, uid, index).catch(() => {})}
      onRematch={() => rematchBsGame(game.id).catch(() => {})}
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
  game: OnlineBsGame;
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

function opponentUidReady(game: OnlineBsGame, uid: string): boolean {
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
  game: OnlineBsGame;
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
    // Imported lazily to avoid a circular import at module load.
    return watchMyFleet(game.id, uid, setMyFleet, () => {});
  }, [game.id, uid]);

  // The opponent's layout, fetched when the battle starts (and again after
  // each rematch re-places fleets). One read per battle — shots are tracked
  // on the shared doc, so the layout itself never changes mid-round.
  useEffect(() => {
    if (game.status !== 'active' && game.status !== 'done') return;
    let cancelled = false;
    fetchOpponentFleet(game.id, opponentUid).then((fleet) => {
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

