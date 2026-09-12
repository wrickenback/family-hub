import { useCallback, useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import {
  isFirebaseConfigured,
  onAuthReady,
  signInWithGoogle,
  signOutUser,
} from './lib/firebase';
import type { Role, Route } from './lib/router';
import { AuthScreen } from './components/AuthScreen';
import { UpdatePrompt } from './components/UpdatePrompt';
import { Home } from './screens/Home';
import { GamesScreen } from './screens/GamesScreen';
import { GameDetail } from './screens/GameDetail';
import { ScoresScreen } from './screens/ScoresScreen';
import { CalendarScreen } from './screens/CalendarScreen';
import { CountdownsScreen } from './screens/CountdownsScreen';
import './App.css';

const HOME: Route = { screen: 'home' };

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  const [stack, setStack] = useState<Route[]>([HOME]);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthReady((user) => {
      setUser(user);
      // TODO: Fetch user role from Firestore
      setUserRole(user ? 'kid' : null);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // Every push adds a history entry so the Android/browser back button pops the
  // stack instead of exiting the PWA. Back always routes through history.back()
  // so popstate stays the single source of truth.
  useEffect(() => {
    const onPop = () =>
      setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((next: Route) => {
    setStack((s) => [...s, next]);
    window.history.pushState(null, '');
  }, []);

  const back = useCallback(() => window.history.back(), []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.getRegistration().then((registration) => {
      if (!registration) return;

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (
            newWorker.state === 'installed' &&
            navigator.serviceWorker.controller
          ) {
            setUpdateAvailable(true);
          }
        });
      });
    });
  }, []);

  const handleUpdateNow = () => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.getRegistration().then((registration) => {
      if (!registration) return;

      const worker = registration.installing || registration.waiting;
      if (worker) {
        worker.postMessage({ type: 'SKIP_WAITING' });
      }

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        setUpdateAvailable(false);
        window.location.reload();
      });
    });
  };

  if (loading) {
    return (
      <div className="loading" role="status" aria-live="polite">
        Loading...
      </div>
    );
  }

  if (!isFirebaseConfigured) {
    return (
      <div className="auth-screen">
        <div className="auth-container">
          <h1>Family Hub</h1>
          <p>
            Firebase isn&rsquo;t configured yet. Copy <code>.env.example</code>{' '}
            to <code>.env.local</code> and fill in your Firebase project
            credentials, then restart the dev server.
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen onSignIn={signInWithGoogle} />;
  }

  const route = stack[stack.length - 1];

  return (
    <div className="app-container">
      <main className="app-content">
        {route.screen === 'home' && (
          <Home
            user={user}
            userRole={userRole}
            onNavigate={navigate}
            onSignOut={() => signOutUser()}
          />
        )}
        {route.screen === 'games' && (
          <GamesScreen
            userRole={userRole}
            onBack={back}
            onOpenGame={(gameId) => navigate({ screen: 'game', gameId })}
          />
        )}
        {route.screen === 'game' && (
          <GameDetail gameId={route.gameId} onBack={back} />
        )}
        {route.screen === 'scores' && (
          <ScoresScreen userRole={userRole} onBack={back} />
        )}
        {route.screen === 'calendar' && <CalendarScreen onBack={back} />}
        {route.screen === 'countdowns' && <CountdownsScreen onBack={back} />}
      </main>
      {updateAvailable && <UpdatePrompt onUpdate={handleUpdateNow} />}
    </div>
  );
}
