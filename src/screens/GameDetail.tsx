import { useState } from 'react';
import { Screen } from '../components/Screen';
import { Scoreboard } from '../components/Scoreboard';
import { TopicPicker } from '../components/TopicPicker';
import { IconClock, IconMulti, IconSolo, IconTrophy } from '../components/icons';
import { getGame } from '../lib/router';
import { sampleScores } from '../lib/sampleData';
import './Games.css';

const scoringLabel: Record<string, string> = {
  wins: 'Tracks wins',
  highScore: 'Tracks high score',
  bestMs: 'Tracks reaction time',
  bestDuration: 'Tracks best time',
};

const scoreboardHeading: Record<string, string> = {
  wins: 'Most wins',
  highScore: 'Top scores',
  bestMs: 'Fastest reactions',
  bestDuration: 'Best times',
};

export function GameDetail({
  gameId,
  onBack,
}: {
  gameId: string;
  onBack: () => void;
}) {
  const game = getGame(gameId);
  const [modeId, setModeId] = useState(game?.modes?.[0]?.id ?? '');

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

  const mode = game.modes?.find((m) => m.id === modeId) ?? game.modes?.[0];
  // Scores for a daily-seeded mode aren't comparable to free play, so they get
  // their own scoreboard entry (see sampleData: 'blocks:daily' vs 'blocks').
  const scoreKey =
    game.id === 'blocks' && mode?.id === 'daily' ? 'blocks:daily' : game.id;

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
            {scoringLabel[game.scoring]}
          </span>
        </div>
      </div>

      {game.modes && (
        <div className="mode-tabs" role="tablist" aria-label="Mode">
          {game.modes.map((m) => (
            <button
              key={m.id}
              role="tab"
              aria-selected={m.id === mode?.id}
              className={`mode-tab ${m.id === mode?.id ? 'active' : ''}`}
              onClick={() => setModeId(m.id)}
            >
              {m.name}
            </button>
          ))}
        </div>
      )}
      {mode && <p className="mode-blurb">{mode.blurb}</p>}

      {game.id === 'wordsearch' && mode?.id === 'create' && <TopicPicker />}

      <div className="game-detail-status">
        <IconClock aria-hidden="true" />
        Not built yet — this is the shell. Gameplay is coming.
      </div>

      <div className="section-head">
        <span className="section-title">
          <IconTrophy aria-hidden="true" />
          {scoreboardHeading[game.scoring]}
        </span>
      </div>
      <Scoreboard
        entries={sampleScores[scoreKey] ?? []}
        scoring={game.scoring}
        limit={5}
      />
    </Screen>
  );
}
