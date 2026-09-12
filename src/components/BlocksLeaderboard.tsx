import { useEffect, useState } from 'react';
import { Scoreboard } from './Scoreboard';
import {
  watchDailyTopScores,
  watchTopScores,
  type LeaderboardEntry,
} from '../lib/firestoreScores';
import { todayKey } from '../lib/blocksEngine';
import type { ScoreEntry } from '../lib/sampleData';

function toScoreEntries(entries: LeaderboardEntry[]): ScoreEntry[] {
  return entries.map((e) => ({
    name: e.name,
    value: e.value,
    date: e.createdAt ?? new Date(),
  }));
}

export function BlocksLeaderboard({
  mode = 'free',
  limit = 10,
}: {
  mode?: string;
  limit?: number;
}) {
  const [entries, setEntries] = useState<ScoreEntry[]>([]);

  useEffect(() => {
    const onChange = (e: LeaderboardEntry[]) => setEntries(toScoreEntries(e));
    const onError = () => setEntries([]);
    if (mode === 'daily') {
      return watchDailyTopScores(
        'blocks',
        'daily',
        todayKey(),
        onChange,
        onError,
        limit
      );
    }
    return watchTopScores('blocks', 'free', onChange, onError, limit);
  }, [mode, limit]);

  return <Scoreboard entries={entries} scoring="highScore" limit={limit} />;
}
