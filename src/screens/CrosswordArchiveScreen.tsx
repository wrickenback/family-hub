import { useEffect, useState } from 'react';
import { Screen } from '../components/Screen';
import { easternDateKey } from '../lib/miniCrosswordEngine';
import { playedCrosswordDates } from '../lib/firestoreCrossword';
import './Home.css';

/** How far back the archive reaches. Firestore's `in` filter tops out at 30
 * values, so this also caps how many "played?" lookups happen in one
 * round trip — see playedCrosswordDates. */
const ARCHIVE_DAYS = 30;

function pastDateKeys(count: number): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    keys.push(easternDateKey(d));
  }
  return keys;
}

function labelFor(dateKey: string, today: string): string {
  if (dateKey === today) return 'Today';
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

export function CrosswordArchiveScreen({
  uid,
  onPlay,
  onBack,
}: {
  uid: string;
  onPlay: (dateKey: string) => void;
  onBack: () => void;
}) {
  const [played, setPlayed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const today = easternDateKey();
  const dateKeys = pastDateKeys(ARCHIVE_DAYS);

  useEffect(() => {
    let live = true;
    playedCrosswordDates(uid, dateKeys).then((next) => {
      if (live) {
        setPlayed(next);
        setLoading(false);
      }
    });
    return () => {
      live = false;
    };
    // dateKeys is rebuilt fresh each render but only actually changes once a
    // day (it's derived from `today`), so keying off `today` avoids an
    // effect that re-fires on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, today]);

  return (
    <Screen
      title="Crossword archive"
      subtitle="Catch up on any day you missed"
      onBack={onBack}
    >
      {loading ? (
        <div className="card empty-state">Loading…</div>
      ) : (
        <ul className="countdown-list">
          {dateKeys.map((dateKey) => {
            const isPlayed = played.has(dateKey);
            return (
              <li key={dateKey} className="card countdown-row">
                <div className="countdown-row-top">
                  <span className="countdown-row-label">
                    {labelFor(dateKey, today)}
                  </span>
                  {isPlayed && (
                    <span className="pill pill-sample">Solved</span>
                  )}
                </div>
                <div className="countdown-row-bottom">
                  <span className="countdown-row-date">{dateKey}</span>
                  <button
                    className="btn btn-text"
                    onClick={() => onPlay(dateKey)}
                  >
                    {isPlayed ? 'Play again' : 'Play'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Screen>
  );
}
