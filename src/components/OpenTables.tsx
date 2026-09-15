import { useEffect, useState } from 'react';
import { IconChevronRight } from './icons';
import {
  myGamesInPlay,
  openTables,
  setPendingTable,
  watchRecentGames,
  type GameKind,
  type OnlineGame,
} from '../lib/onlineGame';
import type { Route } from '../lib/router';
import './OpenTables.css';

const GAME_LABEL: Record<GameKind, string> = {
  tictactoe: 'Tic Tac Toe',
  connect4: 'Connect 4',
  battleship: 'Battleship',
  hangman: 'Hangman',
  dotsandboxes: 'Dots and Boxes',
  war: 'War',
  uno: 'Uno',
};

function routeFor(kind: GameKind): Route {
  switch (kind) {
    case 'tictactoe':
      return { screen: 'play-tictactoe', mode: 'online' };
    case 'connect4':
      return { screen: 'play-connect4', mode: 'online' };
    case 'battleship':
      return { screen: 'play-battleship' };
    case 'hangman':
      return { screen: 'play-hangman', mode: 'family' };
    case 'dotsandboxes':
      return { screen: 'play-dotsandboxes', mode: 'online' };
    case 'war':
      return { screen: 'play-war', mode: 'online' };
    case 'uno':
      return { screen: 'play-uno', mode: 'online' };
  }
}

/** Open tables and games in progress, surfaced on the home screen.
 *
 * Before this, the only way to discover that someone had opened a game was
 * to walk into that exact game's screen and look at its lobby — so a table
 * could sit unnoticed while both people wondered why nobody was playing.
 * Tapping here hands the table to the game screen, which sits down on
 * arrival rather than making you pick it out of a list again. */
export function OpenTables({
  uid,
  onNavigate,
}: {
  uid: string;
  onNavigate: (route: Route) => void;
}) {
  const [games, setGames] = useState<OnlineGame[]>([]);

  useEffect(() => watchRecentGames(setGames), []);

  const inPlay = myGamesInPlay(games, uid);
  const joinable = openTables(games, uid);
  if (inPlay.length === 0 && joinable.length === 0) return null;

  const go = (game: OnlineGame, action: 'join' | 'resume') => {
    setPendingTable({ kind: game.kind, gameId: game.id, action });
    onNavigate(routeFor(game.kind));
  };

  const opponentOf = (game: OnlineGame) => {
    const other = game.players.find((p) => p !== uid);
    return (other && game.names[other]) || 'Someone';
  };

  return (
    <section className="section">
      <div className="section-head">
        <span className="section-title">
          <span className="tables-dot" />
          Your move
        </span>
      </div>
      <ul className="tables-strip">
        {inPlay.map((game) => (
          <li key={game.id}>
            <button
              className={`tables-item card ${
                game.turn === uid ? 'tables-item-turn' : ''
              }`}
              onClick={() => go(game, 'resume')}
            >
              <span className="tables-text">
                <span className="tables-name">
                  {GAME_LABEL[game.kind]} vs {opponentOf(game)}
                </span>
                <span className="tables-meta">
                  {game.turn === uid ? 'Your turn' : 'Waiting on them'}
                </span>
              </span>
              <IconChevronRight aria-hidden="true" />
            </button>
          </li>
        ))}

        {joinable.map((game) => (
          <li key={game.id}>
            <button className="tables-item card" onClick={() => go(game, 'join')}>
              <span className="tables-text">
                <span className="tables-name">
                  {game.names[game.createdBy] ?? 'Someone'} wants to play{' '}
                  {GAME_LABEL[game.kind]}
                </span>
                <span className="tables-meta">Tap to join</span>
              </span>
              <IconChevronRight aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
