import { useState } from 'react';
import { Screen } from '../components/Screen';
import { TurnBanner } from '../components/TurnBanner';
import {
  EMPTY_BOXES,
  EMPTY_EDGES,
  GRID,
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

/** The board, drawn as one SVG.
 *
 * It used to be a CSS grid of alternating dot / edge / dot tracks, with the
 * lines centred inside their cells by hand-written calc(). Every one of
 * those sums had to agree with every other for the lines to meet the dots,
 * and on a real phone they didn't — lines sat a pixel or two off their dots
 * and the whole grid read as crooked. In an SVG the geometry is stated once
 * in board units and the browser scales it, so a line's endpoint IS the
 * dot's centre by construction and cannot drift at any screen width. */

/** Board-space units. The SVG scales to whatever width it's given, so these
 * are only ever relative to each other. */
const CELL = 100;
const PAD = 14;
const DOT_R = 7;
const LINE_UNDRAWN = 5;
const LINE_DRAWN = 13;
/** The invisible strip that actually catches the tap. Far wider than the
 * drawn line, because a thumb is nothing like 13 units wide. */
const HIT = 46;
const SPAN = GRID * CELL + 2 * PAD;

/** Centre of dot (row, col) in board units. */
function dotX(c: number): number {
  return PAD + c * CELL;
}
function dotY(r: number): number {
  return PAD + r * CELL;
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
  /** Both edge families share everything but their endpoints. */
  const segments: {
    edge: number;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }[] = [];

  for (let r = 0; r <= GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      segments.push({
        edge: hIndex(r, c),
        x1: dotX(c),
        y1: dotY(r),
        x2: dotX(c + 1),
        y2: dotY(r),
      });
    }
  }
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c <= GRID; c++) {
      segments.push({
        edge: vIndex(r, c),
        x1: dotX(c),
        y1: dotY(r),
        x2: dotX(c),
        y2: dotY(r + 1),
      });
    }
  }

  return (
    <div className="db-wrapper">
      <svg
        className="db-board"
        viewBox={`0 0 ${SPAN} ${SPAN}`}
        role="grid"
        aria-label="Dots and boxes board"
      >
        {/* Claimed boxes sit underneath everything, so a line always reads
            on top of the tint rather than being swallowed by it. */}
        {Array.from({ length: GRID * GRID }).map((_, i) => {
          const owner = boxes[i];
          if (owner !== 'A' && owner !== 'B') return null;
          const r = Math.floor(i / GRID);
          const c = i % GRID;
          return (
            <rect
              key={`b${i}`}
              className="db-box"
              x={dotX(c)}
              y={dotY(r)}
              width={CELL}
              height={CELL}
              rx={6}
              fill={PLAYER_HEX[owner]}
              opacity={0.22}
            />
          );
        })}

        {segments.map(({ edge, x1, y1, x2, y2 }) => {
          const owner = edges[edge];
          const drawn = owner !== '-';
          return (
            <line
              key={`l${edge}`}
              className={`db-line ${drawn ? 'drawn' : ''} ${
                lastEdge === edge ? 'newly-drawn' : ''
              }`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={drawn ? PLAYER_HEX[owner as Player] : 'var(--sand-200)'}
              strokeWidth={drawn ? LINE_DRAWN : LINE_UNDRAWN}
              strokeLinecap="round"
            />
          );
        })}

        {/* Dots last of the visible layers: a line runs dot-centre to
            dot-centre, and the dot covers the join. */}
        {Array.from({ length: (GRID + 1) * (GRID + 1) }).map((_, i) => (
          <circle
            key={`d${i}`}
            className="db-dot"
            cx={dotX(i % (GRID + 1))}
            cy={dotY(Math.floor(i / (GRID + 1)))}
            r={DOT_R}
          />
        ))}

        {/* Transparent tap targets on top of the lot. Separate from the
            drawn line so the hit area can be thumb-sized without the board
            looking like it's made of fat grey bars. */}
        {segments.map(({ edge, x1, y1, x2, y2 }) => {
          const taken = edges[edge] !== '-' || disabled;
          if (taken) return null;
          return (
            <line
              key={`h${edge}`}
              className="db-hit"
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="transparent"
              strokeWidth={HIT}
              strokeLinecap="butt"
              role="button"
              tabIndex={0}
              aria-label={`Draw edge ${edge}`}
              onClick={() => onDraw(edge)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onDraw(edge);
                }
              }}
            />
          );
        })}
      </svg>
    </div>
  );
}
