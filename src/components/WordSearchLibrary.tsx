import { useEffect, useState } from 'react';
import {
  watchRecentPuzzles,
  type WordSearchPuzzle,
} from '../lib/firestoreWordSearch';
import './WordSearchLibrary.css';

export function WordSearchLibrary({
  onOpen,
}: {
  onOpen: (puzzleId: string) => void;
}) {
  const [puzzles, setPuzzles] = useState<WordSearchPuzzle[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    return watchRecentPuzzles(setPuzzles, () => setError(true));
  }, []);

  if (error) {
    return <div className="card empty-state">Couldn&rsquo;t load the library.</div>;
  }
  if (puzzles.length === 0) {
    return (
      <div className="card empty-state">
        No puzzles yet — switch to Create to make the first one.
      </div>
    );
  }

  return (
    <ul className="ws-library">
      {puzzles.map((p) => (
        <li key={p.id}>
          <button className="ws-library-item card" onClick={() => onOpen(p.id)}>
            <span className="ws-library-topic">{p.topic}</span>
            <span className="ws-library-meta">
              {p.words.length} words · by {p.createdByName ?? 'Someone'}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
