import { useCallback, useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import {
  ensureUserProfile,
  isFirebaseConfigured,
  onAuthReady,
  signInWithGoogle,
  signOutUser,
  watchUserRole,
} from './lib/firebase';
import type { Role, Route } from './lib/router';
import { parentChainFor, pathToRoute, routeToPath } from './lib/router';
import {
  watchCountdowns,
  type FirestoreCountdown,
} from './lib/firestoreCountdowns';
import {
  startPresenceHeartbeat,
  watchPresence,
  type PresenceEntry,
} from './lib/presence';
import { AuthScreen } from './components/AuthScreen';
import { UpdatePrompt } from './components/UpdatePrompt';
import { Home } from './screens/Home';
import { GamesScreen } from './screens/GamesScreen';
import { GameDetail } from './screens/GameDetail';
import { ScoresScreen } from './screens/ScoresScreen';
import { CountdownsScreen } from './screens/CountdownsScreen';
import { BlocksGame } from './screens/BlocksGame';
import { WordSearchGame } from './screens/WordSearchGame';
import { TicTacToeGame } from './screens/TicTacToeGame';
import { TicTacToeOnline } from './screens/TicTacToeOnline';
import { ConnectFourGame } from './screens/ConnectFourGame';
import { ConnectFourOnline } from './screens/ConnectFourOnline';
import { DotsAndBoxesGame } from './screens/DotsAndBoxesGame';
import { DotsAndBoxesOnline } from './screens/DotsAndBoxesOnline';
import { UnoGame } from './screens/UnoGame';
import { UnoOnline } from './screens/UnoOnline';
import { BattleshipOnline } from './screens/BattleshipOnline';
import { ReactionGame } from './screens/ReactionGame';
import { CatQueensGame } from './screens/CatQueensGame';
import { WordleGame } from './screens/WordleGame';
import { HangmanGame } from './screens/HangmanGame';
import { HangmanOnline } from './screens/HangmanOnline';
import { SolitaireGame } from './screens/SolitaireGame';
import { SimonGame } from './screens/SimonGame';
import { WaterSortGame } from './screens/WaterSortGame';
import { YahtzeeGame } from './screens/YahtzeeGame';
import { YahtzeeOnline } from './screens/YahtzeeOnline';
import { CheckersGame } from './screens/CheckersGame';
import { CheckersOnline } from './screens/CheckersOnline';
import { MiniCrosswordGame } from './screens/MiniCrosswordGame';
import { WordBloomGame } from './screens/WordBloomGame';
import './App.css';

const HOME: Route = { screen: 'home' };

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<Role | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [countdowns, setCountdowns] = useState<FirestoreCountdown[]>([]);
  const [presence, setPresence] = useState<PresenceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  // Surfaces a manual recovery button if `loading` never resolves — an
  // installed PWA has no browser chrome at all (no address bar, no
  // pull-to-refresh on most platforms), so a stuck auth/profile check
  // otherwise leaves someone with no way back in short of force-quitting
  // the app and hoping. See the effect below for what the button does.
  const [stuckLoading, setStuckLoading] = useState(false);
  const [stack, setStack] = useState<Route[]>(() =>
    parentChainFor(pathToRoute(window.location.pathname) ?? HOME)
  );
  const [updateAvailable, setUpdateAvailable] = useState(false);

  // A deep link (or a reload) lands on one route with no browser history
  // behind it — rebuild a synthetic chain so the hardware/browser back
  // button walks up through the parent screens instead of exiting the app.
  useEffect(() => {
    if (stack.length <= 1) return;
    window.history.replaceState(null, '', routeToPath(stack[0]));
    for (let i = 1; i < stack.length; i++) {
      window.history.pushState(null, '', routeToPath(stack[i]));
    }
    // Runs once on mount only — later navigation is handled by navigate()/back().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If auth/profile resolution hasn't finished after a generous window,
  // assume something's actually stuck (a bad service-worker transition, a
  // hung Firestore listener) rather than just a slow connection, and offer
  // a way out. Cleared the moment loading actually resolves normally.
  useEffect(() => {
    if (!loading) {
      setStuckLoading(false);
      return;
    }
    const timer = window.setTimeout(() => setStuckLoading(true), 8000);
    return () => window.clearTimeout(timer);
  }, [loading]);

  // The hard reset an installed PWA has no other way to trigger: drop every
  // service worker registration and cache, then reload. A plain reload
  // sometimes isn't enough mid-way through a service-worker transition —
  // this is the equivalent of a browser's shift+reload, which isn't
  // available at all in standalone/installed mode.
  const handleHardReset = useCallback(async () => {
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((r) => r.unregister()));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
    } catch {
      // Best-effort — reload regardless, since staying stuck is worse than
      // an imperfect cleanup.
    } finally {
      window.location.reload();
    }
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthReady((nextUser) => {
      setUser(nextUser);
      setUnauthorized(false);
      if (!nextUser) {
        setUserRole(null);
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) return;

    let unsubscribeRole: (() => void) | undefined;
    let cancelled = false;

    ensureUserProfile(user)
      .then(() => {
        if (cancelled) return;
        unsubscribeRole = watchUserRole(user.uid, (role) => {
          setUserRole(role);
          setLoading(false);
        });
      })
      .catch(() => {
        // Not in config/allowedEmails, or some other rules rejection —
        // treat as "not a family member" rather than crashing.
        if (!cancelled) {
          setUnauthorized(true);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      unsubscribeRole?.();
    };
  }, [user]);

  useEffect(() => {
    if (!user || !userRole) return;
    return watchCountdowns(setCountdowns, () => setCountdowns([]));
  }, [user, userRole]);

  useEffect(() => {
    if (!user || !userRole) return;
    const stopHeartbeat = startPresenceHeartbeat(
      user.uid,
      user.displayName || user.email || 'Someone',
      user.photoURL
    );
    const stopWatching = watchPresence(setPresence, () => setPresence([]));
    return () => {
      stopHeartbeat();
      stopWatching();
    };
  }, [user, userRole]);

  // Every push adds a history entry so the Android/browser back button pops
  // the stack instead of exiting the PWA. Resyncing the whole stack from the
  // URL on every popstate (rather than just slicing off one entry) keeps
  // things correct even after the browser's forward button or multiple
  // rapid back presses.
  useEffect(() => {
    const onPop = () => {
      const route = pathToRoute(window.location.pathname) ?? HOME;
      setStack(parentChainFor(route));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Reset scroll on every navigation — otherwise a new screen can render
  // already scrolled partway down if the previous screen was scrolled.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [stack]);

  const navigate = useCallback((next: Route) => {
    setStack((s) => [...s, next]);
    window.history.pushState(null, '', routeToPath(next));
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
        {stuckLoading && (
          <div className="loading-stuck">
            <p>Taking longer than usual.</p>
            <button onClick={handleHardReset} className="btn btn-primary">
              Reload app
            </button>
          </div>
        )}
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

  if (unauthorized) {
    return (
      <div className="auth-screen">
        <div className="auth-container">
          <h1>Not on the list</h1>
          <p>
            {user.email} isn&rsquo;t in the family allowlist yet. Ask a parent
            to add it in Firebase, then sign in again.
          </p>
          <button className="btn btn-text" onClick={() => signOutUser()}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  const route = stack[stack.length - 1];

  return (
    <div className="app-container">
      <main className="app-content">
        {route.screen === 'home' && (
          <Home
            user={user}
            userRole={userRole}
            countdowns={countdowns}
            presence={presence}
            onNavigate={navigate}
            onSignOut={() => signOutUser()}
          />
        )}
        {route.screen === 'games' && (
          <GamesScreen
            userRole={userRole}
            onBack={back}
            onOpenGame={(gameId, modeId) =>
              navigate({ screen: 'game', gameId, modeId })
            }
            onOpenScores={() => navigate({ screen: 'scores' })}
          />
        )}
        {route.screen === 'game' && (
          <GameDetail
            gameId={route.gameId}
            initialModeId={route.modeId}
            uid={user.uid}
            onBack={back}
            onModeChange={(modeId) =>
              window.history.replaceState(
                null,
                '',
                routeToPath({ screen: 'game', gameId: route.gameId, modeId })
              )
            }
            onPlayBlocks={(mode) => navigate({ screen: 'play-blocks', mode })}
            onPlayWordSearch={(puzzleId) =>
              navigate({ screen: 'play-wordsearch', puzzleId })
            }
            onPlayTicTacToe={(mode) =>
              navigate({ screen: 'play-tictactoe', mode })
            }
            onPlayConnectFour={(mode) =>
              navigate({ screen: 'play-connect4', mode })
            }
            onPlayDotsAndBoxes={(mode) =>
              navigate({ screen: 'play-dotsandboxes', mode })
            }
            onPlayUno={(mode) => navigate({ screen: 'play-uno', mode })}
            onPlayBattleship={() => navigate({ screen: 'play-battleship' })}
            onPlayReaction={() => navigate({ screen: 'play-reaction' })}
            onPlayCatQueens={(size) => navigate({ screen: 'play-catqueens', size })}
            onPlayWordle={(mode) => navigate({ screen: 'play-wordle', mode })}
            onPlayHangman={(mode) => navigate({ screen: 'play-hangman', mode })}
            onPlaySolitaire={(mode) => navigate({ screen: 'play-solitaire', mode })}
            onPlaySimon={(mode) => navigate({ screen: 'play-simon', mode })}
            onPlayWaterSort={() => navigate({ screen: 'play-watersort' })}
            onPlayYahtzee={(mode) => navigate({ screen: 'play-yahtzee', mode })}
            onPlayCheckers={(mode) => navigate({ screen: 'play-checkers', mode })}
            onPlayCrossword={() => navigate({ screen: 'play-crossword' })}
            onPlayWordBloom={(mode) => navigate({ screen: 'play-wordbloom', mode })}
          />
        )}
        {route.screen === 'play-blocks' && (
          <BlocksGame
            mode={route.mode}
            uid={user.uid}
            displayName={user.displayName || user.email || 'Someone'}
            onBack={back}
          />
        )}
        {route.screen === 'play-wordsearch' && (
          <WordSearchGame
            puzzleId={route.puzzleId}
            uid={user.uid}
            displayName={user.displayName || user.email || 'Someone'}
            onBack={back}
          />
        )}
        {route.screen === 'play-tictactoe' &&
          (route.mode === 'online' ? (
            <TicTacToeOnline
              uid={user.uid}
              displayName={user.displayName || user.email || 'Someone'}
              onBack={back}
            />
          ) : (
            <TicTacToeGame onBack={back} />
          ))}
        {route.screen === 'play-connect4' &&
          (route.mode === 'online' ? (
            <ConnectFourOnline
              uid={user.uid}
              displayName={user.displayName || user.email || 'Someone'}
              onBack={back}
            />
          ) : (
            <ConnectFourGame onBack={back} />
          ))}
        {route.screen === 'play-dotsandboxes' &&
          (route.mode === 'online' ? (
            <DotsAndBoxesOnline
              uid={user.uid}
              displayName={user.displayName || user.email || 'Someone'}
              onBack={back}
            />
          ) : (
            <DotsAndBoxesGame onBack={back} />
          ))}
        {route.screen === 'play-uno' &&
          (route.mode === 'online' ? (
            <UnoOnline
              uid={user.uid}
              displayName={user.displayName || user.email || 'Someone'}
              onBack={back}
            />
          ) : (
            <UnoGame onBack={back} />
          ))}
        {route.screen === 'play-battleship' && (
          <BattleshipOnline
            uid={user.uid}
            displayName={user.displayName || user.email || 'Someone'}
            onBack={back}
          />
        )}
        {route.screen === 'play-reaction' && (
          <ReactionGame
            uid={user.uid}
            displayName={user.displayName || user.email || 'Someone'}
            onBack={back}
          />
        )}
        {route.screen === 'play-solitaire' && (
          <SolitaireGame
            mode={route.mode}
            uid={user.uid}
            displayName={user.displayName || user.email || 'Someone'}
            onBack={back}
          />
        )}
        {route.screen === 'play-simon' && (
          <SimonGame
            mode={route.mode}
            uid={user.uid}
            displayName={user.displayName || user.email || 'Someone'}
            onBack={back}
          />
        )}
        {route.screen === 'play-watersort' && (
          <WaterSortGame
            uid={user.uid}
            displayName={user.displayName || user.email || 'Someone'}
            onBack={back}
          />
        )}
        {route.screen === 'play-yahtzee' &&
          (route.mode === 'online' ? (
            <YahtzeeOnline
              uid={user.uid}
              displayName={user.displayName || user.email || 'Someone'}
              onBack={back}
            />
          ) : (
            <YahtzeeGame onBack={back} />
          ))}
        {route.screen === 'play-checkers' &&
          (route.mode === 'online' ? (
            <CheckersOnline
              uid={user.uid}
              displayName={user.displayName || user.email || 'Someone'}
              onBack={back}
            />
          ) : (
            <CheckersGame onBack={back} />
          ))}
        {route.screen === 'play-crossword' && (
          <MiniCrosswordGame
            uid={user.uid}
            displayName={user.displayName || user.email || 'Someone'}
            onBack={back}
          />
        )}
        {route.screen === 'play-wordbloom' && (
          <WordBloomGame
            mode={route.mode}
            uid={user.uid}
            displayName={user.displayName || user.email || 'Someone'}
            onBack={back}
          />
        )}
        {route.screen === 'play-catqueens' && (
          <CatQueensGame
            size={route.size}
            uid={user.uid}
            displayName={user.displayName || user.email || 'Someone'}
            onBack={back}
          />
        )}
        {route.screen === 'play-wordle' && (
          <WordleGame
            mode={route.mode === 'free' ? 'free' : 'family'}
            uid={user.uid}
            displayName={user.displayName || user.email || 'Someone'}
            onBack={back}
          />
        )}
        {route.screen === 'play-hangman' &&
          (route.mode === 'family' ? (
            <HangmanOnline
              uid={user.uid}
              displayName={user.displayName || user.email || 'Someone'}
              onBack={back}
            />
          ) : (
            <HangmanGame
              uid={user.uid}
              displayName={user.displayName || user.email || 'Someone'}
              onBack={back}
            />
          ))}
        {route.screen === 'scores' && (
          <ScoresScreen userRole={userRole} onBack={back} />
        )}
        {route.screen === 'countdowns' && (
          <CountdownsScreen
            countdowns={countdowns}
            uid={user.uid}
            onBack={back}
          />
        )}
      </main>
      {updateAvailable && <UpdatePrompt onUpdate={handleUpdateNow} />}
    </div>
  );
}
