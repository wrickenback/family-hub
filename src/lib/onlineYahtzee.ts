import {
  CATEGORIES,
  NO_DICE,
  NO_HOLDS,
  ROLLS_PER_TURN,
  DICE_COUNT,
  grandTotal,
  isSheetFull,
  rollDice,
  scoreFor,
  type Sheet,
} from './yahtzeeEngine';
import type { GameRules, OnlineGame } from './onlineGame';

/** Yahtzee's half of the online contract. Unusually for these games a turn
 * is several moves long — up to three rolls, then one category — so most
 * moves deliberately leave `turn` where it is and only taking a category
 * hands the dice over. */

export interface YState {
  dice: string;
  held: string;
  rollsLeft: number;
  /** Per-uid sheets. A category absent from a sheet is still open; the
   * Realtime Database would drop an explicit null anyway. */
  sheets: Record<string, Sheet>;
}

export type YahtzeeMove =
  | { type: 'roll'; held: string }
  | { type: 'score'; category: string };

function freshTurn(): Pick<YState, 'dice' | 'held' | 'rollsLeft'> {
  return { dice: NO_DICE, held: NO_HOLDS, rollsLeft: ROLLS_PER_TURN };
}

function emptySheets(players: string[]): Record<string, Sheet> {
  const sheets: Record<string, Sheet> = {};
  for (const uid of players) sheets[uid] = {};
  return sheets;
}

export const yahtzeeRules: GameRules<YState> = {
  kind: 'yahtzee',

  initialState(players) {
    return { ...freshTurn(), sheets: emptySheets(players) };
  },

  applyMove(game, uid, move) {
    const action = move as YahtzeeMove;
    if (!action || typeof action !== 'object') return null;
    const state = game.state;
    const sheets = state.sheets ?? {};
    const sheet = sheets[uid] ?? {};

    if (action.type === 'roll') {
      if ((state.rollsLeft ?? 0) <= 0) return null;
      if (typeof action.held !== 'string' || action.held.length !== DICE_COUNT) {
        return null;
      }
      // Holding a die you haven't rolled yet isn't a move, it's a stale
      // client — roll all five in that case rather than freezing blanks in.
      const held = state.dice?.length === DICE_COUNT ? action.held : NO_HOLDS;
      return {
        ...game,
        state: {
          ...state,
          dice: rollDice(state.dice ?? NO_DICE, held),
          held,
          rollsLeft: state.rollsLeft - 1,
        },
      };
    }

    if (action.type !== 'score') return null;
    if (state.dice?.length !== DICE_COUNT) return null; // nothing rolled yet
    if (!CATEGORIES.some((c) => c.id === action.category)) return null;
    if (sheet[action.category] !== undefined) return null; // already taken

    const nextSheet: Sheet = {
      ...sheet,
      [action.category]: scoreFor(action.category, state.dice),
    };
    const nextSheets = { ...sheets, [uid]: nextSheet };
    const opponent = game.players.find((p) => p !== uid) ?? uid;

    const everyoneDone = game.players.every((p) =>
      isSheetFull(nextSheets[p] ?? {})
    );

    if (everyoneDone) {
      const mine = grandTotal(nextSheet);
      const theirs = grandTotal(nextSheets[opponent] ?? {});
      const winner = mine === theirs ? null : mine > theirs ? uid : opponent;
      return {
        ...game,
        status: 'done',
        outcome: winner ? 'win' : 'draw',
        winnerUid: winner,
        wins: winner
          ? { ...game.wins, [winner]: (game.wins[winner] ?? 0) + 1 }
          : game.wins,
        draws: winner ? game.draws : game.draws + 1,
        state: { ...state, ...freshTurn(), sheets: nextSheets },
      };
    }

    // The other player only gets the dice if they still have a box open —
    // with an odd number of categories between two sheets, one player can
    // finish a turn early and the other plays out the rest alone.
    const next = isSheetFull(nextSheets[opponent] ?? {}) ? uid : opponent;
    return {
      ...game,
      turn: next,
      state: { ...state, ...freshTurn(), sheets: nextSheets },
    };
  },

  resetState(game) {
    return { ...freshTurn(), sheets: emptySheets(game.players) };
  },
};

/** Both sheets side by side, for the result card. */
export function finalScores(game: OnlineGame<YState>) {
  return game.players.map((uid) => ({
    uid,
    name: game.names[uid] ?? 'Someone',
    total: grandTotal(game.state?.sheets?.[uid] ?? {}),
  }));
}
