import {
  MAX_ROUNDS,
  deal,
  fromHandString,
  leader,
  playRound,
  toHandString,
  type CardCode,
} from './warEngine';
import type { GameRules } from './onlineGame';

/** War's half of the online contract. There's no decision to make on a flip
 * — both hands are already fixed once the deck is dealt — so "turn" here
 * just decides whose tap advances the round, alternating so the job of
 * tapping is shared rather than one person driving the whole game. */

export interface WarState {
  players: Record<string, 'A' | 'B'>;
  handA: string;
  handB: string;
  reveals: { a: CardCode; b: CardCode }[];
  roundWinner: 'A' | 'B' | null;
  /** Flips played, against MAX_ROUNDS. Absent on tables dealt before the
   * round cap existed, so every read defaults it. */
  rounds: number;
}

export const warRules: GameRules<WarState> = {
  kind: 'war',

  initialState(players) {
    const assign: Record<string, 'A' | 'B'> = {};
    if (players[0]) assign[players[0]] = 'A';
    if (players[1]) assign[players[1]] = 'B';
    const { a, b } = deal();
    return {
      players: assign,
      handA: toHandString(a),
      handB: toHandString(b),
      reveals: [],
      roundWinner: null,
      rounds: 0,
    };
  },

  applyMove(game) {
    const result = playRound(
      fromHandString(game.state.handA),
      fromHandString(game.state.handB)
    );
    if (!result) return null;

    const opponent = game.players.find((p) => p !== game.turn) ?? game.turn;
    const rounds = (game.state.rounds ?? 0) + 1;
    const nextState = {
      ...game.state,
      handA: toHandString(result.handA),
      handB: toHandString(result.handB),
      reveals: result.reveals,
      roundWinner: result.winner,
      rounds,
    };

    // Two ways to finish: someone is cleaned out, or the flips have run out
    // and one pile is bigger. Level piles at the cap play on rather than
    // ending in a dead heat — a round always moves cards one way or the
    // other, so the very next flip settles it.
    const cleanedOut = result.handA.length === 0 || result.handB.length === 0;
    const ahead = leader(result.handA.length, result.handB.length);
    const decidedOnCards = rounds >= MAX_ROUNDS && ahead !== null;
    if (!cleanedOut && !decidedOnCards) {
      return { ...game, turn: opponent, state: nextState };
    }

    const winnerLetter = cleanedOut
      ? result.handA.length > 0
        ? 'A'
        : 'B'
      : (ahead as 'A' | 'B');

    const winnerUid =
      Object.entries(game.state.players).find(
        ([, letter]) => letter === winnerLetter
      )?.[0] ?? game.turn;
    return {
      ...game,
      status: 'done',
      outcome: 'win',
      winnerUid,
      wins: { ...game.wins, [winnerUid]: (game.wins[winnerUid] ?? 0) + 1 },
      state: nextState,
    };
  },

  resetState(game, starter) {
    const assign: Record<string, 'A' | 'B'> = {};
    for (const uid of game.players) assign[uid] = uid === starter ? 'A' : 'B';
    const { a, b } = deal();
    return {
      players: assign,
      handA: toHandString(a),
      handB: toHandString(b),
      reveals: [],
      roundWinner: null,
      rounds: 0,
    };
  },
};
