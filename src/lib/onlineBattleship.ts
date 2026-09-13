import { get, onValue, ref, remove, set } from 'firebase/database';
import { rtdb } from './firebase';
import {
  applyShot,
  isFleetComplete,
  type ShotResult,
} from './battleshipEngine';
import {
  getGame,
  makeMove,
  patchState,
  type GameRules,
  type OnlineGame,
} from './onlineGame';

/** Battleship's half of the online contract.
 *
 * Unlike the other two games there's hidden information, so fleets live
 * outside the shared game node at gameFleets/{gameId}/{uid} and the shared
 * node carries only public state — whose turn it is, where each player has
 * fired, and the outcome. A fleet is written once during placement and
 * never touched again, which is what makes it safe to resolve a shot
 * against a copy read outside the transaction: the thing being read cannot
 * change underneath us. */

export interface BsState {
  /** Each player's shot indexes at their opponent, in firing order. */
  shots: Record<string, number[]>;
  /** The most recent shot, for a toast/sound on the receiving device. */
  lastResult: { by: string; index: number; result: ShotResult } | null;
  /** Which players have locked in a fleet during placement. */
  ready: Record<string, boolean>;
}

/** What the client resolves before asking the transaction to record it. */
interface ResolvedShot {
  index: number;
  result: ShotResult;
  won: boolean;
}

export const battleshipRules: GameRules<BsState> = {
  kind: 'battleship',
  statusOnJoin: 'placing',

  initialState() {
    return { shots: {}, lastResult: null, ready: {} };
  },

  applyMove(game, uid, move) {
    const shot = move as ResolvedShot;
    if (!shot || typeof shot.index !== 'number') return null;

    const opponentUid = game.players.find((p) => p !== uid);
    if (!opponentUid) return null;

    const mine = game.state.shots?.[uid] ?? [];
    if (mine.includes(shot.index)) return null; // double tap, or a stale client

    const shots = { ...game.state.shots, [uid]: [...mine, shot.index] };
    const lastResult = { by: uid, index: shot.index, result: shot.result };

    if (shot.won) {
      return {
        ...game,
        status: 'done',
        outcome: 'win',
        winnerUid: uid,
        wins: { ...game.wins, [uid]: (game.wins[uid] ?? 0) + 1 },
        state: { ...game.state, shots, lastResult },
      };
    }

    return {
      ...game,
      turn: opponentUid,
      state: { ...game.state, shots, lastResult },
    };
  },

  resetState() {
    return { shots: {}, lastResult: null, ready: {} };
  },
};

function fleetRef(gameId: string, uid: string) {
  if (!rtdb) throw new Error('Firebase is not configured');
  return ref(rtdb, `gameFleets/${gameId}/${uid}`);
}

export interface BsFleetDoc {
  ships: string;
  placed: boolean;
}

function toFleet(val: unknown): BsFleetDoc | null {
  const doc = val as BsFleetDoc | null;
  return doc && typeof doc.ships === 'string' ? doc : null;
}

export async function fetchFleet(
  gameId: string,
  uid: string
): Promise<BsFleetDoc | null> {
  if (!rtdb) return null;
  const snap = await get(fleetRef(gameId, uid));
  return snap.exists() ? toFleet(snap.val()) : null;
}

/** Live view of your own fleet — placement writes it, and the battle screen
 * renders your ships from it. */
export function watchFleet(
  gameId: string,
  uid: string,
  onChange: (fleet: BsFleetDoc | null) => void
) {
  if (!rtdb) return () => {};
  return onValue(
    fleetRef(gameId, uid),
    (snap) => onChange(snap.exists() ? toFleet(snap.val()) : null),
    () => onChange(null)
  );
}

async function readFleetShips(
  gameId: string,
  uid: string
): Promise<string | null> {
  const fleet = await fetchFleet(gameId, uid);
  return fleet?.ships ?? null;
}

/** Locks in a fleet during placement. When both players are ready the game
 * flips to active and whoever hosted fires first. */
export async function saveFleet(
  gameId: string,
  uid: string,
  ships: string
): Promise<void> {
  if (!isFleetComplete(ships)) throw new Error('Place all 5 ships first.');
  await set(fleetRef(gameId, uid), { ships, placed: true });

  await patchState<BsState>(gameId, uid, (game) => {
    if (game.status !== 'placing') return null;
    const ready = { ...game.state.ready, [uid]: true };
    const bothReady =
      game.players.length === 2 && game.players.every((p) => ready[p]);
    return {
      state: { ...game.state, ready },
      ...(bothReady
        ? { status: 'active' as const, turn: game.players[0] }
        : {}),
    };
  });
}

/** Fires at a cell. The opponent's fleet is read first to resolve hit or
 * miss, then the transaction records it — and re-checks turn order and
 * duplicate shots, so a stale client still can't fire twice or out of
 * turn. */
export async function fireShot(
  gameId: string,
  uid: string,
  index: number
): Promise<void> {
  const game = await getGame<BsState>(gameId);
  if (!game || game.status !== 'active' || game.turn !== uid) return;

  const opponentUid = game.players.find((p) => p !== uid);
  if (!opponentUid) return;
  if ((game.state.shots?.[uid] ?? []).includes(index)) return;

  const fleet = await readFleetShips(gameId, opponentUid);
  if (!fleet || !isFleetComplete(fleet)) return; // hasn't placed yet

  const { outcome } = applyShot(fleet, index);
  await makeMove(battleshipRules, gameId, uid, {
    index,
    result: outcome.result,
    won: outcome.won,
  } satisfies ResolvedShot);
}

/** The screen's phase components were written against a flat game object,
 * and they read better that way — public state and game state on one level.
 * This is the view they get; the nesting is a storage detail. */
export interface BsGameView {
  id: string;
  status: OnlineGame<BsState>['status'];
  players: string[];
  names: Record<string, string>;
  turn: string;
  shots: Record<string, number[]>;
  lastResult: BsState['lastResult'];
  ready: Record<string, boolean>;
  outcome: 'win' | null;
  winnerUid: string | null;
  wins: Record<string, number>;
  createdBy: string;
  updatedAt: number;
}

export function bsView(game: OnlineGame<BsState>): BsGameView {
  return {
    id: game.id,
    status: game.status,
    players: game.players,
    names: game.names,
    turn: game.turn,
    shots: game.state?.shots ?? {},
    lastResult: game.state?.lastResult ?? null,
    ready: game.state?.ready ?? {},
    outcome: game.outcome === 'win' ? 'win' : null,
    winnerUid: game.winnerUid,
    wins: game.wins,
    createdBy: game.createdBy,
    updatedAt: game.updatedAt,
  };
}

/** Rematch clears both fleets so placement starts clean. */
export async function clearFleets(game: OnlineGame<BsState>): Promise<void> {
  if (!rtdb) return;
  await Promise.all(
    game.players.map((p) => remove(fleetRef(game.id, p)).catch(() => {}))
  );
}
