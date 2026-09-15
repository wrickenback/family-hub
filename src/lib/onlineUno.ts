import {
  deal,
  drawOne,
  fromHandString,
  playCard,
  toHandString,
  type CardCode,
  type Color,
  type PlayEvent,
  type UnoState,
} from './unoEngine';
import type { GameRules } from './onlineGame';

/** Uno's half of the online contract. Skip, Reverse, Draw Two and Wild Draw
 * Four all resolve the same way in a two-player game — the opponent's turn
 * is skipped, so the current player just goes again — which is why
 * `playCard`'s 'again' effect is the only branch besides a plain turn pass. */

export interface DBUnoState {
  players: Record<string, 'A' | 'B'>;
  handA: string;
  handB: string;
  deck: string;
  discardPile: string;
  topCard: string;
  color: Color;
  /** Cosmetic only — lets the UI toast "Skip!" / "+2!" for whichever side
   * didn't tap the card, without it having to diff the hand sizes itself. */
  event: PlayEvent;
}

export type UnoMove =
  | { type: 'play'; card: CardCode; color?: Color }
  | { type: 'draw' }
  | { type: 'pass' };

function toEngineState(s: DBUnoState): UnoState {
  return {
    handA: fromHandString(s.handA),
    handB: fromHandString(s.handB),
    deck: fromHandString(s.deck),
    discardPile: fromHandString(s.discardPile),
    topCard: s.topCard,
    color: s.color,
  };
}

function fromEngineState(
  s: UnoState,
  players: Record<string, 'A' | 'B'>,
  event: PlayEvent
): DBUnoState {
  return {
    players,
    handA: toHandString(s.handA),
    handB: toHandString(s.handB),
    deck: toHandString(s.deck),
    discardPile: toHandString(s.discardPile),
    topCard: s.topCard,
    color: s.color,
    event,
  };
}

export const unoRules: GameRules<DBUnoState> = {
  kind: 'uno',

  initialState(players) {
    const assign: Record<string, 'A' | 'B'> = {};
    if (players[0]) assign[players[0]] = 'A';
    if (players[1]) assign[players[1]] = 'B';
    const dealt = deal();
    return fromEngineState(dealt, assign, null);
  },

  applyMove(game, uid, move) {
    const m = move as UnoMove;
    const letter = game.state.players[uid];
    if (!letter) return null;
    const opponent = game.players.find((p) => p !== uid) ?? uid;
    const engineState = toEngineState(game.state);

    if (m.type === 'draw') {
      const next = drawOne(engineState, letter);
      return {
        ...game,
        state: fromEngineState(next, game.state.players, null),
      };
    }

    if (m.type === 'pass') {
      return {
        ...game,
        turn: opponent,
        state: { ...game.state, event: null },
      };
    }

    if (m.type === 'play') {
      const result = playCard(engineState, letter, m.card, m.color);
      if (!result) return null;

      if (result.effect === 'winner') {
        return {
          ...game,
          status: 'done',
          outcome: 'win',
          winnerUid: uid,
          wins: { ...game.wins, [uid]: (game.wins[uid] ?? 0) + 1 },
          state: fromEngineState(result.state, game.state.players, result.event),
        };
      }

      return {
        ...game,
        turn: result.effect === 'again' ? uid : opponent,
        state: fromEngineState(result.state, game.state.players, result.event),
      };
    }

    return null;
  },

  resetState(game, starter) {
    const assign: Record<string, 'A' | 'B'> = {};
    for (const uid of game.players) assign[uid] = uid === starter ? 'A' : 'B';
    const dealt = deal();
    return fromEngineState(dealt, assign, null);
  },
};
