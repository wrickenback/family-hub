// "Cat Queens" puzzle: a Star Battle / LinkedIn "Queens"-style logic puzzle.
// One cat per row, one per column, one per colored region, and no two cats
// touch — even diagonally. Generation builds a random valid placement first,
// then grows irregular colored regions outward from each placed cat so the
// region constraint is satisfiable by construction.

export interface CatQueensPuzzle {
  size: number;
  /** regions[r][c] = region index 0..size-1, one region per solution cat. */
  regions: number[][];
  solution: { r: number; c: number }[];
}

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** One column per row, no shared column, no two consecutive rows adjacent
 * in column (rows two apart can never touch, so that's the only check
 * needed). Backtracks on dead ends. */
function generateSolution(size: number): number[] | null {
  const cols: number[] = new Array(size).fill(-1);
  const used = new Set<number>();

  function place(row: number): boolean {
    if (row === size) return true;
    const candidates = shuffled(Array.from({ length: size }, (_, c) => c));
    for (const c of candidates) {
      if (used.has(c)) continue;
      if (row > 0 && Math.abs(cols[row - 1] - c) <= 1) continue;
      cols[row] = c;
      used.add(c);
      if (place(row + 1)) return true;
      used.delete(c);
      cols[row] = -1;
    }
    return false;
  }

  return place(0) ? cols : null;
}

function neighbors(r: number, c: number, size: number): [number, number][] {
  const out: [number, number][] = [];
  if (r > 0) out.push([r - 1, c]);
  if (r < size - 1) out.push([r + 1, c]);
  if (c > 0) out.push([r, c - 1]);
  if (c < size - 1) out.push([r, c + 1]);
  return out;
}

/** Grows one region per solution cell by random flood-fill until every
 * cell is claimed, giving the irregular blob shapes the game is known for.
 * `freebieRegion`, when given, never grows past its single seed cell — a
 * one-cell region is its own solved cat with no deduction needed, a common
 * easy "starter" clue in these puzzles and a good on-ramp for new solvers. */
function growRegions(
  size: number,
  solution: { r: number; c: number }[],
  freebieRegion?: number
): number[][] {
  const regions: number[][] = Array.from({ length: size }, () =>
    new Array(size).fill(-1)
  );
  const frontier: [number, number][][] = solution.map((s) => {
    regions[s.r][s.c] = solution.indexOf(s);
    return [[s.r, s.c]];
  });

  let remaining = size * size - size;
  while (remaining > 0) {
    let progressed = false;
    for (let region = 0; region < size; region++) {
      if (remaining === 0) break;
      if (region === freebieRegion) continue;
      const options = shuffled(
        frontier[region].flatMap(([r, c]) =>
          neighbors(r, c, size).filter(([nr, nc]) => regions[nr][nc] === -1)
        )
      );
      if (options.length === 0) continue;
      const [nr, nc] = options[0];
      regions[nr][nc] = region;
      frontier[region] = [...frontier[region], [nr, nc]];
      remaining--;
      progressed = true;
    }
    if (!progressed) {
      // Every growable region is boxed in — hand one leftover cell to
      // whichever neighboring region can reach it, preferring anyone but
      // the freebie region so its one-cell guarantee survives. Only if an
      // orphan cell's sole claimed neighbor IS the freebie region (it has
      // nowhere else to go) does it fall back to breaking that guarantee —
      // rare, and better than looping forever.
      let assigned = false;
      for (const allowFreebie of [false, true]) {
        outer: for (let r = 0; r < size; r++) {
          for (let c = 0; c < size; c++) {
            if (regions[r][c] !== -1) continue;
            for (const [nr, nc] of neighbors(r, c, size)) {
              const owner = regions[nr][nc];
              if (owner === -1) continue;
              if (owner === freebieRegion && !allowFreebie) continue;
              regions[r][c] = owner;
              frontier[owner] = [...frontier[owner], [r, c]];
              remaining--;
              assigned = true;
              break outer;
            }
          }
        }
        if (assigned) break;
      }
    }
  }
  return regions;
}

/** Counts solutions up to `cap` via backtracking, respecting rows, columns,
 * regions and adjacency — used to reject puzzles with multiple solutions. */
function countSolutions(
  size: number,
  regions: number[][],
  cap: number
): number {
  const colUsed = new Array(size).fill(false);
  const regionUsed = new Array(size).fill(false);
  const placedCols: number[] = [];
  let count = 0;

  function backtrack(row: number) {
    if (count >= cap) return;
    if (row === size) {
      count++;
      return;
    }
    for (let c = 0; c < size; c++) {
      if (colUsed[c]) continue;
      const region = regions[row][c];
      if (regionUsed[region]) continue;
      if (placedCols.length > 0) {
        const prevC = placedCols[placedCols.length - 1];
        if (Math.abs(prevC - c) <= 1) continue;
      }
      colUsed[c] = true;
      regionUsed[region] = true;
      placedCols.push(c);
      backtrack(row + 1);
      placedCols.pop();
      colUsed[c] = false;
      regionUsed[region] = false;
      if (count >= cap) return;
    }
  }

  backtrack(0);
  return count;
}

/** `includeFreebie` gives one region a guaranteed single cell — an easy
 * on-ramp for a solver's first puzzles at a given size. Off by default
 * once they've got the hang of it, so the puzzle stays real logic instead
 * of a free first move forever. */
export function generateCatQueensPuzzle(
  size: number,
  includeFreebie: boolean
): CatQueensPuzzle {
  const freebieRegion = includeFreebie
    ? Math.floor(Math.random() * size)
    : undefined;
  for (let attempt = 0; attempt < 80; attempt++) {
    const cols = generateSolution(size);
    if (!cols) continue;
    const solution = cols.map((c, r) => ({ r, c }));
    const regions = growRegions(size, solution, freebieRegion);
    if (countSolutions(size, regions, 2) === 1) {
      return { size, regions, solution };
    }
  }
  // Fall back to whatever the last attempt produced rather than failing —
  // a non-unique puzzle is still playable, just less elegant.
  const cols = generateSolution(size)!;
  const solution = cols.map((c, r) => ({ r, c }));
  const regions = growRegions(size, solution, freebieRegion);
  return { size, regions, solution };
}

export interface CellConflict {
  row: boolean;
  col: boolean;
  region: boolean;
  adjacent: boolean;
}

/** For every placed cat, flags which constraint(s) it currently breaks —
 * drives the live red-highlight feedback while playing. */
export function findConflicts(
  regions: number[][],
  cats: { r: number; c: number }[]
): Map<string, CellConflict> {
  const conflicts = new Map<string, CellConflict>();
  const byRow = new Map<number, number>();
  const byCol = new Map<number, number>();
  const byRegion = new Map<number, number>();
  cats.forEach(({ r, c }) => {
    byRow.set(r, (byRow.get(r) ?? 0) + 1);
    byCol.set(c, (byCol.get(c) ?? 0) + 1);
    const region = regions[r][c];
    byRegion.set(region, (byRegion.get(region) ?? 0) + 1);
  });

  cats.forEach(({ r, c }) => {
    const region = regions[r][c];
    const adjacent = cats.some(
      (o) =>
        (o.r !== r || o.c !== c) &&
        Math.abs(o.r - r) <= 1 &&
        Math.abs(o.c - c) <= 1
    );
    const conflict: CellConflict = {
      row: (byRow.get(r) ?? 0) > 1,
      col: (byCol.get(c) ?? 0) > 1,
      region: (byRegion.get(region) ?? 0) > 1,
      adjacent,
    };
    if (conflict.row || conflict.col || conflict.region || conflict.adjacent) {
      conflicts.set(`${r}-${c}`, conflict);
    }
  });
  return conflicts;
}

export function isSolved(
  size: number,
  regions: number[][],
  cats: { r: number; c: number }[]
): boolean {
  if (cats.length !== size) return false;
  return findConflicts(regions, cats).size === 0;
}
