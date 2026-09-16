import { useState } from 'react';
import { Screen } from '../components/Screen';
import { TurnBanner } from '../components/TurnBanner';
import {
  EMPTY_BOXES,
  EMPTY_EDGES,
  GRID,
  boxIndex,
  closedABox,
  drawEdge,
  hIndex,
  isFull,
  other,
  tally,
  vIndex,
  type Player,
} from '../lib/dotsAndBoxesEngine';
import { playClear, playGameOver, playPlace } from '../lib/sound';
import './DotsAndBoxesGame.css';

const LABEL: Record<Player, string> = { A: 'Purple', B: 'Orange' };

/** Kept in step with the .db-box / .db-edge colours in the stylesheet. */
export const PLAYER_HEX: Record<Player, string> = {
  A: '#7A3FE0',
  B: '#FF8A3D',
};

type Result = { winner: Player | null } | null;

export function DotsAndBoxesGame({ onBack }: { onBack: () => void }) {
  const [edges, setEdges] = useState(EMPTY_EDGES);
  const [boxes, setBoxes] = useState(EMPTY_BOXES);
  const [turn, setTurn] = useState<Player>('A');
  const [starter, setStarter] = useState<Player>('A');
  const [result, setResult] = useState<Result>(null);
  const [tallyTotal, setTallyTotal] = useState({ A: 0, B: 0, draw: 0 });
  const [lastEdge, setLastEdge] = useState<number | null>(null);

  const handleDraw = (edge: number) => {
    if (result) return;
    const drawn = drawEdge(edges, boxes, edge, turn);
    if (!drawn) return;
    setLastEdge(edge);
    setEdges(drawn.edges);
    setBoxes(drawn.boxes);

    if (drawn.completed > 0) playClear(drawn.completed);
    else playPlace();

    if (isFull(drawn.edges)) {
      const counts = tally(drawn.boxes);
      const winner =
        counts.A === counts.B ? null : counts.A > counts.B ? 'A' : 'B';
      setResult({ winner });
      setTallyTotal((t) =>
        winner ? { ...t, [winner]: t[winner] + 1 } : { ...t, draw: t.draw + 1 }
      );
      if (winner) playClear(4);
      else playGameOver();
    } else if (drawn.completed === 0) {
      setTurn(other(turn));
    }
  };

  const handleNextRound = () => {
    const nextStarter = other(starter);
    setStarter(nextStarter);
    setTurn(nextStarter);
    setEdges(EMPTY_EDGES);
    setBoxes(EMPTY_BOXES);
    setResult(null);
    setLastEdge(null);
  };

  const counts = tally(boxes);

  return (
    <Screen title="Dots and Boxes" subtitle="Pass and play" onBack={onBack}>
      <div className="db-scorebar">
        <div className="db-tally">
          <span className="db-tally-label">Purple</span>
          <span className="db-tally-value">{tallyTotal.A}</span>
        </div>
        <div className="db-tally">
          <span className="db-tally-label">Draws</span>
          <span className="db-tally-value">{tallyTotal.draw}</span>
        </div>
        <div className="db-tally">
          <span className="db-tally-label">Orange</span>
          <span className="db-tally-value">{tallyTotal.B}</span>
        </div>
      </div>

      {result ? (
        <p className="db-status settled" aria-live="polite">
          {result.winner
            ? `${LABEL[result.winner]} wins ${Math.max(
                counts.A,
                counts.B
              )}-${Math.min(counts.A, counts.B)}!`
            : `Draw — ${counts.A}-${counts.B}`}
        </p>
      ) : (
        <TurnBanner
          active
          label={`${LABEL[turn]}'s turn — ${counts.A}-${counts.B}`}
          hint={
            closedABox(boxes, lastEdge) ? 'Box closed! Same player again.' : undefined
          }
          accent={turn === 'A' ? PLAYER_HEX.A : PLAYER_HEX.B}
        />
      )}

      <DBBoard
        edges={edges}
        boxes={boxes}
        lastEdge={lastEdge}
        disabled={!!result}
        onDraw={handleDraw}
      />

      {result && (
        <div className="db-result card">
          <h3>{result.winner ? `${LABEL[result.winner]} wins` : 'Draw'}</h3>
          <button className="btn btn-primary" onClick={handleNextRound}>
            Next round
          </button>
        </div>
      )}

      <p className="db-note">
        Pass-and-play rounds stay on this device. Start an online game to put
        a win on the family board.
      </p>
    </Screen>
  );
}

export function DBBoard({
  edges,
  boxes,
  lastEdge,
  disabled,
  onDraw,
}: {
  edges: string;
  boxes: string;
  lastEdge: number | null;
  disabled: boolean;
  onDraw: (edge: number) => void;
}) {
  // Sizes come from CSS custom properties (see DotsAndBoxesGame.css) so the
  // board can scale with the viewport; this only lays out the alternating
  // dot / edge / dot rhythm the grid needs.
  const track = Array.from({ length: 2 * GRID + 1 })
    .map((_, i) => (i % 2 === 0 ? 'var(--db-dot)' : 'var(--db-edge)'))
    .join(' ');

  const cells: { key: string; el: React.ReactNode }[] = [];

  for (let r = 0; r <= 2 * GRID; r++) {
    for (let c = 0; c <= 2 * GRID; c++) {
      const rEven = r % 2 === 0;
      const cEven = c % 2 === 0;
      if (rEven && cEven) {
        cells.push({ key: `d${r}-${c}`, el: <span className="db-dot" /> });
      } else if (rEven && !cEven) {
        const edge = hIndex(r / 2, (c - 1) / 2);
        const drawn = edges[edge] !== '-';
        cells.push({
          key: `h${edge}`,
          el: (
            <button
              className={`db-edge db-edge-h ${
                drawn ? `drawn drawn-${edges[edge]}` : ''
              } ${
                lastEdge === edge ? 'newly-drawn' : ''
              }`}
              disabled={disabled || drawn}
              onClick={() => onDraw(edge)}
              aria-label={`Draw edge ${edge}`}
            />
          ),
        });
      } else if (!rEven && cEven) {
        const edge = vIndex((r - 1) / 2, c / 2);
        const drawn = edges[edge] !== '-';
        cells.push({
          key: `v${edge}`,
          el: (
            <button
              className={`db-edge db-edge-v ${
                drawn ? `drawn drawn-${edges[edge]}` : ''
              } ${
                lastEdge === edge ? 'newly-drawn' : ''
              }`}
              disabled={disabled || drawn}
              onClick={() => onDraw(edge)}
              aria-label={`Draw edge ${edge}`}
            />
          ),
        });
      } else {
        const box = boxIndex((r - 1) / 2, (c - 1) / 2);
        const owner = boxes[box];
        cells.push({
          key: `b${box}`,
          el: (
            <span
              className={`db-box ${owner !== '-' ? `owner-${owner}` : ''}`}
            />
          ),
        });
      }
    }
  }

  return (
    <div className="db-wrapper">
      <div
        className="db-grid"
        style={{ gridTemplateColumns: track, gridTemplateRows: track }}
        role="grid"
        aria-label="Dots and boxes board"
      >
        {cells.map((c) => (
          <span key={c.key} style={{ display: 'contents' }}>
            {c.el}
          </span>
        ))}
      </div>
    </div>
  );
}
