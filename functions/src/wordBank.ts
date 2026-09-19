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

/** Asks the model chain for a generous batch of words/phrases for a topic.
 * Shape-agnostic on the prompt side — the shape filter narrows what's kept
 * after parsing, not what's asked for, so the same bootstrap serves every
 * consumer's length range from one call. */
async function bootstrap(
  providers: ModelProvider[],
  topic: string,
  shape: ShapeFilter,
  count: number,
  overrides?: BootstrapOverrides
): Promise<{ words: string[]; source: string | null }> {
  const phraseLine = shape.allowPhrases
    ? 'Short phrases are fine where natural (e.g. "GOLDEN RETRIEVER"), or single words — whichever fits the topic better.'
    : 'Each must be a single unbroken token with no spaces — join multi-word names into one word, e.g. "GOLDENRETRIEVER" not "Golden Retriever".';
  const prompt =
    overrides?.buildPrompt?.(topic, count) ??
    `Give me ${count} distinct words or short phrases for a family word game about "${topic}".
Rules:
- If the topic itself is clearly inappropriate for a family app, respond with exactly: []
${CONTENT_RATING}
- Letters A-Z only (spaces allowed only where noted below).
- Each must be ${shape.minLen} to ${shape.maxLen} letters long, not counting spaces.
- ${phraseLine}
- Common enough that a 13-year-old would recognize it, but cover the full range of the topic — not just the five most obvious picks.
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
      overrides
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
