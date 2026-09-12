import type { Mark } from '../lib/ticTacToeEngine';

/** SVG X and O glyphs that draw themselves in with a stroke animation,
 * shared by the pass-and-play and online boards so both feel the same.
 * Stroke colour comes from the cell's `color` (currentColor), so the
 * existing mark-x / mark-o palette rules keep working. */
export function MarkGlyph({ mark }: { mark: Mark }) {
  return mark === 'X' ? (
    <svg className="ttt-glyph" viewBox="0 0 100 100" aria-hidden="true">
      <line className="ttt-glyph-stroke" x1="24" y1="24" x2="76" y2="76" pathLength={100} />
      <line
        className="ttt-glyph-stroke ttt-glyph-x2"
        x1="76" y1="24" x2="24" y2="76" pathLength={100}
      />
    </svg>
  ) : (
    <svg className="ttt-glyph" viewBox="0 0 100 100" aria-hidden="true">
      <circle
        className="ttt-glyph-stroke ttt-glyph-o"
        cx="50" cy="50" r="29" pathLength={100}
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