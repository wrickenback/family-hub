import {
  get,
  limitToLast,
  onValue,
  orderByChild,
  push,
  query,
  ref,
  remove,
  runTransaction,
  serverTimestamp,
  update,
} from 'firebase/database';
import { rtdb } from './firebase';

/** One generic multiplayer core shared by every online game.
 *
 * Live game state lives in the Realtime Database, not Firestore. A move has
 * to appear on the other person's phone in milliseconds, and RTDB both
 * pushes smaller deltas and re-establishes its socket faster after a phone
 * sleeps — which is where the old Firestore setup lost whole seconds.
 *
 * It also hands us optimistic play for free: an RTDB transaction applies to
 * the local cache and fires listeners *before* it reaches the server, so
 * your own move paints instantly and still can't race the opponent's. */

export type GameKind = 'tictactoe' | 'connect4' | 'battleship';
export type OnlineStatus = 'waiting' | 'placing' | 'active' | 'done';
export type Outcome = 'win' | 'draw' | null;

export interface OnlineGame<S = unknown> {
  id: string;
  kind: GameKind;
  status: OnlineStatus;
  /** Seat order — index 0 hosted the table and takes the first turn. */
  players: string[];
  names: Record<string, string>;
  turn: string;
  outcome: Outcome;
  winnerUid: string | null;
  /** Rounds won per uid across this table's rematches. */
  wins: Record<string, number>;
  draws: number;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  /** Whatever the specific game needs — board, marks, fleets, winning line. */
  state: S;
}

/** The per-game half: the rules, and nothing about transport or lobbies. */
export interface GameRules<S> {
  kind: GameKind;
  initialState(players: string[]): S;
  /** Battleship sits in 'placing' until both fleets are down; others play. */
  statusOnJoin?: OnlineStatus;
  /** Return the updated game, or null to reject the move outright. */
  applyMove(game: OnlineGame<S>, uid: string, move: unknown): OnlineGame<S> | null;
  /** Fresh state for the next round; `starter` already alternates. */
  resetState(game: OnlineGame<S>, starter: string): S;
}

const GAMES = 'games';
/** A family will never have many tables going; one capped listener feeds the
 * lobby, the resume prompt and the home screen alike. */
const RECENT_LIMIT = 60;

function requireDb() {
  if (!rtdb) throw new Error('Firebase is not configured');
  return rtdb;
}

function toGame<S>(id: string, raw: Record<string, unknown>): OnlineGame<S> {
  const players = raw.players;
  return {
    id,
    kind: raw.kind as GameKind,
    status: (raw.status as OnlineStatus) ?? 'waiting',
    // RTDB hands back a sparse array as an object; normalise either shape.
    players: Array.isArray(players)
      ? players.filter(Boolean)
      : Object.values((players as Record<string, string>) ?? {}),
    names: (raw.names as Record<string, string>) ?? {},
    turn: (raw.turn as string) ?? '',
    outcome: (raw.outcome as Outcome) ?? null,
    winnerUid: (raw.winnerUid as string | null) ?? null,
    wins: (raw.wins as Record<string, number>) ?? {},
    draws: (raw.draws as number) ?? 0,
    createdBy: (raw.createdBy as string) ?? '',
    createdAt: (raw.createdAt as number) ?? 0,
    updatedAt: (raw.updatedAt as number) ?? 0,
    // The Realtime Database stores neither empty objects nor nulls, so a
    // game whose opening state is entirely empty (Battleship starts with no
    // shots and nobody ready) comes back with no `state` node at all.
    // Without this default, the first read of game.state.<anything> throws
    // inside a transaction callback, which aborts the write silently.
    state: (raw.state ?? {}) as S,
  };
}

/** Opens a table and waits for someone to sit down opposite. */
export async function createGame<S>(
  rules: GameRules<S>,
  uid: string,
  name: string
): Promise<string> {
  const db = requireDb();
  const node = push(ref(db, GAMES));
  await update(node, {
    kind: rules.kind,
    status: 'waiting',
    players: [uid],
    names: { [uid]: name },
    turn: uid,
    outcome: null,
    winnerUid: null,
    wins: {},
    draws: 0,
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    state: rules.initialState([uid]),
  });
  return node.key as string;
}

/** Sits down at a waiting table. Runs as a transaction so two people tapping
 * Join at the same moment can't both end up in the game. */
export async function joinGame<S>(
  rules: GameRules<S>,
  gameId: string,
  uid: string,
  name: string
): Promise<void> {
  const db = requireDb();
  const result = await runTransaction(ref(db, `${GAMES}/${gameId}`), (raw) => {
    if (!raw) return raw;
    const game = toGame<S>(gameId, raw);
    if (game.players.includes(uid)) return raw; // already seated — no-op
    if (game.status !== 'waiting' || game.players.length >= 2) return undefined;

    const players = [...game.players, uid];
    return {
      ...raw,
      status: rules.statusOnJoin ?? 'active',
      players,
      names: { ...game.names, [uid]: name },
      state: rules.initialState(players),
      updatedAt: Date.now(),
    };
  });
  if (!result.committed) throw new Error('Someone else just took that seat.');
}

/** Every recent table, newest last. Callers slice this into "open to join",
 * "my game in progress" and the home screen strip rather than each opening
 * their own listener. */
export function watchRecentGames(
  onChange: (games: OnlineGame[]) => void,
  onError?: (error: unknown) => void
) {
  if (!rtdb) return () => {};
  const q = query(
    ref(rtdb, GAMES),
    orderByChild('updatedAt'),
    limitToLast(RECENT_LIMIT)
  );
  return onValue(
    q,
    (snap) => {
      const games: OnlineGame[] = [];
      snap.forEach((child) => {
        games.push(toGame(child.key as string, child.val()));
      });
      games.reverse(); // newest first
      onChange(games);
    },
    (err) => onError?.(err)
  );
}

export function watchGame<S>(
  gameId: string,
  onChange: (game: OnlineGame<S> | null) => void,
  onError?: (error: unknown) => void
) {
  if (!rtdb) return () => {};
  return onValue(
    ref(rtdb, `${GAMES}/${gameId}`),
    (snap) =>
      onChange(snap.exists() ? toGame<S>(snap.key as string, snap.val()) : null),
    (err) => onError?.(err)
  );
}

export async function getGame<S>(gameId: string): Promise<OnlineGame<S> | null> {
  if (!rtdb) return null;
  const snap = await get(ref(rtdb, `${GAMES}/${gameId}`));
  return snap.exists() ? toGame<S>(snap.key as string, snap.val()) : null;
}

/** Plays a move. The rules decide legality; the transaction decides who wins
 * a race. Rejected moves abort without writing, so a stale client can't move
 * out of turn or onto an occupied square. */
export async function makeMove<S>(
  rules: GameRules<S>,
  gameId: string,
  uid: string,
  move: unknown
): Promise<void> {
  const db = requireDb();
  await runTransaction(ref(db, `${GAMES}/${gameId}`), (raw) => {
    if (!raw) return raw;
    const game = toGame<S>(gameId, raw);
    if (game.status !== 'active') return undefined;
    if (game.turn !== uid) return undefined;

    const next = rules.applyMove(game, uid, move);
    if (!next) return undefined;

    return {
      ...raw,
      status: next.status,
      turn: next.turn,
      outcome: next.outcome,
      winnerUid: next.winnerUid,
      wins: next.wins,
      draws: next.draws,
      state: next.state,
      updatedAt: Date.now(),
    };
  });
}

/** Writes game-specific state without it being a "move" — Battleship's fleet
 * placement, for instance. */
export async function patchState<S>(
  gameId: string,
  uid: string,
  patch: (game: OnlineGame<S>) => Partial<OnlineGame<S>> | null
): Promise<void> {
  const db = requireDb();
  await runTransaction(ref(db, `${GAMES}/${gameId}`), (raw) => {
    if (!raw) return raw;
    const game = toGame<S>(gameId, raw);
    if (!game.players.includes(uid)) return undefined;
    const next = patch(game);
    if (!next) return undefined;
    return { ...raw, ...next, updatedAt: Date.now() };
  });
}

/** Starts the next round at the same table, alternating who opens so the
 * first-move advantage evens out. Idempotent under a double-tap. */
export async function rematchGame<S>(
  rules: GameRules<S>,
  gameId: string
): Promise<void> {
  const db = requireDb();
  await runTransaction(ref(db, `${GAMES}/${gameId}`), (raw) => {
    if (!raw) return raw;
    const game = toGame<S>(gameId, raw);
    if (game.status !== 'done' || game.players.length < 2) return undefined;

    const starter =
      game.players.find((p) => p !== game.turn) ?? game.players[0];
    return {
      ...raw,
      status: rules.statusOnJoin ?? 'active',
      turn: starter,
      outcome: null,
      winnerUid: null,
      state: rules.resetState(game, starter),
      updatedAt: Date.now(),
    };
  });
}

export async function cancelGame(gameId: string): Promise<void> {
  if (!rtdb) return;
  await remove(ref(rtdb, `${GAMES}/${gameId}`));
}

/** How long an opponent can sit on their turn before the person waiting is
 * offered the win. Long enough to survive a school run or a phone in a
 * pocket; short enough that a table doesn't hang around all evening. */
export const IDLE_CLAIM_MS = 15 * 60 * 1000;

/** True when it's the opponent's move and they've gone quiet long enough to
 * claim against. `updatedAt` is stamped by whichever client moved last, so
 * a clock running ahead is treated as "just moved" rather than letting the
 * waiting player claim early off someone else's bad clock. */
export function opponentIsIdle(
  game: Pick<OnlineGame, 'status' | 'turn' | 'updatedAt'>,
  uid: string,
  now = Date.now()
): boolean {
  if (game.status !== 'active') return false;
  if (game.turn === uid) return false; // the hold-up is us
  if (!game.updatedAt || game.updatedAt > now) return false;
  return now - game.updatedAt > IDLE_CLAIM_MS;
}

/** Takes the win when the opponent has abandoned their turn. Re-checks the
 * idle window inside the transaction, so a move that lands while the button
 * is on screen quietly wins the race and the claim does nothing. */
export async function claimIdleWin(gameId: string, uid: string): Promise<void> {
  const db = requireDb();
  await runTransaction(ref(db, `${GAMES}/${gameId}`), (raw) => {
    if (!raw) return raw;
    const game = toGame(gameId, raw);
    if (!game.players.includes(uid)) return undefined;
    if (!opponentIsIdle(game, uid)) return undefined;
    return {
      ...raw,
      status: 'done',
      outcome: 'win',
      winnerUid: uid,
      wins: { ...game.wins, [uid]: (game.wins[uid] ?? 0) + 1 },
      updatedAt: Date.now(),
    };
  });
}

/** Concedes a game in progress so the opponent isn't left hanging. */
export async function forfeitGame(gameId: string, uid: string): Promise<void> {
  const db = requireDb();
  await runTransaction(ref(db, `${GAMES}/${gameId}`), (raw) => {
    if (!raw) return raw;
    const game = toGame(gameId, raw);
    if (game.status === 'done') return raw;
    const winner = game.players.find((p) => p !== uid) ?? null;
    return {
      ...raw,
      status: 'done',
      outcome: winner ? 'win' : 'draw',
      winnerUid: winner,
      wins: winner
        ? { ...game.wins, [winner]: (game.wins[winner] ?? 0) + 1 }
        : game.wins,
      updatedAt: Date.now(),
    };
  });
}

// ---------- handing a table off between screens ----------

/** The home screen can't join a table itself — joining belongs to the game
 * screen that knows the rules. So it parks the intent here and navigates;
 * the screen picks it up on mount and sits down without a second tap. */
const INTENT_KEY = 'familyhub:online:intent';

export interface TableIntent {
  kind: GameKind;
  gameId: string;
  action: 'join' | 'resume';
}

export function setPendingTable(intent: TableIntent) {
  try {
    sessionStorage.setItem(INTENT_KEY, JSON.stringify(intent));
  } catch {
    // Storage blocked — the lobby still lists the table to tap.
  }
}

/** Reads and clears the intent, so a later visit to the same screen doesn't
 * silently drop you back into a table you deliberately left. */
export function takePendingTable(kind: GameKind): TableIntent | null {
  try {
    const raw = sessionStorage.getItem(INTENT_KEY);
    if (!raw) return null;
    const intent = JSON.parse(raw) as TableIntent;
    if (intent?.kind !== kind || !intent.gameId) return null;
    sessionStorage.removeItem(INTENT_KEY);
    return intent;
  } catch {
    return null;
  }
}

// ---------- slicing the one listener ----------

/** Tables someone else has open and is waiting at. */
export function openTables(games: OnlineGame[], uid: string, kind?: GameKind) {
  return games.filter(
    (g) =>
      g.status === 'waiting' &&
      g.createdBy !== uid &&
      !g.players.includes(uid) &&
      (!kind || g.kind === kind)
  );
}

/** Your own table, still waiting for an opponent. */
export function myOpenTables(games: OnlineGame[], uid: string, kind?: GameKind) {
  return games.filter(
    (g) =>
      g.status === 'waiting' &&
      g.createdBy === uid &&
      (!kind || g.kind === kind)
  );
}

/** Games you're mid-way through — what a refresh needs to find, and what the
 * home screen offers to drop you back into. */
export function myGamesInPlay(games: OnlineGame[], uid: string, kind?: GameKind) {
  return games.filter(
    (g) =>
      (g.status === 'active' || g.status === 'placing') &&
      g.players.includes(uid) &&
      (!kind || g.kind === kind)
  );
}
