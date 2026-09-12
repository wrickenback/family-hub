// Pure game logic for Blocks (1010!/Block Blast style) — no rendering, no
// Firestore. Kept framework-free so it's easy to reason about and test.

export const BOARD_SIZE = 8;
export const PIECE_COLORS = 6;

/** 0 = empty; 1..PIECE_COLORS identifies which piece color occupies a cell. */
export type Board = number[][];

export interface Shape {
  id: string;
  cells: [row: number, col: number][];
  weight: number;
}

export function emptyBoard(): Board {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array(BOARD_SIZE).fill(0)
  );
}

// Shapes are pre-rotated, fixed variants rather than a rotation system —
// standard for this genre (Block Blast, 1010!) since the player never
// rotates pieces themselves. Weight biases the random draw. Real Block Blast
// deals medium/large pieces (4-5 cells, the big square, plus-shapes) often
// enough that they define the puzzle, not just 1-3 cell filler — weights
// here lean that direction rather than making big pieces a rare novelty.
export const SHAPES: Shape[] = [
  { id: 'dot', cells: [[0, 0]], weight: 3 },
  { id: 'h2', cells: [[0, 0], [0, 1]], weight: 6 },
  { id: 'v2', cells: [[0, 0], [1, 0]], weight: 6 },
  { id: 'h3', cells: [[0, 0], [0, 1], [0, 2]], weight: 7 },
  { id: 'v3', cells: [[0, 0], [1, 0], [2, 0]], weight: 7 },
  { id: 'h4', cells: [[0, 0], [0, 1], [0, 2], [0, 3]], weight: 6 },
  { id: 'v4', cells: [[0, 0], [1, 0], [2, 0], [3, 0]], weight: 6 },
  { id: 'h5', cells: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]], weight: 4 },
  { id: 'v5', cells: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]], weight: 4 },
  { id: 'square2', cells: [[0, 0], [0, 1], [1, 0], [1, 1]], weight: 6 },
  { id: 'square3', cells: [
    [0, 0], [0, 1], [0, 2],
    [1, 0], [1, 1], [1, 2],
    [2, 0], [2, 1], [2, 2],
  ], weight: 4 },
  { id: 'plus', cells: [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]], weight: 4 },
  // L-tromino, four rotations
  { id: 'l3a', cells: [[0, 0], [1, 0], [1, 1]], weight: 5 },
  { id: 'l3b', cells: [[0, 0], [0, 1], [1, 0]], weight: 5 },
  { id: 'l3c', cells: [[0, 0], [0, 1], [1, 1]], weight: 5 },
  { id: 'l3d', cells: [[0, 1], [1, 0], [1, 1]], weight: 5 },
  // L-tetromino, four rotations
  { id: 'l4a', cells: [[0, 0], [1, 0], [2, 0], [2, 1]], weight: 5 },
  { id: 'l4b', cells: [[0, 0], [0, 1], [0, 2], [1, 0]], weight: 5 },
  { id: 'l4c', cells: [[0, 0], [0, 1], [1, 1], [2, 1]], weight: 5 },
  { id: 'l4d', cells: [[1, 0], [1, 1], [1, 2], [0, 2]], weight: 5 },
  // corner tromino, four rotations (2x2 minus one cell — duplicates l3 set
  // shape-wise but kept distinct for readable ids/weights)
  { id: 'corner_tl', cells: [[0, 0], [0, 1], [1, 0]], weight: 4 },
  { id: 'corner_tr', cells: [[0, 0], [0, 1], [1, 1]], weight: 4 },
  { id: 'corner_bl', cells: [[0, 0], [1, 0], [1, 1]], weight: 4 },
  { id: 'corner_br', cells: [[0, 1], [1, 0], [1, 1]], weight: 4 },
  // S/Z tetromino
  { id: 's4', cells: [[0, 1], [0, 2], [1, 0], [1, 1]], weight: 4 },
  { id: 'z4', cells: [[0, 0], [0, 1], [1, 1], [1, 2]], weight: 4 },
  // T-tetromino, four rotations
  { id: 't4a', cells: [[0, 0], [0, 1], [0, 2], [1, 1]], weight: 5 },
  { id: 't4b', cells: [[0, 1], [1, 0], [1, 1], [2, 1]], weight: 5 },
  { id: 't4c', cells: [[1, 0], [1, 1], [1, 2], [0, 1]], weight: 5 },
  { id: 't4d', cells: [[0, 0], [1, 0], [1, 1], [2, 0]], weight: 5 },
  // big L-pentomino, four rotations — a genuinely awkward, rare shape
  { id: 'l5a', cells: [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1]], weight: 2 },
  { id: 'l5b', cells: [[0, 0], [0, 1], [0, 2], [0, 3], [1, 0]], weight: 2 },
  { id: 'l5c', cells: [[0, 0], [0, 1], [1, 1], [2, 1], [3, 1]], weight: 2 },
  { id: 'l5d', cells: [[1, 0], [1, 1], [1, 2], [1, 3], [0, 3]], weight: 2 },
];

export function shapeBounds(shape: Shape) {
  const rows = shape.cells.map((c) => c[0]);
  const cols = shape.cells.map((c) => c[1]);
  return {
    height: Math.max(...rows) + 1,
    width: Math.max(...cols) + 1,
  };
}

export function canPlace(
  board: Board,
  shape: Shape,
  anchorRow: number,
  anchorCol: number
): boolean {
  for (const [dr, dc] of shape.cells) {
    const r = anchorRow + dr;
    const c = anchorCol + dc;
    if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) return false;
    if (board[r][c] !== 0) return false;
  }
  return true;
}

export function canPlaceAnywhere(board: Board, shape: Shape): boolean {
  const { height, width } = shapeBounds(shape);
  for (let r = 0; r <= BOARD_SIZE - height; r++) {
    for (let c = 0; c <= BOARD_SIZE - width; c++) {
      if (canPlace(board, shape, r, c)) return true;
    }
  }
  return false;
}

export function placePiece(
  board: Board,
  shape: Shape,
  anchorRow: number,
  anchorCol: number,
  colorId: number
): Board {
  const next = board.map((row) => [...row]);
  for (const [dr, dc] of shape.cells) {
    next[anchorRow + dr][anchorCol + dc] = colorId;
  }
  return next;
}

/** Detects full rows/cols without removing them yet, so the caller can play
 * a flash animation on the about-to-clear cells before calling clearLines. */
export function findFullLines(board: Board): { rows: number[]; cols: number[] } {
  const rows: number[] = [];
  const cols: number[] = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    if (board[r].every((cell) => cell !== 0)) rows.push(r);
  }
  for (let c = 0; c < BOARD_SIZE; c++) {
    if (board.every((row) => row[c] !== 0)) cols.push(c);
  }
  return { rows, cols };
}

export function clearLines(board: Board, rows: number[], cols: number[]): Board {
  const rowSet = new Set(rows);
  const colSet = new Set(cols);
  return board.map((row, r) =>
    row.map((cell, c) => (rowSet.has(r) || colSet.has(c) ? 0 : cell))
  );
}

export function cellPoints(cellsPlaced: number): number {
  return cellsPlaced;
}

/** Bonus for lines cleared in a single placement — clearing several at once
 * (not just several separately) is worth more than the sum of its parts. */
export function lineClearScore(linesCleared: number): number {
  if (linesCleared === 0) return 0;
  return linesCleared * 10 + (linesCleared - 1) * 10;
}

/** Consecutive placements that each clear at least one line build a streak;
 * a placement that clears nothing resets it. Multiplies the line-clear score
 * only, so a long streak of small single-line clears compounds like Block
 * Blast's real streak mechanic instead of just rewarding raw piece size. */
export function streakMultiplier(streak: number): number {
  return 1 + (streak - 1) * 0.5;
}

export function isGameOver(board: Board, pieces: (Shape | null)[]): boolean {
  return pieces.every(
    (shape) => shape === null || !canPlaceAnywhere(board, shape)
  );
}

// Mulberry32 — small, fast, seedable PRNG so the daily mode can deal an
// identical sequence of pieces to every family member on the same day.
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFromDateKey(dateKey: string): number {
  let hash = 0;
  for (let i = 0; i < dateKey.length; i++) {
    hash = (Math.imul(31, hash) + dateKey.charCodeAt(i)) | 0;
  }
  return hash;
}

export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

function weightedPick(rng: () => number, pool: Shape[] = SHAPES): Shape {
  const total = pool.reduce((sum, s) => sum + s.weight, 0);
  let roll = rng() * total;
  for (const shape of pool) {
    roll -= shape.weight;
    if (roll <= 0) return shape;
  }
  return pool[pool.length - 1];
}

/** Counts how many board positions a shape fits — not just whether it fits
 * at all. Used to find a genuinely-useful "mercy" piece when the board is
 * crowded, rather than one that technically fits in exactly one cramped
 * spot (legal, but no less frustrating than not fitting at all). */
function placementCount(board: Board, shape: Shape): number {
  const { height, width } = shapeBounds(shape);
  let count = 0;
  for (let r = 0; r <= BOARD_SIZE - height; r++) {
    for (let c = 0; c <= BOARD_SIZE - width; c++) {
      if (canPlace(board, shape, r, c)) count++;
    }
  }
  return count;
}

function mostPlaceableShape(board: Board): Shape {
  let best = SHAPES[0];
  let bestCount = -1;
  for (const shape of SHAPES) {
    const count = placementCount(board, shape);
    if (count > bestCount) {
      best = shape;
      bestCount = count;
    }
  }
  return best;
}

const EASY_SHAPES = SHAPES.filter((s) => s.cells.length <= 3);

/** Draws 3 pieces. Retries a few times if the draw is an instant dead end,
 * then falls back to swapping in whichever single shape currently fits in
 * the most board positions — real dead ends only happen when nothing does.
 * `easyStart` gives a fresh board's very first draw a gentler opening,
 * matching how this genre generally ramps up rather than starting hard. */
export function drawPieces(
  board: Board,
  rng: () => number,
  easyStart = false
): Shape[] {
  if (easyStart) {
    return [
      weightedPick(rng, EASY_SHAPES),
      weightedPick(rng, EASY_SHAPES),
      weightedPick(rng),
    ];
  }

  for (let attempt = 0; attempt < 15; attempt++) {
    const draw = [weightedPick(rng), weightedPick(rng), weightedPick(rng)];
    if (draw.some((shape) => canPlaceAnywhere(board, shape))) return draw;
  }

  const mercy = mostPlaceableShape(board);
  if (placementCount(board, mercy) > 0) {
    return [mercy, weightedPick(rng), weightedPick(rng)];
  }
  // Nothing fits anywhere at all — isGameOver will catch this regardless.
  return [weightedPick(rng), weightedPick(rng), weightedPick(rng)];
}
