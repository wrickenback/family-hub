// Pure Battleship logic — no React, no Firestore. Shared by the online
// screen's shot transaction so the client and any future consumer agree on
// what a hit, a sink, and a win are.
//
// The board is a 100-character string, row-major from the top left ('-' for
// empty water, otherwise the ship's id character). Same representation
// locally and in Firestore, so there's no conversion layer.

export const GRID = 10;
export const TOTAL_SHIP_CELLS = 17;

export type ShipId = 'C' | 'B' | 'R' | 'S' | 'D';

export interface ShipDef {
  id: ShipId;
  name: string;
  size: number;
}

/** The classic fleet: Carrier 5, Battleship 4, Cruiser 3, Submarine 3,
 * Destroyer 2 — 17 cells total, so 17 hits wins. */
export const FLEET: ShipDef[] = [
  { id: 'C', name: 'Carrier', size: 5 },
  { id: 'B', name: 'Battleship', size: 4 },
  { id: 'R', name: 'Cruiser', size: 3 },
  { id: 'S', name: 'Submarine', size: 3 },
  { id: 'D', name: 'Destroyer', size: 2 },
];

export const EMPTY_FLEET = '-'.repeat(GRID * GRID);

export function indexOf(row: number, col: number): number {
  return row * GRID + col;
}

export function rowOf(index: number): number {
  return Math.floor(index / GRID);
}

export function colOf(index: number): number {
  return index % GRID;
}

export type Orientation = 'h' | 'v';

/** The cells a ship would occupy placed at (row, col), or null if it would
 * run off the board or overlap another ship. */
export function shipCells(
  fleet: string,
  ship: ShipDef,
  row: number,
  col: number,
  orientation: Orientation
): number[] | null {
  const cells: number[] = [];
  for (let i = 0; i < ship.size; i++) {
    const r = orientation === 'h' ? row : row + i;
    const c = orientation === 'h' ? col + i : col;
    if (r < 0 || r >= GRID || c < 0 || c >= GRID) return null;
    const index = indexOf(r, c);
    if (fleet[index] !== '-') return null; // overlap
    cells.push(index);
  }
  return cells;
}

/** Fleet string with the ship laid down at (row, col). Assumes shipCells
 * validated the placement first. */
export function placeShip(
  fleet: string,
  ship: ShipDef,
  row: number,
  col: number,
  orientation: Orientation
): string {
  const cells = shipCells(fleet, ship, row, col, orientation);
  if (!cells) return fleet;
  let next = fleet;
  for (const index of cells) {
    next = next.slice(0, index) + ship.id + next.slice(index + 1);
  }
  return next;
}

/** Which fleet ships have been placed so far, by id. */
export function placedShipIds(fleet: string): Set<ShipId> {
  const placed = new Set<ShipId>();
  for (const ch of fleet) {
    if (ch !== '-') placed.add(ch as ShipId);
  }
  return placed;
}

export function isFleetComplete(fleet: string): boolean {
  return [...fleet].filter((c) => c !== '-').length === TOTAL_SHIP_CELLS;
}

/** A full random layout — every ship placed legally, no overlaps. Used for
 * the "Random" button so kids can skip manual placement. Deterministic per
 * call site; no seeding needed since layouts are secret anyway. */
export function randomFleet(): string {
  for (;;) {
    let fleet = EMPTY_FLEET;
    let ok = true;
    for (const ship of FLEET) {
      let placed = false;
      for (let attempt = 0; attempt < 200 && !placed; attempt++) {
        const orientation: Orientation =
          Math.random() < 0.5 ? 'h' : 'v';
        const maxRow = orientation === 'h' ? GRID : GRID - ship.size;
        const maxCol = orientation === 'v' ? GRID : GRID - ship.size;
        const row = Math.floor(Math.random() * maxRow);
        const col = Math.floor(Math.random() * maxCol);
        if (shipCells(fleet, ship, row, col, orientation)) {
          fleet = placeShip(fleet, ship, row, col, orientation);
          placed = true;
        }
      }
      if (!placed) {
        ok = false;
        break;
      }
    }
    if (ok) return fleet;
    // Extremely unlikely with this fleet on 10×10, but retry rather than
    // ever returning a partial layout.
  }
}

export type ShotResult = 'miss' | 'hit' | 'sunk';

export interface ShotOutcome {
  result: ShotResult;
  /** The ship id when result is 'hit' or 'sunk'. */
  shipId: ShipId | null;
  /** All 17 cells hit — the game is over. */
  won: boolean;
}

/** Applies a shot to a fleet layout. The cell may already have been shot
 * (a double-tap racing the snapshot) — that reads as a miss and is a no-op
 * for the hit count, so it can't be used to farm extra information. */
/** Resolves a shot against an untouched layout plus everything already
 * fired at it.
 *
 * The stored fleet is written once during placement and never modified —
 * that immutability is what makes it safe to read outside a transaction.
 * So damage cannot be accumulated *in* the layout; it has to be computed
 * from the shot history each time. Resolving against the layout alone
 * would mean a ship only ever has a single hit on it, so nothing could
 * ever sink and nobody could ever win. */
export function resolveShot(
  fleet: string,
  priorShots: number[],
  index: number
): ShotOutcome {
  const shipId = shipAt(fleet, index);
  if (!shipId) return { result: 'miss', shipId: null, won: false };

  const fired = new Set(priorShots);
  fired.add(index);
  const sunk = shipCellIndexes(fleet, shipId).every((i) => fired.has(i));
  const won = FLEET.every((ship) =>
    shipCellIndexes(fleet, ship.id).every((i) => fired.has(i))
  );
  return { result: sunk ? 'sunk' : 'hit', shipId, won };
}

export function allShipsSunk(fleet: string): boolean {
  return ![...fleet].some((c) => c !== '-' && c !== 'X');
}

/** The cell indexes of a ship's remaining (unhit) parts — used to highlight
 * a freshly sunk ship on the owner's own grid. */
export function shipCellIndexes(fleet: string, shipId: ShipId): number[] {
  const cells: number[] = [];
  [...fleet].forEach((c, i) => {
    if (c === shipId) cells.push(i);
  });
  return cells;
}

export interface ShipPlacement {
  id: ShipId;
  name: string;
  /** Top-left cell of the ship's run. */
  row: number;
  col: number;
  size: number;
  orientation: Orientation;
}

/** Where each ship sits on a layout, as a run rather than loose cells — so
 * a hull can be drawn across the squares it occupies instead of colouring
 * them in one at a time. Ships that aren't fully placed are skipped. */
export function shipPlacements(fleet: string): ShipPlacement[] {
  const out: ShipPlacement[] = [];
  for (const ship of FLEET) {
    const cells = shipCellIndexes(fleet, ship.id);
    if (cells.length !== ship.size) continue;
    const rows = cells.map(rowOf);
    const cols = cells.map(colOf);
    out.push({
      id: ship.id,
      name: ship.name,
      row: Math.min(...rows),
      col: Math.min(...cols),
      size: ship.size,
      orientation: rows.every((r) => r === rows[0]) ? 'h' : 'v',
    });
  }
  return out;
}

/** Which ship occupies a cell on an untouched layout, if any. */
export function shipAt(fleet: string, index: number): ShipId | null {
  const c = fleet[index];
  return c && c !== '-' && c !== 'X' ? (c as ShipId) : null;
}

/** Which of `fleet`'s ships have had every one of their cells fired at.
 *
 * Takes the *placement* layout (ship ids intact, no 'X' marks) plus the
 * shots fired at it, so a player can work out what they've sunk from their
 * own shot history — no extra state has to be synced for it. */
export function sunkShipIds(fleet: string, shots: number[]): Set<ShipId> {
  const fired = new Set(shots);
  const sunk = new Set<ShipId>();
  for (const ship of FLEET) {
    const cells = shipCellIndexes(fleet, ship.id);
    if (cells.length === ship.size && cells.every((i) => fired.has(i))) {
      sunk.add(ship.id);
    }
  }
  return sunk;
}