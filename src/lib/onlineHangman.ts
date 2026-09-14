import {
  addGuess,
  isHanged,
  isSolved,
  wrongCount,
} from './hangmanEngine';
import { patchState, type GameRules, type OnlineGame } from './onlineGame';

/** Hangman's half of the online contract. Unlike the other online games
 * the two seats aren't symmetric: one person sets the word and then only
 * watches, the other does all the guessing. That's expressed entirely
 * through the existing turn field — the guesser holds the turn for the
 * whole round, so the shared makeMove() transaction already refuses any
 * move from the setter without hangman needing its own rule for it. */

export interface HmState {
  /** Empty until the setter has chosen — the 'placing' status is the real
   * signal, this is just what's being guessed. */
  word: string;
  hint: string;
  /** Who chose the word this round. Swaps on every rematch. */
  setter: string;
  /** Guessed letters, sorted, as one atomic string. */
  guessed: string;
}

export const hangmanRules: GameRules<HmState> = {
  kind: 'hangman',

  // Same shape as Battleship: the table sits in 'placing' after someone
  // joins, while the setter thinks of a word.
  statusOnJoin: 'placing',

  initialState(players) {
    return { word: '', hint: '', setter: players[0] ?? '', guessed: '' };
  },

  applyMove(game, uid, move) {
    const letter = typeof move === 'string' ? move.toUpperCase() : '';
    if (!/^[A-Z]$/.test(letter)) return null;

    const { word, guessed } = game.state;
    if (!word) return null;
    if (uid === game.state.setter) return null; // the setter never guesses
    if (guessed.includes(letter)) return null; // already tried, or a stale tap

    const next = addGuess(guessed, letter);
    const state = { ...game.state, guessed: next };

    if (isSolved(word, next)) {
      return {
        ...game,
        status: 'done',
        outcome: 'win',
        winnerUid: uid,
        wins: { ...game.wins, [uid]: (game.wins[uid] ?? 0) + 1 },
        state,
      };
    }

    if (isHanged(word, next)) {
      const setter = game.state.setter;
      return {
        ...game,
        status: 'done',
        outcome: 'win',
        winnerUid: setter,
        wins: { ...game.wins, [setter]: (game.wins[setter] ?? 0) + 1 },
        state,
      };
    }

    // The turn never moves: the guesser keeps going until they solve it or
    // run out of body parts.
    return { ...game, state };
  },

  resetState(game, starter) {
    // rematchGame() hands the turn to whoever didn't hold it, which for
    // hangman means the old setter becomes the new guesser — so the new
    // setter is the other seat, and the roles swap every round.
    const setter = game.players.find((p) => p !== starter) ?? starter;
    return { word: '', hint: '', setter, guessed: '' };
  },
};

/** The setter commits their word, which starts the round. Writing the turn
 * here is what puts the guesser on move — createGame/joinGame leave the
 * turn with whoever opened the table, and for hangman that's the wrong
 * seat. */
export async function setHangmanWord(
  gameId: string,
  uid: string,
  word: string,
  hint: string
): Promise<void> {
  await patchState<HmState>(gameId, uid, (game) => {
    if (game.status !== 'placing') return null;
    if (game.state.setter !== uid) return null;
    const guesser = game.players.find((p) => p !== uid);
    if (!guesser) return null;
    return {
      status: 'active',
      turn: guesser,
      state: { ...game.state, word, hint, guessed: '' },
    };
  });
}

/** Convenience for the screens: which seat this player is sitting in. */
export function roleOf(
  game: OnlineGame<HmState>,
  uid: string
): 'setter' | 'guesser' {
  return game.state?.setter === uid ? 'setter' : 'guesser';
}

export function wrongSoFar(game: OnlineGame<HmState>): number {
  const { word, guessed } = game.state ?? { word: '', guessed: '' };
  return word ? wrongCount(word, guessed ?? '') : 0;
}
