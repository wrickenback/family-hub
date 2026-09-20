// Placeholder content for scores, which still awaits real gameplay data for
// some games. Countdowns now come from Firestore (see firestoreCountdowns.ts)
// — this file no longer seeds them. Calendar sample data has been parked in
// calendar-feature/ at the repo root — that feature is hidden for now.

import type { Scoring } from './router';

export interface ScoreEntry {
  name: string;
  value: number;
  date: Date;
}

export const IS_SAMPLE_DATA = true;

// 'blocks' and 'blocks:daily' aren't seeded here — Blocks gameplay is real
// now, and its leaderboards come from Firestore (see BlocksLeaderboard).
// Only games that aren't built yet are seeded here. A built game reads real
// Firestore scores (see GameLeaderboard), so leaving a seed in place would
// print invented names and times on its card and leaderboard as if they
// were real family results — and set a fake target to beat. 'wordsearch',
// 'reaction', 'tictactoe', 'connect4', 'wordle', 'hangman', 'catqueens',
// 'battleship', 'dotsandboxes' and 'uno' were all dropped from this
// list as they shipped — currently empty since every game is now built.
export const sampleScores: Record<string, ScoreEntry[]> = {};

export function getTopScore(
  gameId: string,
  scoring: Scoring
): ScoreEntry | undefined {
  const entries = sampleScores[gameId];
  if (!entries || entries.length === 0) return undefined;
  const lowerIsBetter = scoring === 'bestMs' || scoring === 'bestDuration';
  return [...entries].sort((a, b) =>
    lowerIsBetter ? a.value - b.value : b.value - a.value
  )[0];
}
