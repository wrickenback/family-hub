import { LINES, other, type Mark } from './ticTacToeEngine';
import type { GameRules, OnlineGame } from './onlineGame';

/** Tic Tac Toe's half of the online contract: how a board starts, what a
 * legal move does to it, and how a rematch resets. Everything about
 * lobbies, transport and turn-taking lives in onlineGame.ts. */

export const EMPTY_BOARD = '---------';

export interface TttState {
  /** 9 characters, '-' for an empty square — one atomic field to write. */
  board: string;
  marks: Record<string, Mark>;
  line: number[] | null;
}

function lineFor(board: string, mark: Mark): number[] | null {
  for (const line of LINES) {
    if (line.every((i) => board[i] === mark)) return line;
  }
  return null;
}

function place(board: string, index: number, mark: Mark): string {
  return board.slice(0, index) + mark + board.slice(index + 1);
}

function emptyCount(board: string): number {
  return board.split('').filter((c) => c === '-').length;
}

export const ticTacToeRules: GameRules<TttState> = {
  kind: 'tictactoe',

  initialState(players) {
    const marks: Record<string, Mark> = {};
    if (players[0]) marks[players[0]] = 'X';
    if (players[1]) marks[players[1]] = 'O';
    return { board: EMPTY_BOARD, marks, line: null };
  },

  applyMove(game, uid, move) {
    const index = move as number;
    const { board, marks } = game.state;
    if (typeof index !== 'number' || index < 0 || index > 8) return null;
    if (board[index] !== '-') return null;

    const mark = marks[uid];
    if (!mark) return null;

    const next = place(board, index, mark);
    const line = lineFor(next, mark);
    const opponent = game.players.find((p) => p !== uid) ?? uid;

    if (line) {
      return {
        ...game,
        status: 'done',
        outcome: 'win',
        winnerUid: uid,
        wins: { ...game.wins, [uid]: (game.wins[uid] ?? 0) + 1 },
        state: { ...game.state, board: next, line },
      };
    }

    if (emptyCount(next) === 0) {
      return {
        ...game,
        status: 'done',
        outcome: 'draw',
        winnerUid: null,
        draws: game.draws + 1,
        state: { ...game.state, board: next, line: null },
      };
    }

    // One square left and the forced move there can't complete a line —
    // the round is already decided, so settle it rather than making someone
    // tap out a foregone result.
    if (emptyCount(next) === 1) {
      const lastIndex = next.indexOf('-');
      const nextMark = other(mark);
      const filled = place(next, lastIndex, nextMark);
      if (!lineFor(filled, nextMark)) {
        return {
          ...game,
          status: 'done',
          outcome: 'draw',
          winnerUid: null,
          draws: game.draws + 1,
          state: { ...game.state, board: filled, line: null },
        };
      }
    }

    return {
      ...game,
      turn: opponent,
      state: { ...game.state, board: next, line: null },
    };
  },

  resetState(game, starter) {
    // Marks swap with the opening turn, so X's advantage alternates.
    const marks: Record<string, Mark> = {};
    for (const uid of game.players) marks[uid] = uid === starter ? 'X' : 'O';
    return { board: EMPTY_BOARD, marks, line: null };
  },
};

/** Convenience for the screen: whose mark is whose, for the scorebar. */
export function markOf(game: OnlineGame<TttState>, uid: string): Mark | null {
  return game.state?.marks?.[uid] ?? null;
}
