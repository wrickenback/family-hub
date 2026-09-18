/** Checkers (English draughts), rules only — no React, no transport.
 *
 * The board is a 64-character string in reading order: '-' for an empty or
 * unplayable square, 'r'/'b' for men and 'R'/'B' for kings. A string rather
 * than a nested array because that is what survives a Realtime Database
 * round trip unchanged, and it makes "did the board move?" a comparison
 * instead of a walk. Only dark squares are ever occupied. */

export const SIZE = 8;
export const SQUARES = SIZE * SIZE;

export type Player = 'r' | 'b';

export interface Move {
  from: number;
  to: number;
  /** Index of the jumped piece, or null for a plain slide. */
  captured: number | null;
}

export function row(index: number): number {
  return Math.floor(index / SIZE);
}

export function col(index: number): number {
  return index % SIZE;
}

export function isDark(index: number): boolean {
  return (row(index) + col(index)) % 2 === 1;
}

function at(r: number, c: number): number | null {
  if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return null;
  return r * SIZE + c;
}

export const INITIAL_BOARD = buildInitialBoard();

function buildInitialBoard(): string {
  let board = '';
  for (let i = 0; i < SQUARES; i++) {
    if (!isDark(i)) board += '-';
    else if (row(i) < 3) board += 'b';
    else if (row(i) > 4) board += 'r';
    else board += '-';
  }
  return board;
}

export function ownerOf(piece: string): Player | null {
  if (piece === 'r' || piece === 'R') return 'r';
  if (piece === 'b' || piece === 'B') return 'b';
  return null;
}

export function isKing(piece: string): boolean {
  return piece === 'R' || piece === 'B';
}

export function other(player: Player): Player {
  return player === 'r' ? 'b' : 'r';
}

/** Red sits at the bottom and moves up the board; black does the opposite.
 * Kings ignore this and move both ways. */
function directionsFor(piece: string): number[] {
  if (isKing(piece)) return [-1, 1];
  return ownerOf(piece) === 'r' ? [-1] : [1];
}

function movesForPiece(board: string, index: number): Move[] {
  const piece = board[index];
  const player = ownerOf(piece);
  if (!player) return [];

  const moves: Move[] = [];
  const r = row(index);
  const c = col(index);

  for (const dr of directionsFor(piece)) {
    for (const dc of [-1, 1]) {
      const stepTo = at(r + dr, c + dc);
      if (stepTo === null) continue;

      if (board[stepTo] === '-') {
        moves.push({ from: index, to: stepTo, captured: null });
        continue;
      }
      // Occupied by an opponent with an empty square directly beyond it.
      if (ownerOf(board[stepTo]) === other(player)) {
        const landing = at(r + 2 * dr, c + 2 * dc);
        if (landing !== null && board[landing] === '-') {
          moves.push({ from: index, to: landing, captured: stepTo });
        }
      }
    }
  }
  return moves;
}

/** Every move `player` may legally make.
 *
 * Captures are compulsory, as in the real game: when any jump exists the
 * quiet moves are filtered out entirely. `chainFrom` narrows that to one
 * piece mid-multi-jump, which is the only time a player is restricted to a
 * single square of origin. */
export function legalMoves(
  board: string,
  player: Player,
  chainFrom: number | null = null
): Move[] {
  if (chainFrom !== null) {
    return movesForPiece(board, chainFrom).filter((m) => m.captured !== null);
  }

  const all: Move[] = [];
  for (let i = 0; i < SQUARES; i++) {
    if (ownerOf(board[i]) !== player) continue;
    all.push(...movesForPiece(board, i));
  }
  const jumps = all.filter((m) => m.captured !== null);
  return jumps.length > 0 ? jumps : all;
}

export interface MoveResult {
  board: string;
  /** True when the move crowned a piece — which also ends the turn, even
   * with jumps still on the table. */
  promoted: boolean;
  /** True when the same piece must jump again before the turn ends. */
  mustContinue: boolean;
}

export function applyMove(board: string, move: Move): MoveResult {
  const piece = board[move.from];
  const player = ownerOf(piece);
  if (!player) throw new Error('No piece on that square');

  const next = board.split('');
  next[move.from] = '-';
  if (move.captured !== null) next[move.captured] = '-';

  const crowningRow = player === 'r' ? 0 : SIZE - 1;
  const promoted = !isKing(piece) && row(move.to) === crowningRow;
  next[move.to] = promoted ? piece.toUpperCase() : piece;

  const board2 = next.join('');
  const mustContinue =
    move.captured !== null &&
    !promoted &&
    movesForPiece(board2, move.to).some((m) => m.captured !== null);

  return { board: board2, promoted, mustContinue };
}

export function countPieces(board: string, player: Player): number {
  let count = 0;
  for (const square of board) if (ownerOf(square) === player) count++;
  return count;
}

/** Who has won, given whose turn it is about to be. A player with no pieces
 * left — or with pieces but nowhere legal to put them — has lost; being
 * unable to move is a loss in draughts, not a draw. */
export function winnerAgainst(board: string, toMove: Player): Player | null {
  if (countPieces(board, toMove) === 0) return other(toMove);
  if (legalMoves(board, toMove).length === 0) return other(toMove);
  return null;
}

/** Squares the given piece may move to right now — what the board lights up
 * when a piece is picked up. */
export function destinationsFrom(
  board: string,
  player: Player,
  from: number,
  chainFrom: number | null
): Move[] {
  return legalMoves(board, player, chainFrom).filter((m) => m.from === from);
}

/** Pieces that can legally move at all, so the board can nudge toward them
 * when a player taps a piece that is stuck. */
export function movablePieces(
  board: string,
  player: Player,
  chainFrom: number | null
): Set<number> {
  return new Set(legalMoves(board, player, chainFrom).map((m) => m.from));
}
