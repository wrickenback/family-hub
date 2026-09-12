// Mirrors config/parentEmails in Firestore, which the security rules treat as
// the source of truth for who may hold the 'parent' role. This constant only
// decides what role a client *attempts* to write on first sign-in — the rule
// checks the signed-in user's real auth token email server-side, so editing
// this file locally can't grant a kid's account parent access.
export const PARENT_EMAILS = ['wrickenback@gmail.com', 'jfink3@gmail.com'];
