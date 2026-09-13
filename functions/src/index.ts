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

/**
 * Sync Firestore users collection to RTDB allowedUsers node
 * Writes all uid as keys with boolean value true; removes any uid no longer in Firestore
 */
export const syncAllowedUsers = functions
  .region('us-central1')
  .pubsub.schedule('every 1 hours')
  .onRun(async () => {
    const rtdb = admin.database();
    const usersSnapshot = await db.collection('users').listDocuments();

    const allowedUsers: { [uid: string]: boolean } = {};
    usersSnapshot.forEach((doc) => {
      allowedUsers[doc.id] = true;
    });

    // Writing {} would clear the node, and the database rules treat a
    // missing allowlist as "not populated yet" and fall back to allowing any
    // signed-in user. A transient empty read must not quietly widen access.
    if (Object.keys(allowedUsers).length === 0) {
      functions.logger.warn('No users found — leaving allowedUsers untouched');
      return null;
    }

    await rtdb.ref('allowedUsers').set(allowedUsers);
    functions.logger.info(`Synced ${Object.keys(allowedUsers).length} allowed users to RTDB`);
    return null;
  });

/**
 * Sweep stale games from RTDB
 * Delete games based on status and age:
 * - 'waiting' status > 1 hour old
 * - 'done' status > 6 hours old
 * - any status > 24 hours old
 */
export const sweepStaleGames = functions
  .region('us-central1')
  .pubsub.schedule('every 30 minutes')
  .onRun(async () => {
    const rtdb = admin.database();
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const sixHoursAgo = now - 6 * 60 * 60 * 1000;
    const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;

    const gamesSnapshot = await rtdb.ref('games').get();
    const games = gamesSnapshot.val() || {};

    const toDelete: string[] = [];

    Object.entries(games).forEach(([gameId, gameData]: [string, any]) => {
      if (!gameData || typeof gameData !== 'object') {
        return;
      }

      const updatedAt = gameData.updatedAt || 0;
      const createdAt = gameData.createdAt || 0;
      const status = gameData.status;

      // If updatedAt is missing/zero, only mark as stale if createdAt is old
      if (updatedAt === 0) {
        if (createdAt !== 0 && createdAt < twentyFourHoursAgo) {
          toDelete.push(gameId);
        }
        return;
      }

      // Apply deletion rules based on status and age
      if (status === 'waiting' && updatedAt < oneHourAgo) {
        toDelete.push(gameId);
      } else if (status === 'done' && updatedAt < sixHoursAgo) {
        toDelete.push(gameId);
      } else if (updatedAt < twentyFourHoursAgo) {
        toDelete.push(gameId);
      }
    });

    // Apply deletions as a single multi-path update. Battleship parks each
    // player's fleet outside the game node, so those have to go with it or
    // they accumulate forever with nothing left pointing at them.
    if (toDelete.length > 0) {
      const updates: { [path: string]: null } = {};
      toDelete.forEach((gameId) => {
        updates[`games/${gameId}`] = null;
        updates[`gameFleets/${gameId}`] = null;
      });
      await rtdb.ref().update(updates);
    }

    functions.logger.info(`Swept ${toDelete.length} stale games from RTDB`);
    return null;
  });
