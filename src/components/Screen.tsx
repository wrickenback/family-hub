import type { ReactNode } from 'react';
import { IconChevronLeft } from './icons';
import './Screen.css';

interface ScreenProps {
  title: string;
  subtitle?: string;
  onBack: () => void;
  children: ReactNode;
}

export function Screen({ title, subtitle, onBack, children }: ScreenProps) {
  return (
    <div className="screen">
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
