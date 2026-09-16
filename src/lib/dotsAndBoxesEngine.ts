// Pure Dots and Boxes logic, shared by the local pass-and-play screen and
// the online game's move transaction so both agree on what a completed box
// is. Same representation approach as connectFourEngine: everything is a
// flat string so it can be written straight to Firestore/RTDB with no
// conversion layer.
//
// A 4x4 grid of boxes (5x5 dots). Edges are one flat 40-character string:
// indices 0-19 are horizontal edges (the top/bottom of a box), 20-39 are
// vertical edges (the left/right of a box), '-' for undrawn and otherwise
// the letter of whoever drew it — so the board can show each player their
// own lines. Boxes are a separate 16-character string, '-' for unclaimed or
// the claiming player's letter.

export const GRID = 4;
const H_COUNT = (GRID + 1) * GRID; // 20
const V_COUNT = GRID * (GRID + 1); // 20
export const EDGE_COUNT = H_COUNT + V_COUNT; // 40
export const BOX_COUNT = GRID * GRID; // 16

export const EMPTY_EDGES = '-'.repeat(EDGE_COUNT);
export const EMPTY_BOXES = '-'.repeat(BOX_COUNT);

export type Player = 'A' | 'B';

/** Index of the horizontal edge above box row `r`, between dots (r,c) and
 * (r,c+1). r ranges 0..GRID (GRID+1 rows of horizontal edges). */
export function hIndex(r: number, c: number): number {
  return r * GRID + c;
}

/** Index of the vertical edge between dots (r,c) and (r+1,c). c ranges
 * 0..GRID (GRID+1 columns of vertical edges). */
export function vIndex(r: number, c: number): number {
  return H_COUNT + r * (GRID + 1) + c;
}

export function boxIndex(r: number, c: number): number {
  return r * GRID + c;
}

/** The (up to) four edges bordering box (r, c). */
function boxEdges(r: number, c: number): number[] {
  return [hIndex(r, c), hIndex(r + 1, c), vIndex(r, c), vIndex(r, c + 1)];
}

/** Which box indexes border a given edge — one for an edge on the outer
 * rim, two for an interior edge. */
export function boxesForEdge(edge: number): number[] {
  const boxes: number[] = [];
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      if (boxEdges(r, c).includes(edge)) boxes.push(boxIndex(r, c));
    }
  }
  return boxes;
}

export function isFull(edges: string): boolean {
  return !edges.includes('-');
}

export function other(player: Player): Player {
  return player === 'A' ? 'B' : 'A';
}

export interface DrawResult {
  edges: string;
  boxes: string;
  /** How many boxes this single edge completed — 0, 1 (an outer edge) or 2
   * (an interior edge closing boxes on both sides at once). */
  completed: number;
}

/** Draws one edge and claims any box(es) it completes. Returns null if the
 * edge is already drawn or out of range. */
export function drawEdge(
  edges: string,
  boxes: string,
  edge: number,
  player: Player
): DrawResult | null {
  if (edge < 0 || edge >= EDGE_COUNT) return null;
  if (edges[edge] !== '-') return null;

  const nextEdges = edges.slice(0, edge) + player + edges.slice(edge + 1);
  let nextBoxes = boxes;
  let completed = 0;

  for (const box of boxesForEdge(edge)) {
    if (nextBoxes[box] !== '-') continue;
    const r = Math.floor(box / GRID);
    const c = box % GRID;
    const done = boxEdges(r, c).every((e) => nextEdges[e] !== '-');
    if (done) {
      nextBoxes = nextBoxes.slice(0, box) + player + nextBoxes.slice(box + 1);
      completed++;
    }
  }

  return { edges: nextEdges, boxes: nextBoxes, completed };
}

/** Whether the edge just drawn closed a box — which is what earned the
 * player another turn, and the thing players kept missing when the turn
 * silently stayed put.
 *
 * Safe to derive from the board alone: a box is only ever claimed on the
 * drawing of its fourth edge, so if a box touching `lastEdge` is owned,
 * `lastEdge` is necessarily the edge that completed it. */
export function closedABox(boxes: string, lastEdge: number | null): boolean {
  if (lastEdge === null) return false;
  return boxesForEdge(lastEdge).some((box) => boxes[box] !== '-');
}

export function tally(boxes: string): { A: number; B: number } {
  let a = 0;
  let b = 0;
  for (const ch of boxes) {
    if (ch === 'A') a++;
    else if (ch === 'B') b++;
  }
  return { A: a, B: b };
}
