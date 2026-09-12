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
// rotates pieces themselves. Weight biases the random draw: small, easy
// pieces are common; big, awkward ones are rare.
export const SHAPES: Shape[] = [
  { id: 'dot', cells: [[0, 0]], weight: 6 },
  { id: 'h2', cells: [[0, 0], [0, 1]], weight: 8 },
  { id: 'v2', cells: [[0, 0], [1, 0]], weight: 8 },
  { id: 'h3', cells: [[0, 0], [0, 1], [0, 2]], weight: 8 },
  { id: 'v3', cells: [[0, 0], [1, 0], [2, 0]], weight: 8 },
  { id: 'h4', cells: [[0, 0], [0, 1], [0, 2], [0, 3]], weight: 5 },
  { id: 'v4', cells: [[0, 0], [1, 0], [2, 0], [3, 0]], weight: 5 },
  { id: 'h5', cells: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]], weight: 2 },
  { id: 'v5', cells: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]], weight: 2 },
  { id: 'square2', cells: [[0, 0], [0, 1], [1, 0], [1, 1]], weight: 7 },
  { id: 'square3', cells: [
    [0, 0], [0, 1], [0, 2],
    [1, 0], [1, 1], [1, 2],
    [2, 0], [2, 1], [2, 2],
  ], weight: 2 },
  { id: 'plus', cells: [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]], weight: 3 },
  // L-tromino, four rotations
  { id: 'l3a', cells: [[0, 0], [1, 0], [1, 1]], weight: 6 },
  { id: 'l3b', cells: [[0, 0], [0, 1], [1, 0]], weight: 6 },
  { id: 'l3c', cells: [[0, 0], [0, 1], [1, 1]], weight: 6 },
  { id: 'l3d', cells: [[0, 1], [1, 0], [1, 1]], weight: 6 },
  // L-tetromino, four rotations
  { id: 'l4a', cells: [[0, 0], [1, 0], [2, 0], [2, 1]], weight: 4 },
  { id: 'l4b', cells: [[0, 0], [0, 1], [0, 2], [1, 0]], weight: 4 },
  { id: 'l4c', cells: [[0, 0], [0, 1], [1, 1], [2, 1]], weight: 4 },
  { id: 'l4d', cells: [[1, 0], [1, 1], [1, 2], [0, 2]], weight: 4 },
  // corner tromino, four rotations (2x2 minus one cell — duplicates l3 set
  // shape-wise but kept distinct for readable ids/weights)
  { id: 'corner_tl', cells: [[0, 0], [0, 1], [1, 0]], weight: 5 },
  { id: 'corner_tr', cells: [[0, 0], [0, 1], [1, 1]], weight: 5 },
  { id: 'corner_bl', cells: [[0, 0], [1, 0], [1, 1]], weight: 5 },
  { id: 'corner_br', cells: [[0, 1], [1, 0], [1, 1]], weight: 5 },
  // S/Z tetromino
  { id: 's4', cells: [[0, 1], [0, 2], [1, 0], [1, 1]], weight: 3 },
  { id: 'z4', cells: [[0, 0], [0, 1], [1, 1], [1, 2]], weight: 3 },
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

export function clearFullLines(board: Board): {
  board: Board;
  linesCleared: number;
} {
  const fullRows = new Set<number>();
  const fullCols = new Set<number>();

  for (let r = 0; r < BOARD_SIZE; r++) {
    if (board[r].every((cell) => cell !== 0)) fullRows.add(r);
  }
  for (let c = 0; c < BOARD_SIZE; c++) {
    if (board.every((row) => row[c] !== 0)) fullCols.add(c);
  }

  const linesCleared = fullRows.size + fullCols.size;
  if (linesCleared === 0) return { board, linesCleared: 0 };

  const next = board.map((row, r) =>
    row.map((cell, c) => (fullRows.has(r) || fullCols.has(c) ? 0 : cell))
  );
  return { board: next, linesCleared };
}

/** 1 point/cell placed, plus an escalating bonus for clearing multiple lines
 * in the same placement (rewards setting up simultaneous clears). */
export function scorePlacement(cellsPlaced: number, linesCleared: number): number {
  const lineBonus =
    linesCleared === 0
      ? 0
      : linesCleared * 10 + (linesCleared - 1) * 10;
  return cellsPlaced + lineBonus;
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

function weightedPick(rng: () => number): Shape {
  const total = SHAPES.reduce((sum, s) => sum + s.weight, 0);
  let roll = rng() * total;
  for (const shape of SHAPES) {
    roll -= shape.weight;
    if (roll <= 0) return shape;
  }
  return SHAPES[SHAPES.length - 1];
}

const SINGLE_CELL = SHAPES.find((s) => s.id === 'dot')!;

/** Draws 3 pieces, retrying a few times if the draw would be an instant
 * dead end so bad luck doesn't end an otherwise-winnable game. Falls back
 * to guaranteeing the single-cell piece is included if the board is nearly
 * full and nothing bigger will ever fit. */
export function drawPieces(board: Board, rng: () => number): Shape[] {
  for (let attempt = 0; attempt < 15; attempt++) {
    const draw = [weightedPick(rng), weightedPick(rng), weightedPick(rng)];
    if (draw.some((shape) => canPlaceAnywhere(board, shape))) return draw;
  }
  if (canPlaceAnywhere(board, SINGLE_CELL)) {
    return [SINGLE_CELL, weightedPick(rng), weightedPick(rng)];
  }
  // Board is completely full or fragmented beyond any piece fitting —
  // isGameOver will catch this on the next check regardless of the draw.
  return [weightedPick(rng), weightedPick(rng), weightedPick(rng)];
}
