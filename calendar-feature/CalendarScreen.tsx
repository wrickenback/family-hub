import { Screen } from '../components/Screen';
import { dayLabel, groupByDay, timeLabel } from '../lib/format';
import { IS_SAMPLE_DATA, sampleEvents } from '../lib/sampleData';
import './Home.css';

export function CalendarScreen({ onBack }: { onBack: () => void }) {
  const upcoming = sampleEvents
    .filter((e) => e.start.getTime() >= Date.now() - 3600000)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const days = groupByDay(upcoming, (e) => e.start);

  return (
    <Screen
      title="Calendar"
      subtitle="School, track & family feeds"
      onBack={onBack}
    >
      {IS_SAMPLE_DATA && (
        <div className="sample-note">
          <span className="pill pill-sample">Sample</span>
          Real events will arrive from the school, track and family ICS feeds.
        </div>
      )}

      {days.length === 0 ? (
        <div className="card empty-state">Nothing scheduled.</div>
      ) : (
        days.map(({ date, items }) => (
          <section key={date.getTime()} className="section">
            <div className="section-head">
              <span className="section-title">{dayLabel(date)}</span>
            </div>
            <ul className="event-list card">
              {items.map((event) => (
                <li key={event.id} className="event-row">
                  <div className="event-when">
                    <span className="event-day">
                      {event.allDay ? 'All day' : timeLabel(event.start)}
                    </span>
                  </div>
                  <div className="event-what">
                    <span className="event-title">{event.title}</span>
                    {event.location && (
                      <span className="event-location">{event.location}</span>
                    )}
                  </div>
                  <span className="event-source">{event.source}</span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </Screen>
  );
}
