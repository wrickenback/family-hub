import './TurnBanner.css';

interface Props {
  /** True when the person holding this device is the one to move. Drives
   * the loud/quiet split — on a pass-and-play screen it's always true,
   * because whoever is looking at it is always the one up. */
  active: boolean;
  /** Whose move it is, e.g. "Your turn" or "Josie's turn". */
  label: string;
  /** Why the turn didn't change hands, e.g. "Box! Go again." */
  hint?: string;
  /** Colour to show instead of the plain dot — the current player's colour
   * in Dots and Boxes, the live colour in Uno. */
  accent?: string;
}

/** One obvious answer to "am I up?", shared by every game that takes turns.
 *
 * The games used to say this in the same muted status line that also
 * carried "waiting for someone to join" and the final result, so the one
 * thing you check on every single move looked exactly like the text you
 * only read once. */
export function TurnBanner({ active, label, hint, accent }: Props) {
  return (
    <div className={`turn-banner ${active ? 'active' : 'waiting'}`} aria-live="polite">
      <span className="turn-banner-main">
        {accent ? (
          <span className="turn-banner-swatch" style={{ background: accent }} />
        ) : (
          <span className="turn-banner-dot" />
        )}
        {label}
      </span>
      {hint && <span className="turn-banner-hint">{hint}</span>}
    </div>
  );
}
