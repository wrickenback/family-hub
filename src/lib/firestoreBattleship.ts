import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit as fbLimit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  TOTAL_SHIP_CELLS,
  applyShot,
  isFleetComplete,
  type ShotResult,
} from './battleshipEngine';

/** Same /games collection and lobby lifecycle as Tic Tac Toe and Connect 4.
 * The difference is hidden information: each player's fleet lives in a
 * per-player subdocument (games/{id}/players/{uid}) that only its owner can
 * write, and which the rules let the two players at the table read. The
 * shared doc holds only public state — whose turn it is, where everyone has
 * fired, and the outcome.
 *
 * A fleet subdoc is written once during placement and never touched again;
 * shots are recorded on the shared doc, so firing a shot never writes to
 * the opponent's subdoc. */

export type BsStatus = 'waiting' | 'placing' | 'active' | 'done';

export interface OnlineBsGame {
  id: string;
  status: BsStatus;
  players: string[];
  names: Record<string, string>;
  /** uid of whoever fires next. */
  turn: string;
  /** Each player's shot indexes at their opponent, in firing order. */
  shots: Record<string, number[]>;
  /** The most recent shot, for a toast/sound on the receiving device. */
  lastResult: { by: string; index: number; result: ShotResult } | null;
  /** Which players have locked in a fleet during placement. */
  ready: Record<string, boolean>;
  outcome: 'win' | null;
  winnerUid: string | null;
  /** Rounds won per uid across this table's rematches. */
  wins: Record<string, number>;
  createdBy: string;
  updatedAt: Date | null;
}

export interface BsFleetDoc {
  ships: string;
  placed: boolean;
}

function toGame(id: string, data: Record<string, unknown>): OnlineBsGame {
  const updatedAt = data.updatedAt as { toDate?: () => Date } | undefined;
  return {
    id,
    status: (data.status as BsStatus) ?? 'waiting',
    players: (data.players as string[]) ?? [],
    names: (data.names as Record<string, string>) ?? {},
    turn: (data.turn as string) ?? '',
    shots: (data.shots as Record<string, number[]>) ?? {},
    lastResult: (data.lastResult as OnlineBsGame['lastResult']) ?? null,
    ready: (data.ready as Record<string, boolean>) ?? {},
    outcome: (data.outcome as 'win' | null) ?? null,
    winnerUid: (data.winnerUid as string | null) ?? null,
    wins: (data.wins as Record<string, number>) ?? {},
    createdBy: (data.createdBy as string) ?? '',
    updatedAt: updatedAt?.toDate ? updatedAt.toDate() : null,
  };
}

export async function createBsGame(uid: string, name: string): Promise<string> {
  if (!db) throw new Error('Firebase is not configured');
  const ref = await addDoc(collection(db, 'games'), {
    gameId: 'battleship',
    status: 'waiting',
    players: [uid],
    names: { [uid]: name },
    turn: uid,
    shots: {},
    lastResult: null,
    ready: {},
    outcome: null,
    winnerUid: null,
    wins: {},
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export function watchOpenBsGames(
  onChange: (games: OnlineBsGame[]) => void,
  onError: (error: unknown) => void
) {
  if (!db) return () => {};
  const q = query(
    collection(db, 'games'),
    where('gameId', '==', 'battleship'),
    where('status', '==', 'waiting'),
    orderBy('createdAt', 'desc'),
    fbLimit(20)
  );
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map((d) => toGame(d.id, d.data()))),
    onError
  );
}

export function watchBsGame(
  gameId: string,
  onChange: (game: OnlineBsGame | null) => void,
  onError: (error: unknown) => void
) {
  if (!db) return () => {};
  return onSnapshot(
    doc(db, 'games', gameId),
    (snap) => onChange(snap.exists() ? toGame(snap.id, snap.data()) : null),
    onError
  );
}

/** The player's own fleet subdoc. Written once at placement, read back on
 * every device this account signs into. */
export function watchMyFleet(
  gameId: string,
  uid: string,
  onChange: (fleet: BsFleetDoc | null) => void,
  onError: (error: unknown) => void
) {
  if (!db) return () => {};
  return onSnapshot(
    doc(db, 'games', gameId, 'players', uid),
    (snap) =>
      onChange(
        snap.exists()
          ? { ships: (snap.data().ships as string) ?? '', placed: true }
          : null
      ),
    onError
  );
}

/** The opponent's fleet layout. Readable by the two players at the table
 * (see firestore.rules) — this is what lets the firing device compute
 * hit/miss locally and render the enemy grid without a server round-trip. */
export async function fetchOpponentFleet(
  gameId: string,
  opponentUid: string
): Promise<BsFleetDoc | null> {
  if (!db) return null;
  const snap = await getDoc(doc(db, 'games', gameId, 'players', opponentUid));
  if (!snap.exists()) return null;
  return { ships: (snap.data().ships as string) ?? '', placed: true };
}

/** Sits down at a waiting table. Both players then place fleets in secret
 * before the battle starts. */
export async function joinBsGame(
  gameId: string,
  uid: string,
  name: string
): Promise<void> {
  if (!db) throw new Error('Firebase is not configured');
  const ref = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('That game is gone.');
    const game = toGame(snap.id, snap.data());
    if (game.players.includes(uid)) return;
    if (game.status !== 'waiting' || game.players.length >= 2) {
      throw new Error('Someone else just took that seat.');
    }
    tx.update(ref, {
      status: 'placing',
      players: [...game.players, uid],
      names: { ...game.names, [uid]: name },
      updatedAt: serverTimestamp(),
    });
  });
}

/** Locks in a fleet during placement. When both players are ready the game
 * flips to active and the host fires first. */
export async function saveBsFleet(
  gameId: string,
  uid: string,
  ships: string
): Promise<void> {
  if (!db) throw new Error('Firebase is not configured');
  if (!isFleetComplete(ships)) throw new Error('Place all 5 ships first.');
  const fleetRef = doc(db, 'games', gameId, 'players', uid);
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error('That game is gone.');
    const game = toGame(snap.id, snap.data());

    tx.set(fleetRef, { ships, placed: true });

    if (game.status !== 'placing') return;
    const ready = { ...game.ready, [uid]: true };
    const bothReady =
      game.players.length === 2 && game.players.every((p) => ready[p]);
    tx.update(gameRef, {
      ready,
      ...(bothReady ? { status: 'active', turn: game.players[0] } : {}),
      updatedAt: serverTimestamp(),
    });
  });
}

/** Fires at a cell. The transaction reads the opponent's fleet subdoc to
 * resolve the shot, then records the result on the shared doc — the fleet
 * itself is never modified after placement. A shot at an already-fired cell
 * is a silent no-op, so a double-tap can't waste the turn or farm info. */
export async function fireBsShot(
  gameId: string,
  uid: string,
  index: number
): Promise<void> {
  if (!db) throw new Error('Firebase is not configured');
  const database = db;
  const gameRef = doc(database, 'games', gameId);
  await runTransaction(database, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error('That game is gone.');
    const game = toGame(snap.id, snap.data());

    if (game.status !== 'active' || game.turn !== uid) return;
    const opponentUid = game.players.find((p) => p !== uid);
    if (!opponentUid) return;
    if ((game.shots[uid] ?? []).includes(index)) return; // already fired here

    const fleetSnap = await tx.get(
      doc(database, 'games', gameId, 'players', opponentUid)
    );
    if (!fleetSnap.exists()) return; // opponent hasn't placed yet
    const fleet = (fleetSnap.data().ships as string) ?? '';
    if (!isFleetComplete(fleet)) return;

    const { outcome } = applyShot(fleet, index);
    const shots = {
      ...game.shots,
      [uid]: [...(game.shots[uid] ?? []), index],
    };

    if (outcome.won) {
      tx.update(gameRef, {
        shots,
        lastResult: { by: uid, index, result: outcome.result },
        status: 'done',
        outcome: 'win',
        winnerUid: uid,
        wins: { ...game.wins, [uid]: (game.wins[uid] ?? 0) + 1 },
        updatedAt: serverTimestamp(),
      });
    } else {
      tx.update(gameRef, {
        shots,
        lastResult: { by: uid, index, result: outcome.result },
        turn: opponentUid,
        updatedAt: serverTimestamp(),
      });
    }
  });
}

/** A player who leaves mid-battle forfeits — the opponent wins. Without
 * this, a leaver strands their opponent in an unwinnable waiting state. */
export async function forfeitBsGame(
  gameId: string,
  uid: string
): Promise<void> {
  if (!db) throw new Error('Firebase is not configured');
  const ref = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const game = toGame(snap.id, snap.data());
    if (game.status !== 'active' && game.status !== 'placing') return;
    const opponentUid = game.players.find((p) => p !== uid);
    if (!opponentUid) return;
    tx.update(ref, {
      status: 'done',
      outcome: 'win',
      winnerUid: opponentUid,
      wins: {
        ...game.wins,
        [opponentUid]: (game.wins[opponentUid] ?? 0) + 1,
      },
      updatedAt: serverTimestamp(),
    });
  });
}

/** Next round at the same table: fresh fleets, placement again, and the
 * previous round's loser fires first (the winner opened last time). */
export async function rematchBsGame(gameId: string): Promise<void> {
  if (!db) throw new Error('Firebase is not configured');
  const ref = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('That game is gone.');
    const game = toGame(snap.id, snap.data());
    if (game.status !== 'done' || game.players.length < 2) return;

    const nextStarter =
      game.winnerUid && game.players.includes(game.winnerUid)
        ? game.players.find((p) => p !== game.winnerUid) ?? game.players[0]
        : game.players[0];

    tx.update(ref, {
      status: 'placing',
      turn: nextStarter,
      shots: {},
      lastResult: null,
      ready: {},
      outcome: null,
      winnerUid: null,
      updatedAt: serverTimestamp(),
    });
  });
}

/** Deletes a lobby nobody joined. Fleet subdocs from finished rounds are
 * overwritten during the next rematch's placement, so no cleanup needed. */
export async function cancelBsGame(gameId: string): Promise<void> {
  if (!db) return;
  await deleteDoc(doc(db, 'games', gameId));
}

export const BS_TOTAL_HITS = TOTAL_SHIP_CELLS;