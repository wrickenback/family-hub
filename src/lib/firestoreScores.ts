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
import type { Scoring } from './router';

export interface LeaderboardEntry {
  id: string;
  name: string;
  value: number;
  createdAt: Date | null;
}

/** Which end of the value range wins, per scoring type. bestMs and
 * bestDuration rank ascending (a 210ms reaction beats a 400ms one); the
 * rest rank descending. This has to drive the Firestore query itself, not
 * just the client-side sort — ordering the query the wrong way and then
 * re-sorting locally returns the N *worst* scores and ranks those. */
export function sortDirectionFor(scoring: Scoring): 'asc' | 'desc' {
  return scoring === 'bestMs' || scoring === 'bestDuration' ? 'asc' : 'desc';
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

/** Free-play style leaderboard: best scores ever, for a game+mode.
 * `order` must match the game's scoring type — see sortDirectionFor. */
export function watchTopScores(
  gameId: string,
  mode: string,
  onChange: (entries: LeaderboardEntry[]) => void,
  onError: (error: unknown) => void,
  limit = 10,
  order: 'asc' | 'desc' = 'desc'
) {
  if (!db) return () => {};
  const q = query(
    collection(db, 'scores'),
    where('gameId', '==', gameId),
    where('mode', '==', mode),
    orderBy('value', order),
    fbLimit(limit)
  );
  return onSnapshot(q, (snap) => onChange(mapEntries(snap)), onError);
}

/** Daily-mode leaderboard: best scores for one specific day only, so free
 * play and the daily challenge never get compared against each other and
 * each day's board resets. */
export function watchDailyTopScores(
  gameId: string,
  mode: string,
  dateKey: string,
  onChange: (entries: LeaderboardEntry[]) => void,
  onError: (error: unknown) => void,
  limit = 10,
  order: 'asc' | 'desc' = 'desc'
) {
  if (!db) return () => {};
  const q = query(
    collection(db, 'scores'),
    where('gameId', '==', gameId),
    where('mode', '==', mode),
    where('dateKey', '==', dateKey),
    orderBy('value', order),
    fbLimit(limit)
  );
  return onSnapshot(q, (snap) => onChange(mapEntries(snap)), onError);
}

/** Leaderboard for a 'wins' game, where each score doc is a single win
 * rather than a comparable score. Ranking the raw docs would just print a
 * column of "1 win" rows, so the wins are counted per player here instead.
 * Aggregating client-side over a recent window is plenty at family scale
 * and avoids maintaining a separate rollup document. */
export function watchWinTotals(
  gameId: string,
  mode: string,
  onChange: (entries: LeaderboardEntry[]) => void,
  onError: (error: unknown) => void,
  scanLimit = 300
) {
  if (!db) return () => {};
  const q = query(
    collection(db, 'scores'),
    where('gameId', '==', gameId),
    where('mode', '==', mode),
    orderBy('createdAt', 'desc'),
    fbLimit(scanLimit)
  );
  return onSnapshot(
    q,
    (snap) => {
      const totals = new Map<string, LeaderboardEntry>();
      for (const d of snap.docs) {
        const data = d.data();
        const uid = (data.uid as string) ?? d.id;
        const createdAt = data.createdAt as { toDate?: () => Date } | undefined;
        const existing = totals.get(uid);
        if (existing) {
          existing.value += (data.value as number) ?? 1;
        } else {
          totals.set(uid, {
            id: uid,
            name: (data.name as string) ?? 'Someone',
            value: (data.value as number) ?? 1,
            // Query is newest-first, so the first doc seen per player is
            // their most recent win — the right date to show beside a total.
            createdAt: createdAt?.toDate ? createdAt.toDate() : null,
          });
        }
      }
      onChange([...totals.values()].sort((a, b) => b.value - a.value));
    },
    onError
  );
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
