// Single source of truth for the service worker registration. main.tsx
// calls registerServiceWorker() once on load; App.tsx calls
// onUpdateAvailable() to be told when a new version has installed and is
// waiting. Splitting these used to race: App.tsx called
// navigator.serviceWorker.getRegistration() from its own effect, which can
// resolve before main.tsx's registration (itself deferred to the 'load'
// event) exists yet — getRegistration() then returns undefined and the
// updatefound listener never gets attached for that session. Funneling both
// through the one registration promise here removes the race.

let registrationPromise: Promise<ServiceWorkerRegistration> | null = null;
const updateListeners = new Set<() => void>();

function watchForUpdate(registration: ServiceWorkerRegistration) {
  registration.addEventListener('updatefound', () => {
    const newWorker = registration.installing;
    if (!newWorker) return;

    newWorker.addEventListener('statechange', () => {
      if (
        newWorker.state === 'installed' &&
        navigator.serviceWorker.controller
      ) {
        updateListeners.forEach((listener) => listener());
      }
    });
  });
}

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;

  registrationPromise = navigator.serviceWorker
    .register('/sw.js')
    .then((registration) => {
      watchForUpdate(registration);

      setInterval(() => registration.update(), 60 * 1000);
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) registration.update();
      });

      return registration;
    });
}

/** Calls `listener` once a new service worker has installed and is waiting
 * to take over. Returns an unsubscribe function. */
export function onUpdateAvailable(listener: () => void): () => void {
  updateListeners.add(listener);
  return () => updateListeners.delete(listener);
}

export function activateWaitingServiceWorker(): void {
  if (!registrationPromise) return;

  registrationPromise.then((registration) => {
    const worker = registration.installing || registration.waiting;
    worker?.postMessage({ type: 'SKIP_WAITING' });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    });
  });
}
