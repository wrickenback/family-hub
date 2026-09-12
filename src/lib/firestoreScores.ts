import {
  addDoc,
  collection,
  limit as fbLimit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { db } from './firebase';

export interface LeaderboardEntry {
  id: string;
  name: string;
  value: number;
  createdAt: Date | null;
}

export async function submitScore(params: {
  gameId: string;
  mode: string;
  dateKey?: string;
  uid: string;
  name: string;
  value: number;
}) {
  if (!db) return;
  await addDoc(collection(db, 'scores'), {
    gameId: params.gameId,
    mode: params.mode,
    dateKey: params.dateKey ?? null,
    uid: params.uid,
    name: params.name,
    value: params.value,
    createdAt: serverTimestamp(),
  });
}

/** Free-play style leaderboard: top scores ever, for a game+mode. */
export function watchTopScores(
  gameId: string,
  mode: string,
  onChange: (entries: LeaderboardEntry[]) => void,
  onError: (error: unknown) => void,
  limit = 10
) {
  if (!db) return () => {};
  const q = query(
    collection(db, 'scores'),
    where('gameId', '==', gameId),
    where('mode', '==', mode),
    orderBy('value', 'desc'),
    fbLimit(limit)
  );
  return onSnapshot(q, (snap) => onChange(mapEntries(snap)), onError);
}

/** Daily-mode leaderboard: top scores for one specific day only, so free
 * play and the daily challenge never get compared against each other and
 * each day's board resets. */
export function watchDailyTopScores(
  gameId: string,
  mode: string,
  dateKey: string,
  onChange: (entries: LeaderboardEntry[]) => void,
  onError: (error: unknown) => void,
  limit = 10
) {
  if (!db) return () => {};
  const q = query(
    collection(db, 'scores'),
    where('gameId', '==', gameId),
    where('mode', '==', mode),
    where('dateKey', '==', dateKey),
    orderBy('value', 'desc'),
    fbLimit(limit)
  );
  return onSnapshot(q, (snap) => onChange(mapEntries(snap)), onError);
}

function mapEntries(snap: {
  docs: { id: string; data: () => Record<string, unknown> }[];
}): LeaderboardEntry[] {
  return snap.docs.map((d) => {
    const data = d.data();
    const createdAt = data.createdAt as { toDate?: () => Date } | undefined;
    return {
      id: d.id,
      name: (data.name as string) ?? 'Someone',
      value: (data.value as number) ?? 0,
      createdAt: createdAt?.toDate ? createdAt.toDate() : null,
    };
  });
}
