import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { generate, firstJson, CONTENT_RATING, type ModelProvider } from './providers';
import { expandBloomWords, spellableFrom, MIN_BLOOM_WORDS } from './wordGames';

/** A parallel, Bloom-specific pool — deliberately NOT routed through
 * wordBank.ts's fetchWords/PoolWord. Investigated doing that first; it
 * doesn't fit. Hangman and word search pick ONE flat word from a list —
 * that's exactly what PoolWord and its bootstrap prompt are shaped for.
 * Bloom's model call invents a base word AND derives its entire spellable
 * sub-word list in the same response: a self-contained puzzle object, not
 * a string, with an internal-consistency constraint (every listed word has
 * to actually be spellable from the base's letters) the generic bootstrap
 * has no way to express or validate. See WORD_BANK_PLAN.md §3 for the full
 * reasoning this was worked out against.
 *
 * Same underlying principle as wordBank.ts anyway: a single flat pool (no
 * topic — Bloom has no category concept, same as Wordle), served from
 * Firestore when there's an unused entry, refilled live only when there
 * isn't, with usage tracked per game so a base used by the daily puzzle
 * stays fully available to free play and vice versa. */

export interface BloomPoolEntry {
  base: string;
  words: string[];
  addedBy: 'bootstrap';
}

const POOL_DOC = 'bloomBasePool/all';
// Smaller batch than wordBank.ts's word lists (80) — each entry here is a
// whole puzzle (a base plus a dozen-plus derived words), not one token, so
// the same generosity would cost proportionally more per bootstrap call.
const DEFAULT_BOOTSTRAP_COUNT = 15;

async function bootstrap(
  providers: ModelProvider[],
  avoidBases: Set<string>,
  count: number
): Promise<{ entries: BloomPoolEntry[]; source: string | null }> {
  const avoidLine = avoidBases.size
    ? `\n- Do NOT use any of these base words — they've been used recently: ${[...avoidBases].join(', ')}.`
    : '';
  const prompt = `Give me ${count} DIFFERENT base words for a word puzzle, each with every shorter word hidden in its letters.
For EACH one:
- The base word must be a single common English word of 6 or 7 letters, letters A-Z only, no proper nouns.${avoidLine}
- List all words of 3 or more letters that can be spelled using ONLY the letters of that base, each letter used no more times than it appears in the base. Include the base word itself in its own list.
- Only include words a 13-year-old would know. No proper nouns, no abbreviations, no slang, no archaic words.
- Aim for at least 12 words per base.
${CONTENT_RATING}
- Respond with ONLY a JSON array of objects, nothing else: [{"base":"GARDEN","words":["GARDEN","DANGER","GRADE","RANGE","READ","DEAR","RAN","AGE"]}]`;

  const { value, source } = await generate<BloomPoolEntry[]>(
    'bloomBankBootstrap',
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

      const entries: BloomPoolEntry[] = [];
      const seenBases = new Set<string>();
      for (const raw of parsed) {
        if (!raw || typeof raw !== 'object') continue;
        const obj = raw as { base?: unknown; words?: unknown };
        const base = String(obj.base ?? '').trim().toUpperCase();
        if (!/^[A-Z]{6,7}$/.test(base) || seenBases.has(base) || avoidBases.has(base)) continue;
        if (!Array.isArray(obj.words)) continue;

        const seen = new Set<string>();
        const words: string[] = [];
        for (const raw2 of obj.words) {
          if (typeof raw2 !== 'string') continue;
          const word = raw2.trim().toUpperCase();
          if (!/^[A-Z]{3,7}$/.test(word) || seen.has(word)) continue;
          if (word.length > base.length || !spellableFrom(word, base)) continue;
          seen.add(word);
          words.push(word);
        }
        // The base has to be findable, or the puzzle has no final answer —
        // same validation generateBloomPuzzle already applies to a single
        // live-generated puzzle, just run here per entry in a batch.
        if (!seen.has(base)) continue;

        const full = expandBloomWords(base, words);
        if (full.length < MIN_BLOOM_WORDS) continue;

        seenBases.add(base);
        entries.push({ base, words: full, addedBy: 'bootstrap' });
      }
      return entries;
    },
    (entries) => entries.length === 0,
    []
  );
  return { entries: value, source };
}

/** The one entry point every Bloom consumer calls: serve an unused puzzle
 * from the pool, or bootstrap a fresh batch live if none is available —
 * same "pool empty" and "pool never existed" collapse into one code path
 * that wordBank.ts's fetchWords already established. Never marks anything
 * used; see `markBloomBaseUsed`. */
export async function fetchBloomPuzzle(
  db: Firestore,
  providers: ModelProvider[],
  game: string,
  avoidBases: string[] = []
): Promise<{ puzzle: BloomPoolEntry | null; source: string | null }> {
  const poolRef = db.doc(POOL_DOC);
  const usageRef = db.doc(`wordUsage/${game}-bloom-bases`);

  const [poolSnap, usageSnap] = await Promise.all([poolRef.get(), usageRef.get()]);
  const pool: BloomPoolEntry[] = (poolSnap.data()?.puzzles as BloomPoolEntry[] | undefined) ?? [];
  const used = new Set<string>([
    ...((usageSnap.data()?.used as string[] | undefined) ?? []),
    ...avoidBases.map((b) => b.toUpperCase()),
  ]);

  let available = pool.filter((p) => !used.has(p.base));
  let source: string | null = null;

  if (available.length === 0) {
    const { entries: fresh, source: bootstrapSource } = await bootstrap(providers, used, DEFAULT_BOOTSTRAP_COUNT);
    source = bootstrapSource;
    if (fresh.length > 0) {
      const existingBases = new Set(pool.map((p) => p.base));
      const newEntries = fresh.filter((p) => !existingBases.has(p.base));
      if (newEntries.length > 0) {
        // arrayUnion dedups by exact value the same way seedPool relies on
        // in wordBank.ts — a concurrent bootstrap of the same empty pool
        // costs at most one duplicate live call, never corrupted data.
        await poolRef.set(
          { puzzles: FieldValue.arrayUnion(...newEntries), createdAt: FieldValue.serverTimestamp() },
          { merge: true }
        );
      }
      available = [...pool, ...newEntries].filter((p) => !used.has(p.base));
    }
  }

  if (available.length === 0) return { puzzle: null, source };
  const picked = available[Math.floor(Math.random() * available.length)];
  return { puzzle: picked, source };
}

/** Marks a base used in `game`'s own record — kept separate from word
 * search/hangman's wordUsage keys by the `-bloom-bases` suffix, but the
 * same collection and the same "per game, not global" principle: a base
 * the daily puzzle used stays fully available to free play and vice
 * versa. */
export async function markBloomBaseUsed(db: Firestore, game: string, base: string): Promise<void> {
  await db.doc(`wordUsage/${game}-bloom-bases`).set({ used: FieldValue.arrayUnion(base) }, { merge: true });
}
