// Pure game logic for Tic Tac Toe — no React, no Firestore, so the rules
// can be reasoned about (and tested) on their own. Shared by the local
// pass-and-play screen and the online game's move transaction, so both
// decide "is this a win?" the same way.
//
// There is deliberately no AI here: Tic Tac Toe is a solved draw, so a
// competent computer opponent can never be beaten, and a deliberately weak
// one is just noise. This game is two people playing each other.

export type Mark = 'X' | 'O';
export type Cell = Mark | null;
export type Board = Cell[]; // length 9, index 0..8 reading left-to-right, top-to-bottom

export const LINES: number[][] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
  [0, 4, 8], [2, 4, 6],            // diagonals
];

export function emptyBoard(): Board {
  return Array(9).fill(null);
}

/** The winning line's cell indexes, or null — returned as the line (not
 * just the mark) so the UI can highlight exactly which three cells won. */
export function winningLine(board: Board): number[] | null {
  for (const line of LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return line;
  }
  return null;
}

export function isFull(board: Board): boolean {
  return board.every((cell) => cell !== null);
}

export function other(mark: Mark): Mark {
  return mark === 'X' ? 'O' : 'X';
}
