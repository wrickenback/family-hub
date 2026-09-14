import './Confetti.css';

const PIECES = 20;

/** Cheap deterministic pseudo-randomness — no need for real entropy on
 * confetti placement, and a fixed seed keeps this component free of
 * useMemo/useState for something purely decorative. */
function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** A short burst of falling confetti across the whole viewport. Generic and
 * self-contained (fixed position, its own keyframes) so any screen can drop
 * it in on a win without depending on a specific board's layout — unlike
 * TttMarks' Confetti, which is sized to sit inside Tic Tac Toe's board
 * frame specifically. */
export function Confetti() {
  return (
    <div className="confetti-burst" aria-hidden="true">
      {Array.from({ length: PIECES }, (_, i) => {
        const left = (i / PIECES) * 100 + (pseudoRandom(i) - 0.5) * 6;
        const delay = pseudoRandom(i + 100) * 0.4;
        const drift = (pseudoRandom(i + 200) - 0.5) * 80;
        return (
          <span
            key={i}
            style={
              {
                left: `${left}%`,
                animationDelay: `${delay}s`,
                '--drift': `${drift}px`,
              } as React.CSSProperties
            }
          />
        );
      })}
    </div>
  );
}
