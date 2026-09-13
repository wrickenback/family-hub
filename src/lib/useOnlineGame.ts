import { useCallback, useEffect, useRef, useState } from 'react';
import {
  cancelGame,
  createGame,
  forfeitGame,
  joinGame,
  makeMove,
  rematchGame,
  takePendingTable,
  watchGame,
  watchRecentGames,
  type GameRules,
  type OnlineGame,
} from './onlineGame';

/** Everything an online game screen needs that isn't its own rules: the
 * lobby feed, the seated game, and surviving a refresh.
 *
 * Rejoin is handled two ways on purpose. The last table you sat at is
 * remembered in localStorage, so a refresh or an OS-killed PWA drops you
 * straight back in. That can't help on a different phone or after cleared
 * storage, so the lobby also lists any game you're mid-way through — which
 * is what the old lobby was missing entirely, since it only ever listed
 * tables in the 'waiting' state. */

function storageKey(kind: string) {
  return `familyhub:online:${kind}`;
}

function rememberGameId(kind: string, gameId: string | null) {
  try {
    if (gameId) localStorage.setItem(storageKey(kind), gameId);
    else localStorage.removeItem(storageKey(kind));
  } catch {
    // Private mode or blocked storage — the lobby's resume list still works.
  }
}

function recallGameId(kind: string): string | null {
  try {
    return localStorage.getItem(storageKey(kind));
  } catch {
    return null;
  }
}

export function useOnlineGame<S>(
  rules: GameRules<S>,
  uid: string,
  displayName: string
) {
  const [gameId, setGameId] = useState<string | null>(() =>
    recallGameId(rules.kind)
  );
  const [game, setGame] = useState<OnlineGame<S> | null>(null);
  const [games, setGames] = useState<OnlineGame[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const seat = useCallback(
    (id: string | null) => {
      setGameId(id);
      rememberGameId(rules.kind, id);
      if (!id) setGame(null);
    },
    [rules.kind]
  );

  // The lobby feed stays open the whole time: it backs the lobby when you're
  // standing up, and it's what tells you a remembered table has since been
  // swept away.
  useEffect(() => {
    return watchRecentGames(setGames, () =>
      setError('Lost connection to the lobby.')
    );
  }, []);

  useEffect(() => {
    if (!gameId) {
      setGame(null);
      return;
    }
    return watchGame<S>(
      gameId,
      (g) => {
        // The table was cancelled, swept, or we were never really in it.
        if (!g || !g.players.includes(uid)) {
          seat(null);
          return;
        }
        setGame(g);
      },
      () => setError('Lost connection to that game.')
    );
  }, [gameId, uid, seat]);

  // A table handed over from the home screen: sit down without making the
  // player pick it out of the lobby they were just looking at.
  const claimedIntent = useRef(false);
  useEffect(() => {
    if (claimedIntent.current) return;
    claimedIntent.current = true;
    const intent = takePendingTable(rules.kind);
    if (!intent) return;
    if (intent.action === 'resume') {
      seat(intent.gameId);
      return;
    }
    joinGame(rules, intent.gameId, uid, displayName)
      .then(() => seat(intent.gameId))
      .catch(() => setError('That game just filled up.'));
  }, [rules, uid, displayName, seat]);

  const guard = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }, []);

  const host = useCallback(
    () =>
      guard(async () => {
        const id = await createGame(rules, uid, displayName);
        seat(id);
      }),
    [guard, rules, uid, displayName, seat]
  );

  const join = useCallback(
    (id: string) =>
      guard(async () => {
        await joinGame(rules, id, uid, displayName);
        seat(id);
      }),
    [guard, rules, uid, displayName, seat]
  );

  const resume = useCallback((id: string) => seat(id), [seat]);

  const move = useCallback(
    (m: unknown) => {
      if (!gameId) return;
      // Deliberately not awaited or guarded: an RTDB transaction applies to
      // the local cache first, so the board repaints on this phone before
      // the write lands. A rejected move simply never commits and the
      // listener puts the authoritative board back.
      makeMove(rules, gameId, uid, m).catch(() => {});
    },
    [gameId, rules, uid]
  );

  const rematch = useCallback(() => {
    if (!gameId) return;
    rematchGame(rules, gameId).catch(() => {});
  }, [gameId, rules]);

  const leave = useCallback(
    () =>
      guard(async () => {
        // A table nobody joined, or one that's finished, is just clutter.
        // A game in progress is left alone so the opponent can come back to
        // it — sweeping that up is the cleanup function's job.
        if (
          game &&
          (game.status === 'waiting' || game.status === 'done') &&
          (game.status !== 'waiting' || game.createdBy === uid)
        ) {
          await cancelGame(game.id);
        }
        seat(null);
      }),
    [guard, game, uid, seat]
  );

  const forfeit = useCallback(
    () =>
      guard(async () => {
        if (gameId) await forfeitGame(gameId, uid);
        seat(null);
      }),
    [guard, gameId, uid, seat]
  );

  return {
    gameId,
    game,
    games,
    busy,
    error,
    setError,
    host,
    join,
    resume,
    move,
    rematch,
    leave,
    forfeit,
  };
}

/** Fires `onChange` whenever the synced board string changes, telling the
 * caller what it changed to and what it was. Screens use it to drive sound
 * and drop animations off the *synced* board, so the opponent's move is as
 * animated and audible as your own. */
export function useBoardChange(
  board: string | undefined,
  onChange: (next: string, previous: string) => void
) {
  const previous = useRef<string | null>(null);
  const handler = useRef(onChange);
  handler.current = onChange;

  useEffect(() => {
    if (board === undefined) return;
    const before = previous.current;
    previous.current = board;
    if (before === null || before === board) return;
    handler.current(board, before);
  }, [board]);
}
