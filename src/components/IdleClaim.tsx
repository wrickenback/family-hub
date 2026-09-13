import { useEffect, useState } from 'react';
import {
  IDLE_CLAIM_MS,
  opponentIsIdle,
  type OnlineStatus,
} from '../lib/onlineGame';
import './IdleClaim.css';

interface Props {
  status: OnlineStatus;
  turn: string;
  updatedAt: number;
  uid: string;
  opponentName: string | null;
  onClaim: () => void;
}

/** Offers the win when the other player has walked off mid-game.
 *
 * Without this a table just hangs: the game is left alive on purpose so an
 * opponent can come back to it, which means someone who never does leaves
 * the other person waiting on a turn that will never come. The sweep
 * eventually bins the table, but hours later and with no result. */
export function IdleClaim({
  status,
  turn,
  updatedAt,
  uid,
  opponentName,
  onClaim,
}: Props) {
  // Idleness is a function of elapsed time, not of anything that changes in
  // the data — without a tick the prompt would never appear on a screen
  // that's just sitting there waiting.
  const [, tick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  if (!opponentIsIdle({ status, turn, updatedAt }, uid)) return null;

  const minutes = Math.floor((Date.now() - updatedAt) / 60_000);

  return (
    <div className="idle-claim card">
      <p className="idle-claim-text">
        {opponentName ?? 'Your opponent'} hasn&rsquo;t moved in {minutes}{' '}
        minutes.
      </p>
      <button className="btn btn-primary idle-claim-btn" onClick={onClaim}>
        Claim the win
      </button>
    </div>
  );
}

export { IDLE_CLAIM_MS };
