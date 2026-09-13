import type { ShipId, ShipPlacement } from '../lib/battleshipEngine';
import './ShipHull.css';

/** A ship drawn as a hull across the squares it occupies, rather than those
 * squares just being coloured in.
 *
 * Each class gets its own silhouette — a carrier's flat flight deck reads
 * differently from a submarine's rounded back — so a ship is identifiable
 * by shape, not only by the legend. */

/** Units per board square in the SVG's own coordinate space. */
const U = 20;
/** The ship's beam, in those same units. */
const BEAM = 20;

function hullPath(length: number): string {
  // Squared-off stern on the left, pointed bow on the right.
  const bow = length - U * 0.55;
  return `M 3 4
          L ${bow} 2.5
          Q ${length - 1.5} ${BEAM / 2} ${bow} ${BEAM - 2.5}
          L 3 ${BEAM - 4}
          Q 1 ${BEAM / 2} 3 4 Z`;
}

/** The deck furniture that tells the classes apart. */
function deck(id: ShipId, length: number) {
  const mid = BEAM / 2;
  switch (id) {
    case 'C': // Carrier — full-length flight deck, island off to one side
      return (
        <>
          <rect
            x={5}
            y={4.5}
            width={length - 14}
            height={BEAM - 9}
            rx={1.5}
            className="hull-deck"
          />
          <line
            x1={9}
            y1={mid}
            x2={length - 13}
            y2={mid}
            className="hull-stripe"
            strokeDasharray="5 4"
          />
          <rect x={length * 0.55} y={2.5} width={7} height={4.5} rx={1} className="hull-tower" />
        </>
      );
    case 'B': // Battleship — bridge amidships, a turret fore and aft
      return (
        <>
          <rect x={length * 0.42} y={5} width={length * 0.2} height={BEAM - 10} rx={1.5} className="hull-tower" />
          <circle cx={length * 0.24} cy={mid} r={3.4} className="hull-turret" />
          <circle cx={length * 0.75} cy={mid} r={3.4} className="hull-turret" />
          <line x1={length * 0.5} y1={5} x2={length * 0.5} y2={0.5} className="hull-mast" />
        </>
      );
    case 'R': // Cruiser — single bridge and turret
      return (
        <>
          <rect x={length * 0.44} y={5.5} width={length * 0.22} height={BEAM - 11} rx={1.5} className="hull-tower" />
          <circle cx={length * 0.23} cy={mid} r={3.2} className="hull-turret" />
          <line x1={length * 0.55} y1={5.5} x2={length * 0.55} y2={1.5} className="hull-mast" />
        </>
      );
    case 'S': // Submarine — rounded back, conning tower, no deck guns
      return (
        <>
          <rect x={length * 0.36} y={3.5} width={length * 0.2} height={5} rx={2} className="hull-tower" />
          <line x1={length * 0.46} y1={3.5} x2={length * 0.46} y2={0.8} className="hull-mast" />
          <line x1={8} y1={mid} x2={length - 12} y2={mid} className="hull-stripe" />
        </>
      );
    case 'D': // Destroyer — compact, one turret forward
      return (
        <>
          <rect x={length * 0.42} y={6} width={length * 0.24} height={BEAM - 12} rx={1.5} className="hull-tower" />
          <circle cx={length * 0.24} cy={mid} r={3} className="hull-turret" />
        </>
      );
  }
}

export function ShipHull({
  ship,
  sunk = false,
}: {
  ship: ShipPlacement;
  sunk?: boolean;
}) {
  const length = ship.size * U;
  const vertical = ship.orientation === 'v';

  // Same artwork either way: for a vertical ship the canvas is turned on its
  // side and the drawing rotated into it, so the bow points down the board.
  const viewBox = vertical ? `0 0 ${BEAM} ${length}` : `0 0 ${length} ${BEAM}`;
  const transform = vertical ? `translate(${BEAM} 0) rotate(90)` : undefined;

  return (
    <div
      className={`bs-hull ship-${ship.id.toLowerCase()} ${sunk ? 'sunk' : ''}`}
      style={{
        gridColumn: `${ship.col + 1} / span ${vertical ? 1 : ship.size}`,
        gridRow: `${ship.row + 1} / span ${vertical ? ship.size : 1}`,
      }}
      aria-hidden="true"
    >
      <svg viewBox={viewBox} preserveAspectRatio="none" className="bs-hull-svg">
        <g transform={transform}>
          <path d={hullPath(length)} className="hull-body" />
          {deck(ship.id, length)}
        </g>
      </svg>
    </div>
  );
}
