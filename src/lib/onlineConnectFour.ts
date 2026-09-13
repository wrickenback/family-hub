import {
  EMPTY_BOARD,
  dropDisc,
  winningLine,
  type Disc,
} from './connectFourEngine';
import type { GameRules } from './onlineGame';

/** Connect 4's half of the online contract. Lobbies, turn-taking and
 * transport all live in onlineGame.ts. */

export interface C4State {
  /** 42 characters, row-major from the top left, '-' for an empty slot. */
  board: string;
  discs: Record<string, Disc>;
  line: number[] | null;
  /** Where the most recent disc landed, so both phones can animate the drop
   * — not just the phone that tapped. */
  lastIndex: number | null;
}

function isFull(board: string): boolean {
  return !board.includes('-');
}

export const connectFourRules: GameRules<C4State> = {
  kind: 'connect4',

  initialState(players) {
    const discs: Record<string, Disc> = {};
    if (players[0]) discs[players[0]] = 'R';
    if (players[1]) discs[players[1]] = 'Y';
    return { board: EMPTY_BOARD, discs, line: null, lastIndex: null };
  },

  applyMove(game, uid, move) {
    const col = move as number;
    if (typeof col !== 'number') return null;

    const disc = game.state.discs[uid];
    if (!disc) return null;

    const dropped = dropDisc(game.state.board, col, disc);
    if (!dropped) return null; // column full

    const line = winningLine(dropped.board);
    const opponent = game.players.find((p) => p !== uid) ?? uid;

    if (line) {
      return {
        ...game,
        status: 'done',
        outcome: 'win',
        winnerUid: uid,
        wins: { ...game.wins, [uid]: (game.wins[uid] ?? 0) + 1 },
        state: {
          ...game.state,
          board: dropped.board,
          line,
          lastIndex: dropped.index,
        },
      };
    }

    if (isFull(dropped.board)) {
      return {
        ...game,
        status: 'done',
        outcome: 'draw',
        winnerUid: null,
        draws: game.draws + 1,
        state: {
          ...game.state,
          board: dropped.board,
          line: null,
          lastIndex: dropped.index,
        },
      };
    }

    return {
      ...game,
      turn: opponent,
      state: {
        ...game.state,
        board: dropped.board,
        line: null,
        lastIndex: dropped.index,
      },
    };
  },

  resetState(game, starter) {
    // Colours swap with the opening turn so red's advantage alternates.
    const discs: Record<string, Disc> = {};
    for (const uid of game.players) discs[uid] = uid === starter ? 'R' : 'Y';
    return { board: EMPTY_BOARD, discs, line: null, lastIndex: null };
  },
};
