import {
  myGamesInPlay,
  myOpenTables,
  openTables,
  type GameKind,
  type OnlineGame,
} from '../lib/onlineGame';
import './OnlineLobby.css';

interface Props {
  kind: GameKind;
  uid: string;
  /** Every recent table, from the one shared listener. */
  games: OnlineGame[];
  busy: boolean;
  error: string | null;
  /** What to call the other seat in the join prompt, e.g. "as O". */
  joinAs?: string;
  onHost: () => void;
  onResume: (gameId: string) => void;
  onJoin: (gameId: string) => void;
}

function opponentName(game: OnlineGame, uid: string) {
  const other = game.players.find((p) => p !== uid);
  return (other && game.names[other]) || 'Someone';
}

/** The lobby every online game shares: resume what you're mid-way through,
 * reopen your own table, or sit down at someone else's. */
export function OnlineLobby({
  kind,
  uid,
  games,
  busy,
  error,
  joinAs,
  onHost,
  onResume,
  onJoin,
}: Props) {
  const inPlay = myGamesInPlay(games, uid, kind);
  const mine = myOpenTables(games, uid, kind);
  const joinable = openTables(games, uid, kind);

  return (
    <>
      {error && <div className="lobby-error card">{error}</div>}

      {/* Before anything else: you have a game going. A refresh used to lose
          this entirely, because only 'waiting' tables were ever listed. */}
      {inPlay.length > 0 && (
        <>
          <div className="section-head">
            <span className="section-title">Pick up where you left off</span>
          </div>
          <ul className="lobby-list">
            {inPlay.map((g) => (
              <li key={g.id}>
                <button
                  className="lobby-item card lobby-item-resume"
                  onClick={() => onResume(g.id)}
                >
                  <span className="lobby-name">
                    Resume vs {opponentName(g, uid)}
                  </span>
                  <span className="lobby-meta">
                    {g.turn === uid ? 'Your turn' : 'Waiting on them'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <button
        className="btn btn-primary lobby-host-btn"
        onClick={onHost}
        disabled={busy}
      >
        {busy ? 'Opening…' : 'Start a game'}
      </button>

      {mine.length > 0 && (
        <>
          <div className="section-head">
            <span className="section-title">Your open game</span>
          </div>
          <ul className="lobby-list">
            {mine.map((g) => (
              <li key={g.id}>
                <button
                  className="lobby-item card"
                  onClick={() => onResume(g.id)}
                >
                  <span className="lobby-name">Waiting for an opponent</span>
                  <span className="lobby-meta">Tap to reopen</span>
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
          Nobody&rsquo;s waiting right now. Start a game and it&rsquo;ll show up
          here for whoever opens the app next.
        </div>
      ) : (
        <ul className="lobby-list">
          {joinable.map((g) => (
            <li key={g.id}>
              <button
                className="lobby-item card"
                onClick={() => onJoin(g.id)}
                disabled={busy}
              >
                <span className="lobby-name">
                  {g.names[g.createdBy] ?? 'Someone'}
                </span>
                <span className="lobby-meta">
                  Tap to join{joinAs ? ` ${joinAs}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
