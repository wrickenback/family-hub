// Deterministic word-search grid builder. Only the word LIST comes from
// Gemini — placing those words into a grid is ordinary local logic, so an
// AI hiccup can only ever mean "fewer words," never a broken puzzle.

export const GRID_SIZE = 12;

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

// All 8 compass directions, forwards and backwards — a full classic
// word search, not just horizontal/vertical.
const DIRECTIONS: [number, number][] = [
  [0, 1], [0, -1],
  [1, 0], [-1, 0],
  [1, 1], [-1, -1],
  [1, -1], [-1, 1],
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

function canPlaceAt(
  cells: (string | null)[][],
  word: string,
  row: number,
  col: number,
  dRow: number,
  dCol: number
): boolean {
  for (let i = 0; i < word.length; i++) {
    const r = row + dRow * i;
    const c = col + dCol * i;
    if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) return false;
    const existing = cells[r][c];
    if (existing !== null && existing !== word[i]) return false;
  }
  return true;
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
  seed: number
): WordSearchPuzzle {
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
    let bestAttempt: { row: number; col: number; dRow: number; dCol: number } | null = null;
    for (let attempt = 0; attempt < 200; attempt++) {
      const [dRow, dCol] = DIRECTIONS[Math.floor(rng() * DIRECTIONS.length)];
      const row = Math.floor(rng() * GRID_SIZE);
      const col = Math.floor(rng() * GRID_SIZE);
      if (canPlaceAt(cells, word, row, col, dRow, dCol)) {
        bestAttempt = { row, col, dRow, dCol };
        break;
      }
    }
    if (bestAttempt) {
      placeWord(cells, word, bestAttempt.row, bestAttempt.col, bestAttempt.dRow, bestAttempt.dCol);
      placed.push({ word, ...bestAttempt });
    }
    // Word didn't fit after 200 tries — dropped, not a puzzle failure.
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
