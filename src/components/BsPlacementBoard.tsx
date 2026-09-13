import { useRef, useState } from 'react';
import {
  EMPTY_FLEET,
  FLEET,
  GRID,
  colOf,
  placeShip,
  placedShipIds,
  rowOf,
  shipCells,
  shipCellIndexes,
  shipPlacements,
  type Orientation,
  type ShipDef,
  type ShipId,
} from '../lib/battleshipEngine';
import { ShipHull } from './ShipHull';
import './BsPlacementBoard.css';

/** Drag-to-place fleet layout.
 *
 * The ghost is deliberately drawn *above* the fingertip rather than under
 * it: on a phone a 10x10 grid puts each cell at roughly a third of a
 * thumb's width, so a ship rendered at the touch point hides exactly the
 * cells you're trying to judge. Everything is pointer events with capture,
 * the same approach the Blocks tray uses. */

const GHOST_LIFT = 64; // px the ghost floats above the finger

interface DragState {
  ship: ShipDef;
  /** Which cell of the ship you grabbed, so it doesn't jump to its nose. */
  grabOffset: number;
  x: number;
  y: number;
  /** Set once the pointer is actually over the board. */
  anchor: number | null;
  valid: boolean;
}

export function BsPlacementBoard({
  fleet,
  orientation,
  onChange,
  onRotate,
}: {
  fleet: string;
  orientation: Orientation;
  onChange: (fleet: string) => void;
  onRotate: () => void;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  const placed = placedShipIds(fleet);

  /** The board cell under a viewport point, or null if outside. */
  const cellAt = (x: number, y: number): number | null => {
    const board = boardRef.current;
    if (!board) return null;
    const r = board.getBoundingClientRect();
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) return null;
    const col = Math.floor(((x - r.left) / r.width) * GRID);
    const row = Math.floor(((y - r.top) / r.height) * GRID);
    if (col < 0 || col >= GRID || row < 0 || row >= GRID) return null;
    return row * GRID + col;
  };

  /** Where the ship's nose lands, given which of its cells you grabbed. */
  const anchorFor = (cell: number, grabOffset: number, o: Orientation) => {
    const row = rowOf(cell);
    const col = colOf(cell);
    return o === 'h'
      ? { row, col: col - grabOffset }
      : { row: row - grabOffset, col };
  };

  const previewCells = (d: DragState): number[] | null => {
    if (d.anchor === null) return null;
    const { row, col } = anchorFor(d.anchor, d.grabOffset, orientation);
    if (row < 0 || col < 0) return null;
    // Validate against the board minus the ship being moved, so dragging a
    // placed ship a single cell sideways doesn't collide with itself.
    const without = clearShip(fleet, d.ship.id);
    return shipCells(without, d.ship, row, col, orientation);
  };

  const beginDrag = (
    e: React.PointerEvent,
    ship: ShipDef,
    grabOffset: number
  ) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const y = e.clientY - GHOST_LIFT;
    const anchor = cellAt(e.clientX, y);
    setDrag({ ship, grabOffset, x: e.clientX, y, anchor, valid: false });
  };

  const moveDrag = (e: React.PointerEvent) => {
    if (!drag) return;
    e.preventDefault();
    const y = e.clientY - GHOST_LIFT;
    const anchor = cellAt(e.clientX, y);
    const next = { ...drag, x: e.clientX, y, anchor };
    next.valid = previewCells(next) !== null;
    setDrag(next);
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!drag) return;
    e.preventDefault();
    const cells = previewCells(drag);
    if (cells && drag.anchor !== null) {
      const { row, col } = anchorFor(drag.anchor, drag.grabOffset, orientation);
      onChange(placeShip(clearShip(fleet, drag.ship.id), drag.ship, row, col, orientation));
    }
    setDrag(null);
  };

  // Ships already down are drawn as hulls, same as they'll look in battle.
  // The one being dragged is hidden here — the ghost under the finger is
  // standing in for it.
  const hulls = shipPlacements(fleet).filter((p) => p.id !== drag?.ship.id);
  const hulled = new Set<number>();
  hulls.forEach((p) => shipCellIndexes(fleet, p.id).forEach((i) => hulled.add(i)));

  const preview = drag ? previewCells(drag) : null;
  const previewSet = new Set(preview ?? []);
  const invalid = drag !== null && drag.anchor !== null && preview === null;

  return (
    <div className="bs-place-wrap">
      <div
        ref={boardRef}
        className={`bs-board bs-board-place ${drag ? 'dragging' : ''}`}
        role="grid"
        aria-label="Your fleet layout"
      >
        {hulls.length > 0 && (
          <div className="bs-hulls">
            {hulls.map((p) => (
              <ShipHull key={p.id} ship={p} />
            ))}
          </div>
        )}
        {Array.from({ length: GRID * GRID }).map((_, index) => {
          const ship = fleet[index];
          const occupied = ship !== '-';
          const isPreview = previewSet.has(index);
          const classes = [
            'bs-cell',
            occupied && !hulled.has(index) ? `ship-${ship.toLowerCase()}` : '',
            isPreview ? (invalid ? 'preview-bad' : 'preview-ok') : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <div
              key={index}
              className={classes}
              // Picking a placed ship back up: grab the cell you touched so
              // it keeps its position relative to your finger.
              onPointerDown={(e) => {
                if (!occupied) return;
                const id = ship as ShipId;
                const def = FLEET.find((s) => s.id === id);
                if (!def) return;
                const cells = shipCellIndexes(fleet, id);
                beginDrag(e, def, Math.max(0, cells.indexOf(index)));
              }}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              aria-label={`Row ${rowOf(index) + 1}, column ${colOf(index) + 1}`}
            />
          );
        })}
      </div>

      <div className="bs-tray" aria-label="Ships to place">
        {FLEET.map((ship) => {
          const isPlaced = placed.has(ship.id);
          return (
            <button
              key={ship.id}
              type="button"
              className={`bs-tray-ship ${isPlaced ? 'placed' : ''} ${
                drag?.ship.id === ship.id ? 'lifting' : ''
              }`}
              onPointerDown={(e) => beginDrag(e, ship, 0)}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              aria-label={`${ship.name}, ${ship.size} squares${
                isPlaced ? ', placed' : ''
              }`}
            >
              <span className="bs-tray-name">{ship.name}</span>
              <span className={`bs-tray-cells o-${orientation}`}>
                {Array.from({ length: ship.size }).map((_, i) => (
                  <span key={i} className={`bs-tray-cell ship-${ship.id.toLowerCase()}`} />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      <div className="bs-place-actions">
        <button type="button" className="btn btn-text" onClick={onRotate}>
          {orientation === 'h' ? 'Rotate ⟷' : 'Rotate ↕'}
        </button>
        <button
          type="button"
          className="btn btn-text"
          onClick={() => onChange(EMPTY_FLEET)}
          disabled={fleet === EMPTY_FLEET}
        >
          Clear
        </button>
      </div>

      {drag && (
        <div
          className={`bs-ghost ${invalid ? 'bad' : ''} o-${orientation}`}
          style={{ left: drag.x, top: drag.y }}
          aria-hidden="true"
        >
          {Array.from({ length: drag.ship.size }).map((_, i) => (
            <span
              key={i}
              className={`bs-ghost-cell ship-${drag.ship.id.toLowerCase()}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** A copy of the layout with one ship lifted off it. */
function clearShip(fleet: string, shipId: ShipId): string {
  return [...fleet].map((c) => (c === shipId ? '-' : c)).join('');
}
