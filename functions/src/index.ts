import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { providersFrom, routineProvidersFrom } from './providers';
import {
  MIN_TOPIC_WORDS,
  fallbackDailyWord,
  fallbackHangmanWord,
  generateHangmanHint,
  expandBloomWords,
  generateCrosswordClues,
  generateSpellingSuggestion,
  generateTopicWords,
  buildWordleBootstrapPrompt,
} from './wordGames';
import { buildWordSearchGrid, type Difficulty } from './wordSearchGrid';
import { seedPool, fetchWords, markUsed, enrichPoolWord, type BootstrapOverrides } from './wordBank';
import { fetchBloomPuzzle, markBloomBaseUsed } from './bloomBank';
import { solveCrossword, buildGrid } from './crosswordSolver';

// Shared by both Wordle endpoints: a single flat pool (no per-topic
// subdivision — Wordle has no categories, just "any real 5-letter word"),
// with the trailing-S check kept as a backstop the same way it always was
// for generateWordleWords, since a model asked not to write plurals
// reliably writes some anyway.
const WORDLE_TOPIC_SLUG = 'wordle';
const WORDLE_OVERRIDES: BootstrapOverrides = {
  buildPrompt: (_topic, count) => buildWordleBootstrapPrompt(count),
  extraFilter: (word) => !word.endsWith('S'),
};

admin.initializeApp();
const db = admin.firestore();

const geminiApiKey = defineSecret('GEMINI_API_KEY');
// GLM Flash (via OpenRouter) backs Gemini up when it returns a transient
// 503 or a response nothing usable can be parsed from — first choice of
// backup because it's the one actually measured against these prompts.
const openRouterApiKey = defineSecret('OPENROUTER_API_KEY');
// Claude Haiku, on the direct Anthropic key, is the last resort behind
// both — deliberately not routed through OpenRouter, so a single outage
// there can't take out every provider at once. providersFrom() simply
// drops whichever key is absent, so the functions still deploy and run
// with only some of the three configured.
const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');

/** The model chain for anything that fills something durable — the shared
 * word pool, a pool word's cached clue, a once-a-day shared doc. Built per
 * request so a key rotation takes effect without a redeploy. */
function models() {
  return providersFrom(geminiApiKey.value(), openRouterApiKey.value(), anthropicApiKey.value());
}

/** The model chain for a call whose result is used once and never cached —
 * see routineProvidersFrom's doc comment. Deliberately skips Gemini, so its
 * tighter free-tier budget stays reserved for models() above. */
function routineModels() {
  return routineProvidersFrom(openRouterApiKey.value(), anthropicApiKey.value());
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
  { region: 'us-central1', secrets: [geminiApiKey, openRouterApiKey, anthropicApiKey] },
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
    const topicSlug = slugify(topic);
    const docRef = await db.collection('wordSearchPuzzles').add({
      topic,
      topicSlug,
      difficulty,
      size: puzzle.size,
      grid: puzzle.grid,
      words: puzzle.words,
      source,
      createdBy: caller.uid,
      createdByName: caller.name,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Feed the full candidate list (not just the subset that fit today's
    // grid — a word this layout couldn't place is still perfectly good
    // vocabulary for hangman or Bloom) into the shared pool, at zero extra
    // API cost since it's already been generated. Best-effort: a failure
    // here must never fail the puzzle the player is actually waiting on.
    try {
      await seedPool(db, topicSlug, topic, words, 'wordsearch');
    } catch (err) {
      console.error('seedPool: failed to seed word-search words into the pool', {
        topicSlug,
        error: err instanceof Error ? err.message : String(err),
      });
    }

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
  { region: 'us-central1', secrets: [geminiApiKey, openRouterApiKey, anthropicApiKey] },
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

    // Drawn from the shared Wordle pool rather than a live call with only a
    // 14-day lookback — that window had the exact same aging-out weakness
    // measured on hangman's 8-word window this session (a word ages out of
    // the lookback and comes right back). A pool draw can't repeat until
    // every word in it has been used once, not just "not in the last 14."
    const { words: picked, source: fetchSource } = await fetchWords(
      db,
      models(),
      'wordle-daily',
      WORDLE_TOPIC_SLUG,
      'Wordle answers',
      { minLen: 5, maxLen: 5, allowPhrases: false },
      1,
      WORDLE_OVERRIDES
    );
    const word = picked[0]?.word ?? fallbackDailyWord(dateKey);
    const source = picked[0] ? fetchSource ?? 'pool' : 'fallback';
    if (picked[0]) await markUsed(db, 'wordle-daily', WORDLE_TOPIC_SLUG, [picked[0].word]);

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
  { region: 'us-central1', secrets: [geminiApiKey, openRouterApiKey, anthropicApiKey] },
  async (request) => {
    await requireFamilyMember(request);

    // models(), not routineModels(): this now draws from the same shared
    // Wordle pool getDailyWord reads, and any bootstrap it triggers fills
    // that pool durably for every future reader in either mode — the
    // fetchWords bootstrap always earns the durable chain regardless of
    // which endpoint happened to trigger it, same as suggestHangmanWords.
    const { words: picked, source } = await fetchWords(
      db,
      models(),
      'wordle-freeplay',
      WORDLE_TOPIC_SLUG,
      'Wordle answers',
      { minLen: 5, maxLen: 5, allowPhrases: false },
      12,
      WORDLE_OVERRIDES
    );
    if (picked.length === 0) {
      // The client falls back to its bundled list, so this is a soft
      // failure rather than an error the player has to look at.
      return { words: [], source: 'fallback' };
    }
    await markUsed(
      db,
      'wordle-freeplay',
      WORDLE_TOPIC_SLUG,
      picked.map((w) => w.word)
    );
    return { words: picked.map((w) => w.word), source: source ?? 'pool' };
  }
);

/** Suggests a clue for a word the setter has typed in the family game.
 * Best-effort: an empty hint means "write your own", not an error. */
export const getHangmanHint = onCall(
  { region: 'us-central1', secrets: [openRouterApiKey, anthropicApiKey] },
  async (request) => {
    await requireFamilyMember(request);

    const word = String(request.data?.word ?? '').trim().toUpperCase();
    if (!/^[A-Z]+( [A-Z]+)*$/.test(word) || word.replace(/ /g, '').length > 18) {
      throw new HttpsError('invalid-argument', 'That word cannot be hinted.');
    }

    // routineModels(): a clue for a human-typed word is used once for this
    // round and never cached, unlike getHangmanWord's lazy pool-word clue
    // enrichment, which IS cached — see models()'s doc comment.
    const { value: clue, source } = await generateHangmanHint(routineModels(), word);
    // Also carries the spelling verdict, so a setter who tapped Suggest
    // doesn't pay for a second call to checkHangmanWord asking the same
    // model about the same word. A null correction here means "looks fine",
    // and the client remembers that against the word it asked about.
    return {
      hint: clue?.hint ?? '',
      correction: clue?.correction ?? null,
      source: clue?.hint ? source : null,
    };
  }
);

/** "Did you mean…?" for the word the setter typed in the family game.
 *
 * Always resolves. A word this can make nothing of is far more likely to be
 * a name or a family in-joke than a mistake, and the setter's own spelling
 * has to stand in that case — the guesser is going to be typing letters at
 * it for the next five minutes, so a wrong "correction" would be much worse
 * than a missed one. `suggestion` is null for "looks fine to me".
 */
export const checkHangmanWord = onCall(
  { region: 'us-central1', secrets: [openRouterApiKey, anthropicApiKey] },
  async (request) => {
    await requireFamilyMember(request);

    const word = String(request.data?.word ?? '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, ' ');
    if (!/^[A-Z]+( [A-Z]+)*$/.test(word) || word.replace(/ /g, '').length > 18) {
      throw new HttpsError('invalid-argument', 'That word cannot be checked.');
    }

    try {
      // routineModels(): a spelling check is used once and never cached.
      const { value } = await generateSpellingSuggestion(routineModels(), word);
      return { suggestion: value };
    } catch {
      return { suggestion: null };
    }
  }
);

/** One word and a clue for a solo game of Hangman. Nothing is stored: solo
 * rounds are disposable, and keeping the word out of Firestore means there
 * is nothing to look up mid-round.
 *
 * Draws from the shared word pool (WORD_BANK_PLAN.md §2/§3) rather than
 * asking a model live on every play — `category` doubles as the pool's
 * topicSlug, so a category populated by word search's own topics (or an
 * earlier hangman bootstrap) is served straight from Firestore, with a
 * repeat structurally impossible until the whole pool has been shown once.
 * Only a brand-new or exhausted category pays a live-call latency, and
 * that call tops the pool up for every family member and every game
 * sharing this topic afterward, not just this one player this once. */
export const getHangmanWord = onCall(
  { region: 'us-central1', secrets: [geminiApiKey, openRouterApiKey, anthropicApiKey] },
  async (request) => {
    await requireFamilyMember(request);

    // Free text, exactly like word search's own topic field (§4) — the
    // slug is derived here, server-side, via the same slugify() word search
    // uses, rather than trusting the client to compute one. Two players
    // typing "Ancient Rome" and "ancient rome!" have to land on the same
    // topicSlug for the pools to actually be shared; only one slugify
    // implementation existing at all guarantees that.
    const topic = String(request.data?.topic ?? 'Anything at all').trim().slice(0, 60);
    if (!topic) {
      throw new HttpsError('invalid-argument', 'Give a category or topic.');
    }
    const category = slugify(topic) || 'anything';

    const { words: picked, source: fetchSource } = await fetchWords(
      db,
      models(),
      'hangman',
      category,
      topic,
      { minLen: 5, maxLen: 10, allowPhrases: false },
      1
    );
    const entry = picked[0];

    if (!entry) {
      // Pool and live bootstrap both came up empty — same soft-failure
      // shape the rest of the app uses, never an error the player sees.
      const avoid = Array.isArray(request.data?.avoid)
        ? (request.data.avoid as unknown[])
            .filter((w): w is string => typeof w === 'string')
            .slice(0, 20)
        : [];
      const fallback = fallbackHangmanWord(category, avoid);
      return { ...fallback, category, source: 'fallback' };
    }

    // Marked used the moment it's actually served for solo play — there's
    // no "browse without committing" step here the way multiplayer's
    // planned suggestion picker will have.
    await markUsed(db, 'hangman', category, [entry.word]);

    // The word is the durable pool asset (models(), Gemini-first, above).
    // The clue is deliberately NOT — it's regenerated fresh via the cheap
    // chain on every single draw, cached word or not, so a word coming
    // around a second time can land a different clue instead of always
    // repeating whatever got cached the first time. This also means
    // Gemini's scarce daily quota is never spent on a clue at all, only on
    // filling the pool itself.
    const { value: clue, source: clueSource } = await generateHangmanHint(
      routineModels(),
      entry.word,
      topic
    );
    let hint = clue?.hint ?? '';
    if (hint) {
      // Refresh the cached copy too, purely as a fallback for the day this
      // live call comes up empty — never a reason to skip generating fresh.
      try {
        await enrichPoolWord(db, category, entry.word, hint);
      } catch (err) {
        console.error('enrichPoolWord: failed to cache a hangman clue', {
          category,
          word: entry.word,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    } else if (entry.hint) {
      // This draw's live clue call came up empty (provider hiccup, or this
      // word just stumped it this time) — an earlier draw's cached clue
      // beats no clue at all.
      hint = entry.hint;
    }
    const source = hint && clue?.hint ? clueSource ?? 'glm-flash' : fetchSource ?? 'pool';
    return { word: entry.word, hint, category, source };
  }
);

/** A batch of candidate words/phrases for the multiplayer setter's "pick a
 * category" path (WORD_BANK_PLAN.md §3), alongside their existing "write
 * from scratch" option. Deliberately read-only: browsing suggestions must
 * never mark a pool entry used, or the pool would exhaust roughly
 * `count` times faster than actual play — see markHangmanSuggestionUsed
 * for the real commit step, fired only once the setter actually picks one.
 *
 * Wider shape than solo hangman's: multiplayer already allows phrases (see
 * checkHangmanWord's own validator, matched here — up to 18 letters,
 * spaces allowed), because a human setter typing "GOLDEN RETRIEVER" was
 * always fine and a category suggestion shouldn't be more limited than
 * free typing already is. */
export const suggestHangmanWords = onCall(
  { region: 'us-central1', secrets: [geminiApiKey, openRouterApiKey, anthropicApiKey] },
  async (request) => {
    await requireFamilyMember(request);

    // Same free-text-in, server-slugifies contract as getHangmanWord above
    // — see its comment for why the client never computes the slug itself.
    const topic = String(request.data?.topic ?? '').trim().slice(0, 60);
    if (!topic) {
      throw new HttpsError('invalid-argument', 'Give a category or topic.');
    }
    const category = slugify(topic) || 'anything';
    const requested = Number(request.data?.count ?? 8);
    const count = Number.isFinite(requested) ? Math.min(Math.max(Math.trunc(requested), 1), 12) : 8;

    const { words: picked, source } = await fetchWords(
      db,
      models(),
      'hangman',
      category,
      topic,
      { minLen: 5, maxLen: 18, allowPhrases: true },
      count
    );

    return { words: picked.map((entry) => entry.word), category, topic, source: source ?? 'pool' };
  }
);

// Pools that exist for internal, non-topic reasons rather than because a
// family typed a real category — offering these back as a hangman category
// choice would be nonsensical (nobody wants to "pick a category" and get
// Wordle's flat 5-letter vocabulary). Grows if a similar flat pool ever
// lands in wordPool rather than its own collection.
const NON_CATEGORY_POOL_SLUGS = new Set(['wordle']);

/** Topics worth offering as a hangman category beyond the pinned defaults —
 * anything already in the shared pool with enough vocabulary to support a
 * round, most recent first. Read-only, no model call, cheap: this is what
 * lets word search's topics (and any hangman category played before)
 * surface back as a pickable option instead of being typed again from
 * scratch (WORD_BANK_PLAN.md §4). */
export const listHangmanCategories = onCall(
  { region: 'us-central1', secrets: [] },
  async (request) => {
    await requireFamilyMember(request);

    const snap = await db.collection('wordPool').orderBy('createdAt', 'desc').limit(30).get();
    const categories = snap.docs
      .filter((doc) => !NON_CATEGORY_POOL_SLUGS.has(doc.id))
      .map((doc) => {
        const data = doc.data();
        const words = (data.words as { word?: unknown }[] | undefined) ?? [];
        // Hangman's own shape (5-10 letters, no phrases) — a topic whose
        // words are all too short/long or all phrases isn't a usable
        // hangman category yet even if it's a fine word-search topic.
        const usable = words.filter(
          (w) => typeof w.word === 'string' && /^[A-Z]{5,10}$/.test(w.word)
        ).length;
        return {
          slug: doc.id,
          label: typeof data.topic === 'string' ? data.topic : doc.id,
          wordCount: usable,
        };
      })
      .filter((c) => c.wordCount >= 5);

    return { categories };
  }
);

/** The commit step for a suggestion the setter actually picked, as opposed
 * to one merely shown. Call this alongside (not instead of) the existing
 * setHangmanWord client-side Firestore write — that write starts the round
 * directly from the client with no callable in the loop at all, so there's
 * no other server-side moment to hook this into. A word that was typed
 * from scratch, never having come from a suggestion, has nothing to mark
 * here and shouldn't call this at all. */
export const markHangmanSuggestionUsed = onCall(
  { region: 'us-central1', secrets: [] },
  async (request) => {
    await requireFamilyMember(request);

    const category = String(request.data?.category ?? '').trim();
    if (!/^[a-z0-9-]{1,60}$/.test(category)) {
      throw new HttpsError('invalid-argument', 'Unknown category.');
    }
    const word = String(request.data?.word ?? '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, ' ');
    if (!/^[A-Z]+( [A-Z]+)*$/.test(word) || word.replace(/ /g, '').length > 18) {
      throw new HttpsError('invalid-argument', 'That word cannot be marked.');
    }

    await markUsed(db, 'hangman', category, [word]);
    return { ok: true };
  }
);

/** A letter set and every word hidden in it, for Word Bloom.
 *
 * With a `dateKey` this is the family's shared puzzle for that day, cached
 * in Firestore so everyone plays the same letters and the day's scores mean
 * something next to each other. Without one it's a free-play round.
 *
 * Draws from the Bloom base pool (bloomBank.ts) rather than a live call
 * every time — same structural fix as hangman and Wordle got, for the same
 * documented reason: the old per-request `avoid` list (still accepted
 * below, layered on top) only ever steered the model away from a short
 * recent window, and it reliably converged back onto the same handful of
 * anagram-rich bases (GARDEN, DANGER) once that window passed. A pool draw
 * can't repeat a base until every base in it has been used once. */
export const getBloomPuzzle = onCall(
  { region: 'us-central1', secrets: [geminiApiKey, openRouterApiKey, anthropicApiKey] },
  async (request) => {
    await requireFamilyMember(request);

    const dateKey = String(request.data?.dateKey ?? '').trim();
    const daily = /^\d{4}-\d{2}-\d{2}$/.test(dateKey);
    const game = daily ? 'bloom-daily' : 'bloom-freeplay';

    const doc = daily ? db.doc(`bloomPuzzles/${dateKey}`) : null;
    if (doc) {
      const existing = await doc.get();
      if (existing.exists) {
        const data = existing.data() ?? {};
        // Expanded on the way out rather than trusting what was stored: a
        // day cached before the vocabulary sweep existed would otherwise
        // keep serving the model's short list until tomorrow.
        return {
          base: data.base,
          words: expandBloomWords(data.base ?? '', data.words ?? []),
          source: data.source,
        };
      }
    }

    const avoid = Array.isArray(request.data?.avoid)
      ? (request.data.avoid as unknown[])
          .filter((w): w is string => typeof w === 'string')
          .slice(0, 20)
      : [];

    const { puzzle: entry, source } = await fetchBloomPuzzle(db, models(), game, avoid);
    if (!entry) {
      // The client falls back to its bundled packs, same as Daily Word.
      return { base: '', words: [], source: 'fallback' };
    }
    await markBloomBaseUsed(db, game, entry.base);
    const puzzle = { base: entry.base, words: entry.words };

    if (doc) {
      // Two people opening it at the same moment: create() lets one win and
      // the other reads back what was actually stored, so they can't end up
      // on different letters for the same day.
      try {
        await doc.create({
          dateKey,
          base: puzzle.base,
          words: puzzle.words,
          source,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch {
        const settled = await doc.get();
        const data = settled.data() ?? {};
        return {
          base: data.base,
          words: expandBloomWords(data.base ?? '', data.words ?? []),
          source: data.source,
        };
      }
    }

    return { ...puzzle, source: source ?? 'pool' };
  }
);

/** Today's 5x5 mini crossword.
 *
 * The grid is filled by a local constraint solver (crosswordSolver.ts),
 * not a model — filling a grid is a constraint-satisfaction problem, and
 * every reasoning model tried this session (GLM-5.3, GLM-5.3-Flash,
 * DeepSeek V4 Pro) failed it outright at every effort level, truncating to
 * zero output. The model's only job now is writing clues for answers the
 * solver already knows are correct, which is fast, cheap recall — no more
 * long-running generation, no more timeout to accommodate.
 *
 * Cached in Firestore per day like before: the whole family shares one
 * puzzle, so the first person to open it pays for generation and
 * everyone after reads it — which also means the crossword the family
 * compares times on is genuinely the same one. */
export const getMiniCrossword = onCall(
  {
    region: 'us-central1',
    secrets: [geminiApiKey, openRouterApiKey, anthropicApiKey],
  },
  async (request) => {
    await requireFamilyMember(request);

    const dateKey = String(request.data?.dateKey ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      throw new HttpsError('invalid-argument', 'A date is required.');
    }

    const doc = db.doc(`crosswords/${dateKey}`);
    const existing = await doc.get();
    if (existing.exists) {
      const data = existing.data() ?? {};
      return { grid: data.grid, entries: data.entries, source: data.source };
    }

    // Filler candidates from the shared pool, one length at a time — never
    // marked used. Unlike hangman/Wordle, a crossword filler word repeating
    // across different days is normal and unnoticeable (real crosswords
    // reuse common short "glue" words constantly); what has to stay fresh
    // is the GRID as a whole, and a large, randomly-sampled pool plus the
    // solver's own per-length shuffle already measured this session as
    // producing near-zero exact-puzzle repeats without any usage tracking
    // at all. Counts match the bank-sizing this session measured against a
    // real frequency word list: 5-letter slots are the actual bottleneck
    // (need 600+ before the solve rate is reliably near 100%); 3- and
    // 4-letter need far less. Each count also doubles as the target size
    // fetchWords' own top-up logic grows that length's view of the pool
    // toward, a little more each time a bootstrap fires.
    const topic = 'common English words for a crossword puzzle';
    const [threes, fours, fives] = await Promise.all([
      fetchWords(db, models(), 'crossword', 'crossword-filler', topic, { minLen: 3, maxLen: 3, allowPhrases: false }, 200),
      fetchWords(db, models(), 'crossword', 'crossword-filler', topic, { minLen: 4, maxLen: 4, allowPhrases: false }, 300),
      fetchWords(db, models(), 'crossword', 'crossword-filler', topic, { minLen: 5, maxLen: 5, allowPhrases: false }, 700),
    ]);
    const candidatesByLength: Record<number, string[]> = {
      3: threes.words.map((w) => w.word),
      4: fours.words.map((w) => w.word),
      5: fives.words.map((w) => w.word),
    };
    const bootstrapSource = threes.source ?? fours.source ?? fives.source;

    const solved = solveCrossword(candidatesByLength);
    if (!solved) {
      // Extremely unlikely once the pool has matured past a few days of
      // bootstraps, and never the player's problem either way — same soft
      // failure the rest of the app uses, straight to the bundled fallback.
      return { grid: null, entries: null, source: 'fallback' };
    }

    const answers = solved.map((s) => s.answer);
    const { value: clues, source: clueSource } = await generateCrosswordClues(models(), answers);
    // The client's own merge logic (firestoreCrossword.ts) falls back to a
    // bundled clue for any entry that "arrives without one" — checked via
    // `typeof entry.clue === 'string'`, which an empty string still
    // satisfies. Omitting the key entirely for an answer clue generation
    // missed is what actually triggers that fallback instead of silently
    // shipping a blank clue for one square.
    const entries = solved.map((s) => {
      const clue = clues?.[s.answer];
      return {
        direction: s.direction,
        row: s.row,
        col: s.col,
        answer: s.answer,
        ...(clue ? { clue } : {}),
      };
    });
    const grid = buildGrid(solved);
    const source = clueSource ?? bootstrapSource ?? 'pool';

    // A race between two family members opening it at the same moment ends
    // with one stored puzzle either way; create() loses politely and the
    // loser re-reads what the winner wrote.
    try {
      await doc.create({
        dateKey,
        grid,
        entries,
        source,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch {
      const settled = await doc.get();
      const data = settled.data() ?? {};
      return { grid: data.grid, entries: data.entries, source: data.source };
    }

    return { grid, entries, source };
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
