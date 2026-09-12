import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithRedirect,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import type { Role } from './router';
import { PARENT_EMAILS } from './roles';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey);

const app = initializeApp(firebaseConfig);
// getAuth() throws synchronously on an invalid/missing API key, which would
// otherwise crash the whole app to a white screen before React can render
// anything — including a helpful "not configured yet" message.
export const auth = isFirebaseConfigured ? getAuth(app) : null;
export const db = isFirebaseConfigured ? getFirestore(app) : null;
export const functions = isFirebaseConfigured
  ? getFunctions(app, 'us-central1')
  : null;

const googleProvider = new GoogleAuthProvider();

export function signInWithGoogle() {
  if (!auth) throw new Error('Firebase is not configured');
  return signInWithRedirect(auth, googleProvider);
}

export function signOutUser() {
  if (!auth) throw new Error('Firebase is not configured');
  return signOut(auth);
}

export function onAuthReady(callback: (user: User | null) => void) {
  if (!auth) return () => {};
  return onAuthStateChanged(auth, callback);
}

// Creates the user's Firestore profile on first sign-in. The attempted role
// is only a guess for the client to send — firestore.rules independently
// checks the signed-in email against config/parentEmails and rejects the
// write if it doesn't match, so this can't be used to self-promote.
export async function ensureUserProfile(user: User): Promise<void> {
  if (!db) return;
  const ref = doc(db, 'users', user.uid);
  const existing = await getDoc(ref);
  if (existing.exists()) return;

  const role: Role =
    user.email && PARENT_EMAILS.includes(user.email) ? 'parent' : 'kid';

  await setDoc(ref, {
    role,
    displayName: user.displayName ?? null,
    email: user.email ?? null,
    createdAt: serverTimestamp(),
  });
}

export function watchUserRole(
  uid: string,
  callback: (role: Role | null) => void
) {
  if (!db) return () => {};
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => callback((snap.data()?.role as Role | undefined) ?? null),
    () => callback(null)
  );
}
