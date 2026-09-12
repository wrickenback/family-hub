import {
  addDoc,
  collection,
  deleteDoc,
  doc,
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
  EMPTY_BOARD,
  dropDisc,
  isFull,
  winningLine,
  type Disc,
} from './connectFourEngine';

/** Same document shape and lifecycle as the Tic Tac Toe online game (and
 * the same /games collection and security rules) — only the board encoding
 * and win rule differ. The existing games composite index covers this query
 * too, since it's keyed on gameId first. */
export type OnlineStatus = 'waiting' | 'active' | 'done';

export interface OnlineC4Game {
  id: string;
  status: OnlineStatus;
  players: string[];
  names: Record<string, string>;
  discs: Record<string, Disc>;
  board: string;
  turn: string;
  outcome: 'win' | 'draw' | null;
  winnerUid: string | null;
  line: number[] | null;
  wins: Record<string, number>;
  draws: number;
  createdBy: string;
}

function toGame(id: string, data: Record<string, unknown>): OnlineC4Game {
  return {
    id,
    status: (data.status as OnlineStatus) ?? 'waiting',
    players: (data.players as string[]) ?? [],
    names: (data.names as Record<string, string>) ?? {},
    discs: (data.discs as Record<string, Disc>) ?? {},
    board: (data.board as string) ?? EMPTY_BOARD,
    turn: (data.turn as string) ?? '',
    outcome: (data.outcome as 'win' | 'draw' | null) ?? null,
    winnerUid: (data.winnerUid as string | null) ?? null,
    line: (data.line as number[] | null) ?? null,
    wins: (data.wins as Record<string, number>) ?? {},
    draws: (data.draws as number) ?? 0,
    createdBy: (data.createdBy as string) ?? '',
  };
}

/** Opens a table. The host takes red and therefore the first move. */
export async function createC4Game(uid: string, name: string): Promise<string> {
  if (!db) throw new Error('Firebase is not configured');
  const ref = await addDoc(collection(db, 'games'), {
    gameId: 'connect4',
    status: 'waiting',
    players: [uid],
    names: { [uid]: name },
    discs: { [uid]: 'R' },
    board: EMPTY_BOARD,
    turn: uid,
    outcome: null,
    winnerUid: null,
    line: null,
    wins: {},
    draws: 0,
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export function watchOpenC4Games(
  onChange: (games: OnlineC4Game[]) => void,
  onError: (error: unknown) => void
) {
  if (!db) return () => {};
  const q = query(
    collection(db, 'games'),
    where('gameId', '==', 'connect4'),
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

export function watchC4Game(
  gameId: string,
  onChange: (game: OnlineC4Game | null) => void,
  onError: (error: unknown) => void
) {
  if (!db) return () => {};
  return onSnapshot(
    doc(db, 'games', gameId),
    (snap) => onChange(snap.exists() ? toGame(snap.id, snap.data()) : null),
    onError
  );
}

export async function joinC4Game(
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
      status: 'active',
      players: [...game.players, uid],
      names: { ...game.names, [uid]: name },
      discs: { ...game.discs, [uid]: 'Y' },
      updatedAt: serverTimestamp(),
    });
  });
}

/** Drops a disc. Validated inside the transaction against the server's copy
 * so a stale client can't play out of turn or into a full column. */
export async function playC4Move(
  gameId: string,
  uid: string,
  col: number
): Promise<void> {
  if (!db) throw new Error('Firebase is not configured');
  const ref = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('That game is gone.');
    const game = toGame(snap.id, snap.data());

    if (game.status !== 'active' || game.turn !== uid) return;
    const disc = game.discs[uid];
    if (!disc) return;

    const dropped = dropDisc(game.board, col, disc);
    if (!dropped) return; // column full

    const line = winningLine(dropped.board);
    const opponent = game.players.find((p) => p !== uid) ?? uid;

    if (line) {
      tx.update(ref, {
        board: dropped.board,
        status: 'done',
        outcome: 'win',
        winnerUid: uid,
        line,
        wins: { ...game.wins, [uid]: (game.wins[uid] ?? 0) + 1 },
        updatedAt: serverTimestamp(),
      });
    } else if (isFull(dropped.board)) {
      tx.update(ref, {
        board: dropped.board,
        status: 'done',
        outcome: 'draw',
        winnerUid: null,
        line: null,
        draws: game.draws + 1,
        updatedAt: serverTimestamp(),
      });
    } else {
      tx.update(ref, {
        board: dropped.board,
        turn: opponent,
        updatedAt: serverTimestamp(),
      });
    }
  });
}

/** Next round at the same table, swapping colours so the first-move
 * advantage alternates. */
export async function rematchC4Game(gameId: string): Promise<void> {
  if (!db) throw new Error('Firebase is not configured');
  const ref = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('That game is gone.');
    const game = toGame(snap.id, snap.data());
    if (game.status !== 'done' || game.players.length < 2) return;

    const swapped: Record<string, Disc> = {};
    for (const p of game.players) swapped[p] = game.discs[p] === 'R' ? 'Y' : 'R';
    const nextStarter = game.players.find((p) => swapped[p] === 'R');

    tx.update(ref, {
      board: EMPTY_BOARD,
      status: 'active',
      outcome: null,
      winnerUid: null,
      line: null,
      discs: swapped,
      turn: nextStarter ?? game.players[0],
      updatedAt: serverTimestamp(),
    });
  });
}

export async function cancelC4Game(gameId: string): Promise<void> {
  if (!db) return;
  await deleteDoc(doc(db, 'games', gameId));
}
