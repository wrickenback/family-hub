/** Water Sort: tubes of stacked coloured units, poured one tube into
 * another until every tube holds a single colour. Colours are stored as
 * numbers; index 0 of a tube is the bottom. */

export const TUBE_CAPACITY = 4;

export type Tube = number[];
export type Tubes = Tube[];

export interface Level {
  tubes: Tubes;
  colorCount: number;
  /** The number of scramble steps this deal was built with — a solution
   * of exactly this length exists, so it doubles as the par the UI shows. */
  par: number;
}

/** How many colours and how many spare (empty) tubes a level number gets.
 * Colours climb one at a time and stop at ten; spare tubes stay at two,
 * which is what keeps the puzzle tight. Level 1 is deliberately trivial —
 * it's the tutorial. */
export function levelShape(level: number): { colors: number; empties: number } {
  const colors = Math.min(2 + Math.ceil(level / 2), 10);
  // Two spares at every size. More would make the big boards easy; fewer
  // makes even the small ones frustrating.
  return { colors, empties: 2 };
}

export function isSolved(tubes: Tubes): boolean {
  return tubes.every(
    (t) =>
      t.length === 0 ||
      (t.length === TUBE_CAPACITY && t.every((c) => c === t[0]))
  );
}

/** How many units come off the top of a tube in one pour: the whole run of
 * matching colour sitting on top. */
export function topRun(tube: Tube): { color: number; count: number } | null {
  if (tube.length === 0) return null;
  const color = tube[tube.length - 1];
  let count = 1;
  for (let i = tube.length - 2; i >= 0 && tube[i] === color; i--) count++;
  return { color, count };
}

export function canPour(tubes: Tubes, from: number, to: number): boolean {
  if (from === to) return false;
  const source = tubes[from];
  const target = tubes[to];
  const run = topRun(source);
  if (!run) return false;
  if (target.length >= TUBE_CAPACITY) return false;
  if (target.length > 0 && target[target.length - 1] !== run.color) return false;
  // Tipping a finished single-colour tube into an empty one is legal by the
  // letter of the rules but never progress, so it's disallowed — it only
  // ever wastes a move and confuses the undo history.
  if (target.length === 0 && run.count === source.length) return false;
  return true;
}

/** Returns the tubes after the pour, or null if it isn't legal. As much of
 * the top run moves as fits. */
export function pour(tubes: Tubes, from: number, to: number): Tubes | null {
  if (!canPour(tubes, from, to)) return null;
  const run = topRun(tubes[from])!;
  const space = TUBE_CAPACITY - tubes[to].length;
  const moving = Math.min(run.count, space);
  const next = tubes.map((t) => [...t]);
  next[from].splice(next[from].length - moving, moving);
  for (let i = 0; i < moving; i++) next[to].push(run.color);
  return next;
}

export function hasAnyMove(tubes: Tubes): boolean {
  for (let from = 0; from < tubes.length; from++) {
    for (let to = 0; to < tubes.length; to++) {
      if (canPour(tubes, from, to)) return true;
    }
  }
  return false;
}

function key(tubes: Tubes): string {
  // Tube order is irrelevant to whether a position is solvable, so the
  // signature is order-independent — that collapses a large amount of
  // duplicate search and is what keeps the solver fast enough to run
  // inline while generating a level.
  return tubes
    .map((t) => t.join(','))
    .sort()
    .join('|');
}

export interface Move {
  from: number;
  to: number;
}

/** Depth-first search for a full solution, with an order-independent
 * visited set and a node budget. Used for the hint button — the level
 * generator doesn't need it, since its levels are solvable by
 * construction. Returns null if it runs out of budget rather than
 * pretending the position is dead. */
export function solveMoves(tubes: Tubes, nodeBudget = 40000): Move[] | null {
  const seen = new Set<string>();
  let nodes = 0;

  const walk = (current: Tubes, path: Move[]): Move[] | null => {
    if (isSolved(current)) return path;
    if (nodes++ > nodeBudget) return null;
    const k = key(current);
    if (seen.has(k)) return null;
    seen.add(k);

    // Most productive pours first: landing on a matching colour, and
    // moving a run that fits whole, get to a solution far sooner than
    // dribbling single units into empty tubes.
    const moves: { from: number; to: number; score: number }[] = [];
    for (let from = 0; from < current.length; from++) {
      for (let to = 0; to < current.length; to++) {
        if (!canPour(current, from, to)) continue;
        const run = topRun(current[from])!;
        const onto = current[to].length > 0 ? 2 : 0;
        const fits = run.count <= TUBE_CAPACITY - current[to].length ? 1 : 0;
        moves.push({ from, to, score: onto + fits });
      }
    }
    moves.sort((a, b) => b.score - a.score);

    for (const move of moves) {
      const next = pour(current, move.from, move.to);
      if (!next) continue;
      const result = walk(next, [...path, { from: move.from, to: move.to }]);
      if (result) return result;
    }
    return null;
  };

  return walk(tubes.map((t) => [...t]), []);
}

/** The next pour a solution actually uses. Falls back to any legal pour
 * when the search can't finish in budget, so the hint button always has
 * something to offer rather than silently doing nothing. */
export function hintMove(tubes: Tubes): Move | null {
  const solution = solveMoves(tubes);
  if (solution && solution.length > 0) return solution[0];
  for (let from = 0; from < tubes.length; from++) {
    for (let to = 0; to < tubes.length; to++) {
      if (canPour(tubes, from, to)) return { from, to };
    }
  }
  return null;
}

function shuffleInPlace<T>(items: T[], rng: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/** The classic opening shape: every colour tube filled to the brim with
 * shuffled units, plus the spare empty tubes. */
function deal(colors: number, empties: number, rng: () => number): Tubes {
  const units: number[] = [];
  for (let c = 0; c < colors; c++) {
    for (let i = 0; i < TUBE_CAPACITY; i++) units.push(c);
  }
  shuffleInPlace(units, rng);
  const tubes: Tubes = [];
  for (let t = 0; t < colors; t++) {
    tubes.push(units.slice(t * TUBE_CAPACITY, (t + 1) * TUBE_CAPACITY));
  }
  for (let e = 0; e < empties; e++) tubes.push([]);
  return tubes;
}

/** Deals at random and keeps only positions the solver can actually
 * finish. A random deal with two spare tubes is very nearly always
 * solvable and the search settles in milliseconds, but "very nearly" is no
 * use to a player stranded on an impossible level — so every level ships
 * with a solution already found. That solution's length becomes par. */
export function generateLevel(
  level: number,
  rng: () => number = Math.random
): Level {
  const { colors, empties } = levelShape(level);
  for (let attempt = 0; attempt < 40; attempt++) {
    const tubes = deal(colors, empties, rng);
    if (isSolved(tubes)) continue;
    const solution = solveMoves(tubes);
    if (!solution) continue;
    // A deal that falls apart in a handful of pours isn't a puzzle.
    if (solution.length < colors) continue;
    return { tubes, colorCount: colors, par: solution.length };
  }
  // Every deal came back unsolvable or trivial, which in practice means
  // the node budget ran out rather than the deals being bad. Build one
  // backwards from a solved board instead: each step is the inverse of a
  // legal pour, so replaying them in reverse is a solution by
  // construction. The shape is less tidy, but the level is always finishable.
  return scrambleFromSolved(colors, empties, rng);
}

/** One inverse pour: lifts `count` units of the top colour off tube
 * `from` and drops them on tube `to`. Legal only when the forward pour
 * (to -> from) would be legal afterwards — `to` must not already show that
 * colour (or the forward pour would carry extra units), and `from` must end
 * up empty or still showing that colour, since a pour can only land on its
 * own colour or an empty tube. */
function reverseStep(
  tubes: Tubes,
  from: number,
  to: number,
  count: number
): Tubes | null {
  if (from === to) return null;
  const source = tubes[from];
  const target = tubes[to];
  const run = topRun(source);
  if (!run || count < 1 || count > run.count) return null;
  if (TUBE_CAPACITY - target.length < count) return null;
  if (target.length > 0 && target[target.length - 1] === run.color) return null;

  const remaining = source.length - count;
  if (remaining > 0 && source[remaining - 1] !== run.color) return null;
  // The one legal-but-pointless pour canPour rejects: a full single-colour
  // tube tipped into an empty one.
  if (remaining === 0 && target.length === 0) return null;

  const next = tubes.map((t) => [...t]);
  next[from].splice(remaining, count);
  for (let i = 0; i < count; i++) next[to].push(run.color);
  return next;
}

function scrambleFromSolved(
  colors: number,
  empties: number,
  rng: () => number
): Level {
  let tubes: Tubes = [];
  for (let c = 0; c < colors; c++) tubes.push(new Array(TUBE_CAPACITY).fill(c));
  for (let e = 0; e < empties; e++) tubes.push([]);

  const wanted = colors * 5 + 6;
  let applied = 0;
  for (let attempt = 0; attempt < wanted * 40 && applied < wanted; attempt++) {
    const from = Math.floor(rng() * tubes.length);
    const to = Math.floor(rng() * tubes.length);
    // Mostly single units — moving whole runs about barely mixes anything.
    const next = reverseStep(tubes, from, to, rng() < 0.75 ? 1 : 2);
    if (next) {
      tubes = next;
      applied++;
    }
  }
  return { tubes, colorCount: colors, par: applied };
}
