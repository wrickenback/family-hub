import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { generate, firstJson, CONTENT_RATING, type ModelProvider } from './providers';

/** Shared word pools, so an AI-picked word doesn't have to come from a live,
 * stateless model call every single play — see WORD_BANK_PLAN.md §2 for the
 * full design and why this replaced a short in-memory avoid-list (measured
 * repeat rate with the old approach: 8% within 13 plays; a seed-pair prompt
 * variant tried as a fix made it worse, 33-36%, because the model's
 * underlying attractor survives the seed words changing).
 *
 * Two collections, deliberately separate:
 * - `wordPool/{topicSlug}` — the shared vocabulary. Words are never
 *   removed; it only grows, fed by whichever game or bootstrap call touches
 *   a topic first.
 * - `wordUsage/{game}-{topicSlug}` — per GAME, not per word: what that one
 *   game has already served. A word used by word search stays fully
 *   available to hangman and vice versa — they're different players'
 *   memories of what they've seen, not one global "used" flag. */

export interface PoolWord {
  word: string;
  hint?: string;
  obvious?: string;
  addedBy: 'wordsearch' | 'bootstrap';
}

export interface ShapeFilter {
  minLen: number;
  maxLen: number;
  /** Multiplayer hangman suggestions allow "GOLDEN RETRIEVER"; solo hangman
   * and word search need a single unbroken token. Length checks below
   * always exclude the spaces themselves. */
  allowPhrases: boolean;
}

// Large enough that only the FIRST request for a brand-new (or freshly
// exhausted) topic pays the live-call latency — everyone after, in any
// game sharing this topic, reads an already-stocked pool. Cost is trivial:
// measured this session at ~$0.0018 for 120 words via GLM Flash.
const DEFAULT_BOOTSTRAP_COUNT = 80;

function fitsShape(word: string, shape: ShapeFilter): boolean {
  const hasSpace = word.includes(' ');
  if (hasSpace && !shape.allowPhrases) return false;
  if (!/^[A-Z]+( [A-Z]+)*$/.test(word)) return false;
  const letterCount = word.replace(/ /g, '').length;
  return letterCount >= shape.minLen && letterCount <= shape.maxLen;
}

/** Merges freshly generated words into a topic's pool. Exported on its own
 * (not just used internally by refill) so word search can seed the pool
 * with words it was already generating for its own puzzle, at zero extra
 * API cost — see generateWordSearchPuzzle's seed-back write. `arrayUnion`
 * dedups by exact value, which is also what keeps two concurrent refills
 * of the same exhausted pool from double-adding entries; a genuine race
 * costs at most one duplicate live call, never corrupted data. */
export async function seedPool(
  db: Firestore,
  topicSlug: string,
  topic: string,
  words: string[],
  addedBy: PoolWord['addedBy']
): Promise<void> {
  if (words.length === 0) return;
  const entries: PoolWord[] = words.map((word) => ({ word, addedBy }));
  await db.doc(`wordPool/${topicSlug}`).set(
    {
      topic,
      words: FieldValue.arrayUnion(...entries),
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

// How many already-known words to name in a refill prompt. Long enough to
// actually steer the model off what we have, short enough not to dominate
// the request — each word costs roughly 4 tokens, so this is ~500.
const MAX_AVOID_LISTED = 120;

/** Asks the model chain for a generous batch of words/phrases for a topic.
 * Shape-agnostic on the prompt side — the shape filter narrows what's kept
 * after parsing, not what's asked for, so the same bootstrap serves every
 * consumer's length range from one call. */
async function bootstrap(
  providers: ModelProvider[],
  topic: string,
  shape: ShapeFilter,
  count: number,
  overrides?: BootstrapOverrides,
  /** What the pool already holds. Without this a refill re-runs the exact
   * prompt that produced the current contents and gets mostly the same
   * words back — `seedPool`'s arrayUnion dedupes them, so nothing breaks,
   * but the call nets only a handful of genuinely new words and the yield
   * gets worse every time. Elapsed time doesn't help: the model is
   * stateless, so the same prompt has the same distribution tomorrow. */
  alreadyHave: string[] = []
): Promise<{ words: string[]; source: string | null }> {
  const phraseLine = shape.allowPhrases
    ? 'Short phrases are fine where natural (e.g. "GOLDEN RETRIEVER"), or single words — whichever fits the topic better.'
    : 'Each must be a single unbroken token with no spaces — join multi-word names into one word, e.g. "GOLDENRETRIEVER" not "Golden Retriever".';
  // Stating the range isn't enough on its own: asked for "5 to 10 letters"
  // a model bunches everything at 6-8, and for hangman especially that
  // makes every round feel like the same puzzle. Only worth saying when
  // there's actually a range — the crossword asks for one exact length.
  const spreadLine =
    shape.minLen === shape.maxLen
      ? ''
      : `\n- Spread the lengths right across that range — about as many at ${shape.minLen} letters and at ${shape.maxLen} letters as in the middle. Don't bunch them all at one length.`;
  // Only the ones matching the shape being asked for — naming 4-letter
  // words we already have does nothing to steer a request for 5-letter
  // ones, it just spends tokens.
  const avoid = alreadyHave.filter((word) => fitsShape(word, shape)).slice(0, MAX_AVOID_LISTED);
  const avoidLine = avoid.length
    ? `\n- We ALREADY have these, so don't repeat any of them — give genuinely different ones: ${avoid.join(', ')}.`
    : '';
  const prompt =
    overrides?.buildPrompt?.(topic, count) ??
    `Give me ${count} distinct words or short phrases for a family word game about "${topic}".
Rules:
- If the topic itself is clearly inappropriate for a family app, respond with exactly: []
${CONTENT_RATING}
- Letters A-Z only (spaces allowed only where noted below).
- Each must be ${shape.minLen} to ${shape.maxLen} letters long, not counting spaces.${spreadLine}
- ${phraseLine}
- Common enough that a 13-year-old would recognize it, but cover the full range of the topic — not just the five most obvious picks.${avoidLine}
- Respond with ONLY a JSON array of uppercase strings, nothing else. Example: ["EXAMPLE","WORDS HERE"]`;

  const { value, source } = await generate<string[]>(
    'wordBankBootstrap',
    providers,
    prompt,
    (text) => {
      const json = firstJson(text, '[');
      if (!json) return [];
      let parsed: unknown;
      try {
        parsed = JSON.parse(json);
      } catch {
        return [];
      }
      if (!Array.isArray(parsed)) return [];
      const seen = new Set<string>();
      const words: string[] = [];
      for (const raw of parsed) {
        if (typeof raw !== 'string') continue;
        const word = raw.trim().toUpperCase().replace(/\s+/g, ' ');
        if (!fitsShape(word, shape) || seen.has(word)) continue;
        if (overrides?.extraFilter && !overrides.extraFilter(word)) continue;
        seen.add(word);
        words.push(word);
      }
      return words;
    },
    (words) => words.length === 0,
    []
  );
  return { words: value, source };
}

/** Lets a caller with rules the generic shape filter can't express — Wordle's
 * "no plurals ending in S, no proper nouns" is the reason this exists — swap
 * in its own bootstrap prompt and/or an extra post-parse filter, while still
 * getting every bit of `fetchWords`'s pool-serving, top-up, and dedup logic
 * for free. Both fields optional; a caller with only a generic shape needs
 * neither. */
export interface BootstrapOverrides {
  buildPrompt?: (topic: string, count: number) => string;
  extraFilter?: (word: string) => boolean;
}

/** The one entry point every game calls for an AI-picked word: read what's
 * available (pool minus this game's own usage, filtered to this caller's
 * shape), and only call the model live if that isn't enough — whether the
 * pool is merely low or doesn't exist yet is the same code path, exactly
 * like `generateWordSearchPuzzle` already behaves for a brand-new topic
 * today. Never marks anything used — see `markUsed` for why that's a
 * separate, caller-triggered step. */
export async function fetchWords(
  db: Firestore,
  providers: ModelProvider[],
  game: string,
  topicSlug: string,
  topic: string,
  shape: ShapeFilter,
  count: number,
  overrides?: BootstrapOverrides
): Promise<{ words: PoolWord[]; source: string | null }> {
  const poolRef = db.doc(`wordPool/${topicSlug}`);
  const usageRef = db.doc(`wordUsage/${game}-${topicSlug}`);

  const [poolSnap, usageSnap] = await Promise.all([poolRef.get(), usageRef.get()]);
  const poolWords: PoolWord[] = (poolSnap.data()?.words as PoolWord[] | undefined) ?? [];
  const used = new Set<string>((usageSnap.data()?.used as string[] | undefined) ?? []);

  let available = poolWords.filter((w) => fitsShape(w.word, shape) && !used.has(w.word));
  let source: string | null = null;

  if (available.length < count) {
    const { words: fresh, source: bootstrapSource } = await bootstrap(
      providers,
      topic,
      shape,
      DEFAULT_BOOTSTRAP_COUNT,
      overrides,
      // Everything the pool already holds — including words this caller's
      // own shape filter rejects, since bootstrap narrows the list to the
      // shape it's actually asking for.
      poolWords.map((w) => w.word)
    );
    source = bootstrapSource;
    if (fresh.length > 0) {
      const existing = new Set(poolWords.map((w) => w.word));
      const newWords = fresh.filter((w) => !existing.has(w));
      await seedPool(db, topicSlug, topic, newWords, 'bootstrap');
      available = [...poolWords, ...newWords.map((word) => ({ word, addedBy: 'bootstrap' as const }))].filter(
        (w) => fitsShape(w.word, shape) && !used.has(w.word)
      );
    }
  }

  const picked = available
    .map((w) => ({ w, r: Math.random() }))
    .sort((a, b) => a.r - b.r)
    .slice(0, count)
    .map((x) => x.w);

  return { words: picked, source };
}

/** Marks words as served in `game`'s usage record for this topic. Call this
 * only when a word is actually played or selected — never just for being
 * shown as a candidate. Multiplayer hangman's "browse 5-8 suggestions, load
 * more" flow depends on this: showing a suggestion must not burn a pool
 * entry, or the pool would exhaust roughly 8x faster than actual play. */
export async function markUsed(
  db: Firestore,
  game: string,
  topicSlug: string,
  words: string[]
): Promise<void> {
  if (words.length === 0) return;
  await db
    .doc(`wordUsage/${game}-${topicSlug}`)
    .set({ used: FieldValue.arrayUnion(...words) }, { merge: true });
}

/** Writes a clue back onto a pool word that didn't have one — e.g. a word
 * search-sourced entry hangman is selecting for the first time. Read-modify
 * -write on the whole array rather than a targeted update: Firestore has no
 * "update the array element matching X" operation, and this array is small
 * (tens to low hundreds of entries) so rewriting it whole is cheap. Safe
 * under a race the same way `seedPool` is — worst case, two concurrent
 * clue-writes for the same word both land and the second simply overwrites
 * the first with an equally valid clue, never corrupted data. */
export async function enrichPoolWord(
  db: Firestore,
  topicSlug: string,
  word: string,
  hint: string,
  obvious?: string
): Promise<void> {
  const poolRef = db.doc(`wordPool/${topicSlug}`);
  const snap = await poolRef.get();
  const words: PoolWord[] = (snap.data()?.words as PoolWord[] | undefined) ?? [];
  const next = words.map((w) =>
    w.word === word ? { ...w, hint, ...(obvious ? { obvious } : {}) } : w
  );
  await poolRef.set({ words: next }, { merge: true });
}

// ------------------------------------------------------------ bulk seeding

/** How many words to ask for per topic when seeding in bulk.
 *
 * Higher than the live refill's 80 because the per-request overhead is
 * shared across a whole chunk of topics here, and the token budget is
 * nowhere near binding (15 topics x 100 words is ~6k output tokens against
 * a ~64k ceiling). It isn't set higher than this because the real limit
 * isn't tokens, it's how many good words a topic actually HAS — "Music
 * awards" doesn't have 150 a 13-year-old knows, and a model pushed to hit
 * a number starts padding with obscure or barely-related entries. The
 * prompt says so explicitly. */
const BULK_WORDS_PER_TOPIC = 100;

/** Asks for several topics' word lists in ONE request.
 *
 * The Gemini free tier bills by request, not tokens (20/day on the
 * flagship), so batching topics is close to free: 197 topics one-at-a-time
 * would take ten days of quota, in chunks of ~15 it's a single evening.
 *
 * Returns a map of topic -> words, only for topics that came back usable,
 * so a partial response still seeds whatever it did answer for. */
export async function bootstrapTopicChunk(
  providers: ModelProvider[],
  topics: string[],
  shape: ShapeFilter,
  perTopic: number = BULK_WORDS_PER_TOPIC
): Promise<{ byTopic: Map<string, string[]>; source: string | null }> {
  const numbered = topics.map((t, i) => `${i + 1}. ${t}`).join('\n');
  const prompt = `Give me a word list for each of these ${topics.length} topics, for a family word game.

Topics:
${numbered}

Rules:
- For EACH topic, up to ${perTopic} distinct words. Fewer is completely fine — if a topic is narrow, give what genuinely fits it and stop. Do NOT pad with obscure, barely-related or invented words to reach a number.
- Letters A-Z only, each a single unbroken token with no spaces — join multi-word names into one, e.g. "TAYLORSWIFT" not "Taylor Swift".
- Each word ${shape.minLen} to ${shape.maxLen} letters. Spread the lengths right across that range rather than bunching at one length.
- Common enough that a 13-year-old would recognize it, and cover the breadth of the topic rather than the few most obvious picks.
- If a topic is clearly inappropriate for a family app, give it an empty array.
${CONTENT_RATING}
- Respond with ONLY a JSON object whose keys are the topic lines EXACTLY as written above (without their numbers), each mapping to an array of uppercase words. Example: {"Cat breeds":["SIAMESE","TABBY"],"Space":["COMET","GALAXY"]}`;

  const { value, source } = await generate<Map<string, string[]>>(
    'bootstrapTopicChunk',
    providers,
    prompt,
    (text) => {
      const json = firstJson(text, '{');
      const byTopic = new Map<string, string[]>();
      if (!json) return byTopic;
      let parsed: unknown;
      try {
        parsed = JSON.parse(json);
      } catch {
        return byTopic;
      }
      if (!parsed || typeof parsed !== 'object') return byTopic;
      const obj = parsed as Record<string, unknown>;

      for (const topic of topics) {
        const raw = obj[topic];
        if (!Array.isArray(raw)) continue;
        const seen = new Set<string>();
        const words: string[] = [];
        for (const entry of raw) {
          if (typeof entry !== 'string') continue;
          const word = entry.trim().toUpperCase().replace(/\s+/g, ' ');
          if (!fitsShape(word, shape) || seen.has(word)) continue;
          seen.add(word);
          words.push(word);
        }
        if (words.length > 0) byTopic.set(topic, words);
      }
      return byTopic;
    },
    (byTopic) => byTopic.size === 0,
    new Map<string, string[]>()
  );

  return { byTopic: value, source };
}

/** How many words a pool needs before the seeder leaves it alone. Set
 * against what the games actually draw: hangman takes one word per round
 * from the 5-10 letter slice, word search takes 20 from the 3-10 slice, so
 * a pool this size is many rounds deep for both without being so ambitious
 * that narrow topics can never satisfy it and get re-seeded forever. */
export const SEEDED_ENOUGH = 40;

/** Which of `topics` still need stocking. Reads the pool docs directly so
 * a re-run costs Firestore reads rather than model calls — the whole point
 * of the seeder being safely repeatable. */
export async function topicsNeedingSeed(
  db: Firestore,
  topics: string[],
  slugify: (topic: string) => string
): Promise<string[]> {
  const needed: string[] = [];
  // Chunked to keep each getAll() well under Firestore's limits.
  for (let i = 0; i < topics.length; i += 50) {
    const batch = topics.slice(i, i + 50);
    const refs = batch.map((t) => db.doc(`wordPool/${slugify(t)}`));
    const snaps = await db.getAll(...refs);
    snaps.forEach((snap, j) => {
      const words = (snap.data()?.words as unknown[] | undefined) ?? [];
      if (words.length < SEEDED_ENOUGH) needed.push(batch[j]);
    });
  }
  return needed;
}
