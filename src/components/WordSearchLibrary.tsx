import { useEffect, useState } from 'react';
import {
  deleteWordSearchPuzzle,
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
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    return watchRecentPuzzles(setPuzzles, () => setError(true));
  }, []);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.confirm('Delete this puzzle for everyone?')) return;
    setDeletingId(id);
    try {
      await deleteWordSearchPuzzle(id);
    } finally {
      setDeletingId(null);
    }
  };

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
          <div className="ws-library-item card">
            <button className="ws-library-open" onClick={() => onOpen(p.id)}>
              <span className="ws-library-topic">{p.topic}</span>
              <span className="ws-library-meta">
                {p.words.length} words · by {p.createdByName ?? 'Someone'}
              </span>
            </button>
            <button
              className="ws-library-delete"
              onClick={(e) => handleDelete(e, p.id)}
              disabled={deletingId === p.id}
              aria-label={`Delete ${p.topic} puzzle`}
            >
              &times;
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
