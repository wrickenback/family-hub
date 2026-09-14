import { CAT_BREEDS, CatFace } from './CatFace';
import { IconChevronLeft } from './icons';
import './CatCollection.css';

/** The full breed collection — every breed already found, rendered in
 * colour; everything else shown as a silhouette so there's still something
 * to look forward to discovering, rather than spoiling the pattern early. */
export function CatCollection({
  discoveredBreeds,
  onClose,
}: {
  discoveredBreeds: string[];
  onClose: () => void;
}) {
  const found = new Set(discoveredBreeds);

  return (
    <div className="cq-collection-overlay" onClick={onClose}>
      <div
        className="cq-collection-sheet"
        role="dialog"
        aria-label="Cat breed collection"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cq-collection-head">
          <button
            className="cq-collection-back"
            onClick={onClose}
            aria-label="Close collection"
          >
            <IconChevronLeft aria-hidden="true" />
          </button>
          <h3>
            Your collection
            <span className="cq-collection-count">
              {found.size}/{CAT_BREEDS.length}
            </span>
          </h3>
        </div>

        <ul className="cq-collection-grid">
          {CAT_BREEDS.map((breed) => {
            const has = found.has(breed.id);
            return (
              <li
                key={breed.id}
                className={`cq-collection-item ${has ? 'found' : 'locked'}`}
              >
                <span className="cq-collection-face">
                  {has ? (
                    <CatFace breed={breed} size={46} />
                  ) : (
                    <span className="cq-collection-mystery" aria-hidden="true">
                      ?
                    </span>
                  )}
                </span>
                <span className="cq-collection-name">
                  {has ? breed.name : '???'}
                </span>
              </li>
            );
          })}
        </ul>

        {found.size < CAT_BREEDS.length && (
          <p className="cq-collection-note">
            Solve a puzzle to meet a new breed — puzzles favor ones you
            haven&rsquo;t found yet.
          </p>
        )}
      </div>
    </div>
  );
}
