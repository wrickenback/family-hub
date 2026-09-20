/** Builds the bundled fallback puzzles for Word Bloom and the mini
 * crossword, from the vetted pool in wordPool.ts.
 *
 * These are what the games play when every model in the chain comes up
 * short — or when the phone has no signal at all, which no second provider
 * can help with. Run with:
 *
 *   npx tsx scripts/buildWordPuzzles.ts
 *
 * Word Bloom packs are written straight out. Crossword grids are printed
 * for review instead, because each one still needs clues written for the
 * words it happens to use — see the note at the top of miniCrosswordPuzzles.ts.
 */

import { writeFileSync } from 'node:fs';
import {
  BLOOM_BASES,
  FIVE_LETTER_EXTRA,
  FOUR_LETTER,
  SEVEN_LETTER,
  SIX_LETTER,
  THREE_LETTER,
} from './wordPool';
import { WORDLE_ANSWERS } from '../src/lib/wordleWords';

const dedupe = (words: string[]) => [...new Set(words.map((w) => w.toUpperCase()))];

const THREE = dedupe(THREE_LETTER);
const FOUR = dedupe(FOUR_LETTER).filter((w) => w.length === 4);
const FIVE = dedupe([...WORDLE_ANSWERS, ...FIVE_LETTER_EXTRA]).filter(
  (w) => w.length === 5
);
// Bloom-only (see SIX_LETTER/SEVEN_LETTER's own doc comment in wordPool.ts)
// — kept out of BY_LENGTH below, since the crossword only ever wants 3-5.
const SIX = dedupe(SIX_LETTER).filter((w) => w.length === 6);
const SEVEN = dedupe(SEVEN_LETTER).filter((w) => w.length === 7);

// ------------------------------------------------------------- word bloom

function spellableFrom(word: string, base: string): boolean {
  const available = new Map<string, number>();
  for (const letter of base) available.set(letter, (available.get(letter) ?? 0) + 1);
  for (const letter of word) {
    const left = available.get(letter) ?? 0;
    if (left === 0) return false;
    available.set(letter, left - 1);
  }
  return true;
}

function buildBloomPacks() {
  const pool = [...THREE, ...FOUR, ...FIVE, ...SIX, ...SEVEN];
  const packs: { base: string; words: string[] }[] = [];

  for (const raw of BLOOM_BASES) {
    const base = raw.toUpperCase();
    if (base.length < 6 || base.length > 7) continue;

    const words = pool.filter(
      (word) => word.length <= base.length && spellableFrom(word, base)
    );
    words.push(base);

    const unique = [...new Set(words)].sort(
      (a, b) => a.length - b.length || a.localeCompare(b)
    );
    // Same bar the server applies — a thin letter set isn't worth playing.
    if (unique.length < 8) continue;
    packs.push({ base, words: unique });
  }

  return packs;
}

// ---------------------------------------------------------- mini crossword

const PATTERN = ['...##', '.....', '.....', '.....', '##...'];
const SIZE = 5;

interface Slot {
  direction: 'across' | 'down';
  row: number;
  col: number;
  length: number;
}

function slots(): Slot[] {
  const found: Slot[] = [];
  const open = (r: number, c: number) =>
    r >= 0 && r < SIZE && c >= 0 && c < SIZE && PATTERN[r][c] !== '#';

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!open(r, c)) continue;
      if (!open(r, c - 1)) {
        let length = 0;
        while (open(r, c + length)) length++;
        if (length >= 3) found.push({ direction: 'across', row: r, col: c, length });
      }
      if (!open(r - 1, c)) {
        let length = 0;
        while (open(r + length, c)) length++;
        if (length >= 3) found.push({ direction: 'down', row: r, col: c, length });
      }
    }
  }
  return found;
}

const SLOTS = slots();
const BY_LENGTH: Record<number, string[]> = { 3: THREE, 4: FOUR, 5: FIVE };

function cellsOf(slot: Slot): [number, number][] {
  return Array.from({ length: slot.length }, (_, i) =>
    slot.direction === 'across'
      ? ([slot.row, slot.col + i] as [number, number])
      : ([slot.row + i, slot.col] as [number, number])
  );
}

function shuffled<T>(list: T[], rng: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type WordIndex = Record<number, Map<string, string[]>>;

/** Words of each length, indexed by (position, letter), so "every 5-letter
 * word with R in slot 3" is a lookup instead of a scan of six hundred words
 * at every node of the search.
 *
 * Built per seed from pre-shuffled pools. That ordering is the only source
 * of randomness in the fill, and doing it here rather than at each node is
 * the whole difference between this finishing in a second and not
 * finishing at all: shuffling a thousand-word candidate list at every one
 * of ~50,000 nodes is slower than the search it was meant to vary. */
function buildIndex(rng: () => number): WordIndex {
  const index: WordIndex = {};
  for (const [length, words] of Object.entries(BY_LENGTH)) {
    const map = new Map<string, string[]>();
    for (const word of shuffled(words, rng)) {
      for (let i = 0; i < word.length; i++) {
        const key = `${i}${word[i]}`;
        const bucket = map.get(key);
        if (bucket) bucket.push(word);
        else map.set(key, [word]);
      }
    }
    index[Number(length)] = map;
  }
  return index;
}

function candidatesFor(slot: Slot, grid: string[][], index: WordIndex, pools: Record<number, string[]>): string[] {
  const cells = cellsOf(slot);
  const constraints: [number, string][] = [];
  cells.forEach(([r, c], i) => {
    if (grid[r][c] !== '.') constraints.push([i, grid[r][c]]);
  });

  if (constraints.length === 0) return pools[slot.length] ?? [];

  // Start from the rarest constraint and filter down — far cheaper than
  // intersecting every bucket.
  const byLetter = index[slot.length];
  let pool: string[] | undefined;
  for (const [i, letter] of constraints) {
    const bucket = byLetter.get(`${i}${letter}`) ?? [];
    if (!pool || bucket.length < pool.length) pool = bucket;
  }
  return (pool ?? []).filter((word) =>
    constraints.every(([i, letter]) => word[i] === letter)
  );
}

/** Backtracking fill with forward checking and most-constrained-slot-first.
 *
 * The naive version — slots in reading order, try every word — does not
 * finish on this pattern: with four of the five rows and three of the
 * columns fully crossed it's close to a double word square, and blind
 * search spends its life deep in branches that died several placements ago.
 * Checking after every placement that each remaining slot still has at
 * least one candidate is what makes it finish in seconds. */
function fillGrid(rng: () => number, budgetMs = 20000): string[] | null {
  const index = buildIndex(rng);
  const pools: Record<number, string[]> = {};
  for (const [length, words] of Object.entries(BY_LENGTH)) {
    pools[Number(length)] = shuffled(words, rng);
  }

  const grid: string[][] = PATTERN.map((row) => row.split(''));
  const used = new Set<string>();
  const filled = new Set<number>();
  const deadline = Date.now() + budgetMs;

  const place = (): boolean => {
    if (Date.now() > deadline) return false;
    if (filled.size === SLOTS.length) return true;

    // Most constrained slot first: fewest candidates, so the branch that is
    // about to fail fails now rather than five levels down.
    let target = -1;
    let best: string[] = [];
    for (let i = 0; i < SLOTS.length; i++) {
      if (filled.has(i)) continue;
      const options = candidatesFor(SLOTS[i], grid, index, pools).filter(
        (w) => !used.has(w)
      );
      if (target === -1 || options.length < best.length) {
        target = i;
        best = options;
        if (options.length === 0) break;
      }
    }
    if (target === -1 || best.length === 0) return false;

    const slot = SLOTS[target];
    const cells = cellsOf(slot);
    filled.add(target);

    for (const word of best) {
      const before = cells.map(([r, c]) => grid[r][c]);
      cells.forEach(([r, c], i) => (grid[r][c] = word[i]));
      used.add(word);

      // Forward check: every slot still open must have somewhere to go.
      let viable = true;
      for (let i = 0; i < SLOTS.length && viable; i++) {
        if (filled.has(i)) continue;
        viable = candidatesFor(SLOTS[i], grid, index, pools).some(
          (w) => !used.has(w)
        );
      }

      if (viable && place()) return true;

      used.delete(word);
      cells.forEach(([r, c], i) => (grid[r][c] = before[i]));
    }

    filled.delete(target);
    return false;
  };

  return place() ? grid.map((row) => row.join('')) : null;
}

function readSlot(grid: string[], slot: Slot): string {
  return cellsOf(slot)
    .map(([r, c]) => grid[r][c])
    .join('');
}

/** Collects many solutions from one search rather than restarting per seed.
 *
 * Restarting was the wrong shape: each run either lands a grid quickly or
 * spends its whole budget proving that one random word ordering has no
 * completion, and most orderings don't. Backtracking already enumerates
 * solutions — letting it continue past the first is close to free. */
function collectGrids(limit: number, budgetMs: number, rng: () => number): string[][] {
  const index = buildIndex(rng);
  const pools: Record<number, string[]> = {};
  for (const [length, words] of Object.entries(BY_LENGTH)) {
    pools[Number(length)] = shuffled(words, rng);
  }

  const grid: string[][] = PATTERN.map((row) => row.split(''));
  const used = new Set<string>();
  const filled = new Set<number>();
  const found: string[][] = [];
  const deadline = Date.now() + budgetMs;

  const walk = (): void => {
    if (found.length >= limit || Date.now() > deadline) return;
    if (filled.size === SLOTS.length) {
      found.push(grid.map((row) => row.join('')));
      return;
    }

    let target = -1;
    let best: string[] = [];
    for (let i = 0; i < SLOTS.length; i++) {
      if (filled.has(i)) continue;
      const options = candidatesFor(SLOTS[i], grid, index, pools).filter(
        (w) => !used.has(w)
      );
      if (target === -1 || options.length < best.length) {
        target = i;
        best = options;
        if (options.length === 0) break;
      }
    }
    if (target === -1 || best.length === 0) return;

    const slot = SLOTS[target];
    const cells = cellsOf(slot);
    filled.add(target);

    for (const word of best) {
      if (found.length >= limit || Date.now() > deadline) break;
      const before = cells.map(([r, c]) => grid[r][c]);
      cells.forEach(([r, c], i) => (grid[r][c] = word[i]));
      used.add(word);

      let viable = true;
      for (let i = 0; i < SLOTS.length && viable; i++) {
        if (filled.has(i)) continue;
        viable = candidatesFor(SLOTS[i], grid, index, pools).some(
          (w) => !used.has(w)
        );
      }
      if (viable) walk();

      used.delete(word);
      cells.forEach(([r, c], i) => (grid[r][c] = before[i]));
    }

    filled.delete(target);
  };

  walk();
  return found;
}

/** Consecutive solutions differ by a single word, so taking the first N
 * would ship fourteen near-identical puzzles. This picks the ones that
 * share the fewest answers with what's already chosen. */
function buildCrosswords(count: number) {
  const candidates = collectGrids(4000, 60000, mulberry32(7));
  const chosen: string[][] = [];
  const usedAnswers = new Set<string>();

  while (chosen.length < count && candidates.length > 0) {
    let bestIndex = 0;
    let bestOverlap = Infinity;
    candidates.forEach((grid, i) => {
      const answers = SLOTS.map((slot) => readSlot(grid, slot));
      const overlap = answers.filter((a) => usedAnswers.has(a)).length;
      if (overlap < bestOverlap) {
        bestOverlap = overlap;
        bestIndex = i;
      }
    });
    const [picked] = candidates.splice(bestIndex, 1);
    for (const slot of SLOTS) usedAnswers.add(readSlot(picked, slot));
    chosen.push(picked);
  }

  return chosen.map((grid) => ({
    grid,
    entries: SLOTS.map((slot) => ({ ...slot, answer: readSlot(grid, slot) })),
  }));
}

// ------------------------------------------------------------------- main

const packs = buildBloomPacks();
const bloomFile = `/** Bundled Word Bloom puzzles — the fallback when every model in the
 * chain comes up empty, and the only thing that works with no signal at
 * all.
 *
 * Generated file: run \`npx tsx scripts/buildWordPuzzles.ts\` to rebuild.
 * Every word here comes from the vetted pool in scripts/wordPool.ts, so a
 * fallback round can't serve a word nobody in the family has heard of. */

export interface BloomPack {
  base: string;
  words: string[];
}

export const BLOOM_PACKS: BloomPack[] = ${JSON.stringify(packs, null, 2)
  .replace(/"base"/g, 'base')
  .replace(/"words"/g, 'words')};
`;

writeFileSync(new URL('../src/lib/bloomPuzzles.ts', import.meta.url), bloomFile);

// The same vocabulary, handed to the Cloud Function so a model-written
// puzzle can be completed against it.
//
// Without this the two halves of Word Bloom disagreed badly: an offline
// pack listed every word in the pool that its base could spell, while a
// live puzzle listed only the dozen or so a model happened to recall — so
// the good puzzle, the one the family actually gets most days, rejected
// perfectly ordinary words the kids could plainly see in the wheel. The
// function now expands its list against this before serving it. Functions
// deploy from their own directory and can't import out of src/, hence a
// generated copy rather than a shared import.
const vocabularyFile = `/** The vetted Word Bloom vocabulary, shared with the bundled packs.
 *
 * Generated file: run \`npx tsx scripts/buildWordPuzzles.ts\` to rebuild.
 * Every word has already been through the "would a kid in this family know
 * it?" filter in scripts/wordPool.ts, so completing a puzzle against this
 * list can't sneak SCREE or OTIC into a family game. */

export const BLOOM_VOCABULARY: string[] = ${JSON.stringify(
  [...THREE, ...FOUR, ...FIVE, ...SIX, ...SEVEN].sort(
    (a, b) => a.length - b.length || a.localeCompare(b)
  )
)};
`;

writeFileSync(
  new URL('../functions/src/bloomVocabulary.ts', import.meta.url),
  vocabularyFile
);
console.log(
  `bloom vocabulary: ${THREE.length + FOUR.length + FIVE.length + SIX.length + SEVEN.length} words`
);

const wordCounts = packs.map((p) => p.words.length);
console.log(
  `word bloom: ${packs.length} packs, ${Math.min(...wordCounts)}-${Math.max(
    ...wordCounts
  )} words each`
);

const crosswords = buildCrosswords(14);
console.log(`\ncrossword grids: ${crosswords.length}`);
console.log(JSON.stringify(crosswords, null, 1));
