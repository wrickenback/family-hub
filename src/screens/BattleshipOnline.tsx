import { useEffect, useRef, useState } from 'react';
import { Screen } from '../components/Screen';
import { OnlineLobby } from '../components/OnlineLobby';
import { IdleClaim } from '../components/IdleClaim';
import { BsPlacementBoard } from '../components/BsPlacementBoard';
import { ShipHull } from '../components/ShipHull';
import { IconSpinner } from '../components/icons';
import {
  EMPTY_FLEET,
  FLEET,
  GRID,
  colOf,
  isFleetComplete,
  placedShipIds,
  randomFleet,
  rowOf,
  shipAt,
  shipCellIndexes,
  shipPlacements,
  sunkShipIds,
  type Orientation,
  type ShipId,
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
  const { game, games, busy, error, host, join, resume, leave, forfeit, rematch, claimWin } =
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
      onClaim={claimWin}
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
  const remaining = FLEET.filter((s) => !placed.has(s.id));
  const opponentReady = opponentUidReady(game, uid);
  const complete = isFleetComplete(fleet);

  const handleReady = () => {
    if (!complete || ready) return;
    setReady(true);
    onPlace(fleet);
  };

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
            : `Fleet locked in. Waiting for ${opponentName ?? 'your opponent'}…`
          : complete
          ? 'All 5 ships placed — hit Ready for battle.'
          : `Drag your ships onto the grid — ${remaining.length} to go`}
      </p>

      {ready ? (
        <BsGrid fleet={fleet} shots={[]} showShips="all" mode="defend" onCell={() => {}} />
      ) : (
        <>
          <p className="bs-place-hint">
            Drag a ship from below onto the water. Ships can touch, but never
            overlap — drag one again to move it.
          </p>
          <BsPlacementBoard
            fleet={fleet}
            orientation={orientation}
            onChange={setFleet}
            onRotate={() => setOrientation((o) => (o === 'h' ? 'v' : 'h'))}
          />
          <button
            className="btn btn-text bs-random-btn"
            onClick={() => setFleet(randomFleet())}
          >
            Or place them for me
          </button>
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
  onClaim,
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
  onClaim: () => void;
  onLeave: () => void;
  onBack: () => void;
}) {
  const [myFleet, setMyFleet] = useState<BsFleetDoc | null>(null);
  const [enemyFleet, setEnemyFleet] = useState<BsFleetDoc | null>(null);

  // The two boards page horizontally instead of stacking — see
  // .bs-grids/.bs-grid-section in BattleshipGame.css. activePage tracks
  // which one is in view so the tabs can highlight it and the "your move"
  // pulse knows whether to bother.
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [activePage, setActivePage] = useState<'enemy' | 'mine'>('enemy');

  const goToPage = (page: 'enemy' | 'mine') => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ left: page === 'enemy' ? 0 : el.clientWidth, behavior: 'smooth' });
    setActivePage(page);
  };

  const handleGridsScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const page = el.scrollLeft > el.clientWidth / 2 ? 'mine' : 'enemy';
    setActivePage((prev) => (prev === page ? prev : page));
  };

  const myShots = game.shots[uid] ?? [];
  const theirShots = game.shots[opponentUid] ?? [];
  const myTurn = game.status === 'active' && game.turn === uid;
  // Signals rather than moves: it's genuinely your move and you're not
  // looking at the board that needs it. Clears itself the instant you
  // swipe or tap over — nothing ever scrolls you there automatically,
  // since that instant is also when the opponent's shot just landed on
  // your own fleet and you might still be reading it.
  const needsAttention = myTurn && activePage !== 'enemy';

  // Both sides' sunk ships are worked out from the layouts this screen
  // already holds plus the shot history, so nothing extra has to be synced
  // to know what has gone down.
  const enemySunk = enemyFleet
    ? sunkShipIds(enemyFleet.ships, myShots)
    : new Set<ShipId>();
  const mySunk = myFleet
    ? sunkShipIds(myFleet.ships, theirShots)
    : new Set<ShipId>();

  const cellsOfSunk = (fleet: string | undefined, sunk: Set<ShipId>) => {
    const cells = new Set<number>();
    if (!fleet) return cells;
    [...fleet].forEach((c, i) => {
      if (c !== '-' && sunk.has(c as ShipId)) cells.add(i);
    });
    return cells;
  };
  const enemySunkCells = cellsOfSunk(enemyFleet?.ships, enemySunk);
  const mySunkCells = cellsOfSunk(myFleet?.ships, mySunk);

  // The last shot, when it finished a ship off, named so it can be said out
  // loud rather than left as five anonymous hit markers.
  const last = game.lastResult;
  const sinkNotice = (() => {
    if (!last || last.result !== 'sunk') return null;
    const mine = last.by === uid;
    const targetFleet = mine ? enemyFleet?.ships : myFleet?.ships;
    if (!targetFleet) return null;
    const id = shipAt(targetFleet, last.index);
    const name = FLEET.find((f) => f.id === id)?.name;
    if (!name) return null;
    return {
      mine,
      text: mine
        ? `You sank ${opponentName ? `${opponentName}'s` : 'their'} ${name}!`
        : `${opponentName ?? 'They'} sank your ${name}.`,
    };
  })();

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

      <IdleClaim
        status={game.status}
        turn={game.turn}
        updatedAt={game.updatedAt}
        uid={uid}
        opponentName={opponentName}
        onClaim={onClaim}
      />

      <div className="bs-scorebar">
        <div className="bs-tally">
          <span className="bs-tally-label">You</span>
          <span className="bs-tally-value">{game.wins[uid] ?? 0}</span>
        </div>
        <div className="bs-tally">
          <span className="bs-tally-label">Sunk</span>
          <span className="bs-tally-value">
            {enemySunk.size}&ndash;{mySunk.size}
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

      {/* Two 10x10 grids don't fit on a phone at once, so this rides along
          at the top of the scroll: whose turn it is and what just sank are
          exactly the things you need while looking at either board. */}
      <div className="bs-sticky">
        {game.status === 'active' && (
          <div
            className={`bs-turn ${myTurn ? 'mine' : 'theirs'}`}
            aria-live="polite"
          >
            {myTurn
              ? 'Your turn — fire at enemy waters'
              : `Waiting for ${opponentName ?? 'your opponent'} to fire`}
          </div>
        )}

        {/* Across a table you'd just say "you sank my battleship". */}
        {sinkNotice && (
          <div
            className={`bs-sink-notice ${sinkNotice.mine ? 'mine' : 'theirs'}`}
            aria-live="polite"
          >
            {sinkNotice.text}
          </div>
        )}

        {/* Doubles as the two boards' labels now that they no longer both
            fit on screen at once — tapping either jumps straight there,
            swiping does the same thing natively. The active tab reads
            reversed-out; "Enemy Waters" pulses (reusing the turn banner's
            own glow) when it's your move and you're not looking at it. */}
        <div className="bs-pager-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activePage === 'enemy'}
            className={`bs-pager-tab ${activePage === 'enemy' ? 'active' : ''} ${
              needsAttention ? 'pulse' : ''
            }`}
            onClick={() => goToPage('enemy')}
          >
            Enemy Waters
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activePage === 'mine'}
            className={`bs-pager-tab ${activePage === 'mine' ? 'active' : ''}`}
            onClick={() => goToPage('mine')}
          >
            Your Fleet
          </button>
        </div>
      </div>

      <div className="bs-grids" ref={scrollerRef} onScroll={handleGridsScroll}>
        <div className="bs-grid-section">
          <FleetChips sunk={enemySunk} label={`${opponentName ?? 'Their'} fleet`} />
          <BsGrid
            fleet={enemyFleet?.ships ?? EMPTY_FLEET}
            shots={myShots}
            sunkCells={enemySunkCells}
            showShips="sunk"
            mode="fire"
            interactive={myTurn && game.status === 'active'}
            onCell={onFire}
          />
        </div>
        <div className="bs-grid-section">
          <FleetChips sunk={mySunk} label="Your fleet" />
          <BsGrid
            fleet={myFleet?.ships ?? EMPTY_FLEET}
            shots={theirShots}
            sunkCells={mySunkCells}
            showShips="all"
            mode="defend"
            onCell={() => {}}
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

/** Which ships are still afloat, at a glance. Replaces a "hits to win
 * 7/17" counter that was accurate but told you nothing about what you'd
 * actually destroyed. */
function FleetChips({ sunk, label }: { sunk: Set<ShipId>; label: string }) {
  return (
    <div className="bs-fleet-chips" aria-label={label}>
      {FLEET.map((ship) => (
        <span
          key={ship.id}
          className={`bs-fleet-chip ship-${ship.id.toLowerCase()} ${
            sunk.has(ship.id) ? 'sunk' : ''
          }`}
        >
          {ship.name}
        </span>
      ))}
    </div>
  );
}

// ---------- shared grid renderer ----------

/** The one grid component for every phase. `mode` decides what a cell
 * shows: placement previews, your own ships under fire, or the enemy waters
 * you're shooting into. */
export function BsGrid({
  fleet,
  shots,
  sunkCells,
  showShips = 'none',
  mode,
  interactive = false,
  previewShip = null,
  previewOrientation = 'h',
  onCell,
}: {
  fleet: string;
  shots: number[];
  /** Cells belonging to ships that have been fully destroyed. */
  sunkCells?: Set<number>;
  /** Draw hulls for every ship, only the wrecks, or none at all. */
  showShips?: 'all' | 'sunk' | 'none';
  mode: 'place' | 'defend' | 'fire';
  interactive?: boolean;
  previewShip?: ShipDef | null;
  previewOrientation?: Orientation;
  onCell: (index: number) => void;
}) {
  const shotSet = new Set(shots);

  // Hulls are drawn across the squares a ship occupies. Your own fleet shows
  // in full; enemy waters give up a hull only once it's been destroyed.
  const placements = showShips === 'none' ? [] : shipPlacements(fleet);
  const wreck = (id: (typeof placements)[number]['id']) =>
    shipCellIndexes(fleet, id).every((i) => sunkCells?.has(i));
  const hulls =
    showShips === 'all' ? placements : placements.filter((p) => wreck(p.id));
  // A cell under a hull stays water-coloured — the ship above it is the
  // thing being read, and doubling up just muddies both.
  const hulled = new Set<number>();
  hulls.forEach((p) => shipCellIndexes(fleet, p.id).forEach((i) => hulled.add(i)));
  // Placement preview: the next ship's shape is shown in the chip legend
  // below the grid, and each tap validates against the current orientation.
  // No hover-preview — this is a phone-first app.
  void previewShip;
  void previewOrientation;

  return (
    <div className="bs-board" role="grid" aria-label="Battleship grid">
      {hulls.length > 0 && (
        <div className="bs-hulls">
          {hulls.map((p) => (
            <ShipHull key={p.id} ship={p} sunk={wreck(p.id)} />
          ))}
        </div>
      )}
      {Array.from({ length: GRID * GRID }).map((_, index) => {
        const ship = fleet[index];
        const shot = shotSet.has(index);
        const hit = shot && ship !== '-' && ship !== 'X';
        // In fire mode the fleet string is the enemy layout — only reveal
        // cells that have actually been fired at.
        // A destroyed ship is revealed as a whole hull rather than staying
        // a scatter of anonymous hit marks.
        const isSunk = sunkCells?.has(index) ?? false;
        // Enemy waters never colour a cell by ship: a hit on a ship still
        // afloat must look like any other hit, or the shape and heading of
        // a half-found ship would be readable straight off the board. What
        // has actually sunk is the only thing given away, and that arrives
        // as a hull. (The red hit background happens to paint over a ship
        // colour today, but leaving the class on was one stylesheet
        // reordering away from leaking.)
        const showShipColour =
          mode !== 'fire' && !hulled.has(index) && ship !== '-' && ship !== 'X';
        const classes = [
          'bs-cell',
          showShipColour ? `ship-${ship.toLowerCase()}` : '',
          shot ? (hit ? 'shot-hit' : 'shot-miss') : '',
          isSunk ? 'sunk' : '',
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

