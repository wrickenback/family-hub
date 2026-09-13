import type { ReactNode } from 'react';
import { IconChevronLeft } from './icons';
import './Screen.css';

interface ScreenProps {
  title: string;
  subtitle?: string;
  onBack: () => void;
  /** Extra class on the screen root, so a game can theme its whole surface
   * — header included — without every other screen paying for it. */
  className?: string;
  children: ReactNode;
}

export function Screen({
  title,
  subtitle,
  onBack,
  className = '',
  children,
}: ScreenProps) {
  return (
    <div className={`screen ${className}`.trim()}>
      <header className="screen-header">
        <button className="back-btn" onClick={onBack} aria-label="Go back">
          <IconChevronLeft aria-hidden="true" />
        </button>
        <div className="screen-heading">
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </header>
      <div className="screen-body">{children}</div>
    </div>
  );
}
