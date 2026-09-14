import type { ReactNode } from 'react';
import { Screen } from '../components/Screen';
import { formatValue } from '../components/Scoreboard';
import {
  IconChevronRight,
  IconMulti,
  IconSolo,
  IconTrophy,
} from '../components/icons';
import { getVisibleGames, type GameApp, type Role } from '../lib/router';
import { getTopScore } from '../lib/sampleData';
import './Games.css';

interface GamesScreenProps {
  userRole: Role | null;
  onBack: () => void;
  onOpenGame: (gameId: string, modeId?: string) => void;
  onOpenScores: () => void;
}

export function GamesScreen({
  userRole,
  onBack,
  onOpenGame,
  onOpenScores,
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
      <button className="scores-link card" onClick={onOpenScores}>
        <span className="scores-link-icon">
          <IconTrophy aria-hidden="true" />
        </span>
        <span className="scores-link-text">
          <span className="scores-link-title">Family Scores</span>
          <span className="scores-link-meta">See every top 10</span>
        </span>
        <IconChevronRight className="chevron-affordance" aria-hidden="true" />
      </button>

      <GameSection
        title="Solo play"
        icon={<IconSolo aria-hidden="true" />}
        games={solo}
        section="solo"
        onOpenGame={onOpenGame}
      />
      <GameSection
        title="Two players"
        icon={<IconMulti aria-hidden="true" />}
        games={multi}
        section="multi"
        onOpenGame={onOpenGame}
      />
    </Screen>
  );
}

interface GameSectionProps {
  title: string;
  icon: ReactNode;
  games: GameApp[];
  section: 'solo' | 'multi';
  onOpenGame: (gameId: string, modeId?: string) => void;
}

function GameSection({ title, icon, games, section, onOpenGame }: GameSectionProps) {
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
        {games.map((game) => {
          const top = game.built ? getTopScore(game.id, game.scoring) : undefined;
          // For a game shown under both sections, land on the mode tab
          // matching whichever section was tapped rather than always the
          // first mode.
          const sectionModeId = game.modes?.find(
            (m) => m.players === section
          )?.id;
          return (
            <li key={game.id}>
              <button
                className={`game-card ${!game.built ? 'coming-soon' : ''}`}
                onClick={() => onOpenGame(game.id, sectionModeId)}
              >
                <span className="game-icon">
                  <game.icon aria-hidden="true" />
                </span>
                <span className="game-text">
                  <span className="game-name">{game.name}</span>
                  <span className="game-blurb">{game.blurb}</span>
                </span>
                <span className="game-meta">
                  {top && (
                    <span className="game-top-score">
                      <IconTrophy aria-hidden="true" />
                      {top.name} · {formatValue(top.value, game.scoring)}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
