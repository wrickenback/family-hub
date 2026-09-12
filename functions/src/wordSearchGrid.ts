// Deterministic word-search grid builder. Only the word LIST comes from
// Gemini — placing those words into a grid is ordinary local logic, so an
// AI hiccup can only ever mean "fewer words," never a broken puzzle.

export const GRID_SIZE = 10;

export interface PlacedWord {
  word: string;
  row: number;
  col: number;
  dRow: number;
  dCol: number;
}

export interface WordSearchPuzzle {
  size: number;
  grid: string[]; // one string per row, GRID_SIZE chars each
  words: PlacedWord[];
}

export type Difficulty = 'easy' | 'hard';

/** How much each crossing letter multiplies a placement's odds of being
 * picked. High enough that words genuinely interlock; not so high that
 * every puzzle from the same word list comes out with the same layout. */
const CROSSING_BIAS = 12;

// Down-left and up-left are never used at all, in either difficulty — of
// the 4 backward-reading diagonals, they're the two that force the eye to
// track backward *and* climb/drop rows at once, which breaks left-to-right
// reading-trained scanning worse than any other direction. For a casual
// few-minutes game aimed at kids, that combination reads as broken rather
// than "harder," so it's cut from the pool entirely rather than gated
// behind difficulty.
//
// Easy keeps only forward-reading directions (right, down, and the one
// diagonal that combines them). Hard adds the reverses of all three but
// still excludes the two omitted diagonals above.
const EASY_DIRECTIONS: [number, number][] = [
  [0, 1],  // right
  [1, 0],  // down
  [1, 1],  // down-right
];

const HARD_DIRECTIONS: [number, number][] = [
  ...EASY_DIRECTIONS,
  [0, -1], // left
  [-1, 0], // up
  [-1, 1], // up-right
];

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

/** How many letters of `word` would sit on top of an identical letter
 * already in the grid, or -1 if the placement is illegal (off the board, or
 * conflicting with a different letter). Zero means a legal placement that
 * touches nothing — a word floating on its own. */
function overlapScore(
  cells: (string | null)[][],
  word: string,
  row: number,
  col: number,
  dRow: number,
  dCol: number
): number {
  let shared = 0;
  for (let i = 0; i < word.length; i++) {
    const r = row + dRow * i;
    const c = col + dCol * i;
    if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) return -1;
    const existing = cells[r][c];
    if (existing !== null) {
      if (existing !== word[i]) return -1;
      shared++;
    }
  }
  return shared;
}

function placeWord(
  cells: (string | null)[][],
  word: string,
  row: number,
  col: number,
  dRow: number,
  dCol: number
) {
  for (let i = 0; i < word.length; i++) {
    cells[row + dRow * i][col + dCol * i] = word[i];
  }
}

/** Builds a puzzle from a word list. Words that don't fit after many
 * attempts are silently dropped rather than failing the whole puzzle —
 * seeded so the same word list always produces the same grid. */
export function buildWordSearchGrid(
  words: string[],
  seed: number,
  difficulty: Difficulty = 'hard'
): WordSearchPuzzle {
  const directions = difficulty === 'easy' ? EASY_DIRECTIONS : HARD_DIRECTIONS;
  const rng = mulberry32(seed);
  const cells: (string | null)[][] = Array.from({ length: GRID_SIZE }, () =>
    Array(GRID_SIZE).fill(null)
  );

  // Longest first — packs more reliably than a random order.
  const ordered = [...words]
    .map((w) => w.toUpperCase())
    .filter((w) => w.length >= 3 && w.length <= GRID_SIZE)
    .sort((a, b) => b.length - a.length);

  const placed: PlacedWord[] = [];

  for (const word of ordered) {
    // Every legal placement, not just the first one a few random darts
    // happen to hit. The old approach took the first merely-legal spot it
    // found, and since placements that cross an existing word are a tiny
    // slice of all legal placements, words almost never intersected —
    // which left a sparse grid of isolated words that was far too easy to
    // scan. The board is 10x10 with at most 6 directions, so enumerating
    // all ~600 candidates costs nothing.
    const candidates: {
      row: number;
      col: number;
      dRow: number;
      dCol: number;
      shared: number;
    }[] = [];

    for (const [dRow, dCol] of directions) {
      for (let row = 0; row < GRID_SIZE; row++) {
        for (let col = 0; col < GRID_SIZE; col++) {
          const shared = overlapScore(cells, word, row, col, dRow, dCol);
          if (shared >= 0) candidates.push({ row, col, dRow, dCol, shared });
        }
      }
    }

    if (candidates.length === 0) continue; // no legal spot — dropped, not a failure

    // Weighted pick rather than "always the most crossings": strongly
    // favours intersections while still varying the layout between puzzles
    // built from the same word list.
    const weights = candidates.map((c) => 1 + c.shared * CROSSING_BIAS);
    const total = weights.reduce((sum, w) => sum + w, 0);
    let roll = rng() * total;
    let chosen = candidates[candidates.length - 1];
    for (let i = 0; i < candidates.length; i++) {
      roll -= weights[i];
      if (roll <= 0) {
        chosen = candidates[i];
        break;
      }
    }

    placeWord(cells, word, chosen.row, chosen.col, chosen.dRow, chosen.dCol);
    placed.push({
      word,
      row: chosen.row,
      col: chosen.col,
      dRow: chosen.dRow,
      dCol: chosen.dCol,
    });
  }

  // Fill remaining cells by sampling letters from the placed words rather
  // than uniform A-Z — uniform fill makes real words visually pop out;
  // sampled fill makes the puzzle meaningfully harder to scan.
  const letterPool = placed.flatMap((p) => p.word.split(''));
  const fallbackPool = 'ETAOINSHRDLU'.split('');
  const pool = letterPool.length > 0 ? letterPool : fallbackPool;

  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (cells[r][c] === null) {
        cells[r][c] = pool[Math.floor(rng() * pool.length)];
      }
    }
  }

  return {
    size: GRID_SIZE,
    grid: cells.map((row) => row.join('')),
    words: placed,
  };
}
