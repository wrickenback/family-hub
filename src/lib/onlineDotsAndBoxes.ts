import {
  BOX_COUNT,
  EMPTY_BOXES,
  EMPTY_EDGES,
  drawEdge,
  tally,
  type Player,
} from './dotsAndBoxesEngine';
import type { GameRules } from './onlineGame';

/** Dots and Boxes' half of the online contract. Lobbies, turn-taking and
 * transport all live in onlineGame.ts. Completing a box grants another turn
 * — that's the one place this game's `applyMove` deviates from "always hand
 * the turn to the other player", which is why it sets `turn` itself instead
 * of leaning on a shared helper. */

export interface DBState {
  /** 40 characters, '-' undrawn, 'X' drawn — see dotsAndBoxesEngine. */
  edges: string;
  /** 16 characters, '-' unclaimed or the claiming player's letter. */
  boxes: string;
  players: Record<string, Player>;
  /** The edge just drawn, so both phones can flash the same line. */
  lastEdge: number | null;
}

export const dotsAndBoxesRules: GameRules<DBState> = {
  kind: 'dotsandboxes',

  initialState(players) {
    const assign: Record<string, Player> = {};
    if (players[0]) assign[players[0]] = 'A';
    if (players[1]) assign[players[1]] = 'B';
    return { edges: EMPTY_EDGES, boxes: EMPTY_BOXES, players: assign, lastEdge: null };
  },

  applyMove(game, uid, move) {
    const edge = move as number;
    if (typeof edge !== 'number') return null;

    const player = game.state.players[uid];
    if (!player) return null;

    const drawn = drawEdge(game.state.edges, game.state.boxes, edge, player);
    if (!drawn) return null;

    const opponent = game.players.find((p) => p !== uid) ?? uid;
    const keepTurn = drawn.completed > 0;
    const boardDone = !drawn.edges.includes('-');

    if (boardDone) {
      const counts = tally(drawn.boxes);
      const myCount = player === 'A' ? counts.A : counts.B;
      const theirCount = player === 'A' ? counts.B : counts.A;
      const winner =
        myCount === theirCount ? null : myCount > theirCount ? uid : opponent;
      return {
        ...game,
        status: 'done',
        outcome: winner ? 'win' : 'draw',
        winnerUid: winner,
        wins: winner
          ? { ...game.wins, [winner]: (game.wins[winner] ?? 0) + 1 }
          : game.wins,
        draws: winner ? game.draws : game.draws + 1,
        state: { ...game.state, edges: drawn.edges, boxes: drawn.boxes, lastEdge: edge },
      };
    }

    return {
      ...game,
      turn: keepTurn ? uid : opponent,
      state: { ...game.state, edges: drawn.edges, boxes: drawn.boxes, lastEdge: edge },
    };
  },

  resetState(game, starter) {
    const assign: Record<string, Player> = {};
    for (const uid of game.players) assign[uid] = uid === starter ? 'A' : 'B';
    return { edges: EMPTY_EDGES, boxes: EMPTY_BOXES, players: assign, lastEdge: null };
  },
};

export { BOX_COUNT };
