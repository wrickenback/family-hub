import { MAX_WRONG } from '../lib/hangmanEngine';
import './HangmanFigure.css';

/** The gallows and the stick figure, drawn as if by hand.
 *
 * Three things do the work. Every stroke is a path with pathLength="1", so
 * one shared keyframe can sweep its dash offset from 1 to 0 and the line
 * appears to be drawn — regardless of how long the real path is. Each
 * stroke is then drawn twice, slightly offset, the way a pen doubles back
 * over a line in a sketch. And the whole drawing sits under a turbulence
 * filter that nudges every edge a pixel or two off true, which is what
 * stops it reading as clean vector art. */

interface Props {
  /** How many wrong guesses — how many body parts are on the gallows. */
  wrong: number;
  /** Draws the face: relieved on a win, X-eyed once the figure is finished. */
  outcome?: 'playing' | 'won' | 'lost';
}

/** The six body parts, in the order a wrong guess adds them. `d` is drawn
 * with a deliberately imperfect hand: the "circle" head is two arcs that
 * don't quite meet, and no limb is exactly straight. */
const PARTS: string[] = [
  // head
  'M100 57 C109 57 115 64 115 72 C115 81 108 88 100 88 C91 88 85 81 85 72 C85 64 91 57 100 56',
  // body
  'M100 88 C102 102 99 116 100 138',
  // left arm
  'M100 100 C91 107 84 114 76 124',
  // right arm
  'M100 99 C109 106 117 113 123 125',
  // left leg
  'M100 138 C94 149 88 160 81 172',
  // right leg
  'M100 138 C106 149 112 160 118 173',
];

/** The gallows itself. Drawn on mount, before anyone has guessed wrong —
 * it's scenery, not a penalty. */
const GALLOWS: string[] = [
  'M24 191 C40 188 56 189 72 190', // base
  'M46 190 C44 140 45 80 46 26', // post
  'M46 26 C64 23 84 24 100 25', // beam
  'M100 25 C101 33 100 41 100 56', // rope
];

export function HangmanFigure({ wrong, outcome = 'playing' }: Props) {
  const shown = Math.min(Math.max(wrong, 0), MAX_WRONG);
  const lost = outcome === 'lost';

  return (
    <div
      className={`hangman-figure ${lost ? 'is-lost' : ''} ${
        outcome === 'won' ? 'is-won' : ''
      }`}
    >
      <svg viewBox="0 0 200 200" role="img" aria-label={`${shown} of ${MAX_WRONG} wrong guesses`}>
        <defs>
          {/* Just enough displacement to wobble a line without breaking it
              into a scribble. baseFrequency low = long, loose waves. */}
          <filter id="hangman-rough" x="-12%" y="-12%" width="124%" height="124%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.028"
              numOctaves="2"
              seed="7"
              result="noise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale="2.6"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>

        <g filter="url(#hangman-rough)" className="hangman-ink">
          {GALLOWS.map((d, i) => (
            <Stroke key={`g${i}`} d={d} delay={i * 180} className="hangman-gallows" />
          ))}

          {PARTS.slice(0, shown).map((d, i) => (
            // Keyed by index so React reuses the element when a later part
            // is added — a re-keyed element would restart every earlier
            // part's draw animation on every guess.
            <Stroke key={`p${i}`} d={d} className="hangman-part" />
          ))}

          {shown >= 1 && outcome !== 'playing' && <Face lost={lost} />}
        </g>
      </svg>
    </div>
  );
}

function Stroke({
  d,
  delay = 0,
  className = '',
}: {
  d: string;
  delay?: number;
  className?: string;
}) {
  const style = { animationDelay: `${delay}ms` } as React.CSSProperties;
  return (
    <>
      <path
        className={`hangman-stroke ${className}`}
        d={d}
        pathLength={1}
        style={style}
      />
      {/* The doubled-back pen line: same path, a hair offset and thinner,
          so the two strokes read as one slightly scruffy line. */}
      <path
        className={`hangman-stroke hangman-stroke-echo ${className}`}
        d={d}
        pathLength={1}
        style={style}
        transform="translate(0.9 0.7) rotate(0.35 100 100)"
      />
    </>
  );
}

/** Eyes and a mouth, once the round is settled. Nothing gruesome — an X-eyed
 * cartoon on a loss, a grin on a win. */
function Face({ lost }: { lost: boolean }) {
  return (
    <g className="hangman-face">
      {lost ? (
        <>
          <path className="hangman-stroke hangman-detail" pathLength={1} d="M92 68 L97 74" />
          <path className="hangman-stroke hangman-detail" pathLength={1} d="M97 68 L92 74" />
          <path className="hangman-stroke hangman-detail" pathLength={1} d="M104 68 L109 74" />
          <path className="hangman-stroke hangman-detail" pathLength={1} d="M109 68 L104 74" />
          <path
            className="hangman-stroke hangman-detail"
            pathLength={1}
            d="M93 82 C97 77 104 77 108 81"
          />
        </>
      ) : (
        <>
          <path className="hangman-stroke hangman-detail" pathLength={1} d="M93 69 C94 67 96 67 97 69" />
          <path className="hangman-stroke hangman-detail" pathLength={1} d="M104 69 C105 67 107 67 108 69" />
          <path
            className="hangman-stroke hangman-detail"
            pathLength={1}
            d="M92 77 C96 84 105 84 109 76"
          />
        </>
      )}
    </g>
  );
}
