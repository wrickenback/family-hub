import {
  INITIAL_BOARD,
  applyMove as applyToBoard,
  legalMoves,
  other,
  winnerAgainst,
  type Player,
} from './checkersEngine';
import type { GameRules } from './onlineGame';

/** Checkers' half of the online contract. The one wrinkle is the multi-jump:
 * a player mid-chain keeps the turn and is pinned to the piece that is
 * jumping, which is what `chainFrom` records. */

export interface CheckersState {
  board: string;
  players: Record<string, Player>;
  /** Square the jumping piece sits on mid-chain, or null between turns. */
  chainFrom: number | null;
  /** The last move, so both phones can flash the same squares. */
  lastFrom: number | null;
  lastTo: number | null;
}

export interface CheckersMove {
  from: number;
  to: number;
}

function seat(players: string[], starter?: string): Record<string, Player> {
  const assign: Record<string, Player> = {};
  if (starter) {
    for (const uid of players) assign[uid] = uid === starter ? 'r' : 'b';
    return assign;
  }
  // Red opens, so the host takes red on a fresh table.
  if (players[0]) assign[players[0]] = 'r';
  if (players[1]) assign[players[1]] = 'b';
  return assign;
}

export const checkersRules: GameRules<CheckersState> = {
  kind: 'checkers',

  initialState(players) {
    return {
      board: INITIAL_BOARD,
      players: seat(players),
      chainFrom: null,
      lastFrom: null,
      lastTo: null,
    };
  },

  applyMove(game, uid, move) {
    const intent = move as CheckersMove;
    if (!intent || typeof intent.from !== 'number' || typeof intent.to !== 'number') {
      return null;
    }

    const state = game.state;
    const player = state.players?.[uid];
    if (!player) return null;

    const board = state.board ?? INITIAL_BOARD;
    const chainFrom = state.chainFrom ?? null;
    const legal = legalMoves(board, player, chainFrom).find(
      (m) => m.from === intent.from && m.to === intent.to
    );
    if (!legal) return null;

    const result = applyToBoard(board, legal);
    const opponent = game.players.find((p) => p !== uid) ?? uid;

    if (result.mustContinue) {
      return {
        ...game,
        state: {
          ...state,
          board: result.board,
          chainFrom: legal.to,
          lastFrom: legal.from,
          lastTo: legal.to,
        },
      };
    }

    const winner = winnerAgainst(result.board, other(player));
    if (winner) {
      // winnerAgainst reports the colour that has won; whoever just moved is
      // the only one it can be, since a move never strands your own side.
      return {
        ...game,
        status: 'done',
        outcome: 'win',
        winnerUid: uid,
        wins: { ...game.wins, [uid]: (game.wins[uid] ?? 0) + 1 },
        state: {
          ...state,
          board: result.board,
          chainFrom: null,
          lastFrom: legal.from,
          lastTo: legal.to,
        },
      };
    }

    return {
      ...game,
      turn: opponent,
      state: {
        ...state,
        board: result.board,
        chainFrom: null,
        lastFrom: legal.from,
        lastTo: legal.to,
      },
    };
  },

  resetState(game, starter) {
    return {
      board: INITIAL_BOARD,
      players: seat(game.players, starter),
      chainFrom: null,
      lastFrom: null,
      lastTo: null,
    };
  },
};
