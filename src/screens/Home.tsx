import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  IconCalendar,
  IconChevronRight,
  IconClock,
  IconGames,
  IconHourglass,
  IconTrophy,
} from '../components/icons';
import { Avatar } from '../components/Avatar';
import { OpenTables } from '../components/OpenTables';
import { dayLabel, daysUntil, timeLabel } from '../lib/format';
import { sampleEvents } from '../lib/sampleData';
import type { FirestoreCountdown } from '../lib/firestoreCountdowns';
import { isActive, type PresenceEntry } from '../lib/presence';
import type { Role, Route } from '../lib/router';
import { getVisibleGames } from '../lib/router';
import './Home.css';

interface HomeProps {
  user: User;
  userRole: Role | null;
  countdowns: FirestoreCountdown[];
  presence: PresenceEntry[];
  onNavigate: (route: Route) => void;
  onSignOut: () => void;
}

export function Home({
  user,
  userRole,
  countdowns: rawCountdowns,
  presence,
  onNavigate,
  onSignOut,
}: HomeProps) {
  const firstName = (user.displayName || user.email || 'there').split(/[ @]/)[0];
  const countdowns = rawCountdowns
    .map((c) => ({ ...c, days: daysUntil(c.target) }))
    .filter((c) => c.days >= 0)
    .sort((a, b) => a.days - b.days);
  const upNext = sampleEvents
    .filter((e) => e.start.getTime() >= Date.now() - 3600000)
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .slice(0, 3);
  const gameCount = getVisibleGames(userRole).length;

  // Presence is only refreshed when Firestore data changes, but "active"
  // status decays purely with the passage of time — tick every 15s so
  // someone's avatar actually disappears once their heartbeat goes stale,
  // not just whenever someone else's presence doc happens to update.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => forceTick((n) => n + 1), 15_000);
    return () => window.clearInterval(id);
  }, []);

  const othersActive = presence.filter(
    (p) => p.uid !== user.uid && isActive(p)
  );

  return (
    <div className="home">
      <header className="home-header">
        <div>
          <p className="home-greeting">Hi {firstName}</p>
          <h1 className="home-title">Family Hub</h1>
        </div>
        <AccountMenu user={user} onSignOut={onSignOut} />
      </header>

      <div className="home-body">
        <OpenTables uid={user.uid} onNavigate={onNavigate} />

        {othersActive.length > 0 && (
          <section className="section">
            <div className="section-head">
              <span className="section-title online-title">
                <span className="online-dot" />
                Online now
              </span>
            </div>
            <ul className="presence-strip" aria-label="Family members online">
              {othersActive.map((p) => (
                <li key={p.uid} className="presence-item">
                  <Avatar name={p.displayName} photoURL={p.photoURL} size={44} />
                  <span className="presence-name">
                    {p.displayName.split(' ')[0]}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {countdowns.length > 0 && (
          <section className="section">
            <div className="section-head">
              <span className="section-title">
                <IconHourglass aria-hidden="true" />
                Counting down
              </span>
            </div>
            <ul
              className="countdown-strip"
              aria-label="Active countdowns"
            >
              {countdowns.map((c) => (
                <li key={c.id}>
                  <button
                    className="countdown-card"
                    onClick={() => onNavigate({ screen: 'countdowns' })}
                  >
                    <span className="countdown-days">{c.days}</span>
                    <span className="countdown-unit">
                      {c.days === 1 ? 'day' : 'days'}
                    </span>
                    <span className="countdown-label">{c.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="section">
          <div className="section-head">
            <span className="section-title">
              <IconClock aria-hidden="true" />
              Up next
            </span>
            <button
              className="btn btn-text"
              onClick={() => onNavigate({ screen: 'calendar' })}
            >
              See all
            </button>
          </div>
          {upNext.length === 0 ? (
            <div className="card empty-state">Nothing scheduled.</div>
          ) : (
            <ul className="event-list card">
              {upNext.map((event) => (
                <li key={event.id} className="event-row">
                  <div className="event-when">
                    <span className="event-day">{dayLabel(event.start)}</span>
                    <span className="event-time">
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
          )}
        </section>

        <section className="section">
          <div className="hub-grid">
            <HubCard
              icon={<IconGames aria-hidden="true" />}
              title="Games"
              meta={`${gameCount} to play`}
              tone="rust"
              onClick={() => onNavigate({ screen: 'games' })}
            />
            <HubCard
              icon={<IconTrophy aria-hidden="true" />}
              title="Scores"
              meta="Family top 10s"
              tone="gold"
              onClick={() => onNavigate({ screen: 'scores' })}
            />
            <HubCard
              icon={<IconCalendar aria-hidden="true" />}
              title="Calendar"
              meta="School, track & family"
              tone="teal"
              onClick={() => onNavigate({ screen: 'calendar' })}
            />
            <HubCard
              icon={<IconHourglass aria-hidden="true" />}
              title="Countdowns"
              meta={`${countdowns.length} active`}
              tone="sand"
              onClick={() => onNavigate({ screen: 'countdowns' })}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function AccountMenu({
  user,
  onSignOut,
}: {
  user: User;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  return (
    <div className="account-menu" ref={ref}>
      <button
        className="account-avatar-btn"
        onClick={() => setOpen((o) => !o)}
        aria-label="Account menu"
        aria-expanded={open}
      >
        <Avatar
          name={user.displayName || user.email || '?'}
          photoURL={user.photoURL}
          size={40}
        />
      </button>
      {open && (
        <div className="account-dropdown card">
          <p className="account-dropdown-name">
            {user.displayName || 'Signed in'}
          </p>
          <p className="account-dropdown-email">{user.email}</p>
          <button className="btn btn-text account-signout" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

interface HubCardProps {
  icon: ReactNode;
  title: string;
  meta: string;
  tone: 'rust' | 'teal' | 'gold' | 'sand';
  onClick: () => void;
}

function HubCard({ icon, title, meta, tone, onClick }: HubCardProps) {
  return (
    <button className={`hub-card tone-${tone}`} onClick={onClick}>
      <span className="hub-icon">{icon}</span>
      <span className="hub-text">
        <span className="hub-title">{title}</span>
        <span className="hub-meta">{meta}</span>
      </span>
      <IconChevronRight className="chevron-affordance" aria-hidden="true" />
    </button>
  );
}
