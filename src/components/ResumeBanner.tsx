import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import {
  dismissWordSearchProgress,
  getResumablePuzzle,
  type ResumablePuzzle,
} from '../lib/firestoreWordSearch';
import './ResumeBanner.css';

/** "Continue where you left off" prompt on the Word Search Create tab.
 * Dismissing (the X) only hides this prompt going forward — the puzzle's
 * actual progress is untouched and still reachable from the Library tab. */
export function ResumeBanner({
  uid,
  onResume,
}: {
  uid: string;
  onResume: (puzzleId: string) => void;
}) {
  const [puzzle, setPuzzle] = useState<ResumablePuzzle | null>(null);
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getResumablePuzzle(uid).then((p) => {
      if (!cancelled) setPuzzle(p);
    });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  if (!puzzle) return null;

  const handleDismiss = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissing(true);
    try {
      await dismissWordSearchProgress(uid, puzzle.puzzleId);
      setPuzzle(null);
    } catch {
      setDismissing(false);
    }
  };

  return (
    <div className="resume-banner card">
      <button className="resume-banner-body" onClick={() => onResume(puzzle.puzzleId)}>
        <span className="resume-banner-label">Continue where you left off</span>
        <span className="resume-banner-topic">
          {puzzle.topic}
          <span className="resume-banner-count">
            {' '}
            &middot; {puzzle.foundCount}/{puzzle.totalCount} found
          </span>
        </span>
      </button>
      <button
        className="resume-banner-dismiss"
        onClick={handleDismiss}
        disabled={dismissing}
        aria-label="Dismiss"
      >
        <X size={16} strokeWidth={2.5} />
      </button>
    </div>
  );
}
