import { shortDate } from '../lib/format';
import type { ScoreEntry } from '../lib/sampleData';
import type { Scoring } from '../lib/router';
import './Scoreboard.css';

interface ScoreboardProps {
  entries: ScoreEntry[];
  scoring: Scoring;
  limit?: number;
}

export function Scoreboard({ entries, scoring, limit = 10 }: ScoreboardProps) {
  const ranked = [...entries]
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);

  if (ranked.length === 0) {
    return (
      <div className="card empty-state">
        No scores yet — play a round to start the board.
      </div>
    );
  }

  return (
    <ol className="scoreboard card">
      {ranked.map((entry, index) => (
        <li key={`${entry.name}-${entry.date.getTime()}`} className="score-row">
          <span className={`score-rank rank-${index + 1}`}>{index + 1}</span>
          <span className="score-name">{entry.name}</span>
          <span className="score-date">{shortDate(entry.date)}</span>
          <span className="score-value">
            {scoring === 'wins'
              ? `${entry.value} ${entry.value === 1 ? 'win' : 'wins'}`
              : entry.value.toLocaleString()}
          </span>
        </li>
      ))}
    </ol>
  );
}
