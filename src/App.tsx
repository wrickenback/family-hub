import { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import {
  isFirebaseConfigured,
  onAuthReady,
  signInWithGoogle,
  signOutUser,
} from './lib/firebase';
import { apps, canAccessApp, type Role } from './lib/router';
import { AuthScreen } from './components/AuthScreen';
import { Nav } from './components/Nav';
import { UpdatePrompt } from './components/UpdatePrompt';
import './App.css';

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentAppId, setCurrentAppId] = useState('blocks');
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthReady((user) => {
      setUser(user);
      if (user) {
        // TODO: Fetch user role from Firestore
        setUserRole('kid');
      } else {
        setUserRole(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const checkForUpdates = () => {
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
    };

    checkForUpdates();
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

  const currentApp = apps.find((app) => app.id === currentAppId);
  const hasAccess = currentApp ? canAccessApp(currentApp, userRole) : false;

  useEffect(() => {
    if (user && (!currentApp || !hasAccess)) {
      setCurrentAppId('blocks');
    }
  }, [user, currentApp, hasAccess]);

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
            Firebase isn&rsquo;t configured yet. Copy{' '}
            <code>.env.example</code> to <code>.env.local</code> and fill in
            your Firebase project credentials, then restart the dev server.
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen onSignIn={signInWithGoogle} />;
  }

  if (!currentApp || !hasAccess) {
    return null;
  }

  return (
    <div className="app-container">
      <Nav
        currentAppId={currentAppId}
        onNavigate={setCurrentAppId}
        userRole={userRole}
        user={user}
        onSignOut={() => signOutUser()}
      />
      <main className="app-content">
        <currentApp.component />
      </main>
      {updateAvailable && <UpdatePrompt onUpdate={handleUpdateNow} />}
    </div>
  );
}
