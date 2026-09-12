import { useEffect, useRef, useState } from 'react';
import { Screen } from '../components/Screen';
import { IconSpinner } from '../components/icons';
import { C4Board } from './ConnectFourGame';
import { EMPTY_BOARD } from '../lib/connectFourEngine';
import {
  cancelC4Game,
  createC4Game,
  joinC4Game,
  playC4Move,
  rematchC4Game,
  watchC4Game,
  watchOpenC4Games,
  type OnlineC4Game,
} from '../lib/firestoreConnectFour';
import { submitScore } from '../lib/firestoreScores';
import { playClear, playGameOver, playPlace } from '../lib/sound';
import './ConnectFourGame.css';

const LABEL: Record<string, string> = { R: 'Red', Y: 'Yellow' };

/** Two family members, two devices, synced through Firestore. Mirrors the
 * Tic Tac Toe online screen: the board lives in the game document and every
 * move goes through a transaction, so there's no local copy to drift. */
export function ConnectFourOnline({
  uid,
  displayName,
  onBack,
}: {
  uid: string;
  displayName: string;
  onBack: () => void;
}) {
  const [gameId, setGameId] = useState<string | null>(null);
  const [game, setGame] = useState<OnlineC4Game | null>(null);
  const [openGames, setOpenGames] = useState<OnlineC4Game[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scoredRounds = useRef<Set<string>>(new Set());
  const prevBoard = useRef<string | null>(null);

  useEffect(() => {
    if (gameId) return;
    return watchOpenC4Games(setOpenGames, () => setOpenGames([]));
  }, [gameId]);

  useEffect(() => {
    if (!gameId) {
      setGame(null);
      return;
    }
    return watchC4Game(
      gameId,
      (g) => {
        if (!g) {
          setGameId(null);
          setGame(null);
          return;
        }
        setGame(g);
      },
      () => setError('Lost connection to that game.')
    );
  }, [gameId]);

  // Driven off the synced board so the opponent's drop is audible too.
  useEffect(() => {
    if (!game) return;
    const previous = prevBoard.current;
    prevBoard.current = game.board;
    if (previous === null || previous === game.board) return;
    if (game.status === 'active' && game.board === EMPTY_BOARD) return; // rematch reset
    if (game.status === 'done') {
      if (game.outcome === 'win') {
        game.winnerUid === uid ? playClear(3) : playGameOver();
      } else {
        playGameOver();
      }
    } else {
      playPlace();
    }
  }, [game, uid]);

  // Each player reports only their own win — the scores rules require the
  // submitted uid to match the caller. wins-per-uid doubles as a round
  // counter, so each round is submitted exactly once.
  useEffect(() => {
    if (!game || game.status !== 'done' || game.outcome !== 'win') return;
    if (game.winnerUid !== uid) return;
    const key = `${game.id}:${game.wins[uid] ?? 0}`;
    if (scoredRounds.current.has(key)) return;
    scoredRounds.current.add(key);
    submitScore({
      gameId: 'connect4',
      mode: 'online',
      uid,
      name: displayName,
      value: 1,
    }).catch(() => scoredRounds.current.delete(key));
  }, [game, uid, displayName]);

  const guard = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const handleLeave = () =>
    guard(async () => {
      // Waiting lobbies and finished tables both need cleanup so games/{id}
      // docs don't accumulate forever — an active game is left alone so the
      // other player isn't kicked out mid-round.
      if (
        game &&
        (game.status === 'waiting' || game.status === 'done') &&
        (game.status !== 'waiting' || game.createdBy === uid)
      ) {
        await cancelC4Game(game.id);
      }
      setGameId(null);
      setGame(null);
      prevBoard.current = null;
    });

  // ---------- lobby ----------

  if (!gameId || !game) {
    const joinable = openGames.filter((g) => g.createdBy !== uid);
    const mine = openGames.filter((g) => g.createdBy === uid);

    return (
      <Screen title="Connect 4" subtitle="Play a family member" onBack={onBack}>
        {error && <div className="c4-error card">{error}</div>}

        <button
          className="btn btn-primary blocks-play-btn"
          onClick={() =>
            guard(async () => setGameId(await createC4Game(uid, displayName)))
          }
          disabled={busy}
        >
          {busy ? 'Opening…' : 'Start a game'}
        </button>

        {mine.length > 0 && (
          <>
            <div className="section-head">
              <span className="section-title">Your open game</span>
            </div>
            <ul className="c4-lobby">
              {mine.map((g) => (
                <li key={g.id}>
                  <button
                    className="c4-lobby-item card"
                    onClick={() => setGameId(g.id)}
                  >
                    <span className="c4-lobby-name">Waiting for an opponent</span>
                    <span className="c4-lobby-meta">Tap to reopen</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="section-head">
          <span className="section-title">Open games</span>
        </div>
        {joinable.length === 0 ? (
          <div className="card empty-state">
            Nobody&rsquo;s waiting right now. Start a game and it&rsquo;ll show
            up here for whoever opens the app next.
          </div>
        ) : (
          <ul className="c4-lobby">
            {joinable.map((g) => (
              <li key={g.id}>
                <button
                  className="c4-lobby-item card"
                  onClick={() =>
                    guard(async () => {
                      await joinC4Game(g.id, uid, displayName);
                      setGameId(g.id);
                    })
                  }
                  disabled={busy}
                >
                  <span className="c4-lobby-name">
                    {g.names[g.createdBy] ?? 'Someone'}
                  </span>
                  <span className="c4-lobby-meta">Tap to join as yellow</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Screen>
    );
  }

  // ---------- at a table ----------

  const myDisc = game.discs[uid];
  const opponentUid = game.players.find((p) => p !== uid);
  const opponentName = opponentUid ? game.names[opponentUid] : null;
  const waiting = game.status === 'waiting';
  const myTurn = game.status === 'active' && game.turn === uid;

  return (
    <Screen
      title="Connect 4"
      subtitle={opponentName ? `vs ${opponentName}` : 'Waiting…'}
      onBack={onBack}
    >
      {error && <div className="c4-error card">{error}</div>}

      <div className="c4-scorebar">
        <div className="c4-tally">
          <span className="c4-tally-label">
            You {myDisc ? `(${LABEL[myDisc]})` : ''}
          </span>
          <span className="c4-tally-value">{game.wins[uid] ?? 0}</span>
        </div>
        <div className="c4-tally">
          <span className="c4-tally-label">Draws</span>
          <span className="c4-tally-value">{game.draws}</span>
        </div>
        <div className="c4-tally">
          <span className="c4-tally-label">{opponentName ?? 'Opponent'}</span>
          <span className="c4-tally-value">
            {opponentUid ? game.wins[opponentUid] ?? 0 : 0}
          </span>
        </div>
      </div>

      <p
        className={`c4-status ${game.status === 'done' ? 'settled' : ''}`}
        aria-live="polite"
      >
        {waiting && <IconSpinner className="c4-status-spinner" aria-hidden="true" />}
        {waiting
          ? 'Waiting for someone to join…'
          : game.status === 'done'
          ? game.outcome === 'draw'
            ? 'Draw — board full'
            : game.winnerUid === uid
            ? 'You win!'
            : `${opponentName} wins`
          : myTurn
          ? 'Your turn'
          : `${opponentName ?? 'Opponent'}'s turn`}
      </p>

      <C4Board
        board={game.board}
        winning={game.line ?? []}
        disabled={!myTurn}
        onDrop={(col) => playC4Move(game.id, uid, col).catch(() => {})}
      />

      {game.status === 'done' && (
        <div className="c4-result card">
          <h3>
            {game.outcome === 'draw'
              ? 'Draw'
              : game.winnerUid === uid
              ? 'You win!'
              : `${opponentName} wins`}
          </h3>
          <button
            className="btn btn-primary"
            onClick={() => rematchC4Game(game.id).catch(() => {})}
          >
            Rematch
          </button>
        </div>
      )}

      <button className="btn btn-text c4-leave" onClick={handleLeave}>
        {waiting ? 'Cancel this game' : 'Leave game'}
      </button>
    </Screen>
  );
}
