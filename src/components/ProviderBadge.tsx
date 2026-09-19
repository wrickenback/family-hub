import { Sparkles, Bot, BookOpen } from 'lucide-react';
import './ProviderBadge.css';

/** Which model actually answered a request. Threaded from the server
 * response all the way to this badge, purely as a debugging aid while the
 * two-model setup is new — worth pulling out once it's clear which one is
 * carrying the load day to day. */
export type ProviderSource = 'gemini' | 'glm-flash' | 'haiku' | 'sonnet' | 'fallback' | null;

const LABEL: Record<'gemini' | 'glm-flash' | 'haiku' | 'sonnet' | 'fallback', string> = {
  gemini: 'Gemini',
  'glm-flash': 'GLM Flash',
  haiku: 'Claude',
  // Distinguished from Haiku on purpose: Sonnet only ever answers the mini
  // crossword, and only on a day Gemini couldn't fill the grid, so seeing
  // it is the signal that the cheap half of the chain is struggling.
  sonnet: 'Claude Sonnet',
  fallback: 'Offline word list',
};

/** A small, unobtrusive chip naming the source. Renders nothing for a null
 * source (still loading, or a screen that hasn't wired a source through
 * yet) rather than a placeholder — an absent badge should never read as
 * "fallback" by omission. */
export function ProviderBadge({
  source,
  className = '',
}: {
  source: ProviderSource;
  className?: string;
}) {
  if (!source) return null;
  const Icon =
    source === 'gemini'
      ? Sparkles
      : source === 'haiku' || source === 'sonnet' || source === 'glm-flash'
      ? Bot
      : BookOpen;
  return (
    <span
      className={`provider-badge provider-badge-${source} ${className}`}
      title={`Answered by ${LABEL[source]}`}
    >
      <Icon aria-hidden="true" />
      {LABEL[source]}
    </span>
  );
}
