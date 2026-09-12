import { useEffect, useState } from 'react';
import { Scoreboard } from './Scoreboard';
import {
  sortDirectionFor,
  watchDailyTopScores,
  watchTopScores,
  watchWinTotals,
  type LeaderboardEntry,
} from '../lib/firestoreScores';
import { DEFAULT_MODE, type Scoring } from '../lib/router';
import type { ScoreEntry } from '../lib/sampleData';

function toScoreEntries(entries: LeaderboardEntry[]): ScoreEntry[] {
  return entries.map((e) => ({
    name: e.name,
    value: e.value,
    date: e.createdAt ?? new Date(),
  }));
}

/** One leaderboard for every real (non-sample) game. Which query it runs is
 * derived from the game's scoring type rather than hardcoded per game:
 * 'wins' games count wins per player, timed games rank ascending, score
 * games rank descending. Adding a game means registering it in router.tsx,
 * not adding another branch here. */
export function GameLeaderboard({
  gameId,
  mode = DEFAULT_MODE,
  scoring,
  dateKey,
  limit = 10,
}: {
  gameId: string;
  mode?: string;
  scoring: Scoring;
  /** Set for day-scoped boards (Blocks' daily challenge) so each day resets. */
  dateKey?: string;
  limit?: number;
}) {
  const [entries, setEntries] = useState<ScoreEntry[]>([]);

  useEffect(() => {
    const onChange = (e: LeaderboardEntry[]) => setEntries(toScoreEntries(e));
    const onError = () => setEntries([]);

    if (scoring === 'wins') {
      return watchWinTotals(gameId, mode, onChange, onError);
    }
    const order = sortDirectionFor(scoring);
    if (dateKey) {
      return watchDailyTopScores(
        gameId,
        mode,
        dateKey,
        onChange,
        onError,
        limit,
        order
      );
    }
    return watchTopScores(gameId, mode, onChange, onError, limit, order);
  }, [gameId, mode, scoring, dateKey, limit]);

  return <Scoreboard entries={entries} scoring={scoring} limit={limit} />;
}
