import { useState } from 'react';
import { Screen } from '../components/Screen';
import { daysUntil } from '../lib/format';
import { addCountdown, deleteCountdown } from '../lib/firestoreCountdowns';
import type { FirestoreCountdown } from '../lib/firestoreCountdowns';
import './Countdowns.css';

interface CountdownsScreenProps {
  countdowns: FirestoreCountdown[];
  uid: string;
  onBack: () => void;
}

export function CountdownsScreen({
  countdowns: raw,
  uid,
  onBack,
}: CountdownsScreenProps) {
  const [label, setLabel] = useState('');
  const [target, setTarget] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const countdowns = raw
    .map((c) => ({ ...c, days: daysUntil(c.target) }))
    .filter((c) => c.days >= 0)
    .sort((a, b) => a.days - b.days);
  const longest = countdowns[countdowns.length - 1]?.days ?? 1;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim() || !target) return;
    setSubmitting(true);
    setError(null);
    try {
      await addCountdown(label.trim(), target, uid);
      setLabel('');
      setTarget('');
    } catch {
      setError("Couldn't save that — try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setPendingDeleteId(id);
    try {
      await deleteCountdown(id);
    } catch {
      setError("Couldn't remove that — try again.");
    } finally {
      setPendingDeleteId(null);
    }
  };

  return (
    <Screen
      title="Countdowns"
      subtitle="What the family is waiting for"
      onBack={onBack}
    >
      <form className="card countdown-form" onSubmit={handleAdd}>
        <label className="countdown-field">
          <span>What are you counting down to?</span>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Disney trip"
            maxLength={60}
            required
          />
        </label>
        <label className="countdown-field">
          <span>Date</span>
          <input
            type="date"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            required
          />
        </label>
        {error && <p className="countdown-error">{error}</p>}
        <button
          type="submit"
          className="btn btn-primary countdown-submit"
          disabled={submitting || !label.trim() || !target}
        >
          {submitting ? 'Adding…' : 'Add countdown'}
        </button>
      </form>

      {countdowns.length === 0 ? (
        <div className="card empty-state">
          No countdowns yet — add the first one above.
        </div>
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
              <div className="countdown-bar" role="presentation">
                <span
                  style={{
                    width: `${Math.max(4, 100 - (c.days / longest) * 100)}%`,
                  }}
                />
              </div>
              <div className="countdown-row-bottom">
                <span className="countdown-row-date">
                  {new Date(c.target + 'T00:00:00').toLocaleDateString(
                    undefined,
                    {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    }
                  )}
                </span>
                <button
                  className="btn btn-text countdown-remove"
                  onClick={() => handleDelete(c.id)}
                  disabled={pendingDeleteId === c.id}
                >
                  {pendingDeleteId === c.id ? 'Removing…' : 'Remove'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Screen>
  );
}
