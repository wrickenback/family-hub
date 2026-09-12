import { Screen } from '../components/Screen';
import { Scoreboard } from '../components/Scoreboard';
import { IconClock, IconMulti, IconSolo, IconTrophy } from '../components/icons';
import { getGame } from '../lib/router';
import { sampleScores } from '../lib/sampleData';
import './Games.css';

export function GameDetail({
  gameId,
  onBack,
}: {
  gameId: string;
  onBack: () => void;
}) {
  const game = getGame(gameId);

  if (!game) {
    return (
      <Screen title="Not found" onBack={onBack}>
        <div className="card empty-state">That game doesn&rsquo;t exist.</div>
      </Screen>
    );
  }

  const playerLabel =
    game.players === 'solo'
      ? '1 player'
      : game.players === 'multi'
      ? '2 players'
      : '1–2 players';

  return (
    <Screen title={game.name} onBack={onBack}>
      <div className="card game-detail-hero">
        <span className="game-detail-icon">
          <game.icon aria-hidden="true" />
        </span>
        <h3>{game.name}</h3>
        <p className="game-detail-blurb">{game.blurb}</p>
        <div className="game-detail-tags">
          <span
            className={`pill ${
              game.players === 'multi' ? 'pill-multi' : 'pill-solo'
            }`}
          >
            {game.players === 'multi' ? (
              <IconMulti aria-hidden="true" />
            ) : (
              <IconSolo aria-hidden="true" />
            )}
            {playerLabel}
          </span>
          <span className="pill pill-solo">
            <IconTrophy aria-hidden="true" />
            {game.scoring === 'wins' ? 'Tracks wins' : 'Tracks high score'}
          </span>
        </div>
      </div>

      <div className="game-detail-status">
        <IconClock aria-hidden="true" />
        Not built yet — this is the shell. Gameplay is coming.
      </div>

      <div className="section-head">
        <span className="section-title">
          <IconTrophy aria-hidden="true" />
          {game.scoring === 'wins' ? 'Most wins' : 'Top scores'}
        </span>
      </div>
      <Scoreboard
        entries={sampleScores[game.id] ?? []}
        scoring={game.scoring}
        limit={5}
      />
    </Screen>
  );
}
