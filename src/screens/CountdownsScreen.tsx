import { Screen } from '../components/Screen';
import { daysUntil, sampleCountdowns, IS_SAMPLE_DATA } from '../lib/sampleData';
import './Countdowns.css';

export function CountdownsScreen({ onBack }: { onBack: () => void }) {
  const countdowns = sampleCountdowns
    .map((c) => ({ ...c, days: daysUntil(c.target) }))
    .filter((c) => c.days >= 0)
    .sort((a, b) => a.days - b.days);

  const longest = countdowns[countdowns.length - 1]?.days ?? 1;

  return (
    <Screen title="Countdowns" subtitle="What the family is waiting for" onBack={onBack}>
      {IS_SAMPLE_DATA && (
        <div className="section-head">
          <span className="section-title">Active</span>
          <span className="pill pill-sample">Sample</span>
        </div>
      )}

      {countdowns.length === 0 ? (
        <div className="card empty-state">No countdowns yet.</div>
      ) : (
        <ul className="countdown-list">
          {countdowns.map((c) => (
            <li key={c.id} className="card countdown-row">
              <div className="countdown-row-top">
                <span className="countdown-row-label">{c.label}</span>
                <span className="countdown-row-days">
                  {c.days}
                  <span>{c.days === 1 ? 'day' : 'days'}</span>
                </span>
              </div>
              <div
                className="countdown-bar"
                role="presentation"
              >
                <span
                  style={{
                    width: `${Math.max(4, 100 - (c.days / longest) * 100)}%`,
                  }}
                />
              </div>
              <span className="countdown-row-date">
                {new Date(c.target + 'T00:00:00').toLocaleDateString(undefined, {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Screen>
  );
}
