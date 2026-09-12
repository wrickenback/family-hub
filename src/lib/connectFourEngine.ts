// Pure Connect 4 logic, shared by the local pass-and-play screen and the
// online game's move transaction so both agree on what a win is.
//
// The board is a 42-character string, row-major from the top left ('-' for
// an empty slot) — same representation locally and in Firestore, so there's
// no conversion layer and the online board can be rendered straight from
// the snapshot.

export const COLS = 7;
export const ROWS = 6;
export const EMPTY_BOARD = '-'.repeat(COLS * ROWS);

export type Disc = 'R' | 'Y';

export function indexOf(row: number, col: number): number {
  return row * COLS + col;
}

/** The row a disc dropped into this column would land in, or -1 if the
 * column is full. Rows count from the top, so gravity means the *highest*
 * row index that's still empty. */
export function landingRow(board: string, col: number): number {
  for (let row = ROWS - 1; row >= 0; row--) {
    if (board[indexOf(row, col)] === '-') return row;
  }
  return -1;
}

/** Board after dropping a disc, plus where it landed — or null if that
 * column is already full. */
export function dropDisc(
  board: string,
  col: number,
  disc: Disc
): { board: string; index: number } | null {
  const row = landingRow(board, col);
  if (row < 0) return null;
  const index = indexOf(row, col);
  return {
    board: board.slice(0, index) + disc + board.slice(index + 1),
    index,
  };
}

// Right, down, and the two diagonals. Their mirrors are covered by scanning
// every cell as a potential start point.
const DIRECTIONS: [number, number][] = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

/** The four cell indexes of a connected run, or null. Returned as the line
 * so the UI can highlight exactly which discs won. */
export function winningLine(board: string): number[] | null {
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const disc = board[indexOf(row, col)];
      if (disc === '-') continue;
      for (const [dRow, dCol] of DIRECTIONS) {
        const line: number[] = [];
        for (let i = 0; i < 4; i++) {
          const r = row + dRow * i;
          const c = col + dCol * i;
          if (r < 0 || r >= ROWS || c < 0 || c >= COLS) break;
          if (board[indexOf(r, c)] !== disc) break;
          line.push(indexOf(r, c));
        }
        if (line.length === 4) return line;
      }
    }
  }
  return null;
}

export function isFull(board: string): boolean {
  return !board.includes('-');
}

export function other(disc: Disc): Disc {
  return disc === 'R' ? 'Y' : 'R';
}
