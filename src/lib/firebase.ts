import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithRedirect,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  User,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

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
