import type { SVGProps } from 'react';

const base: SVGProps<SVGSVGElement> = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

export function IconGames(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M7 8.5h10a4.5 4.5 0 0 1 4.36 5.61l-.77 3.1A2.5 2.5 0 0 1 18.17 19c-.9 0-1.73-.48-2.17-1.26L15 16H9l-1 1.74A2.5 2.5 0 0 1 5.83 19a2.5 2.5 0 0 1-2.42-1.79l-.77-3.1A4.5 4.5 0 0 1 7 8.5Z" />
      <path d="M7.5 12.5h2M8.5 11.5v2M15 12h.01M17 14h.01" />
    </svg>
  );
}

export function IconTrophy(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M17 5h2.5a.5.5 0 0 1 .5.5C20 8 18.5 9.5 17 9.5M7 5H4.5a.5.5 0 0 0-.5.5C4 8 5.5 9.5 7 9.5" />
      <path d="M12 14v3M9 20h6M10 17h4" />
    </svg>
  );
}

export function IconCalendar(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

export function IconHourglass(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M7 3h10M7 21h10" />
      <path d="M8 3v4.5c0 1.2.5 2.3 1.4 3L12 12l-2.6 1.5c-.9.7-1.4 1.8-1.4 3V21" />
      <path d="M16 3v4.5c0 1.2-.5 2.3-1.4 3L12 12l2.6 1.5c.9.7 1.4 1.8 1.4 3V21" />
    </svg>
  );
}

export function IconClock(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function IconChevronLeft(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

export function IconChevronRight(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

export function IconWordTiles(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <rect x="2.5" y="8" width="6" height="8" rx="1.4" />
      <rect x="9" y="8" width="6" height="8" rx="1.4" />
      <rect x="15.5" y="8" width="6" height="8" rx="1.4" />
      <path d="M5 13.5h1.5M11.5 11.5v3M18 11.5h1" />
    </svg>
  );
}

export function IconGrid(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2.5" />
      <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
      <path d="M5.5 5.5l13 13" strokeWidth="2.4" />
    </svg>
  );
}

export function IconStopwatch(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="13.5" r="7.5" />
      <path d="M12 10v3.5l2.5 1.5M9.5 2.5h5M12 2.5V6M18.5 7.5l1.5-1.5" />
    </svg>
  );
}

export function IconSolo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
    </svg>
  );
}

export function IconMulti(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 19.5a6 6 0 0 1 12 0" />
      <path d="M16 5.3a3.2 3.2 0 0 1 0 5.4M18 19.5a6 6 0 0 0-2.4-4.8" />
    </svg>
  );
}
