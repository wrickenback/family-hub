import { useState } from 'react';
import { Screen } from '../components/Screen';
import { Scoreboard } from '../components/Scoreboard';
import { GameLeaderboard } from '../components/GameLeaderboard';
import { DEFAULT_MODE, getVisibleGames, type Role } from '../lib/router';
import { IS_SAMPLE_DATA, sampleScores } from '../lib/sampleData';
import './Scores.css';

/** Games whose all-time board lives under a mode other than the default. */
const ALL_TIME_MODE: Record<string, string> = {
  blocks: 'free',
  tictactoe: 'online',
  connect4: 'online',
  dotsandboxes: 'online',
  battleship: 'online',
  war: 'online',
  uno: 'online',
  hangman: 'solo',
  wordle: 'family',
  solitaire: 'daily',
};

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
          // Which slice of a game's scores its all-time board reads.
          // Blocks' is free play; every two-player game's is the online
          // board, since pass-and-play wins never leave the device;
          // Solitaire's and Daily Word's are the daily deal, the only
          // comparable thing they record. Passing DEFAULT_MODE for any of
          // these would quietly show an empty board.
          mode={ALL_TIME_MODE[selected.id] ?? DEFAULT_MODE}
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
