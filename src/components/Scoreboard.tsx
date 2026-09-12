import { durationLabel, shortDate } from '../lib/format';
import type { ScoreEntry } from '../lib/sampleData';
import type { Scoring } from '../lib/router';
import './Scoreboard.css';

interface ScoreboardProps {
  entries: ScoreEntry[];
  scoring: Scoring;
  limit?: number;
}

function formatValue(value: number, scoring: Scoring): string {
  if (scoring === 'wins') return `${value} ${value === 1 ? 'win' : 'wins'}`;
  if (scoring === 'bestMs') return `${value} ms`;
  if (scoring === 'bestDuration') return durationLabel(value);
  return value.toLocaleString();
}

export function Scoreboard({ entries, scoring, limit = 10 }: ScoreboardProps) {
  const lowerIsBetter = scoring === 'bestMs' || scoring === 'bestDuration';
  const ranked = [...entries]
    .sort((a, b) => (lowerIsBetter ? a.value - b.value : b.value - a.value))
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
            {formatValue(entry.value, scoring)}
          </span>
        </li>
      ))}
    </ol>
  );
}
