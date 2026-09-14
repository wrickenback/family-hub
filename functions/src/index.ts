import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { providersFrom } from './providers';
import {
  MIN_TOPIC_WORDS,
  fallbackDailyWord,
  fallbackHangmanWord,
  generateHangmanHint,
  generateHangmanWord,
  generateTopicWords,
  generateWordleWords,
} from './wordGames';
import { buildWordSearchGrid, type Difficulty } from './wordSearchGrid';

admin.initializeApp();
const db = admin.firestore();

const geminiApiKey = defineSecret('GEMINI_API_KEY');
// Claude Haiku backs Gemini up when it returns a transient 503 or a
// response nothing usable can be parsed from. Declared as a secret like the
// Gemini key; providersFrom() simply drops whichever key is absent, so the
// functions still deploy and run with only one of the two configured.
const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');

/** The model chain every generator runs down, built per request so a key
 * rotation takes effect without a redeploy. */
function models() {
  return providersFrom(geminiApiKey.value(), anthropicApiKey.value());
}

function slugify(topic: string): string {
  return topic
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

interface Caller {
  uid: string;
  email: string;
  name: string;
}

/** Every callable here is family-only: signed in, and on the allowlist the
 * Firestore rules use. Shared so a new game can't accidentally ship without
 * the check — or with a subtly different one. Returns the caller, which also
 * saves each function re-narrowing `request.auth` after the guard. */
async function requireFamilyMember(request: {
  auth?: { uid: string; token: { email?: string; name?: string } };
}): Promise<Caller> {
  const email = request.auth?.token.email;
  if (!request.auth || !email) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const allowlistDoc = await db.doc('config/allowedEmails').get();
  const allowedEmails: string[] = allowlistDoc.data()?.emails ?? [];
  if (!allowedEmails.includes(email)) {
    throw new HttpsError('permission-denied', 'Not a family member.');
  }
  return { uid: request.auth.uid, email, name: request.auth.token.name ?? 'Someone' };
}

/**
 * Generates a new Word Search puzzle for a topic: Gemini supplies the word
 * list (never called from the client — the API key stays server-side),
 * then a deterministic local algorithm places them into a grid. Stores the
 * finished puzzle in Firestore and returns it so the client can start
 * playing immediately without a second round trip.
 */
export const generateWordSearchPuzzle = onCall(
  { region: 'us-central1', secrets: [geminiApiKey, anthropicApiKey] },
  async (request) => {
    const caller = await requireFamilyMember(request);

    const topic = String(request.data?.topic ?? '').trim();
    if (!topic || topic.length > 60) {
      throw new HttpsError('invalid-argument', 'Give a topic between 1 and 60 characters.');
    }

    const difficulty: Difficulty = request.data?.difficulty === 'easy' ? 'easy' : 'hard';

    const { value: words, source } = await generateTopicWords(models(), topic);
    if (words.length < MIN_TOPIC_WORDS) {
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

    // source is never null here — a null source means the whole chain came
    // up empty, which the length check above already turned into a thrown
    // error before this point.
    const docRef = await db.collection('wordSearchPuzzles').add({
      topic,
      topicSlug: slugify(topic),
      difficulty,
      size: puzzle.size,
      grid: puzzle.grid,
      words: puzzle.words,
      source,
      createdBy: caller.uid,
      createdByName: caller.name,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { id: docRef.id, ...puzzle, topic, difficulty, source };
  }
);

/** The one place the Daily Word answer lives. Clients never read
 * `dailyWords` directly (the Firestore rules deny it outright) — they ask
 * here, which is also what makes "the first person to open it today picks
 * the word for everyone" work: the doc is created once, by whoever loads
 * first, and everyone after reads that same answer back.
 *
 * `create()` rather than `set()` is doing the real work: two family members
 * opening the app in the same second both find no doc and both generate a
 * word, but only one write can land. The loser re-reads and plays the
 * winner's word, so the family never splits across two answers.
 */
export const getDailyWord = onCall(
  { region: 'us-central1', secrets: [geminiApiKey, anthropicApiKey] },
  async (request) => {
    const caller = await requireFamilyMember(request);

    const dateKey = String(request.data?.dateKey ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      throw new HttpsError('invalid-argument', 'Bad date.');
    }
    // The key is the client's *local* date, so a family west of UTC gets a
    // new word at their own midnight rather than mid-afternoon. A device
    // with a wildly wrong clock (or someone trying to read tomorrow's word
    // early) is fenced to a day either side of the server's date.
    const serverDay = new Date().toISOString().slice(0, 10);
    const dayApart = Math.abs(Date.parse(dateKey) - Date.parse(serverDay));
    if (!Number.isFinite(dayApart) || dayApart > 36 * 60 * 60 * 1000) {
      throw new HttpsError('invalid-argument', 'That day is out of range.');
    }

    const ref = db.doc(`dailyWords/${dateKey}`);
    const existing = await ref.get();
    if (existing.exists) {
      const data = existing.data() ?? {};
      return {
        dateKey,
        word: data.word as string,
        pickedByName: (data.pickedByName as string) ?? null,
        source: (data.source as string) ?? 'fallback',
      };
    }

    // Two weeks of answers to steer Gemini away from — enough that a repeat
    // is noticeable, small enough to stay one cheap query.
    //
    // Ordered by createdAt, not by document id: Firestore auto-indexes
    // every field ascending AND descending, but __name__ (the document id)
    // only gets an automatic ascending index — querying it descending
    // needs an explicit composite index that was never created, which made
    // every single call here throw FAILED_PRECONDITION and made Daily
    // Word unplayable in both modes. createdAt needs no such index and is
    // the more honest "recent" anyway.
    const recentSnap = await db
      .collection('dailyWords')
      .orderBy('createdAt', 'desc')
      .limit(14)
      .get();
    const recentWords = recentSnap.docs
      .map((doc) => doc.data().word as string)
      .filter(Boolean);

    const { value: generated, source: servedBy } = await generateWordleWords(
      models(),
      recentWords
    );
    const word = generated[0] ?? fallbackDailyWord(dateKey);
    const source = servedBy ?? 'fallback';

    try {
      await ref.create({
        word,
        source,
        pickedBy: caller.uid,
        pickedByName: caller.name,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { dateKey, word, pickedByName: caller.name, source };
    } catch {
      // Someone else's create() won the race — play their word, not ours.
      const winner = await ref.get();
      const data = winner.data() ?? {};
      return {
        dateKey,
        word: data.word as string,
        pickedByName: (data.pickedByName as string) ?? null,
        source: (data.source as string) ?? 'fallback',
      };
    }
  }
);

/** A batch of answers for Daily Word's free-play mode. Returns a list
 * rather than one word on purpose: free play is unlimited, and a request
 * per round would be both slow between rounds and wasteful, when one
 * request produces ten perfectly good words for the same price. The client
 * plays through the batch and comes back when it runs low.
 *
 * Nothing is stored — free-play words are disposable and, unlike the daily
 * word, don't need to be the same for everyone.
 */
export const getWordleWords = onCall(
  { region: 'us-central1', secrets: [geminiApiKey, anthropicApiKey] },
  async (request) => {
    await requireFamilyMember(request);

    const { value: words, source } = await generateWordleWords(models(), [], 12);
    if (words.length === 0) {
      // The client falls back to its bundled list, so this is a soft
      // failure rather than an error the player has to look at.
      return { words: [], source: 'fallback' };
    }
    return { words, source };
  }
);

/** Suggests a clue for a word the setter has typed in the family game.
 * Best-effort: an empty hint means "write your own", not an error. */
export const getHangmanHint = onCall(
  { region: 'us-central1', secrets: [geminiApiKey, anthropicApiKey] },
  async (request) => {
    await requireFamilyMember(request);

    const word = String(request.data?.word ?? '').trim().toUpperCase();
    if (!/^[A-Z]+( [A-Z]+)*$/.test(word) || word.replace(/ /g, '').length > 18) {
      throw new HttpsError('invalid-argument', 'That word cannot be hinted.');
    }

    const { value: hint, source } = await generateHangmanHint(models(), word);
    // source is already null exactly when hint is null (generate()'s empty
    // check is `hint === null`), so this passes both straight through.
    return { hint: hint ?? '', source };
  }
);

/** One word and a clue for a solo game of Hangman. Nothing is stored: solo
 * rounds are disposable, and keeping the word out of Firestore means there
 * is nothing to look up mid-round.
 *
 * `avoid` is the last several words the client has already seen for this
 * category this session — see the comment on generateHangmanWord for why
 * that's what actually stops the same word (looking at you, PLATYPUS) from
 * coming back round after round. */
export const getHangmanWord = onCall(
  { region: 'us-central1', secrets: [geminiApiKey, anthropicApiKey] },
  async (request) => {
    await requireFamilyMember(request);

    const category = String(request.data?.category ?? 'anything').trim();
    if (!/^[a-z]{1,20}$/.test(category)) {
      throw new HttpsError('invalid-argument', 'Unknown category.');
    }
    const label = String(request.data?.label ?? category).trim().slice(0, 40);
    const avoid = Array.isArray(request.data?.avoid)
      ? (request.data.avoid as unknown[])
          .filter((w): w is string => typeof w === 'string')
          .slice(0, 20)
      : [];

    const { value: generated, source: servedBy } = await generateHangmanWord(
      models(),
      label || category,
      avoid
    );
    const picked = generated ?? fallbackHangmanWord(category, avoid);
    return { ...picked, category, source: servedBy ?? 'fallback' };
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
