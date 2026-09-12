import { useEffect, useRef, useState } from 'react';
import { Screen } from '../components/Screen';
import { Confetti, MarkGlyph, StrikeLine } from '../components/TttMarks';
import { IconSpinner } from '../components/icons';
import {
  EMPTY_BOARD,
  cancelOnlineGame,
  createOnlineGame,
  joinOnlineGame,
  playOnlineMove,
  rematchOnlineGame,
  watchGame,
  watchOpenGames,
  type OnlineGame,
} from '../lib/firestoreTicTacToe';
import { submitScore } from '../lib/firestoreScores';
import { playClear, playGameOver, playPlace } from '../lib/sound';
import './TicTacToeGame.css';

interface Props {
  uid: string;
  displayName: string;
  onBack: () => void;
}

/** Two family members on two devices, synced through Firestore. The board
 * lives entirely in the game document — this component renders whatever the
 * snapshot says and writes moves through a transaction, so there's no local
 * copy of the board that could drift from the other player's. */
export function TicTacToeOnline({ uid, displayName, onBack }: Props) {
  const [gameId, setGameId] = useState<string | null>(null);
  const [game, setGame] = useState<OnlineGame | null>(null);
  const [openGames, setOpenGames] = useState<OnlineGame[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scoredRounds = useRef<Set<string>>(new Set());
  const prevBoard = useRef<string | null>(null);

  // Lobby listing, only while we aren't sitting at a table.
  useEffect(() => {
    if (gameId) return;
    return watchOpenGames(setOpenGames, () => setOpenGames([]));
  }, [gameId]);

  useEffect(() => {
    if (!gameId) {
      setGame(null);
      return;
    }
    return watchGame(
      gameId,
      (g) => {
        if (!g) {
          // The host cancelled the table out from under us.
          setGameId(null);
          setGame(null);
          return;
        }
        setGame(g);
      },
      () => setError('Lost connection to that game.')
    );
  }, [gameId]);

  // Sound on any board change we didn't make ourselves, plus the end-of-round
  // flourish. Driven off the synced board rather than off our own tap, so
  // the opponent's move is audible too.
  useEffect(() => {
    if (!game) return;
    const previous = prevBoard.current;
    prevBoard.current = game.board;
    if (previous === null || previous === game.board) return;
    // A rematch clears the board — that's a reset, not a move.
    if (game.status === 'active' && game.board === EMPTY_BOARD) return;
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
  // submitted uid to match the caller, and that's the right constraint: a
  // win is attributed by the person who earned it, on their own device.
  useEffect(() => {
    if (!game || game.status !== 'done' || game.outcome !== 'win') return;
    if (game.winnerUid !== uid) return;
    // wins-per-uid doubles as a round counter, so this key changes on every
    // rematch and each round's win is submitted exactly once.
    const key = `${game.id}:${game.wins[uid] ?? 0}`;
    if (scoredRounds.current.has(key)) return;
    scoredRounds.current.add(key);
    submitScore({
      gameId: 'tictactoe',
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

  const handleHost = () =>
    guard(async () => {
      const id = await createOnlineGame(uid, displayName);
      setGameId(id);
    });

  const handleJoin = (id: string) =>
    guard(async () => {
      await joinOnlineGame(id, uid, displayName);
      setGameId(id);
    });

  const handleLeave = () =>
    guard(async () => {
      // A table nobody ever joined, or one that's already finished, is just
      // clutter — clean it up so games/{id} docs don't accumulate forever.
      // A game still in progress is left alone so the opponent can come back.
      if (
        game &&
        (game.status === 'waiting' || game.status === 'done') &&
        (game.status !== 'waiting' || game.createdBy === uid)
      ) {
        await cancelOnlineGame(game.id);
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
      <Screen title="Tic Tac Toe" subtitle="Play a family member" onBack={onBack}>
        {error && <div className="ttt-error card">{error}</div>}

        <button
          className="btn btn-primary blocks-play-btn"
          onClick={handleHost}
          disabled={busy}
        >
          {busy ? 'Opening…' : 'Start a game'}
        </button>

        {mine.length > 0 && (
          <>
            <div className="section-head">
              <span className="section-title">Your open game</span>
            </div>
            <ul className="ttt-lobby">
              {mine.map((g) => (
                <li key={g.id}>
                  <button
                    className="ttt-lobby-item card"
                    onClick={() => setGameId(g.id)}
                  >
                    <span className="ttt-lobby-name">Waiting for an opponent</span>
                    <span className="ttt-lobby-meta">Tap to reopen</span>
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
          <ul className="ttt-lobby">
            {joinable.map((g) => (
              <li key={g.id}>
                <button
                  className="ttt-lobby-item card"
                  onClick={() => handleJoin(g.id)}
                  disabled={busy}
                >
                  <span className="ttt-lobby-name">
                    {g.names[g.createdBy] ?? 'Someone'}
                  </span>
                  <span className="ttt-lobby-meta">Tap to join as O</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Screen>
    );
  }

  // ---------- at a table ----------

  const myMark = game.marks[uid];
  const opponentUid = game.players.find((p) => p !== uid);
  const opponentName = opponentUid ? game.names[opponentUid] : null;
  const waiting = game.status === 'waiting';
  const myTurn = game.status === 'active' && game.turn === uid;
  const cells = game.board.split('');

  const statusText = () => {
    if (waiting) return 'Waiting for someone to join…';
    if (game.status === 'done') {
      if (game.outcome === 'draw') return "Draw — nobody's giving an inch";
      return game.winnerUid === uid ? 'You win!' : `${opponentName} wins`;
    }
    return myTurn ? 'Your turn' : `${opponentName ?? 'Opponent'}'s turn`;
  };

  return (
    <Screen
      title="Tic Tac Toe"
      subtitle={opponentName ? `vs ${opponentName}` : 'Waiting…'}
      onBack={onBack}
    >
      <div className="ttt-fit">
        {error && <div className="ttt-error card">{error}</div>}

        <div className="ttt-scorebar">
          <div className="ttt-tally">
            <span className="ttt-tally-mark">You ({myMark ?? '—'})</span>
            <span className="ttt-tally-value">{game.wins[uid] ?? 0}</span>
          </div>
          <div className="ttt-tally ttt-tally-draw">
            <span className="ttt-tally-mark">Draws</span>
            <span className="ttt-tally-value">{game.draws}</span>
          </div>
          <div className="ttt-tally">
            <span className="ttt-tally-mark">
              {opponentName ?? 'Opponent'}
              {opponentUid && game.marks[opponentUid]
                ? ` (${game.marks[opponentUid]})`
                : ''}
            </span>
            <span className="ttt-tally-value">
              {opponentUid ? game.wins[opponentUid] ?? 0 : 0}
            </span>
          </div>
        </div>

        <p
          className={`ttt-status ${game.status === 'done' ? 'settled' : ''}`}
          aria-live="polite"
        >
          {waiting && <IconSpinner className="ttt-status-spinner" aria-hidden="true" />}
          {statusText()}
        </p>

        <div className="ttt-board-wrap">
          <div className="ttt-board-frame">
            {game.status === 'done' && game.outcome === 'win' && game.line && (
              <>
                <StrikeLine line={game.line} />
                <Confetti />
              </>
            )}
            <div className="ttt-board" role="grid" aria-label="Tic Tac Toe board">
              {cells.map((cell, index) => (
                <button
                  key={index}
                  className={`ttt-cell ${
                    cell !== '-' ? `mark-${cell.toLowerCase()}` : ''
                  } ${game.line?.includes(index) ? 'winning' : ''}`}
                  onClick={() => playOnlineMove(game.id, uid, index).catch(() => {})}
                  disabled={!myTurn || cell !== '-'}
                  aria-label={
                    cell !== '-'
                      ? `${cell} at square ${index + 1}`
                      : `Empty square ${index + 1}`
                  }
                >
                  {cell !== '-' && <MarkGlyph mark={cell as 'X' | 'O'} />}
                </button>
              ))}
            </div>
          </div>

          {game.status === 'done' && (
            <div className="ttt-result card">
              <h3>
                {game.outcome === 'draw'
                  ? 'Draw'
                  : game.winnerUid === uid
                  ? 'You win!'
                  : `${opponentName} wins`}
              </h3>
              <div className="ttt-result-actions">
                <button
                  className="btn btn-primary"
                  onClick={() => rematchOnlineGame(game.id).catch(() => {})}
                >
                  Rematch
                </button>
              </div>
            </div>
          )}
        </div>

        <button className="btn btn-text ttt-leave" onClick={handleLeave}>
          {waiting ? 'Cancel this game' : 'Leave game'}
        </button>
      </div>
    </Screen>
  );
}
