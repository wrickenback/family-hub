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
// rotates pieces themselves.
//
// This list sticks to shapes confirmed to exist in the real game (1x1/1x2/
// 1x3 "easiest" pieces, standard tetrominoes L/J/S/Z/T/square, 1x4/1x5 bars,
// 2x3/3x2 rectangles, and 3x3/4x4 squares) — no plus/cross shape and no
// 5-cell L exist in the real game, and both were cut. Weight biases the
// random draw heavily toward the small pieces; 1x5/2x3 stay uncommon since
// they get unwieldy once the board fills in, but the 3x3 is a normal
// regular of a draw (not a rare novelty) per direct playtesting, and only
// the 4x4 is kept genuinely rare.
export const SHAPES: Shape[] = [
  { id: 'dot', cells: [[0, 0]], weight: 10 },
  { id: 'h2', cells: [[0, 0], [0, 1]], weight: 12 },
  { id: 'v2', cells: [[0, 0], [1, 0]], weight: 12 },
  { id: 'h3', cells: [[0, 0], [0, 1], [0, 2]], weight: 10 },
  { id: 'v3', cells: [[0, 0], [1, 0], [2, 0]], weight: 10 },
  { id: 'square2', cells: [[0, 0], [0, 1], [1, 0], [1, 1]], weight: 8 },
  // L-tromino, four rotations
  { id: 'l3a', cells: [[0, 0], [1, 0], [1, 1]], weight: 6 },
  { id: 'l3b', cells: [[0, 0], [0, 1], [1, 0]], weight: 6 },
  { id: 'l3c', cells: [[0, 0], [0, 1], [1, 1]], weight: 6 },
  { id: 'l3d', cells: [[0, 1], [1, 0], [1, 1]], weight: 6 },
  { id: 'h4', cells: [[0, 0], [0, 1], [0, 2], [0, 3]], weight: 5 },
  { id: 'v4', cells: [[0, 0], [1, 0], [2, 0], [3, 0]], weight: 5 },
  // S/Z tetromino
  { id: 's4', cells: [[0, 1], [0, 2], [1, 0], [1, 1]], weight: 4 },
  { id: 'z4', cells: [[0, 0], [0, 1], [1, 1], [1, 2]], weight: 4 },
  // T-tetromino, four rotations
  { id: 't4a', cells: [[0, 0], [0, 1], [0, 2], [1, 1]], weight: 4 },
  { id: 't4b', cells: [[0, 1], [1, 0], [1, 1], [2, 1]], weight: 4 },
  { id: 't4c', cells: [[1, 0], [1, 1], [1, 2], [0, 1]], weight: 4 },
  { id: 't4d', cells: [[0, 0], [1, 0], [1, 1], [2, 0]], weight: 4 },
  // L-tetromino, four rotations
  { id: 'l4a', cells: [[0, 0], [1, 0], [2, 0], [2, 1]], weight: 4 },
  { id: 'l4b', cells: [[0, 0], [0, 1], [0, 2], [1, 0]], weight: 4 },
  { id: 'l4c', cells: [[0, 0], [0, 1], [1, 1], [2, 1]], weight: 4 },
  { id: 'l4d', cells: [[1, 0], [1, 1], [1, 2], [0, 2]], weight: 4 },
  { id: 'h5', cells: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]], weight: 2 },
  { id: 'v5', cells: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]], weight: 2 },
  { id: 'rect2x3', cells: [
    [0, 0], [0, 1], [0, 2],
    [1, 0], [1, 1], [1, 2],
  ], weight: 2 },
  { id: 'rect3x2', cells: [
    [0, 0], [0, 1],
    [1, 0], [1, 1],
    [2, 0], [2, 1],
  ], weight: 2 },
  // The user's actual reference app ("Block Puzzle") deals the 3x3 fairly
  // often, not as a rare novelty — corrected from the earlier weight-1
  // guess after direct playtesting feedback. A 4x4 is rarer still but real.
  { id: 'square3', cells: [
    [0, 0], [0, 1], [0, 2],
    [1, 0], [1, 1], [1, 2],
    [2, 0], [2, 1], [2, 2],
  ], weight: 5 },
  { id: 'square4', cells: [
    [0, 0], [0, 1], [0, 2], [0, 3],
    [1, 0], [1, 1], [1, 2], [1, 3],
    [2, 0], [2, 1], [2, 2], [2, 3],
    [3, 0], [3, 1], [3, 2], [3, 3],
  ], weight: 1 },
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

/** UTC, not local time — the daily seed has to be the same for every family
 * member regardless of which timezone their device is in, or two people
 * playing "today's" challenge could get different boards. */
export function todayKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(
    2,
    '0'
  )}-${String(d.getUTCDate()).padStart(2, '0')}`;
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

/** Draws 3 *distinct* shapes (weighted, without replacement) — a draw of
 * two identical pieces reads as a bug/repetition, not a fair puzzle. */
function weightedPickThree(rng: () => number, pool: Shape[] = SHAPES): Shape[] {
  const remaining = [...pool];
  const picks: Shape[] = [];
  for (let i = 0; i < 3 && remaining.length > 0; i++) {
    const shape = weightedPick(rng, remaining);
    picks.push(shape);
    const index = remaining.findIndex((s) => s.id === shape.id);
    remaining.splice(index, 1);
  }
  return picks;
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

/** The most lines a shape could clear with one optimal placement right now
 * (0 if no placement clears anything). Used to find "cash-in" pieces —
 * ones that let the player complete a line the board already has set up. */
function bestClearForShape(board: Board, shape: Shape): number {
  const { height, width } = shapeBounds(shape);
  let best = 0;
  for (let r = 0; r <= BOARD_SIZE - height; r++) {
    for (let c = 0; c <= BOARD_SIZE - width; c++) {
      if (!canPlace(board, shape, r, c)) continue;
      const hypothetical = placePiece(board, shape, r, c, 1);
      const { rows, cols } = findFullLines(hypothetical);
      const cleared = rows.length + cols.length;
      if (cleared > best) best = cleared;
    }
  }
  return best;
}

function bestClearingShape(board: Board): { shape: Shape; clears: number } | null {
  let best: Shape | null = null;
  let bestClears = 0;
  for (const shape of SHAPES) {
    const clears = bestClearForShape(board, shape);
    if (clears > bestClears) {
      best = shape;
      bestClears = clears;
    }
  }
  return best ? { shape: best, clears: bestClears } : null;
}

// How often a draw with no clearing opportunity gets one handed to it
// anyway, when the board actually has a line ready to complete. Not 100%
// — some draws should still make the player wait a turn — but high enough
// that "the right piece for a double" shows up often, matching how this
// genre is meant to feel (confirmed by direct playtesting: the real app
// noticeably does this, though how it does isn't publicly documented).
const MOMENTUM_CHANCE = 0.7;

/** Draws 3 pieces. Retries a few times if the draw is an instant dead end,
 * then falls back to swapping in whichever single shape currently fits in
 * the most board positions — real dead ends only happen when nothing does.
 * `easyStart` gives a fresh board's very first draw a gentler opening,
 * matching how this genre generally ramps up rather than starting hard.
 *
 * After the fairness pass, also checks whether the board has a line that's
 * ready to complete and, if none of the 3 drawn pieces could cash it in,
 * swaps one in most of the time — "momentum": a run of small early wins
 * that build on each other, rather than lines only clearing by accident. */
export function drawPieces(
  board: Board,
  rng: () => number,
  easyStart = false
): Shape[] {
  let draw: Shape[];

  if (easyStart) {
    const [a, b] = weightedPickThree(rng, EASY_SHAPES);
    const [c] = weightedPickThree(rng, SHAPES.filter((s) => s.id !== a.id && s.id !== b.id));
    draw = [a, b, c];
  } else {
    draw = weightedPickThree(rng);
    let attempt = 0;
    while (attempt < 15 && !draw.some((shape) => canPlaceAnywhere(board, shape))) {
      draw = weightedPickThree(rng);
      attempt++;
    }
    if (!draw.some((shape) => canPlaceAnywhere(board, shape))) {
      const mercy = mostPlaceableShape(board);
      if (placementCount(board, mercy) > 0) {
        const rest = weightedPickThree(
          rng,
          SHAPES.filter((s) => s.id !== mercy.id)
        ).slice(0, 2);
        draw = [mercy, ...rest];
      }
      // else: nothing fits anywhere — isGameOver catches this regardless,
      // so the (still unplaceable) draw is left as-is.
    }
  }

  const opportunity = bestClearingShape(board);
  if (opportunity && opportunity.clears > 0) {
    const alreadyCovered = draw.some(
      (s) => bestClearForShape(board, s) > 0
    );
    if (!alreadyCovered && rng() < MOMENTUM_CHANCE) {
      // Replace whichever drawn piece currently fits in the fewest spots —
      // the piece the player would find least useful anyway.
      let worstIndex = 0;
      let worstCount = Infinity;
      draw.forEach((s, i) => {
        const count = placementCount(board, s);
        if (count < worstCount) {
          worstCount = count;
          worstIndex = i;
        }
      });
      draw = draw.map((s, i) => (i === worstIndex ? opportunity.shape : s));
    }
  }

  return draw;
}
