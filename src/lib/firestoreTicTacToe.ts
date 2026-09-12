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
import { LINES, other, type Mark } from './ticTacToeEngine';

/** The board travels as a 9-character string ('-' for an empty square)
 * rather than an array: it's one atomic field to write, it reads clearly in
 * the Firestore console, and it sidesteps array-merge semantics entirely. */
export const EMPTY_BOARD = '---------';

export type OnlineStatus = 'waiting' | 'active' | 'done';

export interface OnlineGame {
  id: string;
  gameId: 'tictactoe';
  status: OnlineStatus;
  players: string[];
  names: Record<string, string>;
  marks: Record<string, Mark>;
  board: string;
  /** uid of whoever moves next. */
  turn: string;
  outcome: 'win' | 'draw' | null;
  winnerUid: string | null;
  line: number[] | null;
  /** Rounds won per uid across this table's rematches. */
  wins: Record<string, number>;
  draws: number;
  createdBy: string;
  updatedAt: Date | null;
}

function toGame(id: string, data: Record<string, unknown>): OnlineGame {
  const updatedAt = data.updatedAt as { toDate?: () => Date } | undefined;
  return {
    id,
    gameId: 'tictactoe',
    status: (data.status as OnlineStatus) ?? 'waiting',
    players: (data.players as string[]) ?? [],
    names: (data.names as Record<string, string>) ?? {},
    marks: (data.marks as Record<string, Mark>) ?? {},
    board: (data.board as string) ?? EMPTY_BOARD,
    turn: (data.turn as string) ?? '',
    outcome: (data.outcome as 'win' | 'draw' | null) ?? null,
    winnerUid: (data.winnerUid as string | null) ?? null,
    line: (data.line as number[] | null) ?? null,
    wins: (data.wins as Record<string, number>) ?? {},
    draws: (data.draws as number) ?? 0,
    createdBy: (data.createdBy as string) ?? '',
    updatedAt: updatedAt?.toDate ? updatedAt.toDate() : null,
  };
}

/** Opens a table and waits for someone to sit down opposite. The host takes
 * X and therefore the first move. */
export async function createOnlineGame(
  uid: string,
  name: string
): Promise<string> {
  if (!db) throw new Error('Firebase is not configured');
  const ref = await addDoc(collection(db, 'games'), {
    gameId: 'tictactoe',
    status: 'waiting',
    players: [uid],
    names: { [uid]: name },
    marks: { [uid]: 'X' },
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

/** Tables still waiting for an opponent. Ordered newest-first and capped —
 * a family will never have many of these open at once. */
export function watchOpenGames(
  onChange: (games: OnlineGame[]) => void,
  onError: (error: unknown) => void
) {
  if (!db) return () => {};
  const q = query(
    collection(db, 'games'),
    where('gameId', '==', 'tictactoe'),
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

export function watchGame(
  gameId: string,
  onChange: (game: OnlineGame | null) => void,
  onError: (error: unknown) => void
) {
  if (!db) return () => {};
  return onSnapshot(
    doc(db, 'games', gameId),
    (snap) => onChange(snap.exists() ? toGame(snap.id, snap.data()) : null),
    onError
  );
}

/** Sits down at a waiting table as O. Runs in a transaction so two people
 * tapping Join at the same moment can't both end up in the game. */
export async function joinOnlineGame(
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
    if (game.players.includes(uid)) return; // already in — treat as a no-op
    if (game.status !== 'waiting' || game.players.length >= 2) {
      throw new Error('Someone else just took that seat.');
    }
    tx.update(ref, {
      status: 'active',
      players: [...game.players, uid],
      names: { ...game.names, [uid]: name },
      marks: { ...game.marks, [uid]: 'O' },
      updatedAt: serverTimestamp(),
    });
  });
}

function lineFor(board: string, mark: Mark): number[] | null {
  for (const line of LINES) {
    if (line.every((i) => board[i] === mark)) return line;
  }
  return null;
}

/** Plays a square. All validation happens inside the transaction against
 * the server's copy, so a stale client (or a double-tap racing the
 * snapshot) can't move out of turn or overwrite an occupied square. */
export async function playOnlineMove(
  gameId: string,
  uid: string,
  index: number
): Promise<void> {
  if (!db) throw new Error('Firebase is not configured');
  const ref = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('That game is gone.');
    const game = toGame(snap.id, snap.data());

    if (game.status !== 'active') return;
    if (game.turn !== uid) return;
    if (game.board[index] !== '-') return;

    const mark = game.marks[uid];
    if (!mark) return;

    const board =
      game.board.slice(0, index) + mark + game.board.slice(index + 1);
    const line = lineFor(board, mark);
    const full = !board.includes('-');
    const opponent = game.players.find((p) => p !== uid) ?? uid;

    // If exactly one square remains, whoever moves next has no choice which
    // square they take — so the outcome for that forced move is already
    // knowable, and a draw can be called now instead of after that tap.
    const emptyIndex = board.indexOf('-');
    const oneLeft = emptyIndex !== -1 && board.indexOf('-', emptyIndex + 1) === -1;
    const nextMark = other(mark);
    const forcedDraw =
      oneLeft &&
      !lineFor(
        board.slice(0, emptyIndex) + nextMark + board.slice(emptyIndex + 1),
        nextMark
      );

    if (line) {
      tx.update(ref, {
        board,
        status: 'done',
        outcome: 'win',
        winnerUid: uid,
        line,
        wins: { ...game.wins, [uid]: (game.wins[uid] ?? 0) + 1 },
        updatedAt: serverTimestamp(),
      });
    } else if (full) {
      tx.update(ref, {
        board,
        status: 'done',
        outcome: 'draw',
        winnerUid: null,
        line: null,
        draws: game.draws + 1,
        updatedAt: serverTimestamp(),
      });
    } else if (forcedDraw) {
      const filled =
        board.slice(0, emptyIndex) + nextMark + board.slice(emptyIndex + 1);
      tx.update(ref, {
        board: filled,
        status: 'done',
        outcome: 'draw',
        winnerUid: null,
        line: null,
        draws: game.draws + 1,
        updatedAt: serverTimestamp(),
      });
    } else {
      tx.update(ref, {
        board,
        turn: opponent,
        updatedAt: serverTimestamp(),
      });
    }
  });
}

/** Starts the next round at the same table, swapping marks so the first-move
 * advantage alternates. Either player can trigger it; running in a
 * transaction makes a double-tap from both players idempotent. */
export async function rematchOnlineGame(gameId: string): Promise<void> {
  if (!db) throw new Error('Firebase is not configured');
  const ref = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('That game is gone.');
    const game = toGame(snap.id, snap.data());
    if (game.status !== 'done' || game.players.length < 2) return;

    const swapped: Record<string, Mark> = {};
    for (const p of game.players) swapped[p] = game.marks[p] === 'X' ? 'O' : 'X';
    const nextStarter = game.players.find((p) => swapped[p] === 'X');

    tx.update(ref, {
      board: EMPTY_BOARD,
      status: 'active',
      outcome: null,
      winnerUid: null,
      line: null,
      marks: swapped,
      turn: nextStarter ?? game.players[0],
      updatedAt: serverTimestamp(),
    });
  });
}

/** Closes a table nobody ever joined. */
export async function cancelOnlineGame(gameId: string): Promise<void> {
  if (!db) return;
  await deleteDoc(doc(db, 'games', gameId));
}
