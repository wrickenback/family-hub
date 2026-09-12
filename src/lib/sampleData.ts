// Placeholder content for calendar and scores, which still await the ICS
// Cloud Function and real gameplay respectively. Countdowns now come from
// Firestore (see firestoreCountdowns.ts) — this file no longer seeds them.

import type { Scoring } from './router';

export interface ScheduleEvent {
  id: string;
  title: string;
  start: Date;
  allDay: boolean;
  source: string;
  location?: string;
}

export interface ScoreEntry {
  name: string;
  value: number;
  date: Date;
}

export const IS_SAMPLE_DATA = true;

// Day-then-time avoids the DST drift you get from adding raw milliseconds.
function at(dayOffset: number, hours: number, minutes = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

export const sampleEvents: ScheduleEvent[] = [
  {
    id: 'e1',
    title: 'Track practice',
    start: at(0, 15, 45),
    allDay: false,
    source: 'Track',
    location: 'High school track',
  },
  {
    id: 'e2',
    title: 'Band concert',
    start: at(0, 19, 0),
    allDay: false,
    source: 'School',
    location: 'Auditorium',
  },
  {
    id: 'e3',
    title: 'Picture day',
    start: at(1, 8, 0),
    allDay: false,
    source: 'School',
  },
  {
    id: 'e4',
    title: 'Cross country meet',
    start: at(2, 16, 30),
    allDay: false,
    source: 'Track',
    location: 'Riverside Park',
  },
  {
    id: 'e5',
    title: 'No school — teacher in-service',
    start: at(3, 0, 0),
    allDay: true,
    source: 'School',
  },
  {
    id: 'e6',
    title: 'Fall festival',
    start: at(5, 18, 0),
    allDay: false,
    source: 'School',
  },
  {
    id: 'e7',
    title: 'Dentist — Emma',
    start: at(6, 9, 15),
    allDay: false,
    source: 'Family',
  },
];

// 'blocks' and 'blocks:daily' aren't seeded here — Blocks gameplay is real
// now, and its leaderboards come from Firestore (see BlocksLeaderboard).
// Only games that aren't built yet are seeded here. A built game reads real
// Firestore scores (see GameLeaderboard), so leaving a seed in place would
// print invented names and times on its card and leaderboard as if they
// were real family results — and set a fake target to beat. 'wordsearch',
// 'reaction', 'tictactoe' and 'connect4' were all dropped from this list as they
// shipped.
export const sampleScores: Record<string, ScoreEntry[]> = {
  wordle: [
    { name: 'Will', value: 18, date: at(0, 7, 15) },
    { name: 'Nora', value: 16, date: at(0, 7, 50) },
    { name: 'Sam', value: 12, date: at(-1, 8, 5) },
    { name: 'Iris', value: 9, date: at(0, 9, 30) },
  ],
};

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
