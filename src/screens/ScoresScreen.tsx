import { useState } from 'react';
import { Screen } from '../components/Screen';
import { Scoreboard } from '../components/Scoreboard';
import { GameLeaderboard } from '../components/GameLeaderboard';
import { DEFAULT_MODE, getVisibleGames, type Role } from '../lib/router';
import { IS_SAMPLE_DATA, sampleScores } from '../lib/sampleData';
import './Scores.css';

export function ScoresScreen({
  userRole,
  onBack,
}: {
  userRole: Role | null;
  onBack: () => void;
}) {
  const scored = getVisibleGames(userRole);
  const [selectedId, setSelectedId] = useState(scored[0]?.id ?? '');
  const selected = scored.find((g) => g.id === selectedId) ?? scored[0];

  if (!selected) {
    return (
      <Screen title="Scores" onBack={onBack}>
        <div className="card empty-state">No games available.</div>
      </Screen>
    );
  }

  return (
    <Screen
      title="Scores"
      subtitle={
        selected.scoring === 'wins' ? 'Most wins' : 'Family top 10'
      }
      onBack={onBack}
    >
      <div className="score-tabs" role="tablist" aria-label="Pick a game">
        {scored.map((game) => (
          <button
            key={game.id}
            role="tab"
            aria-selected={game.id === selected.id}
            className={`score-tab ${game.id === selected.id ? 'active' : ''}`}
            onClick={() => setSelectedId(game.id)}
          >
            {game.name}
          </button>
        ))}
      </div>

      <div className="section-head">
        <span className="section-title">{selected.name}</span>
        {!selected.built && IS_SAMPLE_DATA && sampleScores[selected.id] && (
          <span className="pill pill-sample">Sample</span>
        )}
      </div>

      {selected.built ? (
        <GameLeaderboard
          gameId={selected.id}
          // Blocks' all-time board is free play; Tic Tac Toe's is the online
          // board (pass-and-play wins never leave the device).
          mode={
            selected.id === 'blocks'
              ? 'free'
              : selected.id === 'tictactoe' || selected.id === 'connect4'
              ? 'online'
              : DEFAULT_MODE
          }
          scoring={selected.scoring}
        />
      ) : (
        <Scoreboard
          entries={sampleScores[selected.id] ?? []}
          scoring={selected.scoring}
        />
      )}
    </Screen>
  );
}
