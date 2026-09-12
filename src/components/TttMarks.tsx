import type { Mark } from '../lib/ticTacToeEngine';

/** SVG X and O glyphs that draw themselves in with a stroke animation,
 * shared by the pass-and-play and online boards so both feel the same.
 * Each stroke is a gently bowed curve rather than a perfect line/circle, so
 * the marks read as sketched by hand instead of drafted with a ruler.
 * Stroke colour comes from the cell's `color` (currentColor), so the
 * existing mark-x / mark-o palette rules keep working. */
export function MarkGlyph({ mark }: { mark: Mark }) {
  return mark === 'X' ? (
    <svg className="ttt-glyph" viewBox="0 0 100 100" aria-hidden="true">
      <path className="ttt-glyph-stroke" d="M 23 21 Q 55 45 78 79" pathLength={100} />
      <path
        className="ttt-glyph-stroke ttt-glyph-x2"
        d="M 79 22 Q 45 55 21 78" pathLength={100}
      />
    </svg>
  ) : (
    <svg className="ttt-glyph" viewBox="0 0 100 100" aria-hidden="true">
      <path
        className="ttt-glyph-stroke"
        d="M 61 24 C 82 32 90 55 82 71 C 73 89 45 92 30 78
           C 16 65 17 41 32 28 C 42 19 54 18 61 22"
        pathLength={100}
      />
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