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
export const sampleScores: Record<string, ScoreEntry[]> = {
  reaction: [
    { name: 'Iris', value: 187, date: at(-1, 18, 30) },
    { name: 'Max', value: 201, date: at(-3, 17, 15) },
    { name: 'Nora', value: 214, date: at(0, 12, 5) },
    { name: 'Sam', value: 236, date: at(-2, 20, 40) },
    { name: 'Will', value: 268, date: at(-6, 21, 12) },
    { name: 'Theo', value: 295, date: at(-8, 16, 55) },
  ],
  wordsearch: [
    { name: 'Sam', value: 74, date: at(-1, 16, 20) },
    { name: 'Nora', value: 91, date: at(-1, 16, 45) },
    { name: 'Iris', value: 118, date: at(-4, 15, 30) },
    { name: 'Will', value: 143, date: at(-5, 19, 55) },
    { name: 'Theo', value: 186, date: at(-7, 14, 10) },
  ],
  wordle: [
    { name: 'Will', value: 18, date: at(0, 7, 15) },
    { name: 'Nora', value: 16, date: at(0, 7, 50) },
    { name: 'Sam', value: 12, date: at(-1, 8, 5) },
    { name: 'Iris', value: 9, date: at(0, 9, 30) },
  ],
  connect4: [
    { name: 'Will', value: 27, date: at(-1, 20, 10) },
    { name: 'Nora', value: 24, date: at(-1, 20, 10) },
    { name: 'Sam', value: 19, date: at(-4, 18, 25) },
    { name: 'Theo', value: 11, date: at(-8, 17, 0) },
    { name: 'Iris', value: 6, date: at(-15, 19, 5) },
  ],
  tictactoe: [
    { name: 'Iris', value: 41, date: at(0, 12, 30) },
    { name: 'Max', value: 38, date: at(0, 12, 30) },
    { name: 'Sam', value: 22, date: at(-7, 16, 45) },
    { name: 'Will', value: 15, date: at(-11, 20, 15) },
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
