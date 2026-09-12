import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

export interface FirestoreCountdown {
  id: string;
  label: string;
  target: string; // YYYY-MM-DD
}

export function watchCountdowns(
  onChange: (countdowns: FirestoreCountdown[]) => void,
  onError: (error: unknown) => void
) {
  if (!db) return () => {};
  const q = query(collection(db, 'countdowns'), orderBy('target', 'asc'));
  return onSnapshot(
    q,
    (snap) => {
      onChange(
        snap.docs.map((d) => ({
          id: d.id,
          label: d.data().label as string,
          target: d.data().target as string,
        }))
      );
    },
    onError
  );
}

export async function addCountdown(label: string, target: string, uid: string) {
  if (!db) throw new Error('Firestore is not configured');
  await addDoc(collection(db, 'countdowns'), {
    label,
    target,
    createdBy: uid,
    createdAt: serverTimestamp(),
  });
}

export async function deleteCountdown(id: string) {
  if (!db) throw new Error('Firestore is not configured');
  await deleteDoc(doc(db, 'countdowns', id));
}
