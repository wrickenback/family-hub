import { useEffect, useState } from 'react';
import { Scoreboard } from './Scoreboard';
import { watchTopScores, type LeaderboardEntry } from '../lib/firestoreScores';
import type { ScoreEntry } from '../lib/sampleData';

function toScoreEntries(entries: LeaderboardEntry[]): ScoreEntry[] {
  return entries.map((e) => ({
    name: e.name,
    value: e.value,
    date: e.createdAt ?? new Date(),
  }));
}

export function WordSearchLeaderboard({ limit = 10 }: { limit?: number }) {
  const [entries, setEntries] = useState<ScoreEntry[]>([]);

  useEffect(() => {
    return watchTopScores(
      'wordsearch',
      'default',
      (e) => setEntries(toScoreEntries(e)),
      () => setEntries([]),
      limit
    );
  }, [limit]);

  return <Scoreboard entries={entries} scoring="bestDuration" limit={limit} />;
}
