import { User } from 'firebase/auth';
import { apps, getVisibleApps, type Role } from '../lib/router';
import './Nav.css';

interface NavProps {
  currentAppId: string;
  onNavigate: (appId: string) => void;
  userRole: Role | null;
  user: User;
  onSignOut: () => void;
}

export function Nav({
  currentAppId,
  onNavigate,
  userRole,
  user,
  onSignOut,
}: NavProps) {
  const visibleApps = getVisibleApps(userRole);

  return (
    <nav className="nav">
      <div className="nav-header">
        <h1 className="nav-title">Family Hub</h1>
        <div className="nav-user">
          <span className="user-name">{user.displayName || user.email}</span>
          <button onClick={onSignOut} className="btn btn-text">
            Sign out
          </button>
        </div>
      </div>
      <div className="nav-apps">
        {visibleApps.map((app) => (
          <button
            key={app.id}
            onClick={() => onNavigate(app.id)}
            className={`nav-app ${app.id === currentAppId ? 'active' : ''}`}
          >
            {app.name}
          </button>
        ))}
      </div>
    </nav>
  );
}
