import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();
const db = admin.firestore();

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

/**
 * Initialize user profile on first sign-in
 */
export const initializeUserProfile = functions
  .region('us-central1')
  .auth.user()
  .onCreate(async (user) => {
    // Check if email is in allowlist
    const allowlistDoc = await db.doc('config/allowedEmails').get();
    const allowedEmails = allowlistDoc.data()?.emails || [];

    if (!allowedEmails.includes(user.email)) {
      // Don't create profile for non-family users
      return null;
    }

    // Create user profile with default role (kid)
    await db.collection('users').doc(user.uid).set({
      email: user.email,
      displayName: user.displayName || '',
      photoURL: user.photoURL || '',
      role: 'kid', // Default role; can be updated by parent
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return null;
  });

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
