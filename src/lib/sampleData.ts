// Placeholder content for the visual pass. Countdowns and scores will move to
// Firestore; events will be upserted into `schedule/` by the ICS Cloud Function.
// Shapes here intentionally match those planned collections.

export interface Countdown {
  id: string;
  label: string;
  target: string;
}

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

export const sampleCountdowns: Countdown[] = [
  { id: 'grandma', label: 'Grandma visits', target: '2026-09-26' },
  { id: 'disney', label: 'Disney trip', target: '2026-10-17' },
  { id: 'christmas', label: 'Christmas', target: '2026-12-25' },
  { id: 'lastday', label: 'Last day of school', target: '2027-06-11' },
];

export function daysUntil(target: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = target.split('-').map(Number);
  const then = new Date(y, m - 1, d);
  return Math.round((then.getTime() - today.getTime()) / 86400000);
}

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

export const sampleScores: Record<string, ScoreEntry[]> = {
  blocks: [
    { name: 'Sam', value: 48250, date: at(-2, 19, 12) },
    { name: 'Will', value: 44180, date: at(-5, 20, 3) },
    { name: 'Nora', value: 41090, date: at(-1, 17, 45) },
    { name: 'Max', value: 38720, date: at(-9, 16, 20) },
    { name: 'Sam', value: 36540, date: at(-12, 18, 55) },
    { name: 'Iris', value: 33110, date: at(-3, 15, 8) },
    { name: 'Will', value: 30870, date: at(-17, 21, 30) },
    { name: 'Theo', value: 28440, date: at(-6, 14, 2) },
    { name: 'Nora', value: 25960, date: at(-21, 19, 48) },
    { name: 'Max', value: 22300, date: at(-24, 16, 37) },
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
