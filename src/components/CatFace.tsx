// Twenty procedurally-drawn cat breed faces, built from one flexible SVG
// template (fur color + pattern + ear/fur style) instead of 20 hand-drawn
// assets. Keeps the set easy to extend and gives every breed a distinct,
// recognizable silhouette at the small sizes a puzzle cell renders at.

export type CatPattern = 'solid' | 'stripes' | 'spots' | 'patches' | 'points' | 'tuxedo';

export interface CatBreed {
  id: string;
  name: string;
  fur: string;
  pattern: CatPattern;
  patternColor?: string;
  eyes: string;
  earFold?: boolean;
  longFur?: boolean;
  noseColor?: string;
}

export const CAT_BREEDS: CatBreed[] = [
  { id: 'tabby', name: 'Tabby', fur: '#d99a56', pattern: 'stripes', patternColor: '#8a5a28', eyes: '#5a8a3c' },
  { id: 'siamese', name: 'Siamese', fur: '#f1e2c6', pattern: 'points', patternColor: '#5b4030', eyes: '#4fa8d8' },
  { id: 'persian', name: 'Persian', fur: '#f7f3ea', pattern: 'solid', eyes: '#c98b3a', longFur: true },
  { id: 'mainecoon', name: 'Maine Coon', fur: '#a9754a', pattern: 'stripes', patternColor: '#6b4423', eyes: '#7a9a4a', longFur: true },
  { id: 'sphynx', name: 'Sphynx', fur: '#e2c3ab', pattern: 'solid', eyes: '#c9a227', noseColor: '#b98b6f' },
  { id: 'calico', name: 'Calico', fur: '#faf6ee', pattern: 'patches', patternColor: '#d97b2e', eyes: '#7a5a3a' },
  { id: 'tuxedo', name: 'Tuxedo', fur: '#2b2b2f', pattern: 'tuxedo', eyes: '#c9a227' },
  { id: 'ginger', name: 'Ginger', fur: '#e08a2f', pattern: 'stripes', patternColor: '#a85c17', eyes: '#4a8a3a' },
  { id: 'blackcat', name: 'Black Cat', fur: '#26242a', pattern: 'solid', eyes: '#d8c33a' },
  { id: 'whitecat', name: 'White Cat', fur: '#fbfbf9', pattern: 'solid', eyes: '#4fa8d8' },
  { id: 'russianblue', name: 'Russian Blue', fur: '#8a97a0', pattern: 'solid', eyes: '#5a9a6a' },
  { id: 'bengal', name: 'Bengal', fur: '#d9a144', pattern: 'spots', patternColor: '#5b3a1e', eyes: '#7a9a4a' },
  { id: 'ragdoll', name: 'Ragdoll', fur: '#f3e9d8', pattern: 'points', patternColor: '#7a5738', eyes: '#4fa8d8', longFur: true },
  { id: 'scottishfold', name: 'Scottish Fold', fur: '#a8a49c', pattern: 'solid', eyes: '#c9a227', earFold: true },
  { id: 'britishshorthair', name: 'British Shorthair', fur: '#8f96a3', pattern: 'solid', eyes: '#c9822f' },
  { id: 'tortoiseshell', name: 'Tortoiseshell', fur: '#4a3626', pattern: 'patches', patternColor: '#c9762f', eyes: '#c9a227' },
  { id: 'siberian', name: 'Siberian', fur: '#c69a63', pattern: 'stripes', patternColor: '#7a5230', eyes: '#7a9a4a', longFur: true },
  { id: 'himalayan', name: 'Himalayan', fur: '#f5ede0', pattern: 'points', patternColor: '#6b4a32', eyes: '#4fa8d8', longFur: true },
  { id: 'abyssinian', name: 'Abyssinian', fur: '#b8703f', pattern: 'solid', eyes: '#c9a227', noseColor: '#8a4a2a' },
  { id: 'norwegianforest', name: 'Norwegian Forest Cat', fur: '#b9bcc0', pattern: 'stripes', patternColor: '#6f7378', eyes: '#c9a227', longFur: true },
];

export function getBreed(id: string): CatBreed {
  return CAT_BREEDS.find((b) => b.id === id) ?? CAT_BREEDS[0];
}

function Ear({
  x,
  flip,
  breed,
}: {
  x: number;
  flip: boolean;
  breed: CatBreed;
}) {
  const sign = flip ? -1 : 1;
  if (breed.earFold) {
    // Folded ear: a small rounded flap lying forward instead of a point.
    return (
      <path
        d={`M ${x} 30 q ${sign * 10} -6 ${sign * 16} 4 q ${sign * -2} 10 ${
          sign * -14
        } 8 Z`}
        fill={breed.fur}
        stroke="rgba(0,0,0,0.12)"
        strokeWidth="1"
      />
    );
  }
  const tip = breed.longFur ? 8 : 4;
  return (
    <path
      d={`M ${x} 34 L ${x + sign * 14} 6 L ${x + sign * (14 + tip)} 30 Z`}
      fill={breed.fur}
      stroke="rgba(0,0,0,0.12)"
      strokeWidth="1"
    />
  );
}

/** Renders one breed's face inside a 0-100 viewBox. */
export function CatFace({
  breed,
  size = 40,
  className,
}: {
  breed: CatBreed;
  size?: number;
  className?: string;
}) {
  const dark = 'rgba(0,0,0,0.28)';
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={breed.name}
    >
      <defs>
        <clipPath id={`clip-${breed.id}`}>
          <ellipse cx="50" cy="58" rx="34" ry="30" />
        </clipPath>
      </defs>

      {breed.longFur && (
        <ellipse cx="50" cy="60" rx="42" ry="37" fill={breed.fur} opacity="0.55" />
      )}

      <Ear x={26} flip={false} breed={breed} />
      <Ear x={74} flip={true} breed={breed} />

      <ellipse cx="50" cy="58" rx="34" ry="30" fill={breed.fur} />

      <g clipPath={`url(#clip-${breed.id})`}>
        {breed.pattern === 'stripes' &&
          [20, 34, 50, 66, 80].map((cx, i) => (
            <path
              key={i}
              d={`M ${cx} 20 q 6 20 0 60`}
              stroke={breed.patternColor}
              strokeWidth={i % 2 === 0 ? 5 : 3}
              fill="none"
              opacity="0.85"
            />
          ))}

        {breed.pattern === 'spots' &&
          [
            [30, 40], [66, 42], [40, 62], [60, 68], [50, 48], [24, 66], [74, 62],
          ].map(([cx, cy], i) => (
            <ellipse
              key={i}
              cx={cx}
              cy={cy}
              rx="6"
              ry="5"
              fill={breed.patternColor}
              opacity="0.85"
            />
          ))}

        {breed.pattern === 'patches' && (
          <>
            <path d="M 16 40 q 14 -14 26 -2 q -2 16 -18 20 q -14 -2 -8 -18 Z" fill={breed.patternColor} opacity="0.9" />
            <path d="M 62 30 q 18 -4 22 14 q -6 14 -22 10 q -10 -12 0 -24 Z" fill={breed.patternColor} opacity="0.9" />
            <path d="M 46 66 q 14 -6 20 8 q -6 12 -20 10 q -10 -8 0 -18 Z" fill={breed.patternColor} opacity="0.7" />
          </>
        )}

        {breed.pattern === 'points' && (
          <>
            <ellipse cx="50" cy="76" rx="16" ry="10" fill={breed.patternColor} opacity="0.9" />
            <path d="M 20 24 L 30 8 L 34 30 Z" fill={breed.patternColor} opacity="0.9" />
            <path d="M 80 24 L 70 8 L 66 30 Z" fill={breed.patternColor} opacity="0.9" />
          </>
        )}

        {breed.pattern === 'tuxedo' && (
          <>
            <path d="M 34 58 q 16 -6 32 0 q 4 20 -16 26 q -20 -6 -16 -26 Z" fill="#f7f3ea" />
            <path d="M 46 20 q 4 -4 8 0 q 2 10 -4 18 q -6 -8 -4 -18 Z" fill="#f7f3ea" />
          </>
        )}
      </g>

      {/* eyes */}
      <ellipse cx="38" cy="56" rx="6" ry="7" fill={breed.eyes} />
      <ellipse cx="62" cy="56" rx="6" ry="7" fill={breed.eyes} />
      <circle cx="38" cy="57" r="2.4" fill="#1a1a1a" />
      <circle cx="62" cy="57" r="2.4" fill="#1a1a1a" />

      {/* nose + mouth */}
      <path d="M 46 68 L 54 68 L 50 73 Z" fill={breed.noseColor ?? dark} />
      <path d="M 50 73 q 0 4 -6 5" stroke={dark} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <path d="M 50 73 q 0 4 6 5" stroke={dark} strokeWidth="1.5" fill="none" strokeLinecap="round" />

      {/* whiskers */}
      {[52, 58, 64].map((y, i) => (
        <g key={i} opacity="0.5">
          <line x1="10" y1={y} x2="28" y2={y - 2 + i} stroke="#fff" strokeWidth="1.2" />
          <line x1="90" y1={y} x2="72" y2={y - 2 + i} stroke="#fff" strokeWidth="1.2" />
        </g>
      ))}
    </svg>
  );
}
