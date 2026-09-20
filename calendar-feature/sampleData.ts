// Parked calendar sample data — see calendar-feature/README.md.
// Pulled out of src/lib/sampleData.ts when the Calendar feature was hidden.

export interface ScheduleEvent {
  id: string;
  title: string;
  start: Date;
  allDay: boolean;
  source: string;
  location?: string;
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
