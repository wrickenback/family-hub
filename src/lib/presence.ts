import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from './firebase';

const HEARTBEAT_MS = 25_000;
/** How recent lastActive must be to count as "online" — a heuristic, since
 * Firestore has no true disconnect signal like Realtime Database's
 * onDisconnect. A closed tab just stops refreshing its heartbeat and ages
 * out after this window. */
export const ACTIVE_THRESHOLD_MS = 60_000;

export interface PresenceEntry {
  uid: string;
  displayName: string;
  photoURL: string | null;
  lastActive: Date | null;
}

/** Writes a heartbeat immediately and on an interval while the tab is
 * visible. Returns a cleanup function to stop it (call on sign-out/unmount —
 * there's no explicit "going offline" write, the heartbeat just stops and
 * the entry ages out for other viewers). */
export function startPresenceHeartbeat(
  uid: string,
  displayName: string,
  photoURL: string | null
): () => void {
  if (!db) return () => {};
  const ref = doc(db, 'presence', uid);

  const beat = () => {
    if (document.visibilityState !== 'visible') return;
    setDoc(
      ref,
      { displayName, photoURL, lastActive: serverTimestamp() },
      { merge: true }
    ).catch(() => {});
  };

  beat();
  const interval = window.setInterval(beat, HEARTBEAT_MS);
  const onVisible = () => {
    if (document.visibilityState === 'visible') beat();
  };
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    window.clearInterval(interval);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

export function watchPresence(
  onChange: (entries: PresenceEntry[]) => void,
  onError: (error: unknown) => void
) {
  if (!db) return () => {};
  return onSnapshot(
    collection(db, 'presence'),
    (snap) => {
      onChange(
        snap.docs.map((d) => {
          const data = d.data();
          const ts = data.lastActive as { toDate?: () => Date } | undefined;
          return {
            uid: d.id,
            displayName: (data.displayName as string) ?? 'Someone',
            photoURL: (data.photoURL as string | null) ?? null,
            lastActive: ts?.toDate ? ts.toDate() : null,
          };
        })
      );
    },
    onError
  );
}

export function isActive(entry: PresenceEntry, now = Date.now()): boolean {
  return !!entry.lastActive && now - entry.lastActive.getTime() < ACTIVE_THRESHOLD_MS;
}
