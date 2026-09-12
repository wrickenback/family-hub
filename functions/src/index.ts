import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { generateTopicWords } from './gemini';
import { buildWordSearchGrid, type Difficulty } from './wordSearchGrid';

admin.initializeApp();
const db = admin.firestore();

const geminiApiKey = defineSecret('GEMINI_API_KEY');

function slugify(topic: string): string {
  return topic
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * Generates a new Word Search puzzle for a topic: Gemini supplies the word
 * list (never called from the client — the API key stays server-side),
 * then a deterministic local algorithm places them into a grid. Stores the
 * finished puzzle in Firestore and returns it so the client can start
 * playing immediately without a second round trip.
 */
export const generateWordSearchPuzzle = onCall(
  { region: 'us-central1', secrets: [geminiApiKey] },
  async (request) => {
    const email = request.auth?.token.email;
    if (!request.auth || !email) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }

    const allowlistDoc = await db.doc('config/allowedEmails').get();
    const allowedEmails: string[] = allowlistDoc.data()?.emails ?? [];
    if (!allowedEmails.includes(email)) {
      throw new HttpsError('permission-denied', 'Not a family member.');
    }

    const topic = String(request.data?.topic ?? '').trim();
    if (!topic || topic.length > 60) {
      throw new HttpsError('invalid-argument', 'Give a topic between 1 and 60 characters.');
    }

    const difficulty: Difficulty = request.data?.difficulty === 'easy' ? 'easy' : 'hard';

    const words = await generateTopicWords(geminiApiKey.value(), topic);
    if (words.length < 4) {
      throw new HttpsError(
        'unavailable',
        "Couldn't find enough words for that topic — try a different one."
      );
    }

    const puzzle = buildWordSearchGrid(
      words,
      Date.now() ^ Math.floor(Math.random() * 1e9),
      difficulty
    );
    if (puzzle.words.length < 4) {
      throw new HttpsError(
        'internal',
        "Couldn't fit enough of those words into a grid — try a different topic."
      );
    }

    const docRef = await db.collection('wordSearchPuzzles').add({
      topic,
      topicSlug: slugify(topic),
      difficulty,
      size: puzzle.size,
      grid: puzzle.grid,
      words: puzzle.words,
      createdBy: request.auth.uid,
      createdByName: request.auth.token.name ?? 'Someone',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { id: docRef.id, ...puzzle, topic, difficulty };
  }
);

// TODO: Implement scheduled functions

/**
 * Sync ICS feeds (school calendar, track team calendar)
 * Run every few hours
 */
export const syncIcsFeeds = functions
  .region('us-central1')
  .pubsub.schedule('every 4 hours')
  .onRun(async () => {
    // Fetch school and track team ICS feeds
    // Parse events
    // Upsert into Firestore /schedule collection
    functions.logger.info('ICS sync started');
    return null;
  });

/**
 * Sync Google Calendar events
 * Run every few hours (same cadence as ICS for consistency)
 */
export const syncGoogleCalendar = functions
  .region('us-central1')
  .pubsub.schedule('every 4 hours')
  .onRun(async () => {
    // Use stored refresh token to fetch user's Google Calendar
    // Parse events
    // Upsert into Firestore /schedule collection
    functions.logger.info('Google Calendar sync started');
    return null;
  });

// Deliberately no server-side "initialize user profile on sign-in" trigger
// here — that's handled client-side by ensureUserProfile() in
// src/lib/firebase.ts, which picks the correct role (kid vs parent) from
// config/parentEmails. A version of this used to live here and hardcoded
// role: 'kid' for everyone; since it ran via the Admin SDK (which bypasses
// Firestore rules) it would have won the race against the client's correct
// write and permanently locked parents out of the parent role. Removed
// rather than fixed — no reason to duplicate this in two places.

/**
 * Clean up game invites older than 7 days
 */
export const cleanupOldInvites = functions
  .region('us-central1')
  .pubsub.schedule('every day 3:00')
  .onRun(async () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const batch = db.batch();

    const snapshot = await db
      .collection('invites')
      .where('createdAt', '<', sevenDaysAgo)
      .get();

    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    await batch.commit();
    functions.logger.info(`Deleted ${snapshot.size} old invites`);
    return null;
  });
