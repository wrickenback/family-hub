import { CROSSWORD_SIZE, CROSSWORD_SLOTS } from './wordGames';

/** Fills the mini crossword's fixed grid from a word list — deterministic,
 * local, free, and 100% reliable given enough candidates, replacing the
 * old approach of asking a model to solve the grid directly.
 *
 * That approach was measured failing outright this session: every
 * reasoning model tried (GLM-5.3, GLM-5.3-Flash, DeepSeek V4 Pro, at every
 * reasoning effort level) truncated to zero output trying to fill this
 * exact grid, at up to $0.05 per failed call. A crossword isn't "write me
 * a list" — it's "find N words that mutually agree letter-for-letter at
 * fixed intersections in one pass, no backtracking" — a constraint
 * satisfaction problem, which is precisely the kind of task language
 * models are unreliable at and plain search is not. See
 * WORD_BANK_PLAN.md §3.6 for the fuller writeup and the bank-sizing data
 * this was built against (the 5-letter slots are the real bottleneck —
 * measured needing roughly 600+ candidates before the solve rate is
 * reliably near 100%; 3- and 4-letter slots need far fewer).
 *
 * Algorithm: MRV (most-constrained-slot-next) plus forward checking. A
 * naive unordered backtracker was tried first and thrashes badly — it can
 * burn a six-figure step budget without finding a solution even when one
 * exists, because it doesn't prune a doomed branch until many slots later.
 * Picking the slot with the fewest remaining candidates first, and
 * pruning the moment any other slot's domain goes empty, is what makes
 * this fast enough to run inline in a callable instead of needing its own
 * background job. */

type Slot = (typeof CROSSWORD_SLOTS)[number];

interface Crossing {
  /** Index into this slot's own letters. */
  i: number;
  other: number;
  /** Index into the other slot's letters, at the same shared cell. */
  j: number;
}

const CROSSINGS: Crossing[][] = CROSSWORD_SLOTS.map((slot) =>
  CROSSWORD_SLOTS.flatMap((other, otherIdx) => {
    if (other === slot) return [];
    const crossings: Crossing[] = [];
    for (let i = 0; i < slot.length; i++) {
      const r = slot.direction === 'across' ? slot.row : slot.row + i;
      const c = slot.direction === 'across' ? slot.col + i : slot.col;
      for (let j = 0; j < other.length; j++) {
        const or = other.direction === 'across' ? other.row : other.row + j;
        const oc = other.direction === 'across' ? other.col + j : other.col;
        if (r === or && c === oc) crossings.push({ i, other: otherIdx, j });
      }
    }
    return crossings;
  })
);

function mulberry32(seed: number) {
  return function random() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(list: T[], random: () => number): T[] {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** One attempt, deterministic given `seed` — the caller retries with a
 * different seed on failure, which in practice almost never happens once
 * the filler bank is stocked (see the bank-sizing note above). */
function attempt(byLength: Map<number, string[]>, seed: number, stepBudget = 20000): string[] | null {
  const domains: string[][] = CROSSWORD_SLOTS.map((slot) =>
    shuffled(byLength.get(slot.length) ?? [], mulberry32(seed + slot.length * 7919))
  );
  const assigned: (string | null)[] = new Array(CROSSWORD_SLOTS.length).fill(null);
  const used = new Set<string>();
  let steps = 0;

  function pickNext(): number {
    let best = -1;
    let bestSize = Infinity;
    for (let i = 0; i < CROSSWORD_SLOTS.length; i++) {
      if (assigned[i] !== null) continue;
      if (domains[i].length < bestSize) {
        bestSize = domains[i].length;
        best = i;
      }
    }
    return best;
  }

  function consistent(word: string, slotIdx: number): boolean {
    for (const { i, other, j } of CROSSINGS[slotIdx]) {
      const otherWord = assigned[other];
      if (otherWord !== null && otherWord[j] !== word[i]) return false;
    }
    return true;
  }

  function backtrack(): boolean {
    if (steps++ > stepBudget) return false;
    const idx = pickNext();
    if (idx === -1) return true; // every slot filled

    for (const word of domains[idx]) {
      if (used.has(word) || !consistent(word, idx)) continue;

      const restore: Array<[number, string[]]> = [];
      let dead = false;
      for (const { i, other, j } of CROSSINGS[idx]) {
        if (assigned[other] !== null) continue;
        const before = domains[other];
        const after = before.filter((candidate) => candidate[j] === word[i]);
        restore.push([other, before]);
        domains[other] = after;
        if (after.length === 0) {
          dead = true;
          break;
        }
      }

      if (!dead) {
        assigned[idx] = word;
        used.add(word);
        if (backtrack()) return true;
        used.delete(word);
        assigned[idx] = null;
      }
      for (const [other, before] of restore) domains[other] = before;
    }
    return false;
  }

  return backtrack() ? (assigned as string[]) : null;
}

export interface SolvedSlot {
  direction: 'across' | 'down';
  row: number;
  col: number;
  answer: string;
}

/** Tries a handful of random fill orders before giving up — cheap (pure
 * local computation, no I/O) and covers the rare case a particular
 * shuffle order dead-ends within its own step budget even though the
 * candidate pool could solve it with different ordering luck. */
export function solveCrossword(
  candidatesByLength: Record<number, string[]>,
  attempts = 5
): SolvedSlot[] | null {
  const byLength = new Map(
    Object.entries(candidatesByLength).map(([len, words]) => [Number(len), words])
  );
  for (let t = 0; t < attempts; t++) {
    const result = attempt(byLength, t * 104729 + 1);
    if (result) {
      return CROSSWORD_SLOTS.map((slot, i) => ({
        direction: slot.direction,
        row: slot.row,
        col: slot.col,
        answer: result[i],
      }));
    }
  }
  return null;
}

/** Reconstructs the grid's 5 row-strings from the solved slots — a cell is
 * '#' unless some slot's answer covers it, matching the '#' convention
 * MiniCrossword's `grid` field already uses throughout the rest of the
 * app (ProviderBadge, the client renderer, etc.), so nothing downstream
 * of this needs to change. */
export function buildGrid(solved: SolvedSlot[]): string[] {
  const rows: string[][] = Array.from({ length: CROSSWORD_SIZE }, () =>
    new Array(CROSSWORD_SIZE).fill('#')
  );
  for (const slot of solved) {
    for (let i = 0; i < slot.answer.length; i++) {
      const r = slot.direction === 'across' ? slot.row : slot.row + i;
      const c = slot.direction === 'across' ? slot.col + i : slot.col;
      rows[r][c] = slot.answer[i];
    }
  }
  return rows.map((row) => row.join(''));
}
