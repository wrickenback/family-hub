import { useEffect, useState } from 'react';

/** Whether the browser thinks it has a connection.
 *
 * Deliberately only used to decide what to *offer*, never to block:
 * navigator.onLine reports the network interface, not whether anything is
 * actually reachable, so it says true on a captive wifi portal and on a
 * train with a dead signal. Everything here still tries the real call and
 * handles its failure — this only changes which suggestion the player is
 * given when something goes wrong. */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  );

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return online;
}
