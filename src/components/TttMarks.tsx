import { useState } from 'react';
import type { Mark } from '../lib/ticTacToeEngine';

/** Six hand-sketched takes on each glyph — different bow, steepness and
 * starting point per variant — so marks on the same board don't look
 * stamped from an identical template. */
const X_VARIANTS: [string, string][] = [
  ['M 23 21 Q 55 45 78 79', 'M 79 22 Q 45 55 21 78'],
  ['M 22 24 Q 50 58 79 76', 'M 77 21 Q 42 48 24 80'],
  ['M 25 19 Q 48 52 76 81', 'M 81 25 Q 52 48 19 76'],
  ['M 20 23 Q 60 40 80 77', 'M 78 20 Q 38 62 23 79'],
  ['M 24 22 Q 50 50 77 78', 'M 78 24 Q 48 52 22 77'],
  ['M 21 25 Q 58 35 79 74', 'M 80 23 Q 40 65 20 80'],
];

const O_VARIANTS: string[] = [
  'M 61 24 C 82 32 90 55 82 71 C 73 89 45 92 30 78 C 16 65 17 41 32 28 C 42 19 54 18 61 22',
  'M 22 45 C 20 25 42 14 62 18 C 82 22 88 45 84 62 C 79 82 55 90 37 84 C 22 79 15 62 22 48',
  'M 50 18 C 74 20 86 40 83 60 C 80 80 58 90 38 84 C 20 78 14 58 22 40 C 28 27 40 18 52 20',
  'M 70 66 C 82 50 78 28 58 20 C 40 13 20 24 17 44 C 14 62 26 80 46 84 C 58 87 66 80 70 70',
  'M 30 26 C 50 14 76 22 82 44 C 88 64 74 86 52 88 C 32 90 16 74 16 54 C 16 40 20 32 30 26',
  'M 45 86 C 22 82 14 58 22 40 C 30 22 54 15 70 24 C 86 33 90 56 80 72 C 74 82 60 88 48 87',
];

function pick<T>(variants: T[]): T {
  return variants[Math.floor(Math.random() * variants.length)];
}

/** SVG X and O glyphs that draw themselves in with a stroke animation,
 * shared by the pass-and-play and online boards so both feel the same.
 * Each stroke is a gently bowed curve rather than a perfect line/circle, so
 * the marks read as sketched by hand instead of drafted with a ruler. The
 * variant is rolled once per mounted glyph (lazy useState init) rather than
 * on every render, so a placed mark's shape doesn't shift on unrelated
 * re-renders — it only re-rolls when the cell actually remounts (a new
 * round). Stroke colour comes from the cell's `color` (currentColor), so
 * the existing mark-x / mark-o palette rules keep working. */
export function MarkGlyph({ mark }: { mark: Mark }) {
  const [xStrokes] = useState(() => pick(X_VARIANTS));
  const [oStroke] = useState(() => pick(O_VARIANTS));
  // Only one branch's roll is ever used per instance — mark never changes
  // after a cell is first drawn into — the other's useState call is just
  // the price of not calling hooks conditionally.

  return mark === 'X' ? (
    <svg className="ttt-glyph" viewBox="0 0 100 100" aria-hidden="true">
      <path className="ttt-glyph-stroke" d={xStrokes[0]} pathLength={100} />
      <path className="ttt-glyph-stroke ttt-glyph-x2" d={xStrokes[1]} pathLength={100} />
    </svg>
  ) : (
    <svg className="ttt-glyph" viewBox="0 0 100 100" aria-hidden="true">
      <path className="ttt-glyph-stroke" d={oStroke} pathLength={100} />
    </svg>
  );
}

/** A strike-through line drawn across the three winning cells, sized in the
 * board's 300×300 coordinate space (cell centres at 50/150/250), extended a
 * little past each end so it reads as a slash rather than dot-to-dot. */
export function StrikeLine({ line }: { line: number[] }) {
  const centre = (i: number) => ({ x: (i % 3) * 100 + 50, y: Math.floor(i / 3) * 100 + 50 });
  const cells = [...line].sort((a, b) => a - b);
  const a = centre(cells[0]);
  const b = centre(cells[cells.length - 1]);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const ext = 36 / Math.hypot(dx, dy);
  return (
    <svg className="ttt-strike" viewBox="0 0 300 300" aria-hidden="true">
      <line
        x1={a.x - dx * ext} y1={a.y - dy * ext}
        x2={b.x + dx * ext} y2={b.y + dy * ext}
        pathLength={100}
      />
    </svg>
  );
}

/** A short CSS-only confetti burst over the board when a round is won. */
const CONFETTI_PIECES = 16;

export function Confetti() {
  return (
    <div className="ttt-confetti" aria-hidden="true">
      {Array.from({ length: CONFETTI_PIECES }, (_, i) => (
        <span key={i} />
      ))}
    </div>
  );
}