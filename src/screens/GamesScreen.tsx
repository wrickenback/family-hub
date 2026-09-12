import type { ReactNode } from 'react';
import { Screen } from '../components/Screen';
import { IconMulti, IconSolo } from '../components/icons';
import { getVisibleGames, type GameApp, type Role } from '../lib/router';
import './Games.css';

interface GamesScreenProps {
  userRole: Role | null;
  onBack: () => void;
  onOpenGame: (gameId: string) => void;
}

export function GamesScreen({
  userRole,
  onBack,
  onOpenGame,
}: GamesScreenProps) {
  const visible = getVisibleGames(userRole);
  const solo = visible.filter(
    (g) => g.players === 'solo' || g.players === 'both'
  );
  const multi = visible.filter(
    (g) => g.players === 'multi' || g.players === 'both'
  );

  return (
    <Screen
      title="Games"
      subtitle={`${visible.length} games`}
      onBack={onBack}
    >
      <GameSection
        title="Solo play"
        icon={<IconSolo aria-hidden="true" />}
        games={solo}
        onOpenGame={onOpenGame}
      />
      <GameSection
        title="Two players"
        icon={<IconMulti aria-hidden="true" />}
        games={multi}
        onOpenGame={onOpenGame}
      />
    </Screen>
  );
}

interface GameSectionProps {
  title: string;
  icon: ReactNode;
  games: GameApp[];
  onOpenGame: (gameId: string) => void;
}

function GameSection({ title, icon, games, onOpenGame }: GameSectionProps) {
  if (games.length === 0) return null;

  return (
    <section className="section">
      <div className="section-head">
        <span className="section-title">
          {icon}
          {title}
        </span>
        <span className="section-count">{games.length}</span>
      </div>
      <ul className="game-grid">
        {games.map((game) => (
          <li key={game.id}>
            <button
              className="game-card"
              onClick={() => onOpenGame(game.id)}
            >
              <span className="game-icon">
                <game.icon aria-hidden="true" />
              </span>
              <span className="game-text">
                <span className="game-name">{game.name}</span>
                <span className="game-blurb">{game.blurb}</span>
              </span>
              <span
                className={`pill ${
                  game.players === 'multi' ? 'pill-multi' : 'pill-solo'
                }`}
              >
                {game.players === 'solo' && <IconSolo aria-hidden="true" />}
                {game.players === 'multi' && <IconMulti aria-hidden="true" />}
                {game.players === 'solo'
                  ? '1 player'
                  : game.players === 'multi'
                  ? '2 players'
                  : '1–2'}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
